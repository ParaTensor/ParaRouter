use anyhow::Result;
use sqlx::{Pool, Postgres};

use unigateway_core::{
    ProviderPool, UniGatewayEngine,
};
use unigateway_runtime::host::{
    ResolvedProvider, RuntimeConfig, RuntimeConfigHost, RuntimeEngineHost, RuntimeFuture,
    RuntimePoolHost, RuntimeRoutingHost,
};

pub struct OpenHubRuntime {
    pub db: Pool<Postgres>,
    pub engine: UniGatewayEngine,
    pub openai_base_url: String,
    pub openai_api_key: String,
    pub openai_model: String,
    pub anthropic_base_url: String,
    pub anthropic_api_key: String,
    pub anthropic_model: String,
}

impl RuntimeConfigHost for OpenHubRuntime {
    fn runtime_config(&self) -> RuntimeConfig<'_> {
        RuntimeConfig {
            openai_base_url: &self.openai_base_url,
            openai_api_key: &self.openai_api_key,
            openai_model: &self.openai_model,
            anthropic_base_url: &self.anthropic_base_url,
            anthropic_api_key: &self.anthropic_api_key,
            anthropic_model: &self.anthropic_model,
        }
    }
}

impl RuntimeEngineHost for OpenHubRuntime {
    fn core_engine(&self) -> &UniGatewayEngine {
        &self.engine
    }
}

impl RuntimePoolHost for OpenHubRuntime {
    fn pool_for_service<'a>(
        &'a self,
        service_id: &'a str,
    ) -> RuntimeFuture<'a, Result<Option<ProviderPool>>> {
        Box::pin(async move {
            Ok(self.engine.get_pool(service_id).await)
        })
    }
}

impl RuntimeRoutingHost for OpenHubRuntime {
    fn resolve_providers<'a>(
        &'a self,
        _service_id: &'a str,
        _protocol: &'a str,
        _hint: Option<&'a str>,
    ) -> RuntimeFuture<'a, Result<Vec<ResolvedProvider>>> {
        Box::pin(async move {
            // For now, OpenHub routing directly targets the pool.
            // When building model_pricings mapped proxying later, this is where we return the mapped upstream models.
            Ok(vec![])
        })
    }
}
