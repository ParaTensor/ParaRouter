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

type PricingDraftUpsertRequest = {
  model: string;
  provider_account_id?: string | null;
  price_mode: 'fixed' | 'markup';
  input_price?: number | null;
  output_price?: number | null;
  cache_read_price?: number | null;
  cache_write_price?: number | null;
  reasoning_price?: number | null;
  markup_rate?: number | null;
  currency?: string;
  context_length?: number | null;
  latency_ms?: number | null;
  is_top_provider?: boolean | null;
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

function parseContextLength(raw: string | undefined) {
  if (!raw) return null;
  const value = Number(String(raw).replace(/[^0-9]/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function mapPricingRow(row: any) {
  return {
    model: row.model_id,
    provider_account_id: row.provider_account_id,
    price_mode: row.price_mode,
    input_price: row.input_price,
    output_price: row.output_price,
    cache_read_price: row.cache_read_price,
    cache_write_price: row.cache_write_price,
    reasoning_price: row.reasoning_price,
    markup_rate: row.markup_rate,
    currency: row.currency || 'USD',
    context_length: row.context_length,
    latency_ms: row.latency_ms,
    is_top_provider: Boolean(row.is_top_provider),
    status: row.status || 'online',
    version: row.version,
    updated_at: Number(row.updated_at || Date.now()),
  };
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

    CREATE TABLE IF NOT EXISTS llm_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      context_length INTEGER,
      global_pricing JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_accounts (
      id TEXT PRIMARY KEY,
      provider_type TEXT NOT NULL,
      label TEXT NOT NULL,
      base_url TEXT NOT NULL,
      docs_url TEXT,
      api_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_provider_pricings (
      model_id TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      price_mode TEXT NOT NULL CHECK (price_mode IN ('fixed', 'markup')),
      input_price DOUBLE PRECISION,
      output_price DOUBLE PRECISION,
      cache_read_price DOUBLE PRECISION,
      cache_write_price DOUBLE PRECISION,
      reasoning_price DOUBLE PRECISION,
      markup_rate DOUBLE PRECISION,
      currency TEXT NOT NULL DEFAULT 'USD',
      context_length INTEGER,
      latency_ms INTEGER,
      is_top_provider BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'online',
      version TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (model_id, provider_account_id, version),
      CHECK (
        (price_mode = 'fixed' AND input_price IS NOT NULL AND output_price IS NOT NULL AND markup_rate IS NULL) OR
        (price_mode = 'markup' AND markup_rate IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS model_provider_pricings_draft (
      model_id TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      price_mode TEXT NOT NULL CHECK (price_mode IN ('fixed', 'markup')),
      input_price DOUBLE PRECISION,
      output_price DOUBLE PRECISION,
      cache_read_price DOUBLE PRECISION,
      cache_write_price DOUBLE PRECISION,
      reasoning_price DOUBLE PRECISION,
      markup_rate DOUBLE PRECISION,
      currency TEXT NOT NULL DEFAULT 'USD',
      context_length INTEGER,
      latency_ms INTEGER,
      is_top_provider BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'online',
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (model_id, provider_account_id),
      CHECK (
        (price_mode = 'fixed' AND input_price IS NOT NULL AND output_price IS NOT NULL AND markup_rate IS NULL) OR
        (price_mode = 'markup' AND markup_rate IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS pricing_releases (
      version TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      summary JSONB NOT NULL,
      operator TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      config_version BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pricing_state (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      current_version TEXT NOT NULL DEFAULT 'bootstrap',
      config_version BIGINT NOT NULL DEFAULT 1,
      updated_at BIGINT NOT NULL
    );
  `);

  await pool.query(
    `INSERT INTO pricing_state (id, current_version, config_version, updated_at)
     VALUES (1, 'bootstrap', 1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [Date.now()],
  );

  await pool.query(`ALTER TABLE model_provider_pricings ADD COLUMN IF NOT EXISTS is_top_provider BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE model_provider_pricings_draft ADD COLUMN IF NOT EXISTS is_top_provider BOOLEAN NOT NULL DEFAULT false`);
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

async function upsertModelMetadataFromModel(model: ModelPayload) {
  await pool.query(
    `INSERT INTO llm_models (id, name, description, context_length, global_pricing, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (id)
     DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       context_length = EXCLUDED.context_length,
       global_pricing = EXCLUDED.global_pricing,
       updated_at = EXCLUDED.updated_at`,
    [
      model.id,
      model.name,
      model.description || '',
      parseContextLength(model.context),
      JSON.stringify({
        prompt: parsePrice(model.pricing?.prompt),
        completion: parsePrice(model.pricing?.completion),
      }),
      Date.now(),
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
      await upsertModelMetadataFromModel(model);
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

  app.get('/api/pricing/state', async (_req, res) => {
    const {rows} = await pool.query('SELECT current_version, config_version FROM pricing_state WHERE id = 1');
    const state = rows[0] || {current_version: 'bootstrap', config_version: 1};
    res.json(state);
  });

  app.get('/api/pricing', async (_req, res) => {
    const stateResult = await pool.query('SELECT current_version FROM pricing_state WHERE id = 1');
    const currentVersion = stateResult.rows[0]?.current_version || 'bootstrap';
    const {rows} = await pool.query(
      `SELECT model_id, provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price,
              reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, version, updated_at
       FROM model_provider_pricings
       WHERE version = $1
       ORDER BY model_id ASC, provider_account_id ASC`,
      [currentVersion],
    );
    res.json(rows.map(mapPricingRow));
  });

  app.get('/api/pricing/draft', async (_req, res) => {
    const {rows} = await pool.query(
      `SELECT model_id, provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price,
              reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, updated_at
       FROM model_provider_pricings_draft
       ORDER BY model_id ASC, provider_account_id ASC`,
    );
    res.json(rows.map(mapPricingRow));
  });

  app.put('/api/pricing/draft', async (req, res) => {
    const payload = (req.body || {}) as PricingDraftUpsertRequest;
    const modelId = String(payload.model || '').trim();
    const providerAccountId = String(payload.provider_account_id || '').trim();
    const mode = String(payload.price_mode || '').trim().toLowerCase();
    if (!modelId || !providerAccountId) {
      return res.status(400).json({error: 'model and provider_account_id required'});
    }
    if (mode !== 'fixed' && mode !== 'markup') {
      return res.status(400).json({error: 'price_mode must be fixed or markup'});
    }
    if (mode === 'fixed' && (payload.input_price == null || payload.output_price == null)) {
      return res.status(400).json({error: 'fixed mode requires input_price and output_price'});
    }
    if (mode === 'markup' && payload.markup_rate == null) {
      return res.status(400).json({error: 'markup mode requires markup_rate'});
    }
    const providerExists = await pool.query('SELECT 1 FROM provider_accounts WHERE id = $1 LIMIT 1', [providerAccountId]);
    if (providerExists.rowCount === 0) {
      return res.status(400).json({error: 'provider_account_id not found'});
    }

    await pool.query(
      `INSERT INTO model_provider_pricings_draft (
         model_id, provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price,
         reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (model_id, provider_account_id)
       DO UPDATE SET
         price_mode = EXCLUDED.price_mode,
         input_price = EXCLUDED.input_price,
         output_price = EXCLUDED.output_price,
         cache_read_price = EXCLUDED.cache_read_price,
         cache_write_price = EXCLUDED.cache_write_price,
         reasoning_price = EXCLUDED.reasoning_price,
         markup_rate = EXCLUDED.markup_rate,
         currency = EXCLUDED.currency,
         context_length = EXCLUDED.context_length,
         latency_ms = EXCLUDED.latency_ms,
         is_top_provider = EXCLUDED.is_top_provider,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [
        modelId,
        providerAccountId,
        mode,
        mode === 'fixed' ? payload.input_price ?? null : null,
        mode === 'fixed' ? payload.output_price ?? null : null,
        mode === 'fixed' ? payload.cache_read_price ?? null : null,
        mode === 'fixed' ? payload.cache_write_price ?? null : null,
        payload.reasoning_price ?? null,
        mode === 'markup' ? payload.markup_rate ?? null : null,
        payload.currency || 'USD',
        payload.context_length ?? null,
        payload.latency_ms ?? null,
        Boolean(payload.is_top_provider),
        payload.status || 'online',
        Date.now(),
      ],
    );
    res.json({status: 'saved'});
  });

  app.delete('/api/pricing/draft', async (req, res) => {
    const model = String(req.query.model || '').trim();
    const providerAccountId = String(req.query.provider_account_id || '').trim();
    if (!model) return res.status(400).json({error: 'model required'});
    if (providerAccountId) {
      await pool.query(
        'DELETE FROM model_provider_pricings_draft WHERE model_id = $1 AND provider_account_id = $2',
        [model, providerAccountId],
      );
    } else {
      await pool.query('DELETE FROM model_provider_pricings_draft WHERE model_id = $1', [model]);
    }
    res.json({status: 'deleted'});
  });

  app.post('/api/pricing/preview', async (_req, res) => {
    const draftResult = await pool.query(
      `SELECT model_id, provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price,
              reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, updated_at
       FROM model_provider_pricings_draft`,
    );
    const stateResult = await pool.query('SELECT current_version FROM pricing_state WHERE id = 1');
    const currentVersion = stateResult.rows[0]?.current_version || 'bootstrap';
    const currentResult = await pool.query(
      `SELECT model_id, provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price,
              reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, version, updated_at
       FROM model_provider_pricings
       WHERE version = $1`,
      [currentVersion],
    );

    const currentMap = new Map<string, any>();
    for (const row of currentResult.rows) {
      currentMap.set(`${row.model_id}::${row.provider_account_id}`, row);
    }
    const changes = draftResult.rows.map((row) => {
      const key = `${row.model_id}::${row.provider_account_id}`;
      return {
        model: row.model_id,
        provider_account_id: row.provider_account_id,
        before: currentMap.get(key) ? mapPricingRow(currentMap.get(key)) : null,
        after: mapPricingRow(row),
      };
    });
    const affectedModels = new Set(draftResult.rows.map((r) => r.model_id)).size;
    res.json({
      affected_models: affectedModels,
      changes_count: draftResult.rows.length,
      estimated_monthly_revenue: null,
      estimated_profit_margin: null,
      cost_basis_source: 'provider_cost_markup',
      changes,
    });
  });

  app.post('/api/pricing/publish', async (req, res) => {
    const operator = String(req.body?.operator || 'system');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const now = Date.now();
      const stateResult = await client.query(
        'SELECT current_version, config_version FROM pricing_state WHERE id = 1 FOR UPDATE',
      );
      const currentVersion = stateResult.rows[0]?.current_version || 'bootstrap';
      const configVersion = Number(stateResult.rows[0]?.config_version || 1) + 1;
      const version = `v-${now}`;
      const draftCountResult = await client.query('SELECT COUNT(*)::BIGINT AS count FROM model_provider_pricings_draft');
      const draftCount = Number(draftCountResult.rows[0]?.count || 0);
      const affectedResult = await client.query(
        'SELECT COUNT(DISTINCT model_id)::BIGINT AS count FROM model_provider_pricings_draft',
      );
      const affectedModels = Number(affectedResult.rows[0]?.count || 0);

      if (draftCount > 0) {
        await client.query(
          `INSERT INTO model_provider_pricings (
             model_id, provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price,
             reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, version, updated_at
           )
           SELECT model_id, provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price,
                  reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, $1, updated_at
           FROM model_provider_pricings_draft`,
          [version],
        );
      }

      await client.query(
        `UPDATE pricing_state
         SET current_version = $1, config_version = $2, updated_at = $3
         WHERE id = 1`,
        [version, configVersion, now],
      );
      await client.query(
        `INSERT INTO pricing_releases (version, status, summary, operator, created_at, config_version)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
        [version, 'published', JSON.stringify({source: 'pricing_center', previous_version: currentVersion}), operator, now, configVersion],
      );
      await client.query('COMMIT');
      res.json({status: 'published', version, config_version: configVersion, affected_models: affectedModels});
    } catch (error: any) {
      await client.query('ROLLBACK');
      res.status(500).json({error: `publish failed: ${error?.message || 'unknown_error'}`});
    } finally {
      client.release();
    }
  });

  app.get('/api/pricing/releases', async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const {rows} = await pool.query(
      `SELECT version, status, summary, operator, created_at, config_version
       FROM pricing_releases
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    res.json(rows);
  });

  app.get('/api/models/:modelId/providers', async (req, res) => {
    const modelId = decodeURIComponent(String(req.params.modelId || '')).trim();
    if (!modelId) return res.status(400).json({error: 'modelId required'});
    const stateResult = await pool.query('SELECT current_version FROM pricing_state WHERE id = 1');
    const currentVersion = stateResult.rows[0]?.current_version || 'bootstrap';
    const [draftResult, publishedResult] = await Promise.all([
      pool.query(
        `SELECT model_id, provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price,
                reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, updated_at
         FROM model_provider_pricings_draft
         WHERE model_id = $1
         ORDER BY provider_account_id ASC`,
        [modelId],
      ),
      pool.query(
        `SELECT model_id, provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price,
                reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, version, updated_at
         FROM model_provider_pricings
         WHERE model_id = $1 AND version = $2
         ORDER BY provider_account_id ASC`,
        [modelId, currentVersion],
      ),
    ]);
    const draftKeys = new Set(draftResult.rows.map((r) => `${r.model_id}::${r.provider_account_id}`));
    const merged = [
      ...draftResult.rows.map((r) => ({...mapPricingRow(r), row_status: 'Draft'})),
      ...publishedResult.rows
        .filter((r) => !draftKeys.has(`${r.model_id}::${r.provider_account_id}`))
        .map((r) => ({...mapPricingRow(r), row_status: 'Published'})),
    ];
    res.json({model_id: modelId, version: currentVersion, rows: merged});
  });

  app.get('/api/models/:modelId/routing', async (req, res) => {
    const modelId = decodeURIComponent(String(req.params.modelId || '')).trim();
    if (!modelId) return res.status(400).json({error: 'modelId required'});
    const stateResult = await pool.query('SELECT current_version FROM pricing_state WHERE id = 1');
    const currentVersion = stateResult.rows[0]?.current_version || 'bootstrap';
    const {rows} = await pool.query(
      `SELECT provider_account_id, is_top_provider, latency_ms, status
       FROM model_provider_pricings
       WHERE model_id = $1 AND version = $2
       ORDER BY is_top_provider DESC, provider_account_id ASC`,
      [modelId, currentVersion],
    );
    res.json({model_id: modelId, version: currentVersion, providers: rows});
  });

  app.put('/api/models/:modelId/routing', async (req, res) => {
    const modelId = decodeURIComponent(String(req.params.modelId || '')).trim();
    const providerAccountId = String(req.body?.provider_account_id || '').trim();
    const isTopProvider = Boolean(req.body?.is_top_provider);
    const status = req.body?.status != null ? String(req.body.status) : null;
    const latencyMs = req.body?.latency_ms != null ? Number(req.body.latency_ms) : null;
    if (!modelId || !providerAccountId) {
      return res.status(400).json({error: 'modelId and provider_account_id required'});
    }
    if (isTopProvider) {
      await pool.query(
        `UPDATE model_provider_pricings_draft
         SET is_top_provider = false, updated_at = $3
         WHERE model_id = $1 AND provider_account_id <> $2`,
        [modelId, providerAccountId, Date.now()],
      );
    }
    await pool.query(
      `UPDATE model_provider_pricings_draft
       SET is_top_provider = $3,
           status = COALESCE($4, status),
           latency_ms = COALESCE($5, latency_ms),
           updated_at = $6
       WHERE model_id = $1 AND provider_account_id = $2`,
      [modelId, providerAccountId, isTopProvider, status, latencyMs, Date.now()],
    );
    res.json({status: 'saved'});
  });

  app.get('/api/provider-keys', async (_req, res) => {
    const {rows} = await pool.query(
      `SELECT pa.id AS provider, pa.api_key AS key, pa.status,
              pa.provider_type,
              pa.label,
              pa.base_url,
              COALESCE(pa.docs_url, '') AS docs_url
       FROM provider_accounts pa
       ORDER BY pa.id ASC`,
    );
    res.json(rows);
  });

  app.put('/api/provider-keys/:provider', async (req, res) => {
    const provider = normalizeProviderId(req.params.provider || '');
    const {key, status, label, base_url, docs_url} = req.body || {};
    if (!provider) {
      return res.status(400).json({error: 'provider required'});
    }
    if (!key) {
      return res.status(400).json({error: 'key required'});
    }
    const providerType = normalizeProviderId(String((req.body || {}).provider_type || provider)) || provider;
    const now = Date.now();
    await pool.query(
      `INSERT INTO provider_accounts (id, provider_type, label, base_url, docs_url, api_key, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id)
       DO UPDATE SET
         provider_type = EXCLUDED.provider_type,
         label = EXCLUDED.label,
         base_url = EXCLUDED.base_url,
         docs_url = EXCLUDED.docs_url,
         api_key = EXCLUDED.api_key,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [
        provider,
        providerType,
        String(label || provider),
        String(base_url || providerBaseUrls[provider] || ''),
        docs_url ? String(docs_url) : null,
        key,
        status || 'active',
        now,
      ],
    );

    await pool.query(
      `INSERT INTO provider_keys (provider, key, status, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider)
       DO UPDATE SET key = EXCLUDED.key, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
      [provider, key, status || 'active', now],
    );
    await pool.query(
      `INSERT INTO provider_types (id, label, base_url, driver_type, models, enabled, sort_order, docs_url, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
       ON CONFLICT (id)
       DO UPDATE SET
         label = EXCLUDED.label,
         base_url = EXCLUDED.base_url,
         docs_url = EXCLUDED.docs_url,
         updated_at = EXCLUDED.updated_at`,
      [
        provider,
        String(label || provider),
        String(base_url || providerBaseUrls[provider] || ''),
        'openai_compatible',
        JSON.stringify([]),
        true,
        0,
        docs_url ? String(docs_url) : null,
        Date.now(),
      ],
    );
    res.json({status: 'saved'});
  });

  app.delete('/api/provider-keys/:provider', async (req, res) => {
    const provider = normalizeProviderId(req.params.provider || '');
    await pool.query('DELETE FROM provider_accounts WHERE id = $1', [provider]);
    await pool.query('DELETE FROM provider_keys WHERE provider = $1', [provider]);
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
