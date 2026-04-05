use anyhow::Result;
use sqlx::{Pool, Postgres};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::db::models::{
    ActivityRecord, ApiKey, GatewayRecord, ModelRecord, NewActivityRecord, NewApiKey,
    NewModelRecord, NewPricingDraftRecord, NewProvider, NewProviderType, NewUserApiKeyRecord,
    PricingDraftRecord, PricingPublishResult, PricingRecord, PricingReleaseRecord, PricingStateRecord,
    Provider, ProviderKeyRecord, UpdateApiKey, UpdateProvider, UserApiKeyRecord,
};

#[derive(Clone)]
pub enum DatabasePool {
    Postgres(Pool<Postgres>),
}

impl DatabasePool {
    pub async fn ping(&self) -> Result<()> {
        match self {
            Self::Postgres(pool) => {
                sqlx::query("SELECT 1").execute(pool).await?;
            }
        }
        Ok(())
    }

    pub async fn close(&self) {
        match self {
            Self::Postgres(pool) => pool.close().await,
        }
    }

    fn now_millis() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64
    }

    pub async fn list_providers(&self) -> Result<Vec<Provider>> {
        Ok(Vec::new())
    }

    pub async fn get_provider(&self, _id: i64) -> Result<Option<Provider>> {
        Ok(None)
    }

    pub async fn create_provider(&self, _provider: NewProvider) -> Result<i64> {
        Ok(0)
    }

    pub async fn update_provider(&self, _id: i64, _provider: UpdateProvider) -> Result<()> {
        Ok(())
    }

    pub async fn delete_provider(&self, _id: i64) -> Result<()> {
        Ok(())
    }

    pub async fn list_api_keys(&self) -> Result<Vec<ApiKey>> {
        Ok(Vec::new())
    }

    pub async fn get_api_key_by_id(&self, _id: i64) -> Result<Option<ApiKey>> {
        Ok(None)
    }

    pub async fn create_api_key(&self, _key: NewApiKey) -> Result<i64> {
        Ok(0)
    }

    pub async fn update_api_key(&self, _id: i64, _key: UpdateApiKey) -> Result<()> {
        Ok(())
    }

    pub async fn update_api_key_hash(&self, _id: i64, _hash: &str) -> Result<bool> {
        Ok(false)
    }

    pub async fn delete_api_key(&self, _id: i64) -> Result<()> {
        Ok(())
    }

    pub async fn get_pool_status(&self) -> PoolStatus {
        PoolStatus {
            total: 0,
            enabled: 0,
            healthy: 0,
            degraded: 0,
            unhealthy: 0,
        }
    }

    pub async fn get_all_metrics(&self) -> std::collections::HashMap<i64, ProviderMetrics> {
        std::collections::HashMap::new()
    }

    pub async fn get_all_health_statuses(
        &self,
    ) -> std::collections::HashMap<i64, crate::pool::health::HealthStatus> {
        std::collections::HashMap::new()
    }

    pub async fn get_provider_type(
        &self,
        id: &str,
    ) -> Result<Option<crate::db::models::ProviderType>> {
        match self {
            Self::Postgres(pool) => {
                sqlx::query_as::<_, crate::db::models::ProviderType>(
                    "SELECT id, label, base_url, models::text AS models, driver_type, (CASE WHEN enabled THEN 1 ELSE 0 END) AS enabled, sort_order, COALESCE(docs_url,'') AS docs_url, created_at::text AS created_at, updated_at::text AS updated_at FROM provider_types WHERE id = $1",
                )
                .bind(id)
                .fetch_optional(pool)
                .await
                .map_err(Into::into)
            }
        }
    }

    pub async fn create_provider_type(&self, pt: NewProviderType) -> Result<()> {
        let models_json = serde_json::to_string(&pt.models)?;
        match self {
            Self::Postgres(pool) => {
                sqlx::query(
                    "INSERT INTO provider_types (id, label, base_url, driver_type, models, enabled, sort_order, docs_url) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)",
                )
                .bind(pt.id)
                .bind(pt.label)
                .bind(pt.base_url)
                .bind(pt.driver_type)
                .bind(models_json)
                .bind(pt.enabled.unwrap_or(true))
                .bind(pt.sort_order.unwrap_or(0))
                .bind(pt.docs_url.unwrap_or_default())
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn upsert_provider_type(&self, pt: NewProviderType) -> Result<()> {
        let models_json = serde_json::to_string(&pt.models)?;
        match self {
            Self::Postgres(pool) => {
                sqlx::query(
                    r#"
                    INSERT INTO provider_types (id, label, base_url, driver_type, models, enabled, sort_order, docs_url)
                    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
                    ON CONFLICT (id)
                    DO UPDATE SET
                      label = EXCLUDED.label,
                      base_url = EXCLUDED.base_url,
                      driver_type = EXCLUDED.driver_type,
                      models = EXCLUDED.models,
                      enabled = EXCLUDED.enabled,
                      sort_order = EXCLUDED.sort_order,
                      docs_url = EXCLUDED.docs_url,
                      updated_at = NOW()
                    "#,
                )
                .bind(pt.id)
                .bind(pt.label)
                .bind(pt.base_url)
                .bind(pt.driver_type)
                .bind(models_json)
                .bind(pt.enabled.unwrap_or(true))
                .bind(pt.sort_order.unwrap_or(0))
                .bind(pt.docs_url.unwrap_or_default())
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn list_provider_types(&self) -> Result<Vec<crate::db::models::ProviderType>> {
        match self {
            Self::Postgres(pool) => Ok(sqlx::query_as::<_, crate::db::models::ProviderType>(
                "SELECT id, label, base_url, models::text AS models, driver_type, (CASE WHEN enabled THEN 1 ELSE 0 END) AS enabled, sort_order, COALESCE(docs_url,'') AS docs_url, created_at::text AS created_at, updated_at::text AS updated_at FROM provider_types ORDER BY sort_order ASC, id ASC",
            )
            .fetch_all(pool)
            .await?),
        }
    }

    pub async fn list_models(&self) -> Result<Vec<ModelRecord>> {
        match self {
            Self::Postgres(pool) => Ok(sqlx::query_as::<_, ModelRecord>(
                "SELECT id, name, provider, description, context, pricing_prompt, pricing_completion, tags::text AS tags, (CASE WHEN is_popular THEN 1 ELSE 0 END) AS is_popular, latency, status FROM models ORDER BY name ASC",
            )
            .fetch_all(pool)
            .await?),
        }
    }

    pub async fn upsert_model(&self, model: NewModelRecord) -> Result<()> {
        let tags = serde_json::to_string(&model.tags)?;
        match self {
            Self::Postgres(pool) => {
                sqlx::query(
                    r#"
                    INSERT INTO models (id, name, provider, description, context, pricing_prompt, pricing_completion, tags, is_popular, latency, status)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
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
                      status = EXCLUDED.status
                    "#,
                )
                .bind(model.id)
                .bind(model.name)
                .bind(model.provider)
                .bind(model.description)
                .bind(model.context)
                .bind(model.pricing_prompt)
                .bind(model.pricing_completion)
                .bind(tags)
                .bind(model.is_popular)
                .bind(model.latency)
                .bind(model.status)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn list_provider_keys(&self) -> Result<Vec<ProviderKeyRecord>> {
        match self {
            Self::Postgres(pool) => Ok(sqlx::query_as::<_, ProviderKeyRecord>(
                "SELECT provider, key, status FROM provider_keys ORDER BY provider ASC",
            )
            .fetch_all(pool)
            .await?),
        }
    }

    pub async fn upsert_provider_key(&self, provider: &str, key: &str, status: &str) -> Result<()> {
        let now = Self::now_millis();
        match self {
            Self::Postgres(pool) => {
                sqlx::query(
                    r#"
                    INSERT INTO provider_keys (provider, key, status, updated_at)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (provider)
                    DO UPDATE SET 
                      key = CASE WHEN EXCLUDED.key != '' THEN EXCLUDED.key ELSE provider_keys.key END,
                      status = EXCLUDED.status, 
                      updated_at = EXCLUDED.updated_at
                    "#,
                )
                .bind(provider)
                .bind(key)
                .bind(status)
                .bind(now)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn delete_provider_key(&self, provider: &str) -> Result<()> {
        match self {
            Self::Postgres(pool) => {
                sqlx::query("DELETE FROM provider_keys WHERE provider = $1")
                    .bind(provider)
                    .execute(pool)
                    .await?;
            }
        }
        Ok(())
    }

    pub async fn register_gateway(&self, instance_id: &str, status: &str) -> Result<()> {
        let now = Self::now_millis();
        match self {
            Self::Postgres(pool) => {
                sqlx::query(
                    r#"
                    INSERT INTO gateways (instance_id, status, last_seen)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (instance_id)
                    DO UPDATE SET status = EXCLUDED.status, last_seen = EXCLUDED.last_seen
                    "#,
                )
                .bind(instance_id)
                .bind(status)
                .bind(now)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn list_gateways(&self) -> Result<Vec<GatewayRecord>> {
        match self {
            Self::Postgres(pool) => Ok(sqlx::query_as::<_, GatewayRecord>(
                "SELECT instance_id, status, last_seen FROM gateways ORDER BY last_seen DESC LIMIT 100",
            )
            .fetch_all(pool)
            .await?),
        }
    }

    pub async fn create_activity(&self, data: NewActivityRecord) -> Result<()> {
        let now = Self::now_millis();
        match self {
            Self::Postgres(pool) => {
                sqlx::query(
                    "INSERT INTO activity (timestamp, model, tokens, latency, status, user_id, cost) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                )
                .bind(now)
                .bind(data.model)
                .bind(data.tokens)
                .bind(data.latency)
                .bind(data.status)
                .bind(data.user_id)
                .bind(data.cost)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn list_activity(&self, limit: i64) -> Result<Vec<ActivityRecord>> {
        let limit = limit.clamp(1, 200);
        match self {
            Self::Postgres(pool) => Ok(sqlx::query_as::<_, ActivityRecord>(
                "SELECT id, timestamp, model, tokens, latency, status, user_id, cost FROM activity ORDER BY timestamp DESC LIMIT $1",
            )
            .bind(limit)
            .fetch_all(pool)
            .await?),
        }
    }

    pub async fn list_user_api_keys(&self, uid: &str) -> Result<Vec<UserApiKeyRecord>> {
        match self {
            Self::Postgres(pool) => Ok(sqlx::query_as::<_, UserApiKeyRecord>(
                "SELECT id, name, key, uid, created_at, last_used, usage FROM user_api_keys WHERE uid = $1 ORDER BY created_at DESC",
            )
            .bind(uid)
            .fetch_all(pool)
            .await?),
        }
    }

    pub async fn create_user_api_key(&self, record: NewUserApiKeyRecord) -> Result<()> {
        match self {
            Self::Postgres(pool) => {
                sqlx::query(
                    "INSERT INTO user_api_keys (id, name, key, uid, created_at, last_used, usage) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                )
                .bind(record.id)
                .bind(record.name)
                .bind(record.key)
                .bind(record.uid)
                .bind(record.created_at)
                .bind(record.last_used)
                .bind(record.usage)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn delete_user_api_key(&self, id: &str) -> Result<()> {
        match self {
            Self::Postgres(pool) => {
                sqlx::query("DELETE FROM user_api_keys WHERE id = $1")
                    .bind(id)
                    .execute(pool)
                    .await?;
            }
        }
        Ok(())
    }

    pub async fn get_pricing_state(&self) -> Result<PricingStateRecord> {
        match self {
            Self::Postgres(pool) => Ok(sqlx::query_as::<_, PricingStateRecord>(
                "SELECT current_version, config_version FROM pricing_state WHERE id = 1",
            )
            .fetch_one(pool)
            .await?),
        }
    }

    pub async fn list_pricing(&self) -> Result<Vec<PricingRecord>> {
        let state = self.get_pricing_state().await?;
        match self {
            Self::Postgres(pool) => Ok(sqlx::query_as::<_, PricingRecord>(
                "SELECT model, NULLIF(provider_account_id, '') AS provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price, markup_rate, currency, version, updated_at FROM model_pricings WHERE version = $1 ORDER BY model ASC, provider_account_id ASC",
            )
            .bind(state.current_version)
            .fetch_all(pool)
            .await?),
        }
    }

    pub async fn list_pricing_by_version(&self, version: &str) -> Result<Vec<PricingRecord>> {
        match self {
            Self::Postgres(pool) => Ok(sqlx::query_as::<_, PricingRecord>(
                "SELECT model, NULLIF(provider_account_id, '') AS provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price, markup_rate, currency, version, updated_at FROM model_pricings WHERE version = $1 ORDER BY model ASC, provider_account_id ASC",
            )
            .bind(version)
            .fetch_all(pool)
            .await?),
        }
    }

    pub async fn list_pricing_draft(&self) -> Result<Vec<PricingDraftRecord>> {
        match self {
            Self::Postgres(pool) => Ok(sqlx::query_as::<_, PricingDraftRecord>(
                "SELECT model, NULLIF(provider_account_id, '') AS provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price, markup_rate, currency, updated_at FROM model_pricings_draft ORDER BY model ASC, provider_account_id ASC",
            )
            .fetch_all(pool)
            .await?),
        }
    }

    pub async fn upsert_pricing_draft(&self, item: NewPricingDraftRecord) -> Result<()> {
        let now = Self::now_millis();
        let provider_account_id = item.provider_account_id.unwrap_or_default();
        match self {
            Self::Postgres(pool) => {
                sqlx::query(
                    r#"
                    INSERT INTO model_pricings_draft (model, provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price, markup_rate, currency, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (model, provider_account_id)
                    DO UPDATE SET
                      price_mode = EXCLUDED.price_mode,
                      input_price = EXCLUDED.input_price,
                      output_price = EXCLUDED.output_price,
                      cache_read_price = EXCLUDED.cache_read_price,
                      cache_write_price = EXCLUDED.cache_write_price,
                      markup_rate = EXCLUDED.markup_rate,
                      currency = EXCLUDED.currency,
                      updated_at = EXCLUDED.updated_at
                    "#,
                )
                .bind(item.model)
                .bind(provider_account_id)
                .bind(item.price_mode)
                .bind(item.input_price)
                .bind(item.output_price)
                .bind(item.cache_read_price)
                .bind(item.cache_write_price)
                .bind(item.markup_rate)
                .bind(item.currency)
                .bind(now)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn delete_pricing_draft(&self, model: &str, provider_account_id: Option<&str>) -> Result<()> {
        let provider_account_id = provider_account_id.unwrap_or("");
        match self {
            Self::Postgres(pool) => {
                sqlx::query(
                    "DELETE FROM model_pricings_draft WHERE model = $1 AND provider_account_id = $2",
                )
                .bind(model)
                .bind(provider_account_id)
                .execute(pool)
                .await?;
            }
        }
        Ok(())
    }

    pub async fn list_pricing_releases(&self, limit: i64) -> Result<Vec<PricingReleaseRecord>> {
        let limit = limit.clamp(1, 100);
        match self {
            Self::Postgres(pool) => Ok(sqlx::query_as::<_, PricingReleaseRecord>(
                "SELECT version, status, summary, operator, created_at, config_version FROM pricing_releases ORDER BY created_at DESC LIMIT $1",
            )
            .bind(limit)
            .fetch_all(pool)
            .await?),
        }
    }

    pub async fn publish_pricing_draft(
        &self,
        operator: &str,
        summary: serde_json::Value,
    ) -> Result<PricingPublishResult> {
        let now = Self::now_millis();
        let version = format!("v{}", now);
        match self {
            Self::Postgres(pool) => {
                let mut tx = pool.begin().await?;
                let affected: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*)::BIGINT FROM model_pricings_draft",
                )
                .fetch_one(&mut *tx)
                .await?;

                sqlx::query("DELETE FROM model_pricings WHERE version = $1")
                    .bind(&version)
                    .execute(&mut *tx)
                    .await?;

                sqlx::query(
                    r#"
                    INSERT INTO model_pricings (model, provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price, markup_rate, currency, version, updated_at)
                    SELECT model, provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price, markup_rate, currency, $1, updated_at
                    FROM model_pricings_draft
                    "#,
                )
                .bind(&version)
                .execute(&mut *tx)
                .await?;

                let config_version: i64 = sqlx::query_scalar(
                    "UPDATE pricing_state SET current_version = $1, config_version = config_version + 1, updated_at = $2 WHERE id = 1 RETURNING config_version",
                )
                .bind(&version)
                .bind(now)
                .fetch_one(&mut *tx)
                .await?;

                sqlx::query(
                    "INSERT INTO pricing_releases (version, status, summary, operator, created_at, config_version) VALUES ($1, 'published', $2::jsonb, $3, $4, $5)",
                )
                .bind(&version)
                .bind(summary)
                .bind(operator)
                .bind(now)
                .bind(config_version)
                .execute(&mut *tx)
                .await?;

                tx.commit().await?;
                Ok(PricingPublishResult {
                    version,
                    config_version,
                    affected_models: affected,
                })
            }
        }
    }

    pub async fn rollback_pricing_version(
        &self,
        version: &str,
        operator: &str,
    ) -> Result<PricingPublishResult> {
        let now = Self::now_millis();
        match self {
            Self::Postgres(pool) => {
                let mut tx = pool.begin().await?;
                let affected: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*)::BIGINT FROM model_pricings WHERE version = $1",
                )
                .bind(version)
                .fetch_one(&mut *tx)
                .await?;
                if affected == 0 {
                    anyhow::bail!("pricing version not found");
                }
                let config_version: i64 = sqlx::query_scalar(
                    "UPDATE pricing_state SET current_version = $1, config_version = config_version + 1, updated_at = $2 WHERE id = 1 RETURNING config_version",
                )
                .bind(version)
                .bind(now)
                .fetch_one(&mut *tx)
                .await?;
                sqlx::query(
                    "INSERT INTO pricing_releases (version, status, summary, operator, created_at, config_version) VALUES ($1, 'rolled_back', $2::jsonb, $3, $4, $5)",
                )
                .bind(version)
                .bind(serde_json::json!({"action":"rollback"}))
                .bind(operator)
                .bind(now)
                .bind(config_version)
                .execute(&mut *tx)
                .await?;
                tx.commit().await?;
                Ok(PricingPublishResult {
                    version: version.to_string(),
                    config_version,
                    affected_models: affected,
                })
            }
        }
    }

    pub async fn get_effective_pricing(
        &self,
        model: &str,
        provider_account_id: Option<&str>,
    ) -> Result<Option<PricingRecord>> {
        let state = self.get_pricing_state().await?;
        match self {
            Self::Postgres(pool) => {
                let provider_id = match provider_account_id {
                    Some(v) if !v.trim().is_empty() => v,
                    _ => return Ok(None),
                };
                let record = sqlx::query_as::<_, PricingRecord>(
                    "SELECT model, NULLIF(provider_account_id, '') AS provider_account_id, price_mode, input_price, output_price, cache_read_price, cache_write_price, markup_rate, currency, version, updated_at FROM model_pricings WHERE model = $1 AND provider_account_id = $2 AND version = $3",
                )
                .bind(model)
                .bind(provider_id)
                .bind(&state.current_version)
                .fetch_optional(pool)
                .await?;
                Ok(record)
            }
        }
    }
}

pub struct PoolStatus {
    pub total: i64,
    pub enabled: i64,
    pub healthy: i64,
    pub degraded: i64,
    pub unhealthy: i64,
}

pub struct ProviderMetrics {
    pub active_connections: i64,
    pub total_requests: i64,
    pub avg_latency_ms: f64,
}

impl ProviderMetrics {
    pub fn success_rate(&self) -> f64 {
        1.0
    }
    pub fn error_rate(&self) -> f64 {
        0.0
    }
}
