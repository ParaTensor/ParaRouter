use anyhow::{anyhow, Result};
use std::sync::Arc;

use crate::runtime::OpenHubRuntime;
use unigateway_core::ExecutionTarget;

/// Resolves a requested model name to one or more `provider_account_id`s,
/// picking the best active upstream based on `model_provider_pricings`.
pub async fn resolve_model_target(
    state: &Arc<OpenHubRuntime>,
    requested_model: &str,
) -> Result<ExecutionTarget> {
    let pool = &state.db;

    #[derive(sqlx::FromRow)]
    struct PricingRow {
        provider_account_id: String,
        #[allow(dead_code)]
        is_top_provider: bool,
    }

    // Lookup active pricings for this model to find a target provider account
    // For now we just pick a top priority or any active one constraint
    let rows = sqlx::query_as::<_, PricingRow>(
        r#"
        SELECT provider_account_id, is_top_provider
        FROM model_provider_pricings
        WHERE model_id = $1 AND status = 'online'
        ORDER BY is_top_provider DESC
        LIMIT 1
        "#,
    )
    .bind(requested_model)
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        return Err(anyhow!(
            "Model not found or no active upstream providers exist for '{}'",
            requested_model
        ));
    }

    // For now we just select the first matched provider_account (PoolId)
    // Later we can construct compound targets if unigateway supports load balancing across pools
    let selected_account_id = rows.into_iter().next().unwrap().provider_account_id;

    Ok(ExecutionTarget::Pool {
        pool_id: selected_account_id,
    })
}
