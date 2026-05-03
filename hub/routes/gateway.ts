import { Router } from 'express';
import { pool } from '../db';

const router = Router();

router.post('/register', async (req, res) => {
  const { instance_id, status } = req.body || {};
  if (!instance_id) {
    return res.status(400).json({ error: 'instance_id required' });
  }
  await pool.query(
    `INSERT INTO gateways (instance_id, status, last_seen)
     VALUES ($1, $2, $3)
     ON CONFLICT (instance_id)
     DO UPDATE SET status = EXCLUDED.status, last_seen = EXCLUDED.last_seen`,
    [instance_id, status || 'online', Date.now()],
  );
  res.json({ status: 'registered' });
});

router.get('/list', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT instance_id, status, last_seen FROM gateways ORDER BY last_seen DESC LIMIT 100',
  );
  res.json(rows);
});

router.get('/config', async (_req, res) => {
  const providersResult = await pool.query(
    `SELECT id, label, base_url, driver_type, models, enabled, sort_order, docs_url
     FROM provider_types
     WHERE enabled = true
     ORDER BY sort_order ASC, id ASC`,
  );
  const keysResult = await pool.query(
    'SELECT provider, key, status FROM provider_keys WHERE status = $1 ORDER BY provider ASC',
    ['active'],
  );
  res.json({
    providers: providersResult.rows.map((row) => ({
      id: row.id,
      name: row.id,
      label: row.label,
      base_url: row.base_url,
      driver_type: row.driver_type,
      models: row.models,
      docs_url: row.docs_url,
    })),
    keys: keysResult.rows,
  });
});

router.post('/usage', async (req, res) => {
  const {
    model,
    tokens,
    latency,
    status,
    user_id,
    cost,
    request_correlation_id,
    provider_account_id,
    provider_key_id,
  } = req.body || {};
  await pool.query(
    `INSERT INTO activity (
      timestamp,
      model,
      tokens,
      latency,
      status,
      user_id,
      cost,
      request_correlation_id,
      provider_account_id,
      provider_key_id
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      Date.now(),
      model || 'unknown',
      Number(tokens || 0),
      Number(latency || 0),
      Number(status || 200),
      user_id || 'system',
      cost || '$0.00',
      request_correlation_id || null,
      provider_account_id || null,
      provider_key_id || null,
    ],
  );
  res.json({ status: 'received' });
});

export default router;
