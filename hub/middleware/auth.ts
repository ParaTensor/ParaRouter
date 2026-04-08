import { Response, NextFunction } from 'express';
import { pool } from '../db';
import { AuthUser, AuthenticatedRequest } from '../types';

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const publicPaths = new Set(['/health', '/auth/login', '/auth/register/request', '/auth/register/verify', '/models']);
  if (publicPaths.has(req.path) || req.path === '/gateway/usage') {
    return next();
  }
  const authorization = String(req.header('authorization') || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const now = Date.now();
  const sessionResult = await pool.query(
    `SELECT s.token, u.id, u.username, u.email, u.display_name, u.role, u.status, u.balance
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.revoked_at IS NULL AND s.expires_at > $2
     LIMIT 1`,
    [token, now],
  );
  const user = sessionResult.rows[0] as AuthUser | undefined;
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.authUser = user;
  req.authToken = token;
  // Update last seen in the background
  pool.query('UPDATE auth_sessions SET last_seen_at = $2 WHERE token = $1', [token, now]).catch(console.error);
  next();
}

export function requireRole(role: 'admin' | 'user') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (req.authUser.role !== role) {
      // If asking for 'user' and user is 'admin', they usually have broader permissions,
      // but in this distinct setup, 'admin' inherently covers 'user'
      if (role === 'user' && req.authUser.role === 'admin') {
        return next();
      }
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}
