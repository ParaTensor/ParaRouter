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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hub uses provider_accounts
CREATE TABLE IF NOT EXISTS provider_accounts (
  id TEXT PRIMARY KEY,
  provider_type TEXT NOT NULL,
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  docs_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  supported_models JSONB NOT NULL DEFAULT '[]'::jsonb,
  supported_models_updated_at BIGINT,
  updated_at BIGINT NOT NULL
);

-- Hub uses provider_api_keys
CREATE TABLE IF NOT EXISTS provider_api_keys (
  id TEXT PRIMARY KEY,
  provider_account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  api_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  supported_models JSONB NOT NULL DEFAULT '[]'::jsonb,
  supported_models_updated_at BIGINT,
  health_status TEXT NOT NULL DEFAULT 'unknown',
  health_checked_at BIGINT,
  health_last_ok_at BIGINT,
  health_error TEXT,
  health_fail_count INTEGER NOT NULL DEFAULT 0,
  health_alert_sent_at BIGINT,
  updated_at BIGINT NOT NULL
);

-- Gateway legacy provider_keys
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
  cost TEXT,
  request_correlation_id TEXT,
  provider_account_id TEXT,
  provider_key_id TEXT
);

-- Ensure existing deployments receive new columns before index creation.
ALTER TABLE activity ADD COLUMN IF NOT EXISTS cost TEXT;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS request_correlation_id TEXT;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS provider_account_id TEXT;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS provider_key_id TEXT;

