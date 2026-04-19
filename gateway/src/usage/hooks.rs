use futures_util::future::BoxFuture;
use sqlx::{Pool, Postgres};
use std::time::{SystemTime, UNIX_EPOCH};

use unigateway_sdk::core::hooks::{AttemptFinishedEvent, AttemptStartedEvent, GatewayHooks};
use unigateway_sdk::core::response::RequestReport;

pub struct ParaRouterHooks {
    pub db: Pool<Postgres>,
}

impl GatewayHooks for ParaRouterHooks {
    fn on_attempt_started(&self, _event: AttemptStartedEvent) -> BoxFuture<'static, ()> {
        // No-op for now
        Box::pin(async {})
    }

    fn on_attempt_finished(&self, _event: AttemptFinishedEvent) -> BoxFuture<'static, ()> {
        // No-op for now
        Box::pin(async {})
    }

    fn on_request_finished(&self, report: RequestReport) -> BoxFuture<'static, ()> {
        let db = self.db.clone();
        
        Box::pin(async move {
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64;
                
            let user_id = report.metadata.get("user_id").cloned().unwrap_or_default();
            let key_id = report.metadata.get("key_id").cloned().unwrap_or_default();
            let model = report.metadata.get("requested_model").cloned().unwrap_or_else(|| "unknown".to_string());
            
            let prompt_tokens = report.usage.as_ref().and_then(|u| u.input_tokens).unwrap_or(0) as i32;
            let completion_tokens = report.usage.as_ref().and_then(|u| u.output_tokens).unwrap_or(0) as i32;
            let tokens = report.usage.as_ref().and_then(|u| u.total_tokens).unwrap_or(0) as i32;
            let latency = report.latency_ms as i32;
            let status = 200; // unigateway_core RequestReport only emits for success paths right now, or errors surface differently
            
            let mut cost = "0.0".to_string();
            
            if !user_id.is_empty() {
                let cost_query = sqlx::query(
                    r#"
                    WITH billing AS (
                        SELECT 
                            COALESCE((global_pricing->>'prompt')::numeric, 0) as p_price,
                            COALESCE((global_pricing->>'completion')::numeric, 0) as c_price
                        FROM llm_models WHERE id = $1
                    )
                    UPDATE users
                    SET balance = balance - ((billing.p_price * $2 + billing.c_price * $3) / 1000000.0)
                    FROM billing
                    WHERE users.id = $4
                    RETURNING ((billing.p_price * $2 + billing.c_price * $3) / 1000000.0)::float8 as cost_deducted
                    "#,
                )
                .bind(&model)
                .bind(prompt_tokens)
                .bind(completion_tokens)
                .bind(&user_id)
                .fetch_optional(&db)
                .await;

                if let Ok(Some(row)) = cost_query {
                    use sqlx::Row;
                    let c: f64 = row.try_get("cost_deducted").unwrap_or(0.0);
                    cost = c.to_string();
                    
                    if !key_id.is_empty() {
                        let _ = sqlx::query(
                            "UPDATE user_api_keys SET usage = '$' || (COALESCE(NULLIF(REPLACE(usage, '$', ''), ''), '0')::numeric + $1::numeric)::text WHERE id = $2"
                        )
                        .bind(&cost)
                        .bind(&key_id)
                        .execute(&db)
                        .await;
                    }
                }
            }
            
            // Insert into activity table
            let result = sqlx::query(
                r#"
                INSERT INTO activity (timestamp, model, tokens, latency, status, user_id, cost)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                "#
            )
            .bind(timestamp)
            .bind(model)
            .bind(tokens)
            .bind(latency)
            .bind(status)
            .bind(user_id)
            .bind(cost)
            .execute(&db)
            .await;
            
            if let Err(e) = result {
                tracing::error!("Failed to persist request activity: {}", e);
            }
        })
    }
}
