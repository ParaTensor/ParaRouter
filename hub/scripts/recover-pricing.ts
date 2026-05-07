import { pool } from '../db';

async function checkPricing() {
  // 1. 获取当前版本
  const stateResult = await pool.query(
    'SELECT current_version, config_version FROM pricing_state WHERE id = 1'
  );
  const currentVersion = stateResult.rows[0]?.current_version;
  console.log('当前版本:', currentVersion);

  // 2. 获取当前版本的所有数据
  const currentResult = await pool.query(
    `SELECT model_id, public_model_id, provider_account_id, provider_key_id, provider_model_id, 
            input_price, output_price, status, price_mode
     FROM model_provider_pricings 
     WHERE version = $1
     ORDER BY model_id, provider_account_id`,
    [currentVersion]
  );

  console.log('\n当前版本定价数据:');
  console.log('='.repeat(120));
  currentResult.rows.forEach((row, i) => {
    console.log(`${i + 1}. model_id: ${row.model_id}`);
    console.log(`   public_model_id: ${row.public_model_id || '(null)'}`);
    console.log(`   provider_model_id: ${row.provider_model_id || '(null)'}`);
    console.log(`   provider: ${row.provider_account_id} | key: ${row.provider_key_id}`);
    console.log(`   price_mode: ${row.price_mode} | input: $${row.input_price} | output: $${row.output_price}`);
    console.log(`   status: ${row.status}`);
    console.log('');
  });

  // 3. 检查 draft 表
  const draftResult = await pool.query(
    `SELECT model_id, public_model_id, provider_account_id, provider_key_id, 
            input_price, output_price, status
     FROM model_provider_pricings_draft
     ORDER BY model_id, provider_account_id`
  );
  
  if (draftResult.rows.length > 0) {
    console.log('\nDraft 数据:');
    console.log('='.repeat(120));
    draftResult.rows.forEach((row, i) => {
      console.log(`${i + 1}. model_id: ${row.model_id} | provider: ${row.provider_account_id}`);
      console.log(`   input: $${row.input_price} | output: $${row.output_price} | status: ${row.status}`);
      console.log('');
    });
  } else {
    console.log('\nDraft 表为空');
  }

  // 4. 检查 llm_models 中是否有 claude-opus-4.7
  const modelCheck = await pool.query(
    `SELECT id, name FROM llm_models WHERE id LIKE '%opus-4%' OR id LIKE '%claude%' ORDER BY id`
  );
  if (modelCheck.rows.length > 0) {
    console.log('\nllm_models 中的 claude/opus 模型:');
    modelCheck.rows.forEach(row => {
      console.log(`  - id: ${row.id} | name: ${row.name || '(null)'}`);
    });
  }

  process.exit(0);
}

checkPricing().catch(err => {
  console.error(err);
  process.exit(1);
});
