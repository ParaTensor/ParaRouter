use axum::{
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use std::sync::Arc;

use crate::auth::keys::AuthenticatedUser;
use crate::runtime::ParaRouterRuntime;

pub mod anthropic;
pub mod models;
pub mod openai;

fn model_allowed_by_entries(
    allowed_models: &[String],
    requested_model: &str,
    global_model_id: Option<&str>,
) -> bool {
    let requested_model = requested_model.trim();
    let global_model_id = global_model_id
        .map(str::trim)
        .filter(|value| !value.is_empty());

    allowed_models.iter().any(|allowed_model| {
        let allowed_model = allowed_model.trim();
        !allowed_model.is_empty()
            && (allowed_model == requested_model || global_model_id == Some(allowed_model))
    })
}

fn forbidden_model_response(message: &str) -> Response {
    (
        axum::http::StatusCode::FORBIDDEN,
        Json(serde_json::json!({ "error": message })),
    )
        .into_response()
}

pub(crate) fn enforce_model_acl(
    auth: &AuthenticatedUser,
    requested_model: &str,
    global_model_id: Option<&str>,
) -> Result<(), Response> {
    if let Some(user_models) = &auth.user_allowed_models {
        if !model_allowed_by_entries(user_models, requested_model, global_model_id) {
            return Err(forbidden_model_response("Model not allowed by user policy"));
        }
    }
    if let Some(key_models) = &auth.key_allowed_models {
        if !model_allowed_by_entries(key_models, requested_model, global_model_id) {
            return Err(forbidden_model_response(
                "Model not allowed by API key policy",
            ));
        }
    }

    Ok(())
}

pub(crate) fn auth_can_access_model_listing(
    auth: &AuthenticatedUser,
    public_model_id: &str,
    global_model_id: Option<&str>,
) -> bool {
    enforce_model_acl(auth, public_model_id, global_model_id).is_ok()
}

pub fn api_router() -> Router<Arc<ParaRouterRuntime>> {
    Router::new()
        // OpenAI compatibility layer
        .route("/v1/models", axum::routing::get(models::list_models))
        .route("/v1/chat/completions", post(openai::chat_completions))
        .route("/v1/embeddings", post(openai::embeddings))
        // Anthropic compatibility layer
        .route("/v1/messages", post(anthropic::messages))
}

#[cfg(test)]
mod tests {
    use super::model_allowed_by_entries;

    #[test]
    fn acl_matches_requested_model_directly() {
        assert!(model_allowed_by_entries(
            &["bai/gpt-5.5".to_string()],
            "bai/gpt-5.5",
            Some("gpt-5.5"),
        ));
    }

    #[test]
    fn acl_matches_resolved_global_model_for_alias() {
        assert!(model_allowed_by_entries(
            &["gpt-5.5".to_string()],
            "bai/gpt-5.5",
            Some("gpt-5.5"),
        ));
    }

    #[test]
    fn acl_rejects_unrelated_models() {
        assert!(!model_allowed_by_entries(
            &["gpt-4o-mini".to_string()],
            "bai/gpt-5.5",
            Some("gpt-5.5"),
        ));
    }
}
