import { pool } from './db.js';
async function main() {
  const accs = await pool.query("SELECT id, status FROM provider_accounts");
  console.log("Accs:", accs.rows);
  const keys = await pool.query("SELECT id, provider_account_id, status FROM provider_api_keys");
  console.log("Keys:", keys.rows);
  process.exit(0);
}
main();
