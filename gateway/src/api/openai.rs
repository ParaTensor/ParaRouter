use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use axum::body::Body;
use serde_json::Value;
use url::Url;
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
use crate::translators::openai::{
    into_core_chat_request, into_core_embeddings_request, PermissiveChatRequest,
    PermissiveEmbeddingsRequest,
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
/// Uses UniGateway SDK's official status mapping to ensure semantic alignment.
fn error_response_for_host_error(err: &HostError) -> Response {
    let status = status_for_host_error(err);
    let error_body = serde_json::json!({
        "error": {
            "message": err.to_string()
        }
    });
    (status, axum::Json(error_body)).into_response()
}

fn base_url_requires_forced_tool_choice_downgrade(base_url: &str) -> bool {
    let Ok(parsed) = Url::parse(base_url) else {
        return false;
    };

    let Some(host) = parsed.host_str().map(|host| host.trim().to_ascii_lowercase()) else {
        return false;
    };

    host == "memtensor.cn" || host.ends_with(".memtensor.cn")
}

fn endpoint_urls_require_forced_tool_choice_downgrade(endpoint_urls: &[String]) -> bool {
    endpoint_urls
        .iter()
        .any(|base_url| base_url_requires_forced_tool_choice_downgrade(base_url))
}

fn extract_forced_tool_name(tool_choice: &Value) -> Option<&str> {
    let tool_type = tool_choice.get("type")?.as_str()?.trim();
    if !tool_type.eq_ignore_ascii_case("function") {
        return None;
    }

    tool_choice
        .get("function")?
        .get("name")?
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
}

fn has_single_matching_tool(tools: Option<&Value>, forced_tool_name: &str) -> bool {
    let Some(tool_array) = tools.and_then(Value::as_array) else {
        return false;
    };

    if tool_array.len() != 1 {
        return false;
    }

    let Some(tool_type) = tool_array[0].get("type").and_then(Value::as_str) else {
        return false;
    };
    if !tool_type.eq_ignore_ascii_case("function") {
        return false;
    }

    tool_array[0]
        .get("function")
        .and_then(|function| function.get("name"))
        .and_then(Value::as_str)
        .map(str::trim)
        .is_some_and(|tool_name| tool_name == forced_tool_name)
}

fn downgrade_incompatible_tool_choice(
    endpoint_urls: &[String],
    tools: Option<&Value>,
    tool_choice: &mut Option<Value>,
) -> bool {
    if !endpoint_urls_require_forced_tool_choice_downgrade(endpoint_urls) {
        return false;
    }

    let Some(forced_tool_name) = tool_choice.as_ref().and_then(extract_forced_tool_name) else {
        return false;
    };

    if !has_single_matching_tool(tools, forced_tool_name) {
        return false;
    }

    *tool_choice = Some(Value::String("required".to_string()));
    true
}

fn model_requires_completion_cap_guard(model: &str) -> bool {
    model.trim().to_ascii_lowercase().starts_with("gpt-5")
}

fn request_has_explicit_completion_cap(request: &PermissiveChatRequest) -> bool {
    request.max_tokens.is_some()
        || request
            .extra
            .get("max_completion_tokens")
            .is_some_and(|value| !value.is_null())
}

fn completion_cap_guard_error(request: &PermissiveChatRequest) -> Option<String> {
    let model = request.model.as_deref()?.trim();
    if model.is_empty() || !model_requires_completion_cap_guard(model) {
        return None;
    }

    if !request_has_explicit_completion_cap(request) {
        return None;
    }

    Some(format!(
        "Explicit max_tokens/max_completion_tokens is disabled for {model} on ParaRouter because GPT-5-family models can spend the full completion budget on reasoning and return no visible output. Omit the cap, or lower reasoning_effort if you need faster responses."
    ))
}

pub async fn chat_completions(
    auth: AuthenticatedUser,
    State(runtime): State<Arc<ParaRouterRuntime>>,
    Json(permissive_request): Json<PermissiveChatRequest>,
) -> Response {
    if let Some(message) = completion_cap_guard_error(&permissive_request) {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({
                "error": {
                    "message": message
                }
            })),
        )
            .into_response();
    }

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
        "openai.chat.completions",
        request.model.clone(),
        Some(request_correlation_id),
        Some(service_id.clone()),
        resolved.endpoint_hint.clone(),
    );

    let pool_endpoint_urls = runtime
        .engine
        .get_pool(&service_id)
        .await
        .map(|pool| {
            pool.endpoints
                .iter()
                .map(|endpoint| endpoint.base_url.clone())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let request_tools = request.tools.clone();
    if downgrade_incompatible_tool_choice(
        &pool_endpoint_urls,
        request_tools.as_ref(),
        &mut request.tool_choice,
    ) {
        request.metadata.insert(
            "compat_tool_choice_downgraded".to_string(),
            "forced_function_to_required".to_string(),
        );
    }

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

#[cfg(test)]
mod tests {
    use super::{
        base_url_requires_forced_tool_choice_downgrade, completion_cap_guard_error,
        downgrade_incompatible_tool_choice, endpoint_urls_require_forced_tool_choice_downgrade,
    };
    use crate::translators::openai::PermissiveChatRequest;
    use serde_json::{json, Value};
    use std::collections::HashMap;

    #[test]
    fn memtensor_forced_function_downgrades_to_required_for_single_matching_tool() {
        let endpoint_urls = vec!["https://api.memtensor.cn/v1".to_string()];
        let tools = json!([
            {
                "type": "function",
                "function": {
                    "name": "add_numbers"
                }
            }
        ]);
        let mut tool_choice = Some(json!({
            "type": "function",
            "function": {
                "name": "add_numbers"
            }
        }));

        let rewritten = downgrade_incompatible_tool_choice(
            &endpoint_urls,
            Some(&tools),
            &mut tool_choice,
        );

        assert!(rewritten);
        assert_eq!(tool_choice, Some(Value::String("required".to_string())));
    }

    #[test]
    fn other_openai_compatible_providers_are_left_unchanged() {
        let endpoint_urls = vec!["https://www.kaopuapi.com/v1".to_string()];
        let tools = json!([
            {
                "type": "function",
                "function": {
                    "name": "add_numbers"
                }
            }
        ]);
        let original = json!({
            "type": "function",
            "function": {
                "name": "add_numbers"
            }
        });
        let mut tool_choice = Some(original.clone());

        let rewritten = downgrade_incompatible_tool_choice(
            &endpoint_urls,
            Some(&tools),
            &mut tool_choice,
        );

        assert!(!rewritten);
        assert_eq!(tool_choice, Some(original));
    }

    #[test]
    fn downgrade_requires_a_single_matching_tool() {
        let endpoint_urls = vec!["https://api.memtensor.cn/v1".to_string()];
        let tools = json!([
            {
                "type": "function",
                "function": {
                    "name": "lookup_weather"
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "add_numbers"
                }
            }
        ]);
        let original = json!({
            "type": "function",
            "function": {
                "name": "add_numbers"
            }
        });
        let mut tool_choice = Some(original.clone());

        let rewritten = downgrade_incompatible_tool_choice(
            &endpoint_urls,
            Some(&tools),
            &mut tool_choice,
        );

        assert!(!rewritten);
        assert_eq!(tool_choice, Some(original));
    }

    #[test]
    fn compatibility_gate_tracks_upstream_host_not_provider_name() {
        assert!(base_url_requires_forced_tool_choice_downgrade(
            "https://api.memtensor.cn/v1"
        ));
        assert!(base_url_requires_forced_tool_choice_downgrade(
            "https://gateway.memtensor.cn/custom/v1"
        ));
        assert!(!base_url_requires_forced_tool_choice_downgrade(
            "https://www.kaopuapi.com/v1"
        ));
        assert!(endpoint_urls_require_forced_tool_choice_downgrade(&[
            "https://www.kaopuapi.com/v1".to_string(),
            "https://api.memtensor.cn/v1".to_string()
        ]));
    }

    #[test]
    fn gpt5_requests_reject_explicit_max_tokens() {
        let request = PermissiveChatRequest {
            model: Some("gpt-5.5".to_string()),
            messages: None,
            temperature: None,
            top_p: None,
            top_k: None,
            max_tokens: Some(512),
            stop: None,
            stream: None,
            tools: None,
            tool_choice: None,
            pararouter_provider_account_id: None,
            extra: HashMap::new(),
        };

        let error = completion_cap_guard_error(&request).expect("guard should reject cap");
        assert!(error.contains("gpt-5.5"));
        assert!(error.contains("max_tokens/max_completion_tokens"));
    }

    #[test]
    fn gpt5_requests_reject_explicit_max_completion_tokens() {
        let request = PermissiveChatRequest {
            model: Some("gpt-5.5".to_string()),
            messages: None,
            temperature: None,
            top_p: None,
            top_k: None,
            max_tokens: None,
            stop: None,
            stream: None,
            tools: None,
            tool_choice: None,
            pararouter_provider_account_id: None,
            extra: HashMap::from([("max_completion_tokens".to_string(), json!(1024))]),
        };

        assert!(completion_cap_guard_error(&request).is_some());
    }

    #[test]
    fn non_gpt5_requests_keep_explicit_completion_caps() {
        let request = PermissiveChatRequest {
            model: Some("gpt-4o-mini".to_string()),
            messages: None,
            temperature: None,
            top_p: None,
            top_k: None,
            max_tokens: Some(512),
            stop: None,
            stream: None,
            tools: None,
            tool_choice: None,
            pararouter_provider_account_id: None,
            extra: HashMap::new(),
        };

        assert!(completion_cap_guard_error(&request).is_none());
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
        "openai.embeddings",
        request.model.clone(),
        Some(request_correlation_id),
        Some(service_id.clone()),
        resolved.endpoint_hint.clone(),
    );

    // Stage 3: Execution via HostContext and dispatch_request
    // Note: provider_hint is intentionally NOT passed to dispatch_request.
    // See chat_completions handler for detailed explanation.
    let ctx = HostContext::from_parts(&runtime.engine, &*runtime);
    match dispatch_request(
        &ctx,
        HostDispatchTarget::Service(&service_id),
        HostProtocol::OpenAiEmbeddings,
        resolved.endpoint_hint.as_deref(),
        HostRequest::Embeddings(request),
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
