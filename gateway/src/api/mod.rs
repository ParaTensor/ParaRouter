use axum::{routing::post, Router};
use std::sync::Arc;

use crate::runtime::ParaRouterRuntime;

pub mod openai;
pub mod models;

pub fn api_router() -> Router<Arc<ParaRouterRuntime>> {
    Router::new()
        // OpenAI compatibility layer
        .route("/v1/models", axum::routing::get(models::list_models))
        .route("/v1/chat/completions", post(openai::chat_completions))
        .route("/v1/embeddings", post(openai::embeddings))
}
