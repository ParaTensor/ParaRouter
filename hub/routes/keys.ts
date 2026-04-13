import { Router } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../db';

const router = Router();

router.get('/', async (req, res) => {
  const uid = String(req.query.uid || 'local-admin');
  const { rows } = await pool.query(
    `SELECT id, name, key, uid, created_at, last_used, usage, allowed_models, budget_limit
     FROM user_api_keys
     WHERE uid = $1
     ORDER BY created_at DESC`,
    [uid],
  );
  res.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      key: row.key,
      uid: row.uid,
      createdAt: new Date(Number(row.created_at)).toISOString(),
      lastUsed: row.last_used || 'Never',
      usage: row.usage || '$0.00',
      allowedModels: row.allowed_models ? row.allowed_models : undefined,
      budgetLimit: row.budget_limit !== null ? Number(row.budget_limit) : undefined,
    })),
  );
});

router.post('/', async (req, res) => {
  const { name, key, uid, lastUsed, usage, budgetLimit, allowedModels } = req.body || {};
  if (!name || !key || !uid) {
    return res.status(400).json({ error: 'name/key/uid required' });
  }
  const id = randomUUID();
  const createdAt = Date.now();
  
  let parsedModels = null;
  if (Array.isArray(allowedModels) && allowedModels.length > 0) {
    parsedModels = JSON.stringify(allowedModels);
  }
  
  await pool.query(
    `INSERT INTO user_api_keys (id, name, key, uid, created_at, last_used, usage, allowed_models, budget_limit)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, name, key, uid, createdAt, lastUsed || 'Never', usage || '$0.00', parsedModels, budgetLimit || null],
  );
  res.status(201).json({ id, createdAt });
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM user_api_keys WHERE id = $1', [req.params.id]);
  res.json({ status: 'deleted' });
});

export default router;
