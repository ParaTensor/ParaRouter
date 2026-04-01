import express from 'express';
import {createServer as createViteServer} from 'vite';
import path from 'path';
import {fileURLToPath} from 'url';
import {Pool} from 'pg';
import {randomUUID} from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/openhub';

const pool = new Pool({connectionString: databaseUrl});

type ModelPayload = {
  id: string;
  name: string;
  provider: string;
  description?: string;
  context?: string;
  pricing?: {prompt?: string; completion?: string};
  tags?: string[];
  isPopular?: boolean;
  latency?: string;
  status?: string;
};

const providerBaseUrls: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  mistral: 'https://api.mistral.ai/v1',
  meta: 'https://api.meta.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
};

function normalizeProviderId(provider: string) {
  return provider
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parsePrice(raw: string | undefined) {
  if (!raw) return null;
  const value = Number(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) ? value : null;
}

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      description TEXT,
      context TEXT,
      pricing_prompt TEXT,
      pricing_completion TEXT,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_popular BOOLEAN NOT NULL DEFAULT false,
      latency TEXT,
      status TEXT NOT NULL DEFAULT 'online'
    );

    CREATE TABLE IF NOT EXISTS provider_types (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      base_url TEXT NOT NULL,
      driver_type TEXT NOT NULL DEFAULT 'openai_compatible',
      models JSONB NOT NULL DEFAULT '[]'::jsonb,
      enabled BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      docs_url TEXT,
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_keys (
      provider TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT NOT NULL,
      uid TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      last_used TEXT,
      usage TEXT
    );

    CREATE TABLE IF NOT EXISTS activity (
      id BIGSERIAL PRIMARY KEY,
      timestamp BIGINT NOT NULL,
      model TEXT NOT NULL,
      tokens INTEGER NOT NULL DEFAULT 0,
      latency INTEGER NOT NULL DEFAULT 0,
      status INTEGER NOT NULL DEFAULT 200,
      user_id TEXT,
      cost TEXT
    );

    CREATE TABLE IF NOT EXISTS gateways (
      instance_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      last_seen BIGINT NOT NULL
    );
  `);
}

function mapModel(row: any) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    description: row.description || '',
    context: row.context || '',
    pricing: {
      prompt: row.pricing_prompt || '$0.00',
      completion: row.pricing_completion || '$0.00',
    },
    tags: Array.isArray(row.tags) ? row.tags : [],
    isPopular: row.is_popular,
    latency: row.latency || '0.0s',
    status: row.status || 'online',
  };
}

async function upsertModel(model: ModelPayload) {
  await pool.query(
    `INSERT INTO models (id, name, provider, description, context, pricing_prompt, pricing_completion, tags, is_popular, latency, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
     ON CONFLICT (id)
     DO UPDATE SET
       name = EXCLUDED.name,
       provider = EXCLUDED.provider,
       description = EXCLUDED.description,
       context = EXCLUDED.context,
       pricing_prompt = EXCLUDED.pricing_prompt,
       pricing_completion = EXCLUDED.pricing_completion,
       tags = EXCLUDED.tags,
       is_popular = EXCLUDED.is_popular,
       latency = EXCLUDED.latency,
       status = EXCLUDED.status`,
    [
      model.id,
      model.name,
      model.provider,
      model.description || '',
      model.context || '',
      model.pricing?.prompt || '$0.00',
      model.pricing?.completion || '$0.00',
      JSON.stringify(model.tags || []),
      Boolean(model.isPopular),
      model.latency || '0.0s',
      model.status || 'online',
    ],
  );
}

async function rebuildProviderTypesFromModels() {
  const {rows} = await pool.query(
    `SELECT id, name, provider, description, context, pricing_prompt, pricing_completion
     FROM models
     ORDER BY provider ASC, name ASC`,
  );

  const grouped = new Map<
    string,
    {
      label: string;
      models: Array<{
        id: string;
        name: string;
        description: string;
        context_length: number | null;
        input_price: number | null;
        output_price: number | null;
      }>;
    }
  >();

  for (const row of rows) {
    const id = normalizeProviderId(row.provider || 'unknown');
    if (!grouped.has(id)) {
      grouped.set(id, {label: row.provider || id, models: []});
    }
    const contextLength = Number(String(row.context || '').replace(/[^0-9]/g, ''));
    grouped.get(id)!.models.push({
      id: row.id,
      name: row.name,
      description: row.description || '',
      context_length: Number.isFinite(contextLength) && contextLength > 0 ? contextLength : null,
      input_price: parsePrice(row.pricing_prompt),
      output_price: parsePrice(row.pricing_completion),
    });
  }

  for (const [id, entry] of grouped) {
    await pool.query(
      `INSERT INTO provider_types (id, label, base_url, driver_type, models, enabled, sort_order, docs_url, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
       ON CONFLICT (id)
       DO UPDATE SET
         label = EXCLUDED.label,
         base_url = EXCLUDED.base_url,
         driver_type = EXCLUDED.driver_type,
         models = EXCLUDED.models,
         enabled = EXCLUDED.enabled,
         sort_order = EXCLUDED.sort_order,
         docs_url = EXCLUDED.docs_url,
         updated_at = EXCLUDED.updated_at`,
      [
        id,
        entry.label,
        providerBaseUrls[id] || '',
        'openai_compatible',
        JSON.stringify(entry.models),
        true,
        0,
        null,
        Date.now(),
      ],
    );
  }
}

async function startServer() {
  await initSchema();

  const app = express();
  app.use(express.json());

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({status: 'ok', database: 'connected'});
    } catch {
      res.status(500).json({status: 'error', database: 'disconnected'});
    }
  });

  app.get('/api/models', async (_req, res) => {
    const {rows} = await pool.query('SELECT * FROM models ORDER BY name ASC');
    res.json(rows.map(mapModel));
  });

  app.post('/api/models/sync', async (req, res) => {
    const models = Array.isArray(req.body?.models) ? (req.body.models as ModelPayload[]) : [];
    for (const model of models) {
      await upsertModel(model);
    }
    await rebuildProviderTypesFromModels();
    res.json({status: 'synced', count: models.length});
  });

  app.post('/api/gateway/register', async (req, res) => {
    const {instance_id, status} = req.body || {};
    if (!instance_id) {
      return res.status(400).json({error: 'instance_id required'});
    }
    await pool.query(
      `INSERT INTO gateways (instance_id, status, last_seen)
       VALUES ($1, $2, $3)
       ON CONFLICT (instance_id)
       DO UPDATE SET status = EXCLUDED.status, last_seen = EXCLUDED.last_seen`,
      [instance_id, status || 'online', Date.now()],
    );
    res.json({status: 'registered'});
  });

  app.get('/api/gateway/list', async (_req, res) => {
    const {rows} = await pool.query(
      'SELECT instance_id, status, last_seen FROM gateways ORDER BY last_seen DESC LIMIT 100',
    );
    res.json(rows);
  });

  app.get('/api/gateway/config', async (_req, res) => {
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

  app.get('/api/provider-types', async (_req, res) => {
    const {rows} = await pool.query(
      `SELECT id, label, base_url, driver_type, models, enabled, sort_order, docs_url
       FROM provider_types
       ORDER BY sort_order ASC, id ASC`,
    );
    res.json(rows);
  });

  app.post('/api/gateway/usage', async (req, res) => {
    const {model, tokens, latency, status, user_id, cost} = req.body || {};
    await pool.query(
      `INSERT INTO activity (timestamp, model, tokens, latency, status, user_id, cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        Date.now(),
        model || 'unknown',
        Number(tokens || 0),
        Number(latency || 0),
        Number(status || 200),
        user_id || 'system',
        cost || '$0.00',
      ],
    );
    res.json({status: 'received'});
  });

  app.get('/api/activity', async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const {rows} = await pool.query(
      'SELECT id, timestamp, model, tokens, latency, status, user_id, cost FROM activity ORDER BY timestamp DESC LIMIT $1',
      [limit],
    );
    res.json(rows);
  });

  app.get('/api/provider-keys', async (_req, res) => {
    const {rows} = await pool.query('SELECT provider, key, status FROM provider_keys ORDER BY provider ASC');
    res.json(rows);
  });

  app.put('/api/provider-keys/:provider', async (req, res) => {
    const provider = req.params.provider;
    const {key, status} = req.body || {};
    if (!key) {
      return res.status(400).json({error: 'key required'});
    }
    await pool.query(
      `INSERT INTO provider_keys (provider, key, status, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider)
       DO UPDATE SET key = EXCLUDED.key, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
      [provider, key, status || 'active', Date.now()],
    );
    await pool.query(
      `INSERT INTO provider_types (id, label, base_url, driver_type, models, enabled, sort_order, docs_url, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [provider, provider, providerBaseUrls[provider] || '', 'openai_compatible', JSON.stringify([]), true, 0, null, Date.now()],
    );
    res.json({status: 'saved'});
  });

  app.delete('/api/provider-keys/:provider', async (req, res) => {
    await pool.query('DELETE FROM provider_keys WHERE provider = $1', [req.params.provider]);
    res.json({status: 'deleted'});
  });

  app.get('/api/user-api-keys', async (req, res) => {
    const uid = String(req.query.uid || 'local-admin');
    const {rows} = await pool.query(
      `SELECT id, name, key, uid, created_at, last_used, usage
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
      })),
    );
  });

  app.post('/api/user-api-keys', async (req, res) => {
    const {name, key, uid, lastUsed, usage} = req.body || {};
    if (!name || !key || !uid) {
      return res.status(400).json({error: 'name/key/uid required'});
    }
    const id = randomUUID();
    const createdAt = Date.now();
    await pool.query(
      `INSERT INTO user_api_keys (id, name, key, uid, created_at, last_used, usage)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, name, key, uid, createdAt, lastUsed || 'Never', usage || '$0.00'],
    );
    res.status(201).json({id, createdAt});
  });

  app.delete('/api/user-api-keys/:id', async (req, res) => {
    await pool.query('DELETE FROM user_api_keys WHERE id = $1', [req.params.id]);
    res.json({status: 'deleted'});
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      configFile: path.join(__dirname, 'vite.config.ts'),
      server: {middlewareMode: true},
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
