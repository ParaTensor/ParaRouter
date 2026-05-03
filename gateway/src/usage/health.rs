use sqlx::{Pool, Postgres};
use std::time::{SystemTime, UNIX_EPOCH};

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub async fn mark_provider_key_healthy(db: &Pool<Postgres>, provider_key_id: Option<&str>) {
    let Some(key_id) = provider_key_id.map(str::trim).filter(|id| !id.is_empty()) else {
        return;
    };

    let now = now_millis();
    let result = sqlx::query(
        r#"
        UPDATE provider_api_keys
        SET health_status = 'healthy',
            health_checked_at = $2,
            health_last_ok_at = $2,
            health_error = NULL,
            health_fail_count = 0
        WHERE id = $1
        "#,
    )
    .bind(key_id)
    .bind(now)
    .execute(db)
    .await;

    if let Err(error) = result {
        tracing::warn!(provider_key_id = %key_id, "Failed to auto-mark provider key healthy: {}", error);
    }
}

pub async fn mark_provider_key_unhealthy(
    db: &Pool<Postgres>,
    provider_key_id: Option<&str>,
    reason: &str,
) {
    let Some(key_id) = provider_key_id.map(str::trim).filter(|id| !id.is_empty()) else {
        return;
    };

    let now = now_millis();
    let error_message = reason.chars().take(500).collect::<String>();
    let result = sqlx::query(
        r#"
        UPDATE provider_api_keys
        SET health_status = 'unhealthy',
            health_checked_at = $2,
            health_error = $3,
            health_fail_count = COALESCE(health_fail_count, 0) + 1
        WHERE id = $1
        "#,
    )
    .bind(key_id)
    .bind(now)
    .bind(error_message)
    .execute(db)
    .await;

    if let Err(error) = result {
        tracing::warn!(provider_key_id = %key_id, "Failed to auto-mark provider key unhealthy: {}", error);
    }
}
