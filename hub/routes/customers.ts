import { Router } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { pool } from '../db';
import { AuthenticatedRequest } from '../types';
import { hashPassword, normalizeEmail, normalizeUsername } from '../utils';

const router = Router();

// List all customers (admin only)
router.get('/', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'admin required' });
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.email, u.display_name, u.role, u.status, u.balance, u.created_at,
       u.allowed_models, u.pricing_multiplier,
       (SELECT COUNT(*) FROM user_api_keys k WHERE k.uid = u.id) AS key_count
     FROM users u
     ORDER BY u.created_at DESC`
  );

  res.json(
    rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      balance: Number(row.balance || 0),
      createdAt: new Date(Number(row.created_at)).toISOString(),
      keyCount: Number(row.key_count || 0),
      pricingMultiplier: row.pricing_multiplier != null ? Number(row.pricing_multiplier) : 1,
      allowedModels: Array.isArray(row.allowed_models)
        ? row.allowed_models.filter((x: unknown) => typeof x === 'string')
        : null,
    }))
  );
});

// Create customer (admin only) — creates user + API key in one step
router.post('/', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'admin required' });
  }

  try {
    const username = normalizeUsername(req.body?.username || '');
    let email = normalizeEmail(req.body?.email || '');
    const password = String(req.body?.password || randomBytes(6).toString('hex'));
    const balance = Number(req.body?.balance) || 10.0;
    
    let allowedModels = null;
    if (Array.isArray(req.body?.allowedModels) && req.body.allowedModels.length > 0) {
      allowedModels = JSON.stringify(req.body.allowedModels);
    }

    if (!username) {
      return res.status(400).json({ error: 'username required' });
    }

    if (!email) {
      email = `${username}@pararouter.local`;
    }

    const conflict = await pool.query(
      'SELECT 1 FROM users WHERE username = $1 OR email = $2 LIMIT 1',
      [username, email]
    );

    if (conflict.rows.length > 0) {
      return res.status(409).json({ error: 'username or email already exists' });
    }

    const userId = randomUUID();
    const now = Date.now();

    // 1. Create user
    await pool.query(
      `INSERT INTO users (id, username, email, display_name, password_hash, role, status, created_at, updated_at, balance, allowed_models)
       VALUES ($1, $2, $3, $4, $5, 'user', 'active', $6, $7, $8, $9)`,
      [userId, username, email, username, hashPassword(password), now, now, balance, allowedModels]
    );

    // 2. Generate API Key
    const keyId = randomUUID();
    const apiKey = `sk-${randomBytes(24).toString('hex')}`;

    await pool.query(
      `INSERT INTO user_api_keys (id, name, key, uid, created_at, last_used, usage)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [keyId, 'Default', apiKey, userId, now, 'Never', '$0.00']
    );

    res.json({
      status: 'created',
      user: { id: userId, username, email, password, balance },
      apiKey,
    });
  } catch (err: any) {
    console.error('POST /api/admin/customers', err);
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'username or email already exists' });
    }
    return res.status(500).json({ error: err?.message || 'failed to create customer' });
  }
});

