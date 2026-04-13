import { createServer } from 'http';
import assert from 'assert';

const HUB_URL = process.env.HUB_URL || 'http://localhost:3399';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8000';
const MOCK_PORT = 3344;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

// The mock server stands in for an upstream provider
const mockServer = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'mock-123',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'mock-model',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello from mock provider!' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      }));
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

let token = ''; // Admin token
let clientKey = ''; // Generated User Key

async function start() {
  console.log(`Starting mock upstream server on port ${MOCK_PORT}...`);
  await new Promise<void>((resolve) => mockServer.listen(MOCK_PORT, '127.0.0.1', () => resolve()));
  
  try {
    console.log('1. Hub Auth Login (local-admin) ...');
    const loginRes = await fetch(`${HUB_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'admin', password: 'admin123' }) // default bootstrap admin
    });
    if (!loginRes.ok) throw new Error(`Login failed: ${await loginRes.text()}`);
    const loginData = await loginRes.json();
    token = loginData.token;
    assert.ok(token, 'Admin token should be returned');
    console.log('  -> Login OK');

    console.log('2. Configure Provider & Model ...');
    const providerRes = await fetch(`${HUB_URL}/api/provider-keys/mock-upstream`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        status: 'active',
        label: 'Mock Upstream',
        base_url: MOCK_URL,
        driver_type: 'openai_compatible',
        keys: [{ id: 'k1', label: 'Default', key: 'sk-mock', status: 'active' }]
      })
    });
    if (!providerRes.ok) throw new Error(`Provider setup failed: ${await providerRes.text()}`);
    console.log('  -> Provider OK');

    console.log('3. Set active Pricing ...');
    const draftRes = await fetch(`${HUB_URL}/api/pricing/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: 'mock-model',
        provider_account_id: 'mock-upstream',
        provider_key_id: 'k1',
        price_mode: 'fixed',
        input_price: 1.0,
        output_price: 2.0,
        status: 'online'
      })
    });
    if (!draftRes.ok) throw new Error(`Pricing draft failed: ${await draftRes.text()}`);
    
    const publishRes = await fetch(`${HUB_URL}/api/pricing/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ operator: 'e2e' })
    });
    if (!publishRes.ok) throw new Error(`Pricing publish failed: ${await publishRes.text()}`);
    console.log('  -> Pricing OK');

    console.log('4. Create Client Key ...');
    const keyRes = await fetch(`${HUB_URL}/api/user-api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'E2E Test Key',
        key: 'sk-pararouter-e2e',
        uid: 'local-admin' // we bind it to local-admin for simplicity
      })
    });
    if (!keyRes.ok) throw new Error(`Key creation failed: ${await keyRes.text()}`);
    clientKey = 'sk-pararouter-e2e';
    console.log('  -> Client Key OK');

    console.log('4b. Recharge Balance ...');
    const rechargeRes = await fetch(`${HUB_URL}/api/billing/recharge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: "admin", amount: 15.0 })
    });
    if (!rechargeRes.ok) throw new Error(`Recharge failed: ${await rechargeRes.text()}`);
    const rechargeData = await rechargeRes.json() as any;
    console.log(`  -> Recharge OK. New Balance: $${rechargeData.balance}`);
    const preRequestBalance = rechargeData.balance;

    // Wait a brief moment to ensure gateway syncs the config from db channel
    console.log('Waiting 3s for Gateway to sync configs...');
    await new Promise(r => setTimeout(r, 3000));

    console.log('5. Execute Gateway Request ...');
    const gwRes = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clientKey}`
      },
      body: JSON.stringify({
        model: 'mock-model',
        messages: [{ role: 'user', content: 'hello' }]
      })
    });
    if (!gwRes.ok) throw new Error(`Gateway request failed: ${await gwRes.text()} (Status: ${gwRes.status})`);
    const gwData = await gwRes.json();
    assert.strictEqual(gwData.choices[0].message.content, 'Hello from mock provider!');
    console.log('  -> Gateway Request OK');

    console.log('6. Verify Balance Deduction ...');
    await new Promise(r => setTimeout(r, 1000)); // Wait for hook to flush
    const meRes = await fetch(`${HUB_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const meData = await meRes.json() as any;
    console.log(`  -> Balance after request: $${meData.balance}`);
    assert.ok(meData.balance < preRequestBalance, 'Balance should have decreased');
    console.log('  -> Balance deduction OK');

    console.log('=== E2E TEST PASSED! ===');
    
  } catch (error) {
    console.error('=== E2E TEST FAILED ===');
    console.error(error);
    process.exitCode = 1;
  } finally {
    mockServer.close();
  }
}

start();
