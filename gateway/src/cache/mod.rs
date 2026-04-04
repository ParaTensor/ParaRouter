pub mod listener;

use crate::db::models::{PricingRecord, ProviderKeyRecord, ProviderType};
use crate::db::DatabasePool;
use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

/// A self-implemented in-memory configuration cache.
///
/// Backed by `Arc<RwLock<HashMap>>` — no external dependencies.
/// Designed for a read-heavy, write-rare workload:
///   - Reads (hot path): acquire a read lock, zero DB I/O.
///   - Writes (config reload): acquire a write lock, very infrequent.
#[derive(Clone)]
pub struct ConfigCache {
    provider_keys: Arc<RwLock<HashMap<String, ProviderKeyRecord>>>,
    provider_types: Arc<RwLock<HashMap<String, ProviderType>>>,
    /// Keyed by (model, provider_account_id)
    pricing: Arc<RwLock<HashMap<(String, String), PricingRecord>>>,
    /// The current pricing version, cached to avoid querying pricing_state
    pricing_version: Arc<RwLock<String>>,
}

impl ConfigCache {
    pub fn new() -> Self {
        Self {
            provider_keys: Arc::new(RwLock::new(HashMap::new())),
            provider_types: Arc::new(RwLock::new(HashMap::new())),
            pricing: Arc::new(RwLock::new(HashMap::new())),
            pricing_version: Arc::new(RwLock::new(String::new())),
        }
    }

    /// Full load from database — called once at startup.
    pub async fn load_all(&self, db: &DatabasePool) -> Result<()> {
        self.reload_provider_keys(db).await?;
        self.reload_provider_types(db).await?;
        self.reload_pricing(db).await?;
        info!("ConfigCache fully loaded");
        Ok(())
    }

    // ── Reload methods (called on PG NOTIFY) ────────────────────────

    pub async fn reload_provider_keys(&self, db: &DatabasePool) -> Result<()> {
        let keys = db.list_provider_keys().await?;
        let count = keys.len();
        let mut map = HashMap::with_capacity(count);
        for key in keys {
            map.insert(key.provider.clone(), key);
        }
        *self.provider_keys.write().await = map;
        info!("ConfigCache reloaded: {} provider_keys", count);
        Ok(())
    }

    pub async fn reload_provider_types(&self, db: &DatabasePool) -> Result<()> {
        let types = db.list_provider_types().await?;
        let count = types.len();
        let mut map = HashMap::with_capacity(count);
        for pt in types {
            map.insert(pt.id.clone(), pt);
        }
        *self.provider_types.write().await = map;
        info!("ConfigCache reloaded: {} provider_types", count);
        Ok(())
    }

    pub async fn reload_pricing(&self, db: &DatabasePool) -> Result<()> {
        // First get the current version
        let state = db.get_pricing_state().await;
        let version = match state {
            Ok(s) => s.current_version,
            Err(_) => "bootstrap".to_string(),
        };

        let records = db.list_pricing_by_version(&version).await.unwrap_or_default();
        let count = records.len();
        let mut map = HashMap::with_capacity(count);
        for r in records {
            let provider = r.provider_account_id.clone().unwrap_or_default();
            map.insert((r.model.clone(), provider), r);
        }
        *self.pricing.write().await = map;
        *self.pricing_version.write().await = version.clone();
        info!(
            "ConfigCache reloaded: {} pricing records (version={})",
            count, version
        );
        Ok(())
    }

    // ── Hot-path read methods (read lock only, zero DB I/O) ─────────

    pub async fn get_provider_key(&self, provider: &str) -> Option<ProviderKeyRecord> {
        self.provider_keys.read().await.get(provider).cloned()
    }

    pub async fn get_active_provider_key(&self) -> Option<ProviderKeyRecord> {
        self.provider_keys
            .read()
            .await
            .values()
            .find(|k| k.status == "active")
            .cloned()
    }

    pub async fn list_provider_keys(&self) -> Vec<ProviderKeyRecord> {
        self.provider_keys.read().await.values().cloned().collect()
    }

    pub async fn get_provider_type(&self, id: &str) -> Option<ProviderType> {
        self.provider_types.read().await.get(id).cloned()
    }

    pub async fn list_provider_types(&self) -> Vec<ProviderType> {
        self.provider_types.read().await.values().cloned().collect()
    }

    pub async fn get_effective_pricing(
        &self,
        model: &str,
        provider_account_id: Option<&str>,
    ) -> Option<PricingRecord> {
        let provider = match provider_account_id {
            Some(v) if !v.trim().is_empty() => v,
            _ => return None,
        };
        self.pricing
            .read()
            .await
            .get(&(model.to_string(), provider.to_string()))
            .cloned()
    }

    pub async fn get_pricing_version(&self) -> String {
        self.pricing_version.read().await.clone()
    }
}
