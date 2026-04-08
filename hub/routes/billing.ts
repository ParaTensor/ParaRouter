import { Router } from 'express';
import { pool } from '../db';
import { AuthenticatedRequest } from '../types';

const router = Router();

router.post('/recharge', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'admin required' });
  }

  const targetUsername = String(req.body?.username || '').trim();
  const amountStr = String(req.body?.amount || '').trim();
  const amount = parseFloat(amountStr);

  if (!targetUsername || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'username and a valid amount > 0 required' });
  }

  // Use a transaction to update balance and record history
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get current user
    const userRes = await client.query('SELECT id, balance FROM users WHERE username = $1', [targetUsername]);
    if (userRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'user not found' });
    }
    const targetUserId = userRes.rows[0].id;
    const currentBalance = Number(userRes.rows[0].balance || 0);

    // 2. Add balance
    const nextBalance = currentBalance + amount;
    await client.query('UPDATE users SET balance = $1 WHERE id = $2', [nextBalance, targetUserId]);

    // 3. Record in billing_records
    await client.query(
      `INSERT INTO billing_records (user_id, amount, balance_after, type, description, timestamp)
       VALUES ($1, $2, $3, 'recharge', 'Admin Recharge', $4)`,
      [targetUserId, amount, nextBalance, Date.now()]
    );

    await client.query('COMMIT');
    res.json({ status: 'recharged', balance: nextBalance });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Recharge failed:', error);
    res.status(500).json({ error: 'internal server error' });
  } finally {
    client.release();
  }
});

export default router;
