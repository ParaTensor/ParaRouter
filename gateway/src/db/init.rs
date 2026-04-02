use crate::db::pool::DatabasePool;
use anyhow::Result;

pub async fn try_database_with_url(url: Option<&str>) -> Result<DatabasePool> {
    let url = url.unwrap_or("postgresql://localhost:5432/openhub");
    if !url.starts_with("postgres://") && !url.starts_with("postgresql://") {
        anyhow::bail!("DATABASE_URL must be a postgres/postgresql URL");
    }
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(url)
        .await?;
    ensure_schema_postgres(&pool).await?;
    Ok(DatabasePool::Postgres(pool))
}

async fn ensure_schema_postgres(pool: &sqlx::Pool<sqlx::Postgres>) -> Result<()> {
    let statements = [
        r#"
        CREATE TABLE IF NOT EXISTS models (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider TEXT NOT NULL,
            description TEXT,
            context TEXT,
            pricing_prompt TEXT,
            pricing_completion TEXT,
            tags JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_popular BOOLEAN NOT NULL DEFAULT FALSE,
            latency TEXT,
            status TEXT NOT NULL DEFAULT 'online'
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS provider_types (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            base_url TEXT NOT NULL,
            driver_type TEXT NOT NULL,
            models JSONB NOT NULL DEFAULT '[]'::jsonb,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order INT NOT NULL DEFAULT 0,
            docs_url TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS provider_keys (
            provider TEXT PRIMARY KEY,
            key TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            updated_at BIGINT NOT NULL
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS user_api_keys (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            key TEXT NOT NULL,
            uid TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            last_used TEXT,
            usage TEXT
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS activity (
            id BIGSERIAL PRIMARY KEY,
            timestamp BIGINT NOT NULL,
            model TEXT NOT NULL,
            tokens INTEGER NOT NULL DEFAULT 0,
            latency INTEGER NOT NULL DEFAULT 0,
            status INTEGER NOT NULL DEFAULT 200,
            user_id TEXT,
            cost TEXT
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS gateways (
            instance_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            last_seen BIGINT NOT NULL
        )
        "#,
        r#"
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
        )
        "#,
        r#"
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
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS pricing_releases (
            version TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            summary JSONB NOT NULL,
            operator TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            config_version BIGINT NOT NULL
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS pricing_state (
            id SMALLINT PRIMARY KEY DEFAULT 1,
            current_version TEXT NOT NULL DEFAULT 'bootstrap',
            config_version BIGINT NOT NULL DEFAULT 1,
            updated_at BIGINT NOT NULL
        )
        "#,
    ];
    for statement in statements {
        sqlx::query(statement).execute(pool).await?;
    }

    sqlx::query(
        "ALTER TABLE model_pricings ADD COLUMN IF NOT EXISTS cache_read_price DOUBLE PRECISION",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "ALTER TABLE model_pricings ADD COLUMN IF NOT EXISTS cache_write_price DOUBLE PRECISION",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "ALTER TABLE model_pricings_draft ADD COLUMN IF NOT EXISTS cache_read_price DOUBLE PRECISION",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "ALTER TABLE model_pricings_draft ADD COLUMN IF NOT EXISTS cache_write_price DOUBLE PRECISION",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO pricing_state (id, current_version, config_version, updated_at)
        VALUES (1, 'bootstrap', 1, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT)
        ON CONFLICT (id) DO NOTHING
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}