CREATE INDEX IF NOT EXISTS idx_activity_user_id ON activity(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_request_correlation_id ON activity(request_correlation_id);
CREATE INDEX IF NOT EXISTS idx_activity_provider_account_id ON activity(provider_account_id);
CREATE INDEX IF NOT EXISTS idx_activity_provider_key_id ON activity(provider_key_id);

CREATE TABLE IF NOT EXISTS stream_observations (
  id BIGSERIAL PRIMARY KEY,
  timestamp BIGINT NOT NULL,
  route TEXT NOT NULL,
  requested_model TEXT NOT NULL,
  request_correlation_id TEXT,
  provider_account_id TEXT,
  provider_key_id TEXT,
  ttft_ms INTEGER,
  max_inter_chunk_ms INTEGER,
  chunk_count BIGINT NOT NULL DEFAULT 0,
  stream_duration_ms INTEGER NOT NULL DEFAULT 0,
  completed_normally BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE stream_observations ADD COLUMN IF NOT EXISTS request_correlation_id TEXT;
ALTER TABLE stream_observations ADD COLUMN IF NOT EXISTS provider_account_id TEXT;
ALTER TABLE stream_observations ADD COLUMN IF NOT EXISTS provider_key_id TEXT;

CREATE INDEX IF NOT EXISTS idx_stream_observations_timestamp ON stream_observations(timestamp);
CREATE INDEX IF NOT EXISTS idx_stream_observations_model ON stream_observations(requested_model);
CREATE INDEX IF NOT EXISTS idx_stream_observations_request_correlation_id ON stream_observations(request_correlation_id);
CREATE INDEX IF NOT EXISTS idx_stream_observations_provider_account_id ON stream_observations(provider_account_id);
CREATE INDEX IF NOT EXISTS idx_stream_observations_provider_key_id ON stream_observations(provider_key_id);

CREATE TABLE IF NOT EXISTS gateways (
  instance_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  last_seen BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT,
  description TEXT,
  context_length INTEGER,
  global_pricing JSONB NOT NULL DEFAULT '{}'::jsonb,
  score DOUBLE PRECISION,
  trend TEXT,
  category TEXT,
  updated_at BIGINT NOT NULL
);

-- Hub's modern pricings tables
CREATE TABLE IF NOT EXISTS model_provider_pricings (
  model_id TEXT NOT NULL,
  public_model_id TEXT,
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
  provider_model_id TEXT,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (model_id, provider_account_id, provider_key_id, version),
  CHECK (
    (price_mode = 'fixed' AND input_price IS NOT NULL AND output_price IS NOT NULL AND markup_rate IS NULL) OR
    (price_mode = 'markup' AND markup_rate IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS model_provider_pricings_draft (
  model_id TEXT NOT NULL,
  public_model_id TEXT,
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
  provider_model_id TEXT,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (model_id, provider_account_id, provider_key_id),
  CHECK (
    (price_mode = 'fixed' AND input_price IS NOT NULL AND output_price IS NOT NULL AND markup_rate IS NULL) OR
    (price_mode = 'markup' AND markup_rate IS NOT NULL)
  )
);

-- Gateway's legacy pricings tables
CREATE TABLE IF NOT EXISTS model_pricings (
  id BIGSERIAL PRIMARY KEY,
  model TEXT NOT NULL,
  provider_account_id TEXT NOT NULL DEFAULT '',
  price_mode TEXT NOT NULL CHECK (price_mode IN ('fixed', 'markup')),
  input_price DOUBLE PRECISION,
  output_price DOUBLE PRECISION,
  cache_read_price DOUBLE PRECISION,
  cache_write_price DOUBLE PRECISION,
  markup_rate DOUBLE PRECISION,
  currency TEXT NOT NULL DEFAULT 'USD',
  version TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE (model, provider_account_id, version),
  CHECK (
      (price_mode = 'fixed' AND input_price IS NOT NULL AND output_price IS NOT NULL AND markup_rate IS NULL) OR
      (price_mode = 'markup' AND markup_rate IS NOT NULL AND input_price IS NULL AND output_price IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS model_pricings_draft (
  id BIGSERIAL PRIMARY KEY,
  model TEXT NOT NULL,
  provider_account_id TEXT NOT NULL DEFAULT '',
  price_mode TEXT NOT NULL CHECK (price_mode IN ('fixed', 'markup')),
  input_price DOUBLE PRECISION,
  output_price DOUBLE PRECISION,
  cache_read_price DOUBLE PRECISION,
  cache_write_price DOUBLE PRECISION,
  markup_rate DOUBLE PRECISION,
  currency TEXT NOT NULL DEFAULT 'USD',
  updated_at BIGINT NOT NULL,
  UNIQUE (model, provider_account_id),
  CHECK (
      (price_mode = 'fixed' AND input_price IS NOT NULL AND output_price IS NOT NULL AND markup_rate IS NULL) OR
      (price_mode = 'markup' AND markup_rate IS NOT NULL AND input_price IS NULL AND output_price IS NULL)
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

--- Migrations and Alter Table Fixes ---
-- These ensure that existing tables receive the new columns dynamically instead of failing.
ALTER TABLE model_provider_pricings ADD COLUMN IF NOT EXISTS is_top_provider BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE model_provider_pricings_draft ADD COLUMN IF NOT EXISTS is_top_provider BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE model_provider_pricings ADD COLUMN IF NOT EXISTS input_cost DOUBLE PRECISION;
ALTER TABLE model_provider_pricings ADD COLUMN IF NOT EXISTS output_cost DOUBLE PRECISION;
ALTER TABLE model_provider_pricings ADD COLUMN IF NOT EXISTS cache_read_cost DOUBLE PRECISION;
ALTER TABLE model_provider_pricings ADD COLUMN IF NOT EXISTS cache_write_cost DOUBLE PRECISION;
ALTER TABLE model_provider_pricings ADD COLUMN IF NOT EXISTS reasoning_cost DOUBLE PRECISION;

ALTER TABLE model_provider_pricings_draft ADD COLUMN IF NOT EXISTS input_cost DOUBLE PRECISION;
ALTER TABLE model_provider_pricings_draft ADD COLUMN IF NOT EXISTS output_cost DOUBLE PRECISION;
ALTER TABLE model_provider_pricings_draft ADD COLUMN IF NOT EXISTS cache_read_cost DOUBLE PRECISION;
ALTER TABLE model_provider_pricings_draft ADD COLUMN IF NOT EXISTS cache_write_cost DOUBLE PRECISION;
ALTER TABLE model_provider_pricings_draft ADD COLUMN IF NOT EXISTS reasoning_cost DOUBLE PRECISION;

ALTER TABLE model_provider_pricings ADD COLUMN IF NOT EXISTS provider_model_id TEXT;
ALTER TABLE model_provider_pricings_draft ADD COLUMN IF NOT EXISTS provider_model_id TEXT;
ALTER TABLE model_provider_pricings ADD COLUMN IF NOT EXISTS public_model_id TEXT;
ALTER TABLE model_provider_pricings_draft ADD COLUMN IF NOT EXISTS public_model_id TEXT;

-- Gateway legacy alter tables
ALTER TABLE model_pricings ADD COLUMN IF NOT EXISTS cache_read_price DOUBLE PRECISION;
ALTER TABLE model_pricings ADD COLUMN IF NOT EXISTS cache_write_price DOUBLE PRECISION;
ALTER TABLE model_pricings_draft ADD COLUMN IF NOT EXISTS cache_read_price DOUBLE PRECISION;
ALTER TABLE model_pricings_draft ADD COLUMN IF NOT EXISTS cache_write_price DOUBLE PRECISION;

-- Provider types and accounts migrations
ALTER TABLE provider_types ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE provider_types ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE provider_types ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE provider_types ADD COLUMN IF NOT EXISTS docs_url TEXT;
ALTER TABLE provider_types ADD COLUMN IF NOT EXISTS driver_type TEXT NOT NULL DEFAULT 'openai_compatible';
ALTER TABLE provider_types ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_types ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE provider_accounts ADD COLUMN IF NOT EXISTS docs_url TEXT;
ALTER TABLE provider_accounts ADD COLUMN IF NOT EXISTS supported_models JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE provider_accounts ADD COLUMN IF NOT EXISTS supported_models_updated_at BIGINT;

ALTER TABLE provider_api_keys ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE provider_api_keys ADD COLUMN IF NOT EXISTS supported_models JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE provider_api_keys ADD COLUMN IF NOT EXISTS supported_models_updated_at BIGINT;
ALTER TABLE provider_api_keys ADD COLUMN IF NOT EXISTS health_checked_at BIGINT;
ALTER TABLE provider_api_keys ADD COLUMN IF NOT EXISTS health_last_ok_at BIGINT;
ALTER TABLE provider_api_keys ADD COLUMN IF NOT EXISTS health_error TEXT;
ALTER TABLE provider_api_keys ADD COLUMN IF NOT EXISTS health_fail_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_api_keys ADD COLUMN IF NOT EXISTS health_alert_sent_at BIGINT;

CREATE TABLE IF NOT EXISTS billing_records (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  balance_after DOUBLE PRECISION NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  timestamp BIGINT NOT NULL
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS balance DOUBLE PRECISION NOT NULL DEFAULT 10.0;

-- Additional LLM Model fields for rankings
ALTER TABLE llm_models ADD COLUMN IF NOT EXISTS score DOUBLE PRECISION;
ALTER TABLE llm_models ADD COLUMN IF NOT EXISTS trend TEXT;
ALTER TABLE llm_models ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE llm_models ADD COLUMN IF NOT EXISTS provider TEXT;

-- User Model ACL & Budget Limits
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_models JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pricing_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS allowed_models JSONB;
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS budget_limit DOUBLE PRECISION;
