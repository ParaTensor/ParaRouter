use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::db::{
    ModelInfo, NewActivityRecord, NewModelRecord, NewPricingDraftRecord, NewProviderType,
    NewUserApiKeyRecord,
};
use crate::endpoints::{error_response, ProxyState};

#[derive(Debug, Deserialize)]
pub struct ModelsSyncRequest {
    models: Vec<IncomingModel>,
}

#[derive(Debug, Deserialize)]
struct IncomingModel {
    id: String,
    name: String,
    provider: String,
    description: Option<String>,
    context: Option<String>,
    pricing: Option<IncomingPricing>,
    tags: Option<Vec<String>>,
    #[serde(rename = "isPopular")]
    is_popular: Option<bool>,
    latency: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IncomingPricing {
    prompt: Option<String>,
    completion: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GatewayRegisterRequest {
    instance_id: String,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UsageRequest {
    model: Option<String>,
    tokens: Option<i32>,
    latency: Option<i32>,
    status: Option<i32>,
    user_id: Option<String>,
    cost: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ActivityQuery {
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UserApiKeysQuery {
    uid: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct NewUserApiKeyRequest {
    name: String,
    key: String,
    uid: String,
    #[serde(rename = "lastUsed")]
    last_used: Option<String>,
    usage: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ProviderKeyRequest {
    key: String,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PricingDraftUpsertRequest {
    model: String,
    provider_account_id: Option<String>,
    price_mode: String,
    input_price: Option<f64>,
    output_price: Option<f64>,
    cache_read_price: Option<f64>,
    cache_write_price: Option<f64>,
    markup_rate: Option<f64>,
    currency: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PricingDraftDeleteRequest {
    model: String,
    provider_account_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PricingPublishRequest {
    operator: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PricingPreviewRequest {
    operator: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PricingReleasesQuery {
    limit: Option<i64>,
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn parse_price(raw: Option<&str>) -> Option<f64> {
    let cleaned: String = raw
        .unwrap_or("")
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    cleaned.parse::<f64>().ok()
}

fn normalize_provider_id(provider: &str) -> String {
    provider
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

fn provider_base_url(provider_id: &str) -> String {
    match provider_id {
        "openai" => "https://api.openai.com/v1",
        "anthropic" => "https://api.anthropic.com/v1",
        "google" => "https://generativelanguage.googleapis.com/v1beta",
        "mistral" => "https://api.mistral.ai/v1",
        "meta" => "https://api.meta.ai/v1",
        "deepseek" => "https://api.deepseek.com/v1",
        _ => "",
    }
    .to_string()
}

pub async fn api_health(State(state): State<ProxyState>) -> impl IntoResponse {
    match state.db_pool.ping().await {
        Ok(_) => Json(json!({ "status": "ok", "database": "connected" })).into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "status": "error", "database": "disconnected" })),
        )
            .into_response(),
    }
}

pub async fn get_models(State(state): State<ProxyState>) -> impl IntoResponse {
    let rows = match state.db_pool.list_models().await {
        Ok(r) => r,
        Err(err) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to list models: {}", err),
                "db_error",
            )
            .into_response();
        }
    };

    let mapped = rows
        .into_iter()
        .map(|row| {
            let tags: Vec<String> = serde_json::from_str(&row.tags).unwrap_or_default();
            json!({
                "id": row.id,
                "name": row.name,
                "provider": row.provider,
                "description": row.description.unwrap_or_default(),
                "context": row.context.unwrap_or_default(),
                "pricing": {
                    "prompt": row.pricing_prompt.unwrap_or_else(|| "$0.00".to_string()),
                    "completion": row.pricing_completion.unwrap_or_else(|| "$0.00".to_string())
                },
                "tags": tags,
                "isPopular": row.is_popular != 0,
                "latency": row.latency.unwrap_or_else(|| "0.0s".to_string()),
                "status": row.status
            })
        })
        .collect::<Vec<_>>();

    Json(mapped).into_response()
}

pub async fn sync_models(
    State(state): State<ProxyState>,
    Json(payload): Json<ModelsSyncRequest>,
) -> impl IntoResponse {
    for model in &payload.models {
        let record = NewModelRecord {
            id: model.id.clone(),
            name: model.name.clone(),
            provider: model.provider.clone(),
            description: model.description.clone().unwrap_or_default(),
            context: model.context.clone().unwrap_or_default(),
            pricing_prompt: model
                .pricing
                .as_ref()
                .and_then(|p| p.prompt.clone())
                .unwrap_or_else(|| "$0.00".to_string()),
            pricing_completion: model
                .pricing
                .as_ref()
                .and_then(|p| p.completion.clone())
                .unwrap_or_else(|| "$0.00".to_string()),
            tags: model.tags.clone().unwrap_or_default(),
            is_popular: model.is_popular.unwrap_or(false),
            latency: model.latency.clone().unwrap_or_else(|| "0.0s".to_string()),
            status: model.status.clone().unwrap_or_else(|| "online".to_string()),
        };
        if let Err(err) = state.db_pool.upsert_model(record).await {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to upsert model {}: {}", model.id, err),
                "db_error",
            )
            .into_response();
        }
    }

    // rebuild provider_types from models
    let all_models = match state.db_pool.list_models().await {
        Ok(r) => r,
        Err(err) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to list models: {}", err),
                "db_error",
            )
            .into_response();
        }
    };

    let mut grouped: HashMap<String, (String, Vec<ModelInfo>)> = HashMap::new();
    for row in all_models {
        let provider_id = normalize_provider_id(&row.provider);
        let entry = grouped
            .entry(provider_id.clone())
            .or_insert_with(|| (row.provider.clone(), vec![]));
        let context_length = row
            .context
            .as_deref()
            .unwrap_or("")
            .chars()
            .filter(|c| c.is_ascii_digit())
            .collect::<String>()
            .parse::<u32>()
            .ok();
        entry.1.push(ModelInfo {
            id: row.id,
            name: row.name,
            description: row.description,
            supports_tools: None,
            context_length,
            input_price: parse_price(row.pricing_prompt.as_deref()),
            output_price: parse_price(row.pricing_completion.as_deref()),
        });
    }

    for (provider_id, (label, models)) in grouped {
        let pt = NewProviderType {
            id: provider_id.clone(),
            label,
            base_url: provider_base_url(&provider_id),
            driver_type: "openai_compatible".to_string(),
            models,
            enabled: Some(true),
            sort_order: Some(0),
            docs_url: None,
        };
        if let Err(err) = state.db_pool.upsert_provider_type(pt).await {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to rebuild provider_types: {}", err),
                "db_error",
            )
            .into_response();
        }
    }

    Json(json!({"status":"synced","count":payload.models.len()})).into_response()
}

pub async fn gateway_register(
    State(state): State<ProxyState>,
    Json(payload): Json<GatewayRegisterRequest>,
) -> impl IntoResponse {
    if payload.instance_id.trim().is_empty() {
        return error_response(StatusCode::BAD_REQUEST, "instance_id required", "invalid_request")
            .into_response();
    }
    if let Err(err) = state
        .db_pool
        .register_gateway(&payload.instance_id, payload.status.as_deref().unwrap_or("online"))
        .await
    {
        return error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("register failed: {}", err),
            "db_error",
        )
        .into_response();
    }
    Json(json!({"status":"registered"})).into_response()
}

pub async fn gateway_list(State(state): State<ProxyState>) -> impl IntoResponse {
    match state.db_pool.list_gateways().await {
        Ok(rows) => Json(rows).into_response(),
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to list gateways: {}", err),
            "db_error",
        )
        .into_response(),
    }
}

pub async fn gateway_config(State(state): State<ProxyState>) -> impl IntoResponse {
    let provider_types = match state.db_pool.list_provider_types().await {
        Ok(rows) => rows,
        Err(err) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to list provider types: {}", err),
                "db_error",
            )
            .into_response();
        }
    };
    let keys = match state.db_pool.list_provider_keys().await {
        Ok(rows) => rows,
        Err(err) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to list provider keys: {}", err),
                "db_error",
            )
            .into_response();
        }
    };
    let providers = provider_types
        .into_iter()
        .filter(|pt| pt.enabled != 0)
        .map(|pt| {
            json!({
                "id": pt.id,
                "name": pt.id,
                "label": pt.label,
                "base_url": pt.base_url,
                "driver_type": pt.driver_type,
                "models": pt.models,
                "docs_url": pt.docs_url
            })
        })
        .collect::<Vec<_>>();
    let keys = keys
        .into_iter()
        .filter(|k| k.status == "active")
        .map(|k| json!({"provider":k.provider,"key":k.key,"status":k.status}))
        .collect::<Vec<_>>();
    Json(json!({ "providers": providers, "keys": keys })).into_response()
}

