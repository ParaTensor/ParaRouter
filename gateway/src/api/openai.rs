use axum::{
    extract::State,
    response::{IntoResponse, Response},
    Json,
};
use std::sync::Arc;
use unigateway_core::ExecutionTarget;

use unigateway_runtime::core::{try_openai_chat_via_core, try_openai_embeddings_via_core};
use unigateway_runtime::host::RuntimeContext;

use crate::auth::keys::AuthenticatedUser;
use crate::routing::resolve::resolve_model_target;
use crate::runtime::ParaRouterRuntime;
use crate::translators::openai::{
    into_core_chat_request, into_core_embeddings_request, PermissiveChatRequest,
    PermissiveEmbeddingsRequest,
};

pub async fn chat_completions(
    auth: AuthenticatedUser,
    State(runtime): State<Arc<ParaRouterRuntime>>,
    Json(permissive_request): Json<PermissiveChatRequest>,
) -> Response {
    // Stage 1: Protocol Translation
    let mut request = match into_core_chat_request(permissive_request) {
        Ok(r) => r,
        Err(e) => {
            return (axum::http::StatusCode::BAD_REQUEST, e).into_response();
        }
    };

    // Enforce ACL
    if let Some(user_models) = &auth.user_allowed_models {
        if !user_models.contains(&request.model) {
            return (
                axum::http::StatusCode::FORBIDDEN,
                axum::Json(serde_json::json!({ "error": "Model not allowed by user policy" }))
            ).into_response();
        }
    }
    if let Some(key_models) = &auth.key_allowed_models {
        if !key_models.contains(&request.model) {
            return (
                axum::http::StatusCode::FORBIDDEN,
                axum::Json(serde_json::json!({ "error": "Model not allowed by API key policy" }))
            ).into_response();
        }
    }

    // Annotate metadata securely from Auth layer
    request.metadata.insert("user_id".to_string(), auth.uid.clone());
    request.metadata.insert("key_id".to_string(), auth.key_id.clone());
    request.metadata.insert("requested_model".to_string(), request.model.clone());
    if let Some(budget_limit) = auth.budget_limit {
        request.metadata.insert("budget_limit".to_string(), budget_limit.to_string());
    }

    // Stage 2: Routing Lifecycle (find ExecutionTarget)
    let target = match resolve_model_target(&runtime, &request.model).await {
        Ok(t) => t,
        Err(e) => {
            return (
                axum::http::StatusCode::NOT_FOUND,
                format!("Routing failed: {}", e),
            )
                .into_response();
        }
    };

    let service_id = match &target {
        ExecutionTarget::Pool { pool_id } => pool_id.clone(),
        _ => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Unsupported target type",
            )
                .into_response()
        }
    };

    let ctx = RuntimeContext::from_parts(&*runtime, &*runtime, &*runtime, &*runtime);

    // Stage 3: Execution
    match try_openai_chat_via_core(&ctx, &service_id, None, request).await {
        Ok(Some(response)) => response,
        Ok(None) => (axum::http::StatusCode::NOT_FOUND, "Pool mapping not found").into_response(),
        Err(err) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            err.to_string(),
        )
            .into_response(),
    }
}

pub async fn embeddings(
    auth: AuthenticatedUser,
    State(runtime): State<Arc<ParaRouterRuntime>>,
    Json(permissive_request): Json<PermissiveEmbeddingsRequest>,
) -> Response {
    let mut request = match into_core_embeddings_request(permissive_request) {
        Ok(r) => r,
        Err(e) => {
            return (axum::http::StatusCode::BAD_REQUEST, e).into_response();
        }
    };

    // Enforce ACL
    if let Some(user_models) = &auth.user_allowed_models {
        if !user_models.contains(&request.model) {
            return (
                axum::http::StatusCode::FORBIDDEN,
                axum::Json(serde_json::json!({ "error": "Model not allowed by user policy" }))
            ).into_response();
        }
    }
    if let Some(key_models) = &auth.key_allowed_models {
        if !key_models.contains(&request.model) {
            return (
                axum::http::StatusCode::FORBIDDEN,
                axum::Json(serde_json::json!({ "error": "Model not allowed by API key policy" }))
            ).into_response();
        }
    }

    request.metadata.insert("user_id".to_string(), auth.uid.clone());
    request.metadata.insert("key_id".to_string(), auth.key_id.clone());
    request.metadata.insert("requested_model".to_string(), request.model.clone());
    if let Some(budget_limit) = auth.budget_limit {
        request.metadata.insert("budget_limit".to_string(), budget_limit.to_string());
    }

    let target = match resolve_model_target(&runtime, &request.model).await {
        Ok(t) => t,
        Err(e) => {
            return (
                axum::http::StatusCode::NOT_FOUND,
                format!("Routing failed: {}", e),
            )
                .into_response();
        }
    };

    let service_id = match &target {
        ExecutionTarget::Pool { pool_id } => pool_id.clone(),
        _ => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Unsupported target type",
            )
                .into_response()
        }
    };

    let ctx = RuntimeContext::from_parts(&*runtime, &*runtime, &*runtime, &*runtime);

    match try_openai_embeddings_via_core(&ctx, &service_id, None, request).await {
        Ok(Some(response)) => response,
        Ok(None) => (axum::http::StatusCode::NOT_FOUND, "Pool mapping not found").into_response(),
        Err(err) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            err.to_string(),
        )
            .into_response(),
    }
}
