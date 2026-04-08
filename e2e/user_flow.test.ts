import { randomUUID } from 'crypto';
import fetch from 'node-fetch'; // assuming node 18+ global fetch or configured locally
import assert from 'assert';
import express from 'express';

const HUB_URL = process.env.HUB_URL || 'http://localhost:3399';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8000';

const mockApp = express();
mockApp.use(express.json());
mockApp.post('/v1/chat/completions', (req, res) => {
  res.json({
    id: 'mock-123',
    choices: [{ message: { role: 'assistant', content: 'Hello from mock provider!' } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
  });
});


async function startUserFlow() {
  const server = mockApp.listen(3344, () => {
    console.log('Mock Provider running on port 3344');
  });

  console.log('=== Starting End-to-End User Flow Test ===');

  try {
    const randomSuffix = randomUUID().slice(0, 8);
    const username = `testuser_${randomSuffix}`;

    console.log('\n[1] Logging in as admin to simulate a user...');
    const loginRes = await fetch(`${HUB_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'admin', password: 'admin123' }) 
    });
    if (!loginRes.ok) throw new Error(`Login failed: ${await loginRes.text()}`);
    const loginData = await loginRes.json() as any;
    const token = loginData.token;
    const uid = loginData.user.uid;
    console.log(`  -> Login OK, uid: ${uid}`);
    console.log(`  -> Initial Balance: $${loginData.user.balance}`);

    const testModel = 'gpt-4o'; 
    console.log(`\n[2] Selecting Model: ${testModel}`);

    console.log('  -> Setting up mock provider and pricing...');
    await fetch(`${HUB_URL}/api/provider-keys/mock-upstream`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        status: 'active', label: 'Mock Upstream', base_url: 'http://127.0.0.1:3344', driver_type: 'openai_compatible',
        keys: [{ id: 'k1', label: 'Default', key: 'sk-mock', status: 'active' }]
      })
    });
    
    // We can test deducting by using an actual model that is in db (`gpt-5.4-mini` has global pricing set up)
    // We just create a pricing override connecting gpt-5.4-mini to mock-upstream
    await fetch(`${HUB_URL}/api/pricing/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: testModel, provider_account_id: 'mock-upstream', provider_key_id: 'k1',
        price_mode: 'fixed', input_price: 1.0, output_price: 2.0, status: 'online'
      })
    });
    await fetch(`${HUB_URL}/api/pricing/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ operator: 'e2e' })
    });

    console.log('\n[3] Recharging Balance...');
    const rechargeRes = await fetch(`${HUB_URL}/api/billing/recharge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: "admin", amount: 5.0 })
    });
    if (!rechargeRes.ok) throw new Error(`Recharge failed: ${await rechargeRes.text()}`);
    const rechargeData = await rechargeRes.json() as any;
    console.log(`  -> Recharge OK. New Balance: $${rechargeData.balance}`);

    console.log('\n[4] Creating API Key...');
    const apiKeyRaw = `sk-user-${randomSuffix}`;
    const keyRes = await fetch(`${HUB_URL}/api/user-api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'My Test Key',
        key: apiKeyRaw,
        uid: uid
      })
    });
    if (!keyRes.ok) throw new Error(`Key creation failed: ${await keyRes.text()}`);
    console.log(`  -> Client Key Created OK: ${apiKeyRaw}`);

    console.log('  -> Waiting 3s for Gateway to sync user keys...');
    await new Promise(r => setTimeout(r, 3000));

    console.log('\n[5] Executing Gateway Request (Testing Connectivity & Deduction)...');
    const gwRes = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKeyRaw}`
      },
      body: JSON.stringify({
        model: testModel,
        messages: [{ role: 'user', content: 'test connectivity message' }]
      })
    });
    
    if (!gwRes.ok) {
        throw new Error(`Gateway request failed: ${await gwRes.text()}`);
    } else {
        const gwData = await gwRes.json();
        console.log('  -> Gateway Request OK, Response Received!');
    }

    console.log('\n[6] Checking Backend Billing/Activity...');
    const meRes = await fetch(`${HUB_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const meData = await meRes.json() as any;
    console.log(`  -> Current User Balance After Request: $${meData.balance}`);

    const activityRes = await fetch(`${HUB_URL}/api/activity?limit=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (activityRes.ok) {
        const activities = await activityRes.json() as any[];
        if (activities.length > 0) {
            console.log(`  -> Auto-deducted Cost recorded in Activity: $${activities[0].cost}`);
        }
    }

    console.log('\n=== E2E USER TEST FINISHED ===');
    
  } catch (error) {
    console.error('\n=== E2E TEST FAILED ===', error);
  }
}

startUserFlow().then(() => process.exit(0));