pub async fn provider_types(State(state): State<ProxyState>) -> impl IntoResponse {
    match state.db_pool.list_provider_types().await {
        Ok(rows) => Json(rows).into_response(),
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to list provider types: {}", err),
            "db_error",
        )
        .into_response(),
    }
}

pub async fn gateway_usage(
    State(state): State<ProxyState>,
    Json(payload): Json<UsageRequest>,
) -> impl IntoResponse {
    let record = NewActivityRecord {
        model: payload.model.unwrap_or_else(|| "unknown".to_string()),
        tokens: payload.tokens.unwrap_or(0),
        latency: payload.latency.unwrap_or(0),
        status: payload.status.unwrap_or(200),
        user_id: payload.user_id.unwrap_or_else(|| "system".to_string()),
        cost: payload.cost.unwrap_or_else(|| "$0.00".to_string()),
    };
    match state.db_pool.create_activity(record).await {
        Ok(_) => Json(json!({"status":"received"})).into_response(),
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to insert activity: {}", err),
            "db_error",
        )
        .into_response(),
    }
}

pub async fn activity(
    State(state): State<ProxyState>,
    Query(query): Query<ActivityQuery>,
) -> impl IntoResponse {
    let limit = query.limit.unwrap_or(50);
    match state.db_pool.list_activity(limit).await {
        Ok(rows) => Json(rows).into_response(),
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to list activity: {}", err),
            "db_error",
        )
        .into_response(),
    }
}

