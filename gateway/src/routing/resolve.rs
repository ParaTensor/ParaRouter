use anyhow::{anyhow, Result};
use std::sync::Arc;

use crate::runtime::ParaRouterRuntime;
use unigateway_sdk::core::ExecutionTarget;

/// Routing result containing the selected pool and the concrete endpoint hint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedModelTarget {
    pub target: ExecutionTarget,
    pub endpoint_hint: Option<String>,
}

/// Resolves a requested model name to a `provider_account_id` (pool id).
/// Uses the current published pricing version. When `forced_provider_account_id` is set,
/// routes to that account if it has an active row for the model; otherwise falls back to
/// the best-ranked provider (top flag, then lowest input price).
pub async fn resolve_model_target(
    state: &Arc<ParaRouterRuntime>,
    requested_model: &str,
    forced_provider_account_id: Option<&str>,
) -> Result<ResolvedModelTarget> {
    let pool = &state.db;

    #[derive(sqlx::FromRow)]
    struct PricingRow {
        provider_account_id: String,
        provider_key_id: String,
    }

    let current_version = sqlx::query_scalar::<_, String>(
        "SELECT current_version FROM pricing_state WHERE id = 1",
    )
    .fetch_optional(pool)
    .await?
    .unwrap_or_else(|| "bootstrap".to_string());

    let rows = if let Some(pid) = forced_provider_account_id.filter(|s| !s.is_empty()) {
        sqlx::query_as::<_, PricingRow>(
            r#"
            SELECT mpp.provider_account_id, mpp.provider_key_id
            FROM model_provider_pricings mpp
            JOIN provider_api_keys pak ON pak.id = mpp.provider_key_id
            WHERE mpp.model_id = $1
              AND mpp.provider_account_id = $2
              AND mpp.version = $3
              AND mpp.status = 'online'
              AND pak.status = 'active'
              AND COALESCE(pak.health_status, 'unknown') <> 'unhealthy'
            ORDER BY mpp.is_top_provider DESC, mpp.input_price ASC NULLS LAST, mpp.provider_key_id ASC
            LIMIT 1
            "#,
        )
        .bind(requested_model)
        .bind(pid)
        .bind(&current_version)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, PricingRow>(
            r#"
            SELECT mpp.provider_account_id, mpp.provider_key_id
            FROM model_provider_pricings mpp
            JOIN provider_api_keys pak ON pak.id = mpp.provider_key_id
            WHERE mpp.model_id = $1
              AND mpp.version = $2
              AND mpp.status = 'online'
              AND pak.status = 'active'
              AND COALESCE(pak.health_status, 'unknown') <> 'unhealthy'
            ORDER BY mpp.is_top_provider DESC, mpp.input_price ASC NULLS LAST, mpp.provider_account_id ASC, mpp.provider_key_id ASC
            LIMIT 1
            "#,
        )
        .bind(requested_model)
        .bind(&current_version)
        .fetch_all(pool)
        .await?
    };

    let rows = if rows.is_empty() && forced_provider_account_id.is_some() {
        sqlx::query_as::<_, PricingRow>(
            r#"
            SELECT mpp.provider_account_id, mpp.provider_key_id
            FROM model_provider_pricings mpp
            JOIN provider_api_keys pak ON pak.id = mpp.provider_key_id
            WHERE mpp.model_id = $1
              AND mpp.version = $2
              AND mpp.status = 'online'
              AND pak.status = 'active'
              AND COALESCE(pak.health_status, 'unknown') <> 'unhealthy'
            ORDER BY mpp.is_top_provider DESC, mpp.input_price ASC NULLS LAST, mpp.provider_account_id ASC, mpp.provider_key_id ASC
            LIMIT 1
            "#,
        )
        .bind(requested_model)
        .bind(&current_version)
        .fetch_all(pool)
        .await?
    } else {
        rows
    };

    if rows.is_empty() {
        return Err(anyhow!(
            "Model not found or no active upstream providers exist for '{}'",
            requested_model
        ));
    }

    let selected = rows.into_iter().next().unwrap();

    Ok(ResolvedModelTarget {
        target: ExecutionTarget::Pool {
            pool_id: selected.provider_account_id,
        },
        endpoint_hint: Some(selected.provider_key_id),
    })
}
