use sqlx::{Pool, Postgres};
use std::collections::HashMap;
use tracing::{info, warn};
use unigateway_core::{
    Endpoint, LoadBalancingStrategy, ModelPolicy, ProviderKind, ProviderPool, RetryPolicy,
    SecretString, UniGatewayEngine,
};

pub async fn load_all_pools(db: &Pool<Postgres>, engine: &UniGatewayEngine) -> anyhow::Result<()> {
    #[derive(sqlx::FromRow)]
    struct AccountRow {
        id: String,
        provider_type: String,
        base_url: String,
    }

    let accounts = sqlx::query_as::<_, AccountRow>(
        r#"
        SELECT id, provider_type, base_url 
        FROM provider_accounts 
        WHERE status = 'active'
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
    }

    let keys = sqlx::query_as::<_, KeyRow>(
        r#"
        SELECT id, provider_account_id, api_key 
        FROM provider_api_keys 
        WHERE status = 'active'
        "#,
    )
    .fetch_all(db)
    .await?;

    info!("Pool sync: found {} active provider API keys", keys.len());

    let mut pool_endpoints: HashMap<String, Vec<Endpoint>> = HashMap::new();
    for key in keys {
        if let Some(account) = account_map.get(&key.provider_account_id) {
            let provider_kind = match account.provider_type.as_str() {
                "anthropic" => ProviderKind::Anthropic,
                _ => ProviderKind::OpenAiCompatible,
            };

            let driver_id = match account.provider_type.as_str() {
                "anthropic" => "anthropic",
                _ => "openai-compatible",
            };

            let endpoint = Endpoint {
                endpoint_id: key.id.clone(),
                provider_kind,
                driver_id: driver_id.to_string(),
                base_url: account.base_url.clone(),
                api_key: SecretString::new(key.api_key),
                model_policy: ModelPolicy::default(),
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
                account.base_url,
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
