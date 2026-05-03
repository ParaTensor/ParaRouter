use sqlx::{Pool, Postgres};
use unigateway_sdk::core::UniGatewayEngine;
use unigateway_sdk::host::{
    EnvPoolHost, HostFuture, PoolHost, PoolLookupOutcome, PoolLookupResult,
};

use crate::usage::stream::StreamObservationSink;

/// ParaRouter runtime state combining database connection and UniGateway engine.
pub struct ParaRouterRuntime {
    pub db: Pool<Postgres>,
    pub engine: UniGatewayEngine,
    pub stream_observation_sink: std::sync::Arc<dyn StreamObservationSink>,
}

impl ParaRouterRuntime {
    /// Create a new runtime with the given database pool and engine.
    pub fn new(
        db: Pool<Postgres>,
        engine: UniGatewayEngine,
        stream_observation_sink: std::sync::Arc<dyn StreamObservationSink>,
    ) -> Self {
        Self {
            db,
            engine,
            stream_observation_sink,
        }
    }
}

impl PoolHost for ParaRouterRuntime {
    fn pool_for_service<'a>(
        &'a self,
        service_id: &'a str,
    ) -> HostFuture<'a, PoolLookupResult<PoolLookupOutcome>> {
        Box::pin(async move {
            match self.engine.get_pool(service_id).await {
                Some(pool) => Ok(PoolLookupOutcome::found(pool)),
                None => Ok(PoolLookupOutcome::not_found()),
            }
        })
    }
}

impl EnvPoolHost for ParaRouterRuntime {
    fn env_pool<'a>(
        &'a self,
        _provider: unigateway_sdk::host::EnvProvider,
        _api_key_override: Option<&'a str>,
    ) -> HostFuture<'a, PoolLookupResult<PoolLookupOutcome>> {
        Box::pin(async move { Ok(PoolLookupOutcome::not_found()) })
    }
}