pub async fn list_provider_keys(State(state): State<ProxyState>) -> impl IntoResponse {
    match state.db_pool.list_provider_keys().await {
        Ok(rows) => Json(rows).into_response(),
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to list provider keys: {}", err),
            "db_error",
        )
        .into_response(),
    }
}

pub async fn upsert_provider_key(
    State(state): State<ProxyState>,
    Path(provider): Path<String>,
    Json(payload): Json<ProviderKeyRequest>,
) -> impl IntoResponse {
    if payload.key.trim().is_empty() {
        return error_response(StatusCode::BAD_REQUEST, "key required", "invalid_request")
            .into_response();
    }
    let status = payload.status.unwrap_or_else(|| "active".to_string());
    if let Err(err) = state
        .db_pool
        .upsert_provider_key(&provider, &payload.key, &status)
        .await
    {
        return error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to save provider key: {}", err),
            "db_error",
        )
        .into_response();
    }

    let pt = NewProviderType {
        id: provider.clone(),
        label: provider.clone(),
        base_url: provider_base_url(&provider),
        driver_type: "openai_compatible".to_string(),
        models: vec![],
        enabled: Some(true),
        sort_order: Some(0),
        docs_url: None,
    };
    let _ = state.db_pool.upsert_provider_type(pt).await;

    Json(json!({"status":"saved"})).into_response()
}

pub async fn delete_provider_key(
    State(state): State<ProxyState>,
    Path(provider): Path<String>,
) -> impl IntoResponse {
    match state.db_pool.delete_provider_key(&provider).await {
        Ok(_) => Json(json!({"status":"deleted"})).into_response(),
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to delete provider key: {}", err),
            "db_error",
        )
        .into_response(),
    }
}

pub async fn list_user_api_keys(
    State(state): State<ProxyState>,
    Query(query): Query<UserApiKeysQuery>,
) -> impl IntoResponse {
    let uid = query.uid.unwrap_or_else(|| "local-admin".to_string());
    match state.db_pool.list_user_api_keys(&uid).await {
        Ok(rows) => {
            let data = rows
                .into_iter()
                .map(|row| {
                    json!({
                        "id": row.id,
                        "name": row.name,
                        "key": row.key,
                        "uid": row.uid,
                        "createdAt": chrono::DateTime::<chrono::Utc>::from_timestamp_millis(row.created_at)
                            .map(|d| d.to_rfc3339())
                            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
                        "lastUsed": row.last_used.unwrap_or_else(|| "Never".to_string()),
                        "usage": row.usage.unwrap_or_else(|| "$0.00".to_string()),
                    })
                })
                .collect::<Vec<_>>();
            Json(data).into_response()
        }
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to list user api keys: {}", err),
            "db_error",
        )
        .into_response(),
    }
}

