const { pool } = require('./build/db.js');

async function updateModels() {
  const res = await pool.query('SELECT id, name FROM llm_models');
  console.log(res.rows);
  process.exit(0);
}
updateModels();
