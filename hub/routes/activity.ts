import { Router } from 'express';
import { pool } from '../db';
import { AuthenticatedRequest } from '../types';

const router = Router();

function buildWhereClauses(
  targetUserId: string | null,
  search: string,
  startTime: number | null,
  endTime: number | null,
) {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (targetUserId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(targetUserId);
  }
  if (search) {
    conditions.push(`model ILIKE $${paramIndex++}`);
    params.push(`%${search}%`);
  }
  if (startTime) {
    conditions.push(`timestamp >= $${paramIndex++}`);
    params.push(startTime);
  }
  if (endTime) {
    conditions.push(`timestamp <= $${paramIndex++}`);
    params.push(endTime);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params, paramIndex };
}

router.get('/', async (req: AuthenticatedRequest, res) => {
  const user = req.authUser;
  const isUser = user?.role === 'user';
  const isAdmin = user?.role === 'admin';
  const mine = req.query.mine === 'true';
  const userIdParam = isAdmin && !mine && req.query.userId ? String(req.query.userId) : null;
  const showMineOnly = isUser || (isAdmin && mine);
  const targetUserId = showMineOnly ? user?.id : userIdParam;

  const search = String(req.query.search || '');
  const startTime = req.query.startTime ? Number(req.query.startTime) : null;
  const endTime = req.query.endTime ? Number(req.query.endTime) : null;
  const limit = Math.min(Number(req.query.limit || 20), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  const { where, params, paramIndex } = buildWhereClauses(targetUserId, search, startTime, endTime);

  try {
    const listQuery = `SELECT id, timestamp, model, tokens, latency, status, user_id, cost FROM activity ${where} ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const listParams = [...params, limit, offset];

    const countQuery = `SELECT COUNT(*) as total FROM activity ${where}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(listQuery, listParams),
      pool.query(countQuery, params),
    ]);

    res.json({ rows, total: Number(countRows[0].total || 0) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.authUser;
    const isUser = user?.role === 'user';
    const isAdmin = user?.role === 'admin';
    const mine = req.query.mine === 'true';
    const userIdParam = isAdmin && !mine && req.query.userId ? String(req.query.userId) : null;
    const showMineOnly = isUser || (isAdmin && mine);
    const targetUserId = showMineOnly ? user?.id : userIdParam;

    const search = String(req.query.search || '');
    let startTime = req.query.startTime ? Number(req.query.startTime) : null;
    let endTime = req.query.endTime ? Number(req.query.endTime) : null;
    let previousStartTime: number | null = null;
    let previousEndTime: number | null = null;

    if (!startTime || !endTime) {
      const now = Date.now();
      endTime = now;
      startTime = now - 7 * 24 * 60 * 60 * 1000;
      previousEndTime = startTime;
      previousStartTime = startTime - 7 * 24 * 60 * 60 * 1000;
    } else {
      const duration = endTime - startTime;
      previousEndTime = startTime;
      previousStartTime = startTime - duration;
    }

    const { where, params } = buildWhereClauses(targetUserId, search, startTime, endTime);
    const { where: prevWhere, params: prevParams } = buildWhereClauses(
      targetUserId,
      search,
      previousStartTime,
      previousEndTime,
    );

    // 1. Current period summary
    const currentQuery = `
      SELECT 
        SUM(tokens) as total_tokens,
        SUM(CAST(REPLACE(REPLACE(COALESCE(cost, '0'), '$', ''), ',', '') AS NUMERIC)) as total_cost,
        AVG(latency) as avg_latency
      FROM activity
      ${where}
    `;

    // 2. Previous period summary (for comparison)
    const previousQuery = `
      SELECT 
        SUM(tokens) as total_tokens,
        SUM(CAST(REPLACE(REPLACE(COALESCE(cost, '0'), '$', ''), ',', '') AS NUMERIC)) as total_cost,
        AVG(latency) as avg_latency
      FROM activity
      ${prevWhere}
    `;

    // 3. Daily trend
    const trendQuery = `
      SELECT 
        to_char(to_timestamp(timestamp / 1000), 'Mon DD') as date,
        SUM(tokens) as tokens,
        SUM(CAST(REPLACE(REPLACE(COALESCE(cost, '0'), '$', ''), ',', '') AS NUMERIC)) as cost
      FROM activity
      ${where}
      GROUP BY date
      ORDER BY MIN(timestamp)
    `;

    const [{ rows: currentStats }, { rows: previousStats }, { rows: dailyTrend }] = await Promise.all([
      pool.query(currentQuery, params),
      pool.query(previousQuery, prevParams),
      pool.query(trendQuery, params),
    ]);

    const calculateChange = (current: number | null, previous: number | null) => {
      if (!current || !previous) return null;
      const change = ((current - previous) / previous) * 100;
      return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
    };

    const current = currentStats[0];
    const previous = previousStats[0];

    res.json({
      summary: {
        totalTokens: Number(current.total_tokens || 0),
        totalCost: Number(current.total_cost || 0),
        avgLatency: Number(current.avg_latency || 0),
        changes: {
          tokens: calculateChange(Number(current.total_tokens), Number(previous.total_tokens)),
          cost: calculateChange(Number(current.total_cost), Number(previous.total_cost)),
          latency: calculateChange(Number(current.avg_latency), Number(previous.avg_latency)),
        },
      },
      trend: dailyTrend.map((t) => ({
        date: t.date,
        tokens: Number(t.tokens),
        cost: Number(t.cost),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
