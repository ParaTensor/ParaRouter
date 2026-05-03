use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::Result;
use latch_core::score::{
    LatencyBreakdown, ObservationError, RequestObservation, ScoreBreakdown, ScoreConfig,
    ScoreTier, StreamMetrics, TokenStats,
};
use latch_score::{PoolFeedback, ScoringEngine};
use serde::Serialize;
use sqlx::{FromRow, Pool, Postgres};

#[derive(Debug, Clone, Copy)]
pub struct ProviderAnalysisQuery {
    pub lookback_window: Duration,
    pub max_rows: i64,
}

impl Default for ProviderAnalysisQuery {
    fn default() -> Self {
        Self {
            lookback_window: Duration::from_secs(24 * 60 * 60),
            max_rows: 5_000,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderEndpointAnalysis {
    pub provider_account_id: String,
    pub provider_key_id: String,
    pub score: f64,
    pub tier: ScoreTier,
    pub observation_count: usize,
    pub breakdown: ScoreBreakdown,
    pub excluded: bool,
    pub exclusion_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderPoolAnalysis {
    pub provider_account_id: String,
    pub recommended_provider_key_id: Option<String>,
    pub fallback_provider_key_id: Option<String>,
    pub ranked_endpoints: Vec<ProviderEndpointAnalysis>,
    pub excluded_endpoints: Vec<ProviderEndpointAnalysis>,
    pub feedback: PoolFeedback,
}

#[derive(Debug, Clone, FromRow)]
struct ProviderObservationRow {
    timestamp: i64,
    status: i32,
    tokens: i32,
    latency: i32,
    provider_account_id: String,
    provider_key_id: String,
    ttft_ms: Option<i32>,
    max_inter_chunk_ms: Option<i32>,
    chunk_count: Option<i64>,
    completed_normally: Option<bool>,
}

pub async fn analyze_provider_pools(
    db: &Pool<Postgres>,
    query: ProviderAnalysisQuery,
) -> Result<Vec<ProviderPoolAnalysis>> {
    let rows = load_provider_observations(db, query).await?;
    let mut engine = ScoringEngine::new(provider_score_config());

    for row in rows {
        engine.observe(row_to_observation(&row));
    }

    let mut pools = engine
        .rank_all()
        .into_iter()
        .map(|ranking| ProviderPoolAnalysis {
            provider_account_id: ranking.pool_id.clone(),
            recommended_provider_key_id: ranking
                .recommended
                .as_ref()
                .map(|endpoint| endpoint.endpoint_id.clone()),
            fallback_provider_key_id: ranking
                .recommended_fallback
                .as_ref()
                .map(|endpoint| endpoint.endpoint_id.clone()),
            ranked_endpoints: endpoint_analyses(&ranking.pool_id, ranking.ranked_endpoints),
            excluded_endpoints: endpoint_analyses(&ranking.pool_id, ranking.excluded_endpoints),
            feedback: engine.get_pool_feedback(&ranking.pool_id),
        })
        .collect::<Vec<_>>();

    pools.sort_by(|left, right| left.provider_account_id.cmp(&right.provider_account_id));
    Ok(pools)
}

async fn load_provider_observations(
    db: &Pool<Postgres>,
    query: ProviderAnalysisQuery,
) -> Result<Vec<ProviderObservationRow>> {
    let cutoff_ms = SystemTime::now()
        .checked_sub(query.lookback_window)
        .unwrap_or(UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let rows = sqlx::query_as::<_, ProviderObservationRow>(
        r#"
        SELECT
            a.timestamp,
            a.status,
            a.tokens,
            a.latency,
            a.provider_account_id,
            a.provider_key_id,
            s.ttft_ms,
            s.max_inter_chunk_ms,
            s.chunk_count,
            s.completed_normally
        FROM activity a
        LEFT JOIN LATERAL (
            SELECT
                so.ttft_ms,
                so.max_inter_chunk_ms,
                so.chunk_count,
                so.completed_normally
            FROM stream_observations so
            WHERE a.request_correlation_id IS NOT NULL
              AND so.request_correlation_id = a.request_correlation_id
            ORDER BY so.timestamp DESC
            LIMIT 1
        ) s ON TRUE
        WHERE a.timestamp >= $1
          AND a.provider_account_id IS NOT NULL
          AND a.provider_account_id <> ''
          AND a.provider_key_id IS NOT NULL
          AND a.provider_key_id <> ''
        ORDER BY a.timestamp DESC
        LIMIT $2
        "#,
    )
    .bind(cutoff_ms)
    .bind(query.max_rows)
    .fetch_all(db)
    .await?;

    Ok(rows)
}

fn endpoint_analyses(
    provider_account_id: &str,
    endpoints: Vec<latch_core::score::EndpointScore>,
) -> Vec<ProviderEndpointAnalysis> {
    endpoints
        .into_iter()
        .map(|endpoint| ProviderEndpointAnalysis {
            provider_account_id: provider_account_id.to_string(),
            provider_key_id: endpoint.endpoint_id,
            score: endpoint.score,
            tier: endpoint.tier,
            observation_count: endpoint.observation_count,
            breakdown: endpoint.breakdown,
            excluded: endpoint.excluded,
            exclusion_reason: endpoint.exclusion_reason,
        })
        .collect()
}

fn provider_score_config() -> ScoreConfig {
    ScoreConfig {
        baseline_score: 60.0,
        availability_weight: 0.45,
        latency_weight: 0.30,
        quality_weight: 0.25,
        cost_weight: 0.0,
        ..ScoreConfig::default()
    }
}

fn row_to_observation(row: &ProviderObservationRow) -> RequestObservation {
    let (success, error) = classify_status(row.status);

    RequestObservation {
        endpoint_id: row.provider_key_id.clone(),
        pool_id: row.provider_account_id.clone(),
        started_at: timestamp_millis_to_system_time(row.timestamp),
        success,
        error,
        was_retry: false,
        latency: LatencyBreakdown {
            total_ms: row.latency.max(0) as u64,
            ttft_ms: row.ttft_ms.map(|value| value.max(0) as u64),
        },
        tokens: TokenStats {
            input: 0,
            output: row.tokens.max(0) as u64,
        },
        stream: build_stream_metrics(row),
    }
}

fn build_stream_metrics(row: &ProviderObservationRow) -> Option<StreamMetrics> {
    let ttft_ms = row.ttft_ms?;

    Some(StreamMetrics {
        ttft_ms: ttft_ms.max(0) as u64,
        tokens_per_second: None,
        max_inter_chunk_ms: row.max_inter_chunk_ms.map(|value| value.max(0) as u64),
        chunk_count: row.chunk_count.unwrap_or_default().max(0) as u64,
        completed_normally: row.completed_normally.unwrap_or(false),
        stream_broken: !row.completed_normally.unwrap_or(false),
    })
}

fn classify_status(status: i32) -> (bool, Option<ObservationError>) {
    if (200..400).contains(&status) {
        return (true, None);
    }

    let error = match status {
        429 => ObservationError::RateLimited,
        500..=599 => ObservationError::Upstream5xx,
        400..=499 => ObservationError::Upstream4xx,
        _ => ObservationError::Other {
            code: status.clamp(0, u16::MAX as i32) as u16,
            message: format!("unexpected status {status}"),
        },
    };

    (false, Some(error))
}

fn timestamp_millis_to_system_time(timestamp_ms: i64) -> SystemTime {
    if timestamp_ms <= 0 {
        return UNIX_EPOCH;
    }

    UNIX_EPOCH + Duration::from_millis(timestamp_ms as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_row(status: i32) -> ProviderObservationRow {
        ProviderObservationRow {
            timestamp: 1_715_000_000_000,
            status,
            tokens: 123,
            latency: 450,
            provider_account_id: "acct-1".to_string(),
            provider_key_id: "key-1".to_string(),
            ttft_ms: Some(120),
            max_inter_chunk_ms: Some(80),
            chunk_count: Some(6),
            completed_normally: Some(true),
        }
    }

    #[test]
    fn successful_row_maps_to_successful_observation() {
        let obs = row_to_observation(&sample_row(200));
        assert!(obs.success);
        assert!(obs.error.is_none());
        assert_eq!(obs.endpoint_id, "key-1");
        assert_eq!(obs.pool_id, "acct-1");
        assert_eq!(obs.tokens.output, 123);
        assert_eq!(obs.stream.as_ref().map(|stream| stream.ttft_ms), Some(120));
    }

    #[test]
    fn upstream_failure_status_is_classified() {
        let obs = row_to_observation(&sample_row(503));
        assert!(!obs.success);
        match obs.error {
            Some(ObservationError::Upstream5xx) => {}
            other => panic!("unexpected error classification: {:?}", other),
        }
    }

    #[test]
    fn broken_stream_maps_quality_signal() {
        let mut row = sample_row(200);
        row.completed_normally = Some(false);
        let stream = row_to_observation(&row).stream.expect("stream metrics");
        assert!(stream.stream_broken);
        assert!(!stream.completed_normally);
    }

    #[test]
    fn provider_score_config_disables_cost_weight() {
        let config = provider_score_config();
        assert_eq!(config.cost_weight, 0.0);
        assert!((config.availability_weight + config.latency_weight + config.quality_weight - 1.0).abs() < 1e-6);
    }
}