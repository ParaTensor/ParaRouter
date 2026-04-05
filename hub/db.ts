import { Pool } from 'pg';
import { hashPassword } from './utils';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env'), override: true });

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/openhub';
export const pool = new Pool({ connectionString: databaseUrl });

export async function initSchema() {
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

    CREATE TABLE IF NOT EXISTS provider_accounts (
      id TEXT PRIMARY KEY,
      provider_type TEXT NOT NULL,
      label TEXT NOT NULL,
      base_url TEXT NOT NULL,
      docs_url TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_api_keys (
      id TEXT PRIMARY KEY,
      provider_account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      api_key TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      status TEXT NOT NULL DEFAULT 'active',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      last_login_at BIGINT
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      last_seen_at BIGINT,
      revoked_at BIGINT
    );

    CREATE TABLE IF NOT EXISTS email_verifications (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      used_at BIGINT
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
    CREATE TABLE IF NOT EXISTS model_provider_pricings (
      model_id TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      price_mode TEXT NOT NULL CHECK (price_mode IN ('fixed', 'markup')),
      input_cost DOUBLE PRECISION,
      output_cost DOUBLE PRECISION,
      input_price DOUBLE PRECISION,
      output_price DOUBLE PRECISION,
      cache_read_price DOUBLE PRECISION,
      cache_write_price DOUBLE PRECISION,
      reasoning_price DOUBLE PRECISION,
      markup_rate DOUBLE PRECISION,
      provider_key_id TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      context_length INTEGER,
      latency_ms INTEGER,
      is_top_provider BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'online',
      version TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (model_id, provider_account_id, provider_key_id, version),
      CHECK (
        (price_mode = 'fixed' AND input_price IS NOT NULL AND output_price IS NOT NULL AND markup_rate IS NULL) OR
        (price_mode = 'markup' AND markup_rate IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS model_provider_pricings_draft (
      model_id TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      price_mode TEXT NOT NULL CHECK (price_mode IN ('fixed', 'markup')),
      input_cost DOUBLE PRECISION,
      output_cost DOUBLE PRECISION,
      input_price DOUBLE PRECISION,
      output_price DOUBLE PRECISION,
      cache_read_price DOUBLE PRECISION,
      cache_write_price DOUBLE PRECISION,
      reasoning_price DOUBLE PRECISION,
      markup_rate DOUBLE PRECISION,
      provider_key_id TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      context_length INTEGER,
      latency_ms INTEGER,
      is_top_provider BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'online',
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (model_id, provider_account_id, provider_key_id),
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

  await pool.query(
    `INSERT INTO users (id, username, email, display_name, password_hash, role, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'admin', 'active', $6, $7)
     ON CONFLICT (username) DO NOTHING`,
    [
      'local-admin',
      'admin',
      'admin@openhub.local',
      'OpenHub Admin',
      hashPassword('admin123'),
      Date.now(),
      Date.now(),
    ],
  );

  await pool.query(`ALTER TABLE model_provider_pricings ADD COLUMN IF NOT EXISTS is_top_provider BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE model_provider_pricings_draft ADD COLUMN IF NOT EXISTS is_top_provider BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE model_provider_pricings ADD COLUMN IF NOT EXISTS input_cost DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE model_provider_pricings ADD COLUMN IF NOT EXISTS output_cost DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE model_provider_pricings_draft ADD COLUMN IF NOT EXISTS input_cost DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE model_provider_pricings_draft ADD COLUMN IF NOT EXISTS output_cost DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE model_provider_pricings ADD COLUMN IF NOT EXISTS cache_read_cost DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE model_provider_pricings ADD COLUMN IF NOT EXISTS cache_write_cost DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE model_provider_pricings ADD COLUMN IF NOT EXISTS reasoning_cost DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE model_provider_pricings_draft ADD COLUMN IF NOT EXISTS cache_read_cost DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE model_provider_pricings_draft ADD COLUMN IF NOT EXISTS cache_write_cost DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE model_provider_pricings_draft ADD COLUMN IF NOT EXISTS reasoning_cost DOUBLE PRECISION`);
  
  // Group Support Migrations
  // Since we are moving to Key-centric pricing, we will bypass the old price_group columns
  // Note: Local postgres wiping script will run to wipe the tables so no alter table needed

  try {
    // model_provider_pricings
    await pool.query(`ALTER TABLE model_provider_pricings DROP CONSTRAINT IF EXISTS model_provider_pricings_pkey`);
    await pool.query(`ALTER TABLE model_provider_pricings ADD PRIMARY KEY (model_id, provider_account_id, provider_key_id, version)`);
  } catch (err: any) { console.error('Migration failed (pricings pkey):', err.message); }

  try {
    // model_provider_pricings_draft
    await pool.query(`ALTER TABLE model_provider_pricings_draft DROP CONSTRAINT IF EXISTS model_provider_pricings_draft_pkey`);
    await pool.query(`ALTER TABLE model_provider_pricings_draft ADD PRIMARY KEY (model_id, provider_account_id, provider_key_id)`);
  } catch (err: any) { console.error('Migration failed (pricings_draft pkey):', err.message); }

  const defaultLlmModels = [
    // OpenAI Models from developers.openai.com 2026 (Verified via User Screenshot)
    { id: 'gpt-5.4', name: 'GPT-5.4', description: "OpenAI Flagship", context_length: 200000, global_pricing: { prompt: 2.50, completion: 15.00, cache_read: 0.25 } },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', description: "OpenAI Fast & Affordable", context_length: 200000, global_pricing: { prompt: 0.75, completion: 4.50, cache_read: 0.075 } },
    { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', description: "OpenAI Lowest latency and cost", context_length: 200000, global_pricing: { prompt: 0.20, completion: 1.25, cache_read: 0.02 } },
    { id: 'gpt-5.4-pro', name: 'GPT-5.4 Pro', description: "OpenAI Professional", context_length: 200000, global_pricing: { prompt: 30.00, completion: 180.00 } },
    
    { id: 'gpt-5.2', name: 'GPT-5.2', description: "Previous generation", context_length: 128000, global_pricing: { prompt: 1.75, completion: 14.00, cache_read: 0.175 } },
    { id: 'gpt-5.2-pro', name: 'GPT-5.2 Pro', description: "Previous generation Professional", context_length: 128000, global_pricing: { prompt: 21.00, completion: 168.00 } },
    
    { id: 'gpt-5.1', name: 'GPT-5.1', description: "Legacy", context_length: 128000, global_pricing: { prompt: 1.25, completion: 10.00, cache_read: 0.125 } },
    { id: 'gpt-5', name: 'GPT-5', description: "Legacy GPT-5", context_length: 128000, global_pricing: { prompt: 1.25, completion: 10.00, cache_read: 0.125 } },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: "Legacy Mini", context_length: 128000, global_pricing: { prompt: 0.25, completion: 2.00, cache_read: 0.025 } },
    { id: 'gpt-5-nano', name: 'GPT-5 Nano', description: "Legacy Nano", context_length: 128000, global_pricing: { prompt: 0.05, completion: 0.40, cache_read: 0.005 } },
    { id: 'gpt-5-pro', name: 'GPT-5 Pro', description: "Legacy Professional", context_length: 128000, global_pricing: { prompt: 15.00, completion: 120.00 } },
    
    { id: 'gpt-4.1', name: 'GPT-4.1', description: "Legacy GPT-4.1", context_length: 128000, global_pricing: { prompt: 2.00, completion: 8.00, cache_read: 0.50 } },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: "Legacy GPT-4.1 Mini", context_length: 128000, global_pricing: { prompt: 0.40, completion: 1.60, cache_read: 0.10 } },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', description: "Legacy GPT-4.1 Nano", context_length: 128000, global_pricing: { prompt: 0.10, completion: 0.40, cache_read: 0.025 } },
    
    { id: 'gpt-4o', name: 'GPT-4o', description: "Legacy Flagship", context_length: 128000, global_pricing: { prompt: 2.50, completion: 10.00, cache_read: 1.25 } },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: "Legacy Small", context_length: 128000, global_pricing: { prompt: 0.15, completion: 0.60, cache_read: 0.075 } },
    
    { id: 'o4-mini', name: 'o4-mini', description: "Reasoning Mini", context_length: 200000, global_pricing: { prompt: 1.10, completion: 4.40, cache_read: 0.275, reasoning: 4.40 } },
    { id: 'o3', name: 'o3', description: "Reasoning Legacy", context_length: 200000, global_pricing: { prompt: 2.00, completion: 8.00, cache_read: 0.50, reasoning: 8.00 } },
    { id: 'o3-mini', name: 'o3-mini', description: "Reasoning Legacy Mini", context_length: 200000, global_pricing: { prompt: 1.10, completion: 4.40, cache_read: 0.55, reasoning: 4.40 } },
    
    // Anthropic Models from docs.anthropic.com 2026 (Verified via User Screenshot)
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', description: "Most capable model for complex reasoning and agents", context_length: 200000, global_pricing: { prompt: 5.00, completion: 25.00, cache_read: 0.50, cache_write: 6.25 } },
    { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', description: "Previous generation Opus", context_length: 300000, global_pricing: { prompt: 5.00, completion: 25.00, cache_read: 0.50, cache_write: 6.25 } },
    { id: 'claude-opus-4-1', name: 'Claude Opus 4.1', description: "Legacy Opus", context_length: 300000, global_pricing: { prompt: 15.00, completion: 75.00, cache_read: 1.50, cache_write: 18.75 } },
    { id: 'claude-opus-4', name: 'Claude Opus 4', description: "Legacy Opus", context_length: 300000, global_pricing: { prompt: 15.00, completion: 75.00, cache_read: 1.50, cache_write: 18.75 } },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: "Advanced intelligence at higher speed", context_length: 200000, global_pricing: { prompt: 3.00, completion: 15.00, cache_read: 0.30, cache_write: 3.75, reasoning: 15.00 } },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', description: "Previous generation Sonnet", context_length: 300000, global_pricing: { prompt: 3.00, completion: 15.00, cache_read: 0.30, cache_write: 3.75 } },
    { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', description: "Legacy Sonnet", context_length: 300000, global_pricing: { prompt: 3.00, completion: 15.00, cache_read: 0.30, cache_write: 3.75 } },
    { id: 'claude-sonnet-3-7', name: 'Claude Sonnet 3.7', description: "Deprecated Sonnet", context_length: 200000, global_pricing: { prompt: 3.00, completion: 15.00, cache_read: 0.30, cache_write: 3.75 } },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', description: "Fastest Claude model for swift responses", context_length: 200000, global_pricing: { prompt: 1.00, completion: 5.00, cache_read: 0.10, cache_write: 1.25 } },
    { id: 'claude-haiku-3-5', name: 'Claude Haiku 3.5', description: "Legacy Haiku", context_length: 200000, global_pricing: { prompt: 0.80, completion: 4.00, cache_read: 0.08, cache_write: 1.00 } },
    { id: 'claude-opus-3', name: 'Claude Opus 3', description: "Deprecated Opus", context_length: 200000, global_pricing: { prompt: 15.00, completion: 75.00, cache_read: 1.50, cache_write: 18.75 } },
    { id: 'claude-haiku-3', name: 'Claude Haiku 3', description: "Deprecated Haiku", context_length: 200000, global_pricing: { prompt: 0.25, completion: 1.25, cache_read: 0.03, cache_write: 0.30 } },

    // Google Gemini Models from ai.google.dev 2026 (Verified via User Screenshot)
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', description: "Latest intelligence improvements for multimodal and vibe-coding", context_length: 2000000, global_pricing: { prompt: 2.00, completion: 12.00, cache_read: 0.20 } },
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite', description: "Most cost-efficient model for high-volume tasks", context_length: 1048576, global_pricing: { prompt: 0.25, completion: 1.50, cache_read: 0.025 } },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', description: "Built for speed and frontier intelligence", context_length: 1000000, global_pricing: { prompt: 0.50, completion: 3.00, cache_read: 0.05 } },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: "Multipurpose model for complex reasoning", context_length: 2000000, global_pricing: { prompt: 1.25, completion: 5.00, cache_read: 0.3125 } },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: "Hybrid reasoning model with thinking budgets", context_length: 1048576, global_pricing: { prompt: 0.10, completion: 0.40, cache_read: 0.025 } }
  ];

  for (const m of defaultLlmModels) {
    await pool.query(
      `INSERT INTO llm_models (id, name, description, context_length, global_pricing, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         context_length = EXCLUDED.context_length,
         global_pricing = EXCLUDED.global_pricing,
         updated_at = EXCLUDED.updated_at`,
      [m.id, m.name, m.description, m.context_length, JSON.stringify(m.global_pricing), Date.now()]
    );
  }
}
