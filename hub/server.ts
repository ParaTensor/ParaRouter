import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';
dotenv.config({ override: true });

import { pool, initSchema } from './db';
import { AuthUser, AuthenticatedRequest } from './types';
import authRouter from './routes/auth';
import modelsRouter from './routes/models';
import pricingRouter from './routes/pricing';
import gatewayRouter from './routes/gateway';
import providersRouter from './routes/providers';
import { authenticate } from './middleware/auth';
import keysRouter from './routes/keys';
import activityRouter from './routes/activity';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);

async function startServer() {
  await initSchema();

  const app = express();

  app.use((req, res, next) => {
    const origin = req.header('origin');
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  app.use(express.json());

  // Check Auth Middleware for /api routes
  app.use('/api', authenticate);

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(500).json({ status: 'error', database: 'disconnected' });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/models', modelsRouter);
  app.use('/api/pricing', pricingRouter);
  app.use('/api/gateway', gatewayRouter);
  app.use('/api', providersRouter);
  app.use('/api/user-api-keys', keysRouter);
  app.use('/api/activity', activityRouter);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      configFile: path.join(__dirname, '../web/vite.config.ts'),
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
