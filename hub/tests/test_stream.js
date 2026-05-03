const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://localhost:5432/pararouter' });

async function test() {
  const res = await pool.query('SELECT key FROM user_api_keys LIMIT 1');
  const key = res.rows[0].key;
  
  const payload = {
    model: "claude-3-haiku-20240307", 
    messages: [{role: "user", content: "hi"}],
    stream: true
  };
  
  const fe = await fetch('http://127.0.0.1:8000/v1/chat/completions', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  console.log("Status:", fe.status);
  console.log("Headers:");
  for (let [k, v] of fe.headers) {
    console.log(k, v);
  }
  
  process.exit(0);
}
test();
