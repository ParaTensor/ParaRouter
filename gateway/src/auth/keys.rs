use anyhow::Result;
use axum::{
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::sync::Arc;

use crate::runtime::ParaRouterRuntime;

/// Represents an authenticated ParaRouter principal via user_api_keys
#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    pub key_id: String,
    pub uid: String,
    pub name: String,
    pub balance: f64,
    pub user_allowed_models: Option<Vec<String>>,
    pub key_allowed_models: Option<Vec<String>>,
    pub budget_limit: Option<f64>,
    pub key_usage: String,
}

#[axum::async_trait]
impl FromRequestParts<Arc<ParaRouterRuntime>> for AuthenticatedUser {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<ParaRouterRuntime>,
    ) -> std::result::Result<Self, Self::Rejection> {
        // Try Authorization: Bearer <token> first (OpenAI standard)
        let auth_header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
            .unwrap_or_default();

        // Fallback to x-api-key (Anthropic standard)
        let api_key_header = parts
            .headers
            .get("x-api-key")
            .and_then(|h| h.to_str().ok())
            .unwrap_or_default();

        tracing::debug!(
            "Auth headers: Authorization={}, x-api-key={}",
            if auth_header.is_empty() {
                "<empty>"
            } else {
                "<present>"
            },
            if api_key_header.is_empty() {
                "<empty>"
            } else {
                "<present>"
            }
        );

        let token = if auth_header.starts_with("Bearer ") {
            auth_header["Bearer ".len()..].trim().to_string()
        } else if !api_key_header.is_empty() {
            api_key_header.trim().to_string()
        } else {
            tracing::warn!(
                "No valid auth header found (neither Authorization: Bearer nor x-api-key)"
            );
            return Err(unauthorized_response("Missing or invalid Bearer token"));
        };

        let token = token.as_str();

        // Perform the lookup directly in the gateway
        let user = lookup_user_api_key(state, token).await.map_err(|e| {
            tracing::error!("Auth lookup failed: {}", e);
            internal_error_response("Authentication service failed")
        })?;

        match user {
            Some(u) => {
                if u.balance <= 0.0 {
                    return Err(payment_required_response(
                        "Insufficient balance. Please recharge your account.",
                    ));
                }

                if let Some(budget) = u.budget_limit {
                    let current_usage = u.key_usage.replace("$", "").parse::<f64>().unwrap_or(0.0);
                    if current_usage >= budget {
                        return Err(payment_required_response("API Key budget limit exceeded."));
                    }
                }

                Ok(u)
            }
            None => Err(unauthorized_response("Invalid API key")),
        }
    }
}

async fn lookup_user_api_key(
    state: &Arc<ParaRouterRuntime>,
    token: &str,
) -> Result<Option<AuthenticatedUser>> {
    #[derive(sqlx::FromRow)]
    struct UserKeyRow {
        id: String,
        uid: String,
        name: String,
        balance: f64,
        user_allowed_models: Option<sqlx::types::Json<Vec<String>>>,
        key_allowed_models: Option<sqlx::types::Json<Vec<String>>>,
        budget_limit: Option<f64>,
        usage: String,
    }

    let pool = &state.db;

    // In ParaRouter schema, `user_api_keys` holds the gateway keys
    let row = sqlx::query_as::<_, UserKeyRow>(
        r#"
        SELECT 
            k.id, k.uid, k.name, u.balance,
            u.allowed_models as user_allowed_models,
            k.allowed_models as key_allowed_models,
            k.budget_limit,
            k.usage
        FROM user_api_keys k
        JOIN users u ON k.uid = u.id
        WHERE k.key = $1
        "#,
    )
    .bind(token)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| AuthenticatedUser {
        key_id: r.id,
        uid: r.uid,
        name: r.name,
        balance: r.balance,
        user_allowed_models: r.user_allowed_models.map(|j| j.0),
        key_allowed_models: r.key_allowed_models.map(|j| j.0),
        budget_limit: r.budget_limit,
        key_usage: r.usage,
    }))
}

fn unauthorized_response(msg: &str) -> Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(json!({
            "error": {
                "message": msg,
                "type": "invalid_request_error",
                "param": null,
                "code": "invalid_api_key"
            }
        })),
    )
        .into_response()
}

fn internal_error_response(msg: &str) -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({
            "error": {
                "message": msg,
                "type": "api_error",
                "param": null,
                "code": "internal_error"
            }
        })),
    )
        .into_response()
}

fn payment_required_response(msg: &str) -> Response {
    (
        StatusCode::PAYMENT_REQUIRED,
        Json(json!({
            "error": {
                "message": msg,
                "type": "api_error",
                "param": null,
                "code": "insufficient_quota"
            }
        })),
    )
        .into_response()
}