pub async fn create_user_api_key(
    State(state): State<ProxyState>,
    Json(payload): Json<NewUserApiKeyRequest>,
) -> impl IntoResponse {
    if payload.name.trim().is_empty() || payload.key.trim().is_empty() || payload.uid.trim().is_empty() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "name/key/uid required",
            "invalid_request",
        )
        .into_response();
    }
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = now_millis();
    let record = NewUserApiKeyRecord {
        id: id.clone(),
        name: payload.name,
        key: payload.key,
        uid: payload.uid,
        created_at,
        last_used: payload.last_used.unwrap_or_else(|| "Never".to_string()),
        usage: payload.usage.unwrap_or_else(|| "$0.00".to_string()),
    };
    match state.db_pool.create_user_api_key(record).await {
        Ok(_) => Json(json!({"id": id, "createdAt": created_at})).into_response(),
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to create user api key: {}", err),
            "db_error",
        )
        .into_response(),
    }
}

pub async fn delete_user_api_key(
    State(state): State<ProxyState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.db_pool.delete_user_api_key(&id).await {
        Ok(_) => Json(json!({"status":"deleted"})).into_response(),
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to delete user api key: {}", err),
            "db_error",
        )
        .into_response(),
    }
}

pub async fn get_pricing(State(state): State<ProxyState>) -> impl IntoResponse {
    match state.db_pool.list_pricing().await {
        Ok(rows) => Json(rows).into_response(),
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to list pricing: {}", err),
            "db_error",
        )
        .into_response(),
    }
}

pub async fn get_pricing_state(State(state): State<ProxyState>) -> impl IntoResponse {
    match state.db_pool.get_pricing_state().await {
        Ok(state_row) => Json(state_row).into_response(),
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to load pricing state: {}", err),
            "db_error",
        )
        .into_response(),
    }
}

pub async fn get_pricing_draft(State(state): State<ProxyState>) -> impl IntoResponse {
    match state.db_pool.list_pricing_draft().await {
        Ok(rows) => Json(rows).into_response(),
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to list pricing draft: {}", err),
            "db_error",
        )
        .into_response(),
    }
}

pub async fn put_pricing_draft(
    State(state): State<ProxyState>,
    Json(payload): Json<PricingDraftUpsertRequest>,
) -> impl IntoResponse {
    let mode = payload.price_mode.trim().to_lowercase();
    if payload.model.trim().is_empty() {
        return error_response(StatusCode::BAD_REQUEST, "model required", "invalid_request")
            .into_response();
    }
    if mode != "fixed" && mode != "markup" {
        return error_response(
            StatusCode::BAD_REQUEST,
            "price_mode must be fixed or markup",
            "invalid_request",
        )
        .into_response();
    }
    if mode == "fixed" && (payload.input_price.is_none() || payload.output_price.is_none()) {
        return error_response(
            StatusCode::BAD_REQUEST,
            "fixed mode requires input_price and output_price",
            "invalid_request",
        )
        .into_response();
    }
    if mode == "markup" && payload.markup_rate.is_none() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "markup mode requires markup_rate",
            "invalid_request",
        )
        .into_response();
    }
    let record = NewPricingDraftRecord {
        model: payload.model.trim().to_string(),
        provider_account_id: payload
            .provider_account_id
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        price_mode: mode.clone(),
        input_price: if mode == "fixed" {
            payload.input_price
        } else {
            None
        },
        output_price: if mode == "fixed" {
            payload.output_price
        } else {
            None
        },
        cache_read_price: if mode == "fixed" {
            payload.cache_read_price
        } else {
            None
        },
        cache_write_price: if mode == "fixed" {
            payload.cache_write_price
        } else {
            None
        },
        markup_rate: if mode == "markup" {
            payload.markup_rate
        } else {
            None
        },
        currency: payload.currency.unwrap_or_else(|| "USD".to_string()),
    };
    if record.provider_account_id.is_none() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "provider_account_id required",
            "invalid_request",
        )
        .into_response();
    }
    match state.db_pool.upsert_pricing_draft(record).await {
        Ok(_) => Json(json!({"status":"saved"})).into_response(),
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to save pricing draft: {}", err),
            "db_error",
        )
        .into_response(),
    }
}