// Update customer (admin only)
router.patch('/:userId', async (req: AuthenticatedRequest, res) => {
  const admin = req.authUser;
  if (!admin || admin.role !== 'admin') {
    return res.status(403).json({ error: 'admin required' });
  }

  const userId = req.params.userId;
  const { rows: existingRows } = await pool.query(
    `SELECT id, username, email, display_name, role, status, balance, allowed_models, pricing_multiplier
     FROM users WHERE id = $1`,
    [userId]
  );
  if (existingRows.length === 0) {
    return res.status(404).json({ error: 'user not found' });
  }
  const existing = existingRows[0] as {
    id: string;
    username: string;
    email: string;
    display_name: string;
    role: string;
    status: string;
    balance: number;
    allowed_models: unknown;
    pricing_multiplier: number | null;
  };

  const body = req.body || {};
  const now = Date.now();
  const sets: string[] = [];
  const values: unknown[] = [];
  let p = 1;

  if (body.username !== undefined) {
    const username = normalizeUsername(String(body.username || ''));
    if (!username) {
      return res.status(400).json({ error: 'invalid username' });
    }
    if (username !== existing.username) {
      const dup = await pool.query('SELECT 1 FROM users WHERE username = $1 AND id <> $2 LIMIT 1', [
        username,
        userId,
      ]);
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: 'username already exists' });
      }
      sets.push(`username = $${p++}`, `display_name = $${p++}`);
      values.push(username, username);
    }
  }

  if (body.email !== undefined) {
    let email = normalizeEmail(String(body.email || ''));
    if (!email) {
      email = `${existing.username}@pararouter.local`;
    }
    if (email !== existing.email) {
      const dup = await pool.query('SELECT 1 FROM users WHERE email = $1 AND id <> $2 LIMIT 1', [email, userId]);
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: 'email already exists' });
      }
    }
    sets.push(`email = $${p++}`);
    values.push(email);
  }

  if (body.displayName !== undefined) {
    const displayName = String(body.displayName || '').trim() || existing.username;
    sets.push(`display_name = $${p++}`);
    values.push(displayName);
  }

  if (body.balance !== undefined) {
    const balance = Number(body.balance);
    if (Number.isNaN(balance) || balance < 0) {
      return res.status(400).json({ error: 'invalid balance' });
    }
    sets.push(`balance = $${p++}`);
    values.push(balance);
  }

  if (body.status !== undefined) {
    const status = String(body.status || '').toLowerCase();
    if (status !== 'active' && status !== 'inactive') {
      return res.status(400).json({ error: 'invalid status' });
    }
    if (status === 'inactive' && admin.id === userId) {
      return res.status(400).json({ error: 'cannot deactivate your own account' });
    }
    if (status === 'inactive' && existing.role === 'admin') {
      const { rows: ac } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin' AND status = 'active' AND id <> $1`,
        [userId]
      );
      if (Number(ac[0]?.c || 0) < 1) {
        return res.status(400).json({ error: 'cannot deactivate the last active admin' });
      }
    }
    sets.push(`status = $${p++}`);
    values.push(status);
  }

  if (body.pricingMultiplier !== undefined) {
    const pricingMultiplier = Number(body.pricingMultiplier);
    if (Number.isNaN(pricingMultiplier) || pricingMultiplier <= 0) {
      return res.status(400).json({ error: 'invalid pricingMultiplier' });
    }
    sets.push(`pricing_multiplier = $${p++}`);
    values.push(pricingMultiplier);
  }

  if (body.allowedModels !== undefined) {
    if (body.allowedModels === null) {
      sets.push(`allowed_models = $${p++}`);
      values.push(null);
    } else if (Array.isArray(body.allowedModels)) {
      const ids = body.allowedModels.filter((x: unknown) => typeof x === 'string') as string[];
      sets.push(`allowed_models = $${p++}`);
      values.push(ids.length > 0 ? JSON.stringify(ids) : null);
    } else {
      return res.status(400).json({ error: 'allowedModels must be an array or null' });
    }
  }

  const newPassword = body.newPassword != null ? String(body.newPassword) : '';
  if (newPassword.length > 0) {
    sets.push(`password_hash = $${p++}`);
    values.push(hashPassword(newPassword));
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'no fields to update' });
  }

  sets.push(`updated_at = $${p++}`);
  values.push(now);
  values.push(userId);

  try {
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${p}`, values);
  } catch (err: any) {
    console.error('PATCH /api/admin/customers/:userId', err);
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'username or email already exists' });
    }
    return res.status(500).json({ error: err?.message || 'failed to update customer' });
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.email, u.display_name, u.role, u.status, u.balance, u.created_at,
       u.allowed_models, u.pricing_multiplier,
       (SELECT COUNT(*) FROM user_api_keys k WHERE k.uid = u.id) AS key_count
     FROM users u WHERE u.id = $1`,
    [userId]
  );
  const row = rows[0];
  res.json({
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    balance: Number(row.balance || 0),
    createdAt: new Date(Number(row.created_at)).toISOString(),
    keyCount: Number(row.key_count || 0),
    pricingMultiplier: row.pricing_multiplier != null ? Number(row.pricing_multiplier) : 1,
    allowedModels: Array.isArray(row.allowed_models)
      ? row.allowed_models.filter((x: unknown) => typeof x === 'string')
      : null,
  });
});

// Get API keys for a specific user (admin only)
router.get('/:userId/keys', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'admin required' });
  }

  const { rows } = await pool.query(
    `SELECT id, name, key, uid, created_at, last_used, usage
     FROM user_api_keys
     WHERE uid = $1
     ORDER BY created_at DESC`,
    [req.params.userId]
  );

  res.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      key: row.key,
      createdAt: new Date(Number(row.created_at)).toISOString(),
      lastUsed: row.last_used || 'Never',
      usage: row.usage || '$0.00',
    }))
  );
});

// Create an API key for a specific user (admin only)
router.post('/:userId/keys', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'admin required' });
  }

  const name = String(req.body?.name || 'Default').trim();
  const keyId = randomUUID();
  const apiKey = `sk-${randomBytes(24).toString('hex')}`;
  const now = Date.now();

  await pool.query(
    `INSERT INTO user_api_keys (id, name, key, uid, created_at, last_used, usage)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [keyId, name, apiKey, req.params.userId, now, 'Never', '$0.00']
  );

  res.json({ id: keyId, key: apiKey, name });
});

// Delete an API key (admin only)
router.delete('/keys/:keyId', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'admin required' });
  }

  await pool.query('DELETE FROM user_api_keys WHERE id = $1', [req.params.keyId]);
  res.json({ status: 'deleted' });
});

export default router;
