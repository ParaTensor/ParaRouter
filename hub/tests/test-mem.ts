const pg = require('pg');
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/pararouter' });

async function run() {
  const provider = 'memtensor';
  const { rows } = await pool.query('SELECT base_url, api_key, provider_type FROM provider_accounts WHERE id = $1', [provider]);
  console.log('Provider Rows:', rows);
  if (!rows.length) return console.log('Not found');

  let baseUrl = rows[0].base_url || '';
  const apiKey = rows[0].api_key || '';
  const providerType = rows[0].provider_type || 'openai_compatible';
  
  const ptResult = await pool.query('SELECT driver_type FROM provider_types WHERE id = $1', [providerType]);
  const driverType = ptResult.rows[0]?.driver_type || 'openai_compatible';
  
  console.log('Provider Type:', providerType, 'Driver Type:', driverType);

  if (baseUrl.endsWith('/chat/completions')) {
      baseUrl = baseUrl.replace('/chat/completions', '');
  }
  baseUrl = baseUrl.replace(/\/$/, '');
  
  console.log('Fetching:', `${baseUrl}/models`);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (driverType === 'anthropic' || providerType.includes('anthropic')) {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    const response = await fetch(`${baseUrl}/models`, { method: 'GET', headers });
    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response body:', text);
  } catch(e) {
    console.error('Fetch error:', e);
  }
  process.exit(0);
}
run();
