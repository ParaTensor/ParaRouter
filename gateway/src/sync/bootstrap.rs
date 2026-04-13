use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{error, info};

use crate::runtime::ParaRouterRuntime;
use crate::sync::pools::load_all_pools;

pub async fn start_background_syncer(runtime: Arc<ParaRouterRuntime>) {
    info!("Starting ProviderPool background snapshot synchronizer...");

    // Initial sync
    if let Err(e) = load_all_pools(&runtime.db, &runtime.engine).await {
        error!("Initial provider pool sync failed: {}", e);
    } else {
        info!("Initial database snapshot loaded to engine pools.");
    }

    // Background polling loop
    tokio::spawn(async move {
        loop {
            sleep(Duration::from_secs(60)).await;
            if let Err(e) = load_all_pools(&runtime.db, &runtime.engine).await {
                error!("Periodic provider pool sync failed: {}", e);
            }
        }
    });
}
