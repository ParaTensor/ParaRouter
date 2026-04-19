use anyhow::{anyhow, Result};
use std::sync::Arc;

use crate::runtime::ParaRouterRuntime;
use unigateway_sdk::core::ExecutionTarget;

/// Resolves a requested model name to a `provider_account_id` (pool id).
/// Uses the current published pricing version. When `forced_provider_account_id` is set,
/// routes to that account if it has an active row for the model; otherwise falls back to
/// the best-ranked provider (top flag, then lowest input price).
pub async fn resolve_model_target(
    state: &Arc<ParaRouterRuntime>,
    requested_model: &str,
    forced_provider_account_id: Option<&str>,
) -> Result<ExecutionTarget> {
    let pool = &state.db;

    #[derive(sqlx::FromRow)]
    struct PricingRow {
        provider_account_id: String,
        #[allow(dead_code)]
        is_top_provider: bool,
    }

    let rows = if let Some(pid) = forced_provider_account_id.filter(|s| !s.is_empty()) {
        sqlx::query_as::<_, PricingRow>(
            r#"
            SELECT mpp.provider_account_id, mpp.is_top_provider
            FROM model_provider_pricings mpp
            JOIN pricing_state ps ON ps.id = 1 AND mpp.version = ps.current_version
            WHERE mpp.model_id = $1
              AND mpp.provider_account_id = $2
              AND mpp.status = 'online'
            LIMIT 1
            "#,
        )
        .bind(requested_model)
        .bind(pid)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, PricingRow>(
            r#"
            SELECT mpp.provider_account_id, mpp.is_top_provider
            FROM model_provider_pricings mpp
            JOIN pricing_state ps ON ps.id = 1 AND mpp.version = ps.current_version
            WHERE mpp.model_id = $1 AND mpp.status = 'online'
            ORDER BY mpp.is_top_provider DESC, mpp.input_price ASC NULLS LAST
            LIMIT 1
            "#,
        )
        .bind(requested_model)
        .fetch_all(pool)
        .await?
    };

    if rows.is_empty() {
        return Err(anyhow!(
            "Model not found or no active upstream providers exist for '{}'",
            requested_model
        ));
    }

    let selected_account_id = rows.into_iter().next().unwrap().provider_account_id;

    Ok(ExecutionTarget::Pool {
        pool_id: selected_account_id,
    })
}
