use axum::{
    extract::State,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::auth::keys::AuthenticatedUser;
use crate::runtime::ParaRouterRuntime;

pub async fn list_models(
    _auth: AuthenticatedUser,
    State(runtime): State<Arc<ParaRouterRuntime>>,
) -> Response {
    let pool = &runtime.db;

    #[derive(sqlx::FromRow)]
    struct ModelRow {
        model_id: String,
    }

    // We only list models that have an active pricing configuration
    let result = sqlx::query_as::<_, ModelRow>(
        r#"
        SELECT DISTINCT model_id 
        FROM model_provider_pricings 
        WHERE status = 'online'
        "#,
    )
    .fetch_all(pool)
    .await;

    let rows = match result {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("Failed to fetch models: {}", e);
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Internal Server Error",
            )
                .into_response();
        }
    };

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let data: Vec<_> = rows
        .into_iter()
        .map(|row| {
            json!({
                "id": row.model_id,
                "object": "model",
                "created": now,
                "owned_by": "pararouter"
            })
        })
        .collect();

    (
        axum::http::StatusCode::OK,
        Json(json!({
            "object": "list",
            "data": data
        })),
    )
        .into_response()
}
