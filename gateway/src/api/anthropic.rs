use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use axum::body::Body;
use uuid::Uuid;

use super::enforce_model_acl;
use unigateway_sdk::core::ExecutionTarget;
use unigateway_sdk::host::{
    dispatch_request, HostContext, HostDispatchOutcome, HostDispatchTarget, HostError,
    HostProtocol, HostRequest,
};
use unigateway_sdk::host::status::status_for_host_error;
use unigateway_sdk::protocol::{ProtocolHttpResponse, ProtocolResponseBody};

use crate::auth::keys::AuthenticatedUser;
use crate::routing::resolve::resolve_model_target;
use crate::runtime::ParaRouterRuntime;
use crate::translators::anthropic::{
    into_core_chat_request, PermissiveAnthropicRequest,
};
use crate::usage::health::mark_provider_key_unhealthy;
use crate::usage::stream::{observe_sse_body, StreamObservationLabels, StreamObservationSink};

/// Convert a ProtocolHttpResponse into an axum::Response.
fn into_axum_response(
    response: ProtocolHttpResponse,
    stream_observation: Option<(Arc<dyn StreamObservationSink>, StreamObservationLabels)>,
) -> Response {
    let (status, body) = response.into_parts();
    match body {
        ProtocolResponseBody::Json(value) => {
            (status, axum::Json(value)).into_response()
        }
        ProtocolResponseBody::ServerSentEvents(stream) => {
            let body = match stream_observation {
                Some((sink, labels)) => observe_sse_body(stream, sink, labels),
                None => Body::from_stream(stream),
            };

            Response::builder()
                .status(status)
                .header("content-type", "text/event-stream")
                .header("cache-control", "no-cache")
                .body(body)
                .unwrap_or_else(|e| {
                    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
                })
        }
    }
}

/// Convert HostError into an appropriate HTTP Response.
fn error_response_for_host_error(err: &HostError) -> Response {
    let status = status_for_host_error(err);
    let error_body = serde_json::json!({
        "error": {
            "message": err.to_string()
        }
    });
    (status, axum::Json(error_body)).into_response()
}

pub async fn messages(
    auth: AuthenticatedUser,
    State(runtime): State<Arc<ParaRouterRuntime>>,
    Json(permissive_request): Json<PermissiveAnthropicRequest>,
) -> Response {
    tracing::info!("Anthropic /v1/messages handler invoked for model: {}", permissive_request.model);
    tracing::debug!("Auth user: key_id={}, uid={}", auth.key_id, auth.uid);
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

    // Stage 2: Routing Lifecycle (find ExecutionTarget)
    let resolved = match resolve_model_target(&runtime, &request.model, provider_hint.as_deref()).await {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                format!("Routing failed: {}", e),
            )
                .into_response();
        }
    };

    if let Err(response) = enforce_model_acl(&auth, &request.model, Some(&resolved.global_model_id)) {
        return response;
    }

    // Annotate metadata securely from Auth layer
    let request_correlation_id = Uuid::new_v4().to_string();
    request.metadata.insert(
        "request_correlation_id".to_string(),
        request_correlation_id.clone(),
    );
    request.metadata.insert("user_id".to_string(), auth.uid.clone());
    request.metadata.insert("key_id".to_string(), auth.key_id.clone());
    request.metadata.insert("requested_model".to_string(), request.model.clone());
    request.metadata.insert("global_model_id".to_string(), resolved.global_model_id.clone());
    if let Some(budget_limit) = auth.budget_limit {
        request.metadata.insert("budget_limit".to_string(), budget_limit.to_string());
    }

    let service_id = match &resolved.target {
        ExecutionTarget::Pool { pool_id } => pool_id.clone(),
        _ => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Unsupported target type",
            )
                .into_response()
        }
    };

    request.metadata.insert(
        "resolved_provider_account_id".to_string(),
        service_id.clone(),
    );
    request.metadata.insert("global_model_id".to_string(), resolved.global_model_id.clone());
    if let Some(endpoint_hint) = &resolved.endpoint_hint {
        request.metadata.insert(
            "resolved_provider_key_id".to_string(),
            endpoint_hint.clone(),
        );
    }
    let stream_labels = StreamObservationLabels::new(
        "anthropic.messages",
        request.model.clone(),
        Some(request_correlation_id),
        Some(service_id.clone()),
        resolved.endpoint_hint.clone(),
    );

    // Stage 3: Execution via HostContext and dispatch_request
    let ctx = HostContext::from_parts(&runtime.engine, &*runtime);
    match dispatch_request(
        &ctx,
        HostDispatchTarget::Service(&service_id),
        HostProtocol::AnthropicMessages,
        resolved.endpoint_hint.as_deref(),
        HostRequest::Chat(request),
    )
    .await
    {
        Ok(outcome) => match outcome {
            HostDispatchOutcome::Response(response) => into_axum_response(
                response,
                Some((runtime.stream_observation_sink.clone(), stream_labels)),
            ),
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
        Err(err) => {
            mark_provider_key_unhealthy(&runtime.db, resolved.endpoint_hint.as_deref(), &err.to_string()).await;
            error_response_for_host_error(&err)
        }
    }
}
