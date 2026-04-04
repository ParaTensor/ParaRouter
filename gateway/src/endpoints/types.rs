use crate::cache::ConfigCache;
use crate::db::DatabasePool;
use crate::pool::PoolManager;
use crate::service::Service as LlmService;
use crate::settings::{LlmBackendSettings, Settings};
use crate::trace::TraceClient;
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct ProxyState {
    pub db_pool: DatabasePool,
    pub pool_manager: Arc<PoolManager>,
    pub llm_service: Arc<RwLock<LlmService>>,
    pub config: Arc<RwLock<Settings>>,
    pub trace: Option<Arc<TraceClient>>,
    pub cache: ConfigCache,
}

impl ProxyState {
    pub async fn update_llm_service(&self, new_backend: &LlmBackendSettings) -> Result<()> {
        let new_service = LlmService::new(new_backend)?;

        {
            let mut service = self.llm_service.write().await;
            *service = new_service;
        }

        {
            let mut config = self.config.write().await;
            config.llm_backend = new_backend.clone();
        }

        Ok(())
    }

    pub async fn get_current_config(&self) -> Result<Settings> {
        let config = self.config.read().await;
        Ok(config.clone())
    }
}
