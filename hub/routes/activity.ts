import { Router } from 'express';
import { pool } from '../db';

const router = Router();

router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const { rows } = await pool.query(
    'SELECT id, timestamp, model, tokens, latency, status, user_id, cost FROM activity ORDER BY timestamp DESC LIMIT $1',
    [limit],
  );
  res.json(rows);
});

export default router;
