import { Router } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { pool } from '../db';
import { AuthenticatedRequest } from '../types';
import { AuthUser } from '@pararouter/shared';
import {
  hashPassword,
  verifyPassword,
  normalizeEmail,
  isValidEmail,
  normalizeUsername,
  generateVerificationCode,
  toAuthSessionResponse,
  sendRegisterVerificationEmail,
} from '../utils';

const router = Router();

router.post('/login', async (req, res) => {
  const accountRaw = String(req.body?.account || req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!accountRaw || !password) {
    return res.status(400).json({ error: 'account and password required' });
  }
  const account = accountRaw.toLowerCase();
  const result = await pool.query(
    `SELECT id, username, email, display_name, role, status, balance, password_hash
     FROM users
     WHERE username = $1 OR email = $2
     LIMIT 1`,
    [normalizeUsername(account), normalizeEmail(account)],
  );
  const user = result.rows[0];
  if (!user || user.status !== 'active' || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = randomBytes(24).toString('hex');
  const now = Date.now();
  await pool.query(
    `INSERT INTO auth_sessions (token, user_id, created_at, expires_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [token, user.id, now, now + 30 * 24 * 60 * 60 * 1000, now],
  );
  await pool.query('UPDATE users SET last_login_at = $2 WHERE id = $1', [user.id, now]);
  res.json(
    toAuthSessionResponse(token, {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.display_name,
      role: user.role === 'admin' ? 'admin' : 'user',
      status: user.status,
      balance: user.balance,
    }),
  );
});

router.post('/register/request', async (req, res) => {
  const username = normalizeUsername(req.body?.username || '');
  const email = normalizeEmail(req.body?.email || '');
  const password = String(req.body?.password || '');
  const displayName = String(req.body?.display_name || username).trim() || username;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'invalid email' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 chars' });
  }
  const conflict = await pool.query(
    'SELECT 1 FROM users WHERE username = $1 OR email = $2 LIMIT 1',
    [username, email],
  );
  if (conflict.rowCount) {
    return res.status(409).json({ error: 'username or email already exists' });
  }
  const now = Date.now();
  const code = generateVerificationCode();
  await pool.query('DELETE FROM email_verifications WHERE email = $1 AND used_at IS NULL', [email]);
  await pool.query(
    `INSERT INTO email_verifications (id, email, username, display_name, password_hash, code_hash, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      randomUUID(),
      email,
      username,
      displayName,
      hashPassword(password),
      hashPassword(code),
      now,
      now + 10 * 60 * 1000,
    ],
  );
  try {
    await sendRegisterVerificationEmail(email, code);
    res.json({ status: 'sent', email });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'failed to send verification email' });
  }
});

router.post('/register/verify', async (req, res) => {
  const email = normalizeEmail(req.body?.email || '');
  const code = String(req.body?.code || '').trim();
  if (!email || !code) {
    return res.status(400).json({ error: 'email and code required' });
  }
  const now = Date.now();
  const verificationResult = await pool.query(
    `SELECT id, username, display_name, password_hash, code_hash, expires_at
     FROM email_verifications
     WHERE email = $1 AND used_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [email],
  );
  const verification = verificationResult.rows[0];
  if (!verification) {
    return res.status(400).json({ error: 'verification not found' });
  }
  if (Number(verification.expires_at) < now) {
    return res.status(400).json({ error: 'verification expired' });
  }
  if (!verifyPassword(code, verification.code_hash)) {
    return res.status(400).json({ error: 'invalid code' });
  }
  const conflict = await pool.query(
    'SELECT 1 FROM users WHERE username = $1 OR email = $2 LIMIT 1',
    [verification.username, email],
  );
  if (conflict.rowCount) {
    return res.status(409).json({ error: 'username or email already exists' });
  }
  const userId = randomUUID();
  const userInsertResult = await pool.query(
    `INSERT INTO users (id, username, email, display_name, password_hash, role, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'user', 'active', $6, $7)
     RETURNING balance`,
    [userId, verification.username, email, verification.display_name, verification.password_hash, now, now],
  );
  const insertedBalance = userInsertResult.rows[0]?.balance || 10.0;
  await pool.query('UPDATE email_verifications SET used_at = $2 WHERE id = $1', [verification.id, now]);
  const token = randomBytes(24).toString('hex');
  await pool.query(
    `INSERT INTO auth_sessions (token, user_id, created_at, expires_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [token, userId, now, now + 30 * 24 * 60 * 60 * 1000, now],
  );
  res.json(
    toAuthSessionResponse(token, {
      id: userId,
      username: verification.username,
      email,
      display_name: verification.display_name,
      role: 'user',
      status: 'active',
      balance: insertedBalance,
    }),
  );
});

router.post('/logout', async (req: AuthenticatedRequest, res) => {
  const token = String(req.authToken || '');
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  await pool.query('UPDATE auth_sessions SET revoked_at = $2 WHERE token = $1', [token, Date.now()]);
  res.json({ status: 'logged_out' });
});

router.get('/me', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  res.json({
    uid: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    balance: user.balance,
  });
});