pub async fn delete_pricing_draft(
    State(state): State<ProxyState>,
    Query(payload): Query<PricingDraftDeleteRequest>,
) -> impl IntoResponse {
    if payload.model.trim().is_empty() {
        return error_response(StatusCode::BAD_REQUEST, "model required", "invalid_request")
            .into_response();
    }
    match state
        .db_pool
        .delete_pricing_draft(payload.model.trim(), payload.provider_account_id.as_deref())
        .await
    {
        Ok(_) => Json(json!({"status":"deleted"})).into_response(),
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to delete pricing draft: {}", err),
            "db_error",
        )
        .into_response(),
    }
}

pub async fn preview_pricing(
    State(state): State<ProxyState>,
    Json(payload): Json<PricingPreviewRequest>,
) -> impl IntoResponse {
    let _operator = payload.operator.unwrap_or_else(|| "system".to_string());
    let draft = match state.db_pool.list_pricing_draft().await {
        Ok(rows) => rows,
        Err(err) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to list pricing draft: {}", err),
                "db_error",
            )
            .into_response();
        }
    };
    let current = match state.db_pool.list_pricing().await {
        Ok(rows) => rows,
        Err(err) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to list current pricing: {}", err),
                "db_error",
            )
            .into_response();
        }
    };

    let current_map: HashMap<String, crate::db::PricingRecord> = current
        .into_iter()
        .map(|r| {
            (
                format!("{}::{}", r.model, r.provider_account_id.clone().unwrap_or_default()),
                r,
            )
        })
        .collect();
    let mut changes = Vec::new();
    for item in &draft {
        let key = format!(
            "{}::{}",
            item.model,
            item.provider_account_id.clone().unwrap_or_default()
        );
        let before = current_map.get(&key);
        changes.push(json!({
            "model": item.model,
            "provider_account_id": item.provider_account_id,
            "before": before,
            "after": item,
        }));
    }

    let affected_models = draft
        .iter()
        .map(|r| r.model.clone())
        .collect::<std::collections::HashSet<_>>()
        .len() as i64;
    Json(json!({
        "affected_models": affected_models,
        "changes_count": draft.len(),
        "estimated_monthly_revenue": serde_json::Value::Null,
        "estimated_profit_margin": serde_json::Value::Null,
        "cost_basis_source": "provider_cost_markup",
        "changes": changes
    }))
    .into_response()
}

pub async fn publish_pricing(
    State(state): State<ProxyState>,
    Json(payload): Json<PricingPublishRequest>,
) -> impl IntoResponse {
    let operator = payload.operator.unwrap_or_else(|| "system".to_string());
    let summary = json!({"source":"pricing_center","operator":operator});
    match state.db_pool.publish_pricing_draft(&operator, summary).await {
        Ok(result) => {
            tracing::info!(
                metric = "pricing_publish",
                version = %result.version,
                affected = result.affected_models,
                config_version = result.config_version,
                operator = %operator
            );
            Json(json!({
                "status":"published",
                "version": result.version,
                "config_version": result.config_version,
                "affected_models": result.affected_models
            }))
            .into_response()
        }
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to publish pricing: {}", err),
            "db_error",
        )
        .into_response(),
    }
}

pub async fn rollback_pricing(
    State(state): State<ProxyState>,
    Path(version): Path<String>,
    Json(payload): Json<PricingPublishRequest>,
) -> impl IntoResponse {
    let operator = payload.operator.unwrap_or_else(|| "system".to_string());
    match state
        .db_pool
        .rollback_pricing_version(version.trim(), &operator)
        .await
    {
        Ok(result) => {
            tracing::info!(
                metric = "pricing_rollback",
                version = %result.version,
                affected = result.affected_models,
                config_version = result.config_version,
                operator = %operator
            );
            Json(json!({
                "status":"rolled_back",
                "version": result.version,
                "config_version": result.config_version,
                "affected_models": result.affected_models
            }))
            .into_response()
        }
        Err(err) => error_response(
            StatusCode::BAD_REQUEST,
            format!("Failed to rollback pricing: {}", err),
            "invalid_request",
        )
        .into_response(),
    }
}

pub async fn list_pricing_releases(
    State(state): State<ProxyState>,
    Query(query): Query<PricingReleasesQuery>,
) -> impl IntoResponse {
    let limit = query.limit.unwrap_or(20);
    match state.db_pool.list_pricing_releases(limit).await {
        Ok(rows) => Json(rows).into_response(),
        Err(err) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to list pricing releases: {}", err),
            "db_error",
        )
        .into_response(),
    }
}
