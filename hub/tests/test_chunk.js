const { execSync } = require('child_process');
const { readFileSync } = require('fs');

async function run() {
  const rs = await fetch('http://127.0.0.1:8000/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer 123'
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [{role: "user", content: "hi"}],
      stream: true
    })
  });
  console.log("Status:", rs.status); // Expect 401, but we just want to see if we can do this without auth
}
run();
