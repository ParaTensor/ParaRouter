const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://localhost:5432/pararouter' });

async function test() {
  const providers = await pool.query('SELECT * FROM providers');
  const provider = providers.rows.find(p => p.base_url && p.base_url.includes('kaopuapi'));
  if (!provider) {
    console.log("Kaopu API provider not found.");
    process.exit(1);
  }
  
  console.log("Testing base_url:", provider.base_url);
  
  const payload = {
    model: "claude-3-opus-20240229", // Typical real model name for Claude Opus
    messages: [{role: "user", content: "Count from 1 to 5 slowly"}],
    stream: true
  };

  const fe = await fetch(provider.base_url + '/chat/completions', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${provider.api_key}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  console.log("Status:", fe.status);
  
  const start = Date.now();
  const reader = fe.body.getReader();
  while(true) {
      const {value, done} = await reader.read();
      if(done) break;
      const elapsed = (Date.now() - start) / 1000;
      console.log(`[+${elapsed.toFixed(2)}s] chunk size:`, value.length);
  }
  process.exit(0);
}
test();
