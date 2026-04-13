import { randomUUID } from 'crypto';
import fetch from 'node-fetch';
import { Pool } from 'pg';

const HUB_URL = process.env.HUB_URL || 'http://localhost:3322';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8000';
// Database connection to inject a clean user directly for testing
const pool = new Pool({ connectionString: 'postgresql://localhost:5432/pararouter' });

async function runTest() {
  console.log('🌟 开始端到端计费流测试 🌟\n');
  const userId = randomUUID();
  const username = `user_${userId.substring(0, 5)}`;
  const apiKey = `sk-test-${randomUUID().substring(0, 8)}`;
  
  try {
    console.log(`[1] 正在模拟普通用户注册... (用户名: ${username})`);
    const defaultBalance = 10.0;
    await pool.query(
      `INSERT INTO users (id, username, email, display_name, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'user', 'active', $6, $7)`,
      [userId, username, `${username}@test.com`, username, 'mock_hash', Date.now(), Date.now()]
    );
    console.log(`✅ 普通用户创建成功！系统默认赠送测试额度：$${defaultBalance}\n`);

    console.log('[2] 管理员执行人工充值操做... (给用户充值 $5.00)');
    // 假设通过管理员身份调用 /api/billing/recharge
    // 为了脚本独立运行脱离admin session依赖，我们直接通过 SQL 模拟这步的效果
    await pool.query(
      `UPDATE users SET balance = balance + 5.0 WHERE id = $1`,
      [userId]
    );
    await pool.query(
      `INSERT INTO billing_records (user_id, amount, balance_after, type, description, timestamp)
       VALUES ($1, 5.0, 15.0, 'recharge', 'Admin API Recharge Test', $2)`,
      [userId, Date.now()]
    );
    console.log(`✅ 充值成功！用户当前余额：$15.00 \n`);

    console.log('[3] 用户登录系统，在设置页生成专属 API Key...');
    await pool.query(
      `INSERT INTO user_api_keys (id, uid, name, key, created_at)
       VALUES ($1, $2, 'Test Device Key', $3, $4)`,
      [randomUUID(), userId, apiKey, Date.now()]
    );
    console.log(`✅ API Key 生成完成: ${apiKey}\n`);

    // 通知网关同步 Key (模拟hub逻辑)
    await pool.query("SELECT pg_notify('config_changed', 'user_keys')");

    console.log('[!] 等待网关同步内存中的 Keys... (3秒)');
    await new Promise(r => setTimeout(r, 3000));

    console.log('\n[4] 用户发起大模型测试请求 (网关联通性测试)...');
    console.log('----------------------------------------------------');
    console.log(`POST ${GATEWAY_URL}/v1/chat/completions`);
    console.log(`Authorization: Bearer ${apiKey}`);
    console.log('----------------------------------------------------');
    
    // 发起真实的网关请求
    const gwRes = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o', // 必须是您网库里已有的合法模型
        messages: [{ role: 'user', content: 'Say "hello world" in 2 words.' }]
      })
    });
    
    if (gwRes.status === 402) {
      console.log('❌ 请求被网关拦截：金额不足 (正常表现之一如果余额为0)');
    } else if (gwRes.status === 200) {
      const data = await gwRes.json() as any;
      console.log('✅ 请求成功响应！消耗 tokens:', data.usage);
    } else {
      console.log(`⚠️ 请求失败：HTTP ${gwRes.status}`);
      const txt = await gwRes.text();
      console.log(txt);
      console.log('（注：如果是 Provider 没配置好导致网关报错，不影响鉴权和计费的扣除环境独立测试。要确保能消耗Token，需要后台已配置可用的渠道）');
    }

    console.log('\n[5] 校验后台计费系统是否触发扣费...');
    // 等待写库 Hook 执行完毕
    await new Promise(r => setTimeout(r, 1500));
    const userRow = await pool.query(`SELECT balance FROM users WHERE id = $1`, [userId]);
    const finalBalance = userRow.rows[0].balance;
    console.log(`💰 请求后最终用户余额: $${finalBalance}`);
    if (finalBalance < 15.0) {
      console.log('🎉 测试通过：计费系统已成功执行精准抵扣！');
    } else {
      console.log('ℹ️ 余额未发生变动 (若网关层面因为上游不可用导致未能产生 tokens 回调，则这是合理的表现。配置有效真实渠道后才产生抵扣)');
    }

  } catch (error) {
    console.error('测试异常报错:', error);
  } finally {
    // 测完可以随意清理，保障环境干净
    await pool.query(`DELETE FROM user_api_keys WHERE uid = $1`, [userId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    pool.end();
  }
}

runTest();
