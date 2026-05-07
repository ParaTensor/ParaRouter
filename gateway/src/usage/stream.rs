use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::time::{SystemTime, UNIX_EPOCH};

use async_stream::stream;
use axum::body::{Body, Bytes};
use axum::BoxError;
use futures_util::{pin_mut, Stream, StreamExt};
use sqlx::{Pool, Postgres};

#[derive(Debug, Clone)]
pub struct StreamObservationLabels {
    pub route: &'static str,
    pub requested_model: String,
    pub request_correlation_id: Option<String>,
    pub provider_account_id: Option<String>,
    pub provider_key_id: Option<String>,
}

impl StreamObservationLabels {
    pub fn new(
        route: &'static str,
        requested_model: String,
        request_correlation_id: Option<String>,
        provider_account_id: Option<String>,
        provider_key_id: Option<String>,
    ) -> Self {
        Self {
            route,
            requested_model,
            request_correlation_id,
            provider_account_id,
            provider_key_id,
        }
    }
}

#[derive(Debug, Clone)]
pub struct StreamObservation {
    pub ttft_ms: Option<u64>,
    pub max_inter_chunk_ms: Option<u64>,
    pub chunk_count: u64,
    pub stream_duration_ms: u64,
    pub completed_normally: bool,
}

pub trait StreamObservationSink: Send + Sync {
    fn record(&self, labels: StreamObservationLabels, observation: StreamObservation);
}

#[derive(Debug, Default)]
pub struct LoggingStreamObservationSink;

impl StreamObservationSink for LoggingStreamObservationSink {
    fn record(&self, labels: StreamObservationLabels, observation: StreamObservation) {
        tracing::debug!(
            route = labels.route,
            model = %labels.requested_model,
            request_correlation_id = ?labels.request_correlation_id,
            provider_account_id = ?labels.provider_account_id,
            provider_key_id = ?labels.provider_key_id,
            ttft_ms = ?observation.ttft_ms,
            max_inter_chunk_ms = ?observation.max_inter_chunk_ms,
            chunk_count = observation.chunk_count,
            stream_duration_ms = observation.stream_duration_ms,
            completed_normally = observation.completed_normally,
            "Captured SSE stream observation"
        );
    }
}

#[derive(Debug, Clone)]
pub struct DatabaseStreamObservationSink {
    db: Pool<Postgres>,
}

impl DatabaseStreamObservationSink {
    pub fn new(db: Pool<Postgres>) -> Self {
        Self { db }
    }
}

impl StreamObservationSink for DatabaseStreamObservationSink {
    fn record(&self, labels: StreamObservationLabels, observation: StreamObservation) {
        let db = self.db.clone();

        tokio::spawn(async move {
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64;

            let result = sqlx::query(
                r#"
                INSERT INTO stream_observations (
                    timestamp,
                    route,
                    requested_model,
                    request_correlation_id,
                    provider_account_id,
                    provider_key_id,
                    ttft_ms,
                    max_inter_chunk_ms,
                    chunk_count,
                    stream_duration_ms,
                    completed_normally
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                "#,
            )
            .bind(timestamp)
            .bind(labels.route)
            .bind(labels.requested_model)
            .bind(labels.request_correlation_id)
            .bind(labels.provider_account_id)
            .bind(labels.provider_key_id)
            .bind(observation.ttft_ms.map(to_i32_saturated))
            .bind(observation.max_inter_chunk_ms.map(to_i32_saturated))
            .bind(to_i64_saturated(observation.chunk_count))
            .bind(to_i32_saturated(observation.stream_duration_ms))
            .bind(observation.completed_normally)
            .execute(&db)
            .await;

            if let Err(error) = result {
                tracing::error!("Failed to persist stream observation: {}", error);
            }
        });
    }
}

fn to_i32_saturated(value: u64) -> i32 {
    value.min(i32::MAX as u64) as i32
}

fn to_i64_saturated(value: u64) -> i64 {
    value.min(i64::MAX as u64) as i64
}

#[derive(Debug)]
struct StreamObservationState {
    started_at: Instant,
    first_chunk_at: Option<Instant>,
    last_chunk_at: Option<Instant>,
    max_inter_chunk: Option<Duration>,
    chunk_count: u64,
    emitted: bool,
}

impl StreamObservationState {
    fn new() -> Self {
        Self {
            started_at: Instant::now(),
            first_chunk_at: None,
            last_chunk_at: None,
            max_inter_chunk: None,
            chunk_count: 0,
            emitted: false,
        }
    }

    fn observe_chunk(&mut self, now: Instant) {
        if let Some(last_chunk_at) = self.last_chunk_at {
            let interval = now.saturating_duration_since(last_chunk_at);
            self.max_inter_chunk = Some(match self.max_inter_chunk {
                Some(current_max) => current_max.max(interval),
                None => interval,
            });
        } else {
            self.first_chunk_at = Some(now);
        }

        self.last_chunk_at = Some(now);
        self.chunk_count += 1;
    }

    fn finish(&mut self, completed_normally: bool) -> Option<StreamObservation> {
        if self.emitted {
            return None;
        }

        self.emitted = true;

        Some(StreamObservation {
            ttft_ms: self.first_chunk_at.map(|first_chunk_at| {
                first_chunk_at.duration_since(self.started_at).as_millis() as u64
            }),
            max_inter_chunk_ms: self
                .max_inter_chunk
                .map(|interval| interval.as_millis() as u64),
            chunk_count: self.chunk_count,
            stream_duration_ms: Instant::now().duration_since(self.started_at).as_millis() as u64,
            completed_normally,
        })
    }
}

struct StreamObservationGuard {
    labels: StreamObservationLabels,
    sink: Arc<dyn StreamObservationSink>,
    state: Arc<Mutex<StreamObservationState>>,
}

impl StreamObservationGuard {
    fn new(
        labels: StreamObservationLabels,
        sink: Arc<dyn StreamObservationSink>,
        state: Arc<Mutex<StreamObservationState>>,
    ) -> Self {
        Self {
            labels,
            sink,
            state,
        }
    }
}

impl Drop for StreamObservationGuard {
    fn drop(&mut self) {
        let Ok(mut state) = self.state.lock() else {
            return;
        };

        let Some(observation) = state.finish(false) else {
            return;
        };

        drop(state);
        self.sink.record(self.labels.clone(), observation);
    }
}

pub fn observe_sse_body<S, O, E>(
    stream: S,
    sink: Arc<dyn StreamObservationSink>,
    labels: StreamObservationLabels,
) -> Body
where
    S: Stream<Item = Result<O, E>> + Send + 'static,
    O: Into<Bytes> + Send + 'static,
    E: Into<BoxError> + Send + 'static,
{
    let state = Arc::new(Mutex::new(StreamObservationState::new()));
    let observed_stream = stream! {
        let _guard = StreamObservationGuard::new(labels.clone(), sink.clone(), state.clone());
        pin_mut!(stream);

        while let Some(item) = stream.next().await {
            if let Ok(mut locked) = state.lock() {
                locked.observe_chunk(Instant::now());
            }

            yield item;
        }

        if let Ok(mut locked) = state.lock() {
            if let Some(observation) = locked.finish(true) {
                drop(locked);
                sink.record(labels.clone(), observation);
            }
        }
    };

    Body::from_stream(observed_stream)
}
