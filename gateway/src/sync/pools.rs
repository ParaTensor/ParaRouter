use std::collections::HashMap;

use sqlx::{Pool, Postgres};
use tracing::{info, warn};
use unigateway_sdk::core::{
    Endpoint, LoadBalancingStrategy, ModelPolicy, ProviderKind, ProviderPool, RetryPolicy,
    SecretString, UniGatewayEngine,
};
use url::Url;

fn normalize_base_url(base_url: &str, provider_kind: &ProviderKind) -> String {
    if !matches!(provider_kind, ProviderKind::OpenAiCompatible) {
        return base_url.to_string();
    }

    let Ok(mut parsed) = Url::parse(base_url) else {
        return base_url.to_string();
    };

    if parsed.path().is_empty() || parsed.path() == "/" {
        parsed.set_path("/v1");
        return parsed.to_string();
    }

    base_url.to_string()
}

pub async fn load_all_pools(db: &Pool<Postgres>, engine: &UniGatewayEngine) -> anyhow::Result<()> {
    #[derive(sqlx::FromRow)]
    struct AccountRow {
        id: String,
        provider_type: String,
        driver_type: String,
        base_url: String,
    }

    let accounts = sqlx::query_as::<_, AccountRow>(
        r#"
        SELECT a.id,
               a.provider_type,
               COALESCE(NULLIF(pt.driver_type, ''), CASE WHEN a.provider_type = 'anthropic' THEN 'anthropic' ELSE 'openai_compatible' END) AS driver_type,
             a.base_url
        FROM provider_accounts a
        LEFT JOIN provider_types pt ON pt.id = a.provider_type
        WHERE a.status = 'active'
        "#,
    )
    .fetch_all(db)
    .await?;

    let account_map: HashMap<String, AccountRow> =
        accounts.into_iter().map(|a| (a.id.clone(), a)).collect();

    info!(
        "Pool sync: found {} active provider accounts: {:?}",
        account_map.len(),
        account_map.keys().collect::<Vec<_>>()
    );

    #[derive(sqlx::FromRow)]
    struct KeyRow {
        id: String,
        provider_account_id: String,
        api_key: String,
        health_status: String,
    }

    let keys = sqlx::query_as::<_, KeyRow>(
        r#"
        SELECT id, provider_account_id, api_key,
               COALESCE(health_status, 'unknown') AS health_status
        FROM provider_api_keys 
        WHERE status = 'active'
          AND COALESCE(health_status, 'unknown') <> 'unhealthy'
        "#,
    )
    .fetch_all(db)
    .await?;

    info!("Pool sync: found {} active provider API keys", keys.len());

    let current_version =
        sqlx::query_scalar::<_, String>("SELECT current_version FROM pricing_state WHERE id = 1")
            .fetch_optional(db)
            .await?
            .unwrap_or_else(|| "bootstrap".to_string());

    #[derive(sqlx::FromRow)]
    struct PricingMappingRow {
        model_id: String,
        public_model_id: Option<String>,
        provider_account_id: String,
        provider_model_id: Option<String>,
    }

    let mappings = sqlx::query_as::<_, PricingMappingRow>(
        r#"
        SELECT model_id, public_model_id, provider_account_id, provider_model_id 
        FROM model_provider_pricings 
        WHERE version = $1 AND status = 'online'
        "#,
    )
    .bind(&current_version)
    .fetch_all(db)
    .await?;

    let mut account_model_mappings: HashMap<String, HashMap<String, String>> = HashMap::new();
    for mapping in mappings {
        let public_model_id = mapping
            .public_model_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(mapping.model_id.as_str())
            .to_string();
        let provider_target = mapping
            .provider_model_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .or_else(|| {
                if public_model_id != mapping.model_id {
                    Some(mapping.model_id.clone())
                } else {
                    None
                }
            });

        if let Some(provider_target) = provider_target {
            account_model_mappings
                .entry(mapping.provider_account_id)
                .or_default()
                .insert(public_model_id, provider_target);
        }
    }

    let mut pool_endpoints: HashMap<String, Vec<Endpoint>> = HashMap::new();
    for key in keys {
        if let Some(account) = account_map.get(&key.provider_account_id) {
            if key.health_status.eq_ignore_ascii_case("unhealthy") {
                warn!(
                    "Pool sync: key {} for account '{}' is unhealthy, skipping",
                    key.id, key.provider_account_id
                );
                continue;
            }
            let provider_kind = match account.driver_type.as_str() {
                "anthropic" => ProviderKind::Anthropic,
                _ => ProviderKind::OpenAiCompatible,
            };
            let normalized_base_url = normalize_base_url(&account.base_url, &provider_kind);

            let driver_id = match account.driver_type.as_str() {
                "anthropic" => "anthropic",
                _ => "openai-compatible",
            };

            let endpoint = Endpoint {
                endpoint_id: key.id.clone(),
                provider_name: Some(account.provider_type.clone()),
                source_endpoint_id: Some(key.id.clone()),
                provider_family: Some(account.provider_type.clone()),
                provider_kind,
                driver_id: driver_id.to_string(),
                base_url: normalized_base_url,
                api_key: SecretString::new(key.api_key),
                model_policy: ModelPolicy {
                    default_model: None,
                    model_mapping: account_model_mappings
                        .get(&account.id)
                        .cloned()
                        .unwrap_or_default(),
                },
                enabled: true,
                metadata: HashMap::new(),
            };

            pool_endpoints
                .entry(account.id.clone())
                .or_default()
                .push(endpoint);
        } else {
            warn!(
                "Pool sync: key {} references unknown account '{}', skipping",
                key.id, key.provider_account_id
            );
        }
    }

    // Upsert active pools
    let mut current_pool_ids = std::collections::HashSet::new();

    for (account_id, endpoints) in pool_endpoints {
        if let Some(account) = account_map.get(&account_id) {
            info!(
                "Pool sync: registering pool '{}' ({}) with {} endpoint(s)",
                account_id,
                endpoints[0].base_url,
                endpoints.len()
            );
            let pool = ProviderPool {
                pool_id: account_id.clone(),
                endpoints,
                load_balancing: LoadBalancingStrategy::RoundRobin,
                retry_policy: RetryPolicy::default(),
                metadata: HashMap::from([("provider".to_string(), account.provider_type.clone())]),
            };

            engine.upsert_pool(pool).await?;
            current_pool_ids.insert(account_id);
        }
    }

    info!(
        "Pool sync: {} pool(s) active in engine: {:?}",
        current_pool_ids.len(),
        current_pool_ids
    );

    // Cleanup pools that are no longer active in the DB
    let active_pools = engine.list_pools().await;
    for existing_pool in active_pools {
        if !current_pool_ids.contains(&existing_pool.pool_id) {
            engine.remove_pool(&existing_pool.pool_id).await?;
        }
    }

    Ok(())
}