router.post('/change-password', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser;
  const token = String(req.authToken || '');
  if (!user || !token) return res.status(401).json({ error: 'unauthorized' });
  const currentPassword = String(req.body?.current_password || '');
  const nextPassword = String(req.body?.new_password || '');
  if (!currentPassword || !nextPassword) {
    return res.status(400).json({ error: 'current_password and new_password required' });
  }
  if (nextPassword.length < 8) {
    return res.status(400).json({ error: 'new password must be at least 8 chars' });
  }
  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1 LIMIT 1', [user.id]);
  const currentHash = result.rows[0]?.password_hash;
  if (!currentHash || !verifyPassword(currentPassword, currentHash)) {
    return res.status(400).json({ error: 'current password invalid' });
  }
  await pool.query('UPDATE users SET password_hash = $2, updated_at = $3 WHERE id = $1', [
    user.id,
    hashPassword(nextPassword),
    Date.now(),
  ]);
  await pool.query('UPDATE auth_sessions SET revoked_at = $2 WHERE user_id = $1 AND token <> $3 AND revoked_at IS NULL', [
    user.id,
    Date.now(),
    token,
  ]);
  res.json({ status: 'password_updated' });
});
router.post('/set-admin', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  
  if (user.role !== 'admin') {
    return res.status(403).json({ 
      error: '无权限操作，仅管理员可修改角色', 
      code: 'org_admin_required' 
    });
  }

  const targetUsername = String(req.body?.username || '').trim();
  if (!targetUsername) {
    return res.status(400).json({ error: 'username required' });
  }

  const result = await pool.query(
    'UPDATE users SET role = $1, updated_at = $2 WHERE username = $3 RETURNING id',
    ['admin', Date.now(), targetUsername]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'user not found' });
  }

  res.json({ status: 'admin_role_granted' });
});

router.post('/admin/create-customer', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser;
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'admin required' });
  }

  const username = normalizeUsername(req.body?.username || '');
  let email = normalizeEmail(req.body?.email || '');
  // Auto-generate a 12-char random password if not provided
  const password = String(req.body?.password || randomBytes(6).toString('hex'));
  const balance = Number(req.body?.balance) || 10.0;
  
  if (!username) {
    return res.status(400).json({ error: 'username required' });
  }

  // If no email provided, create a dummy one for the customer
  if (!email) {
    email = `${username}@pararouter.local`;
  }

  const conflict = await pool.query(
    'SELECT 1 FROM users WHERE username = $1 OR email = $2 LIMIT 1',
    [username, email]
  );
  
  if (conflict.rowCount) {
    return res.status(409).json({ error: 'username or email already exists' });
  }

  const userId = randomUUID();
  const now = Date.now();
  
  // 1. Create the user
  await pool.query(
    `INSERT INTO users (id, username, email, display_name, password_hash, role, status, created_at, updated_at, balance)
     VALUES ($1, $2, $3, $4, $5, 'user', 'active', $6, $7, $8)`,
    [userId, username, email, username, hashPassword(password), now, now, balance],
  );

  // 2. Generate and bind an API Key for this new user
  const keyId = randomUUID();
  const apiKey = `sk-${randomBytes(24).toString('hex')}`;
  
  await pool.query(
    `INSERT INTO user_api_keys (id, name, key, uid, created_at, last_used, usage)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [keyId, 'Admin Assigned Key', apiKey, userId, now, 'Never', '$0.00'],
  );

  res.json({
    status: 'customer_created',
    message: 'Customer and API Key created successfully',
    account: {
      username,
      email,
      password,
      balance
    },
    api_key: apiKey
  });
});

export default router;
