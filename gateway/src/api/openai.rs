use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use axum::body::Body;

use unigateway_sdk::core::ExecutionTarget;
use unigateway_sdk::host::{
    dispatch_request, HostContext, HostDispatchOutcome, HostDispatchTarget, HostError,
    HostProtocol, HostRequest,
};
use unigateway_sdk::protocol::{ProtocolHttpResponse, ProtocolResponseBody};

use crate::auth::keys::AuthenticatedUser;
use crate::routing::resolve::resolve_model_target;
use crate::runtime::ParaRouterRuntime;
use crate::translators::openai::{
    into_core_chat_request, into_core_embeddings_request, PermissiveChatRequest,
    PermissiveEmbeddingsRequest,
};

/// Convert a ProtocolHttpResponse into an axum::Response.
fn into_axum_response(response: ProtocolHttpResponse) -> Response {
    let (status, body) = response.into_parts();
    match body {
        ProtocolResponseBody::Json(value) => {
            (status, axum::Json(value)).into_response()
        }
        ProtocolResponseBody::ServerSentEvents(stream) => {
            Response::builder()
                .status(status)
                .header("content-type", "text/event-stream")
                .header("cache-control", "no-cache")
                .body(Body::from_stream(stream))
                .unwrap_or_else(|e| {
                    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
                })
        }
    }
}

/// Convert HostError into an appropriate HTTP Response.
fn error_response_for_host_error(err: &HostError) -> Response {
    let status = match err {
        HostError::InvalidDispatchRequest { .. } => StatusCode::BAD_REQUEST,
        HostError::PoolLookup(_) => StatusCode::BAD_GATEWAY,
        HostError::Targeting(_) => StatusCode::BAD_REQUEST,
        HostError::CoreInvalidRequest(_) => StatusCode::BAD_REQUEST,
        HostError::CorePoolNotFound(_) => StatusCode::NOT_FOUND,
        HostError::CoreEndpointNotFound(_) => StatusCode::NOT_FOUND,
        HostError::CoreBuild(_) => StatusCode::INTERNAL_SERVER_ERROR,
        HostError::CoreAllEndpointsSaturated { .. } => StatusCode::SERVICE_UNAVAILABLE,
        HostError::CoreNoAvailableEndpoint { .. } => StatusCode::SERVICE_UNAVAILABLE,
        HostError::CoreUpstreamHttp { status, .. } => {
            StatusCode::from_u16(*status).unwrap_or(StatusCode::BAD_GATEWAY)
        }
        HostError::CoreTransport { .. } => StatusCode::BAD_GATEWAY,
        HostError::CoreStreamAborted { .. } => StatusCode::BAD_GATEWAY,
        HostError::CoreNotImplemented(_) => StatusCode::NOT_IMPLEMENTED,
        HostError::CoreAllAttemptsFailed { .. } => StatusCode::BAD_GATEWAY,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };

    let error_body = serde_json::json!({
        "error": {
            "message": err.to_string()
        }
    });
    (status, axum::Json(error_body)).into_response()
}

pub async fn chat_completions(
    auth: AuthenticatedUser,
    State(runtime): State<Arc<ParaRouterRuntime>>,
    Json(permissive_request): Json<PermissiveChatRequest>,
) -> Response {
    let provider_hint = permissive_request
        .pararouter_provider_account_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    // Stage 1: Protocol Translation
    let mut request = match into_core_chat_request(permissive_request) {
        Ok(r) => r,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, e).into_response();
        }
    };

    // Enforce ACL
    if let Some(user_models) = &auth.user_allowed_models {
        if !user_models.contains(&request.model) {
            return (
                StatusCode::FORBIDDEN,
                axum::Json(serde_json::json!({ "error": "Model not allowed by user policy" }))
            ).into_response();
        }
    }
    if let Some(key_models) = &auth.key_allowed_models {
        if !key_models.contains(&request.model) {
            return (
                StatusCode::FORBIDDEN,
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
    let target = match resolve_model_target(&runtime, &request.model, provider_hint.as_deref()).await {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                format!("Routing failed: {}", e),
            )
                .into_response();
        }
    };

    let service_id = match &target {
        ExecutionTarget::Pool { pool_id } => pool_id.clone(),
        _ => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Unsupported target type",
            )
                .into_response()
        }
    };

    // Stage 3: Execution via HostContext and dispatch_request
    // Note: provider_hint is intentionally NOT passed to dispatch_request here.
    // The hint (pararouter_provider_account_id) is only used at the routing stage
    // to select which provider pool to use (resolve_model_target). At the dispatch
    // stage, hint would be used to filter endpoints within the pool, but ParaRouter's
    // endpoint modeling does not include account_id in any hint-matchable field.
    let ctx = HostContext::from_parts(&runtime.engine, &*runtime);
    match dispatch_request(
        &ctx,
        HostDispatchTarget::Service(&service_id),
        HostProtocol::OpenAiChat,
        None,
        HostRequest::Chat(request),
    )
    .await
    {
        Ok(outcome) => match outcome {
            HostDispatchOutcome::Response(response) => into_axum_response(response),
            HostDispatchOutcome::PoolNotFound => (
                StatusCode::NOT_FOUND,
                "Pool mapping not found",
            )
                .into_response(),
            _ => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Unexpected dispatch outcome",
            )
                .into_response(),
        },
        Err(err) => error_response_for_host_error(&err),
    }
}

pub async fn embeddings(
    auth: AuthenticatedUser,
    State(runtime): State<Arc<ParaRouterRuntime>>,
    Json(permissive_request): Json<PermissiveEmbeddingsRequest>,
) -> Response {
    let provider_hint = permissive_request
        .pararouter_provider_account_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let mut request = match into_core_embeddings_request(permissive_request) {
        Ok(r) => r,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, e).into_response();
        }
    };

    // Enforce ACL
    if let Some(user_models) = &auth.user_allowed_models {
        if !user_models.contains(&request.model) {
            return (
                StatusCode::FORBIDDEN,
                axum::Json(serde_json::json!({ "error": "Model not allowed by user policy" }))
            ).into_response();
        }
    }
    if let Some(key_models) = &auth.key_allowed_models {
        if !key_models.contains(&request.model) {
            return (
                StatusCode::FORBIDDEN,
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

    let target = match resolve_model_target(&runtime, &request.model, provider_hint.as_deref()).await {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                format!("Routing failed: {}", e),
            )
                .into_response();
        }
    };

    let service_id = match &target {
        ExecutionTarget::Pool { pool_id } => pool_id.clone(),
        _ => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Unsupported target type",
            )
                .into_response()
        }
    };

    // Stage 3: Execution via HostContext and dispatch_request
    // Note: provider_hint is intentionally NOT passed to dispatch_request.
    // See chat_completions handler for detailed explanation.
    let ctx = HostContext::from_parts(&runtime.engine, &*runtime);
    match dispatch_request(
        &ctx,
        HostDispatchTarget::Service(&service_id),
        HostProtocol::OpenAiEmbeddings,
        None,
        HostRequest::Embeddings(request),
    )
    .await
    {
        Ok(outcome) => match outcome {
            HostDispatchOutcome::Response(response) => into_axum_response(response),
            HostDispatchOutcome::PoolNotFound => (
                StatusCode::NOT_FOUND,
                "Pool mapping not found",
            )
                .into_response(),
            _ => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Unexpected dispatch outcome",
            )
                .into_response(),
        },
        Err(err) => error_response_for_host_error(&err),
    }
}
