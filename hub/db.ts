import { Pool } from 'pg';
import { hashPassword } from './utils';
import dotenv from 'dotenv';
dotenv.config({ override: true });

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
}
