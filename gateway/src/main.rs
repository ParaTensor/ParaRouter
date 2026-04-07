use anyhow::Result;
use gateway::api::api_router;
use gateway::db::try_database_with_url;
use gateway::runtime::OpenHubRuntime;
use std::sync::Arc;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use unigateway_core::UniGatewayEngine;

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting OpenHub Gateway (powered by UniGateway v1.0.0)");

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let db_pool = match try_database_with_url(Some(&database_url)).await {
        Ok(gateway::db::DatabasePool::Postgres(pool)) => pool,
        Err(e) => {
            error!("Database initialization failed: {}", e);
            std::process::exit(1);
        }
    };

    let transport = Arc::new(unigateway_core::transport::ReqwestHttpTransport::new(
        reqwest::Client::new(),
    ));
    let registry = Arc::new(unigateway_core::registry::InMemoryDriverRegistry::new());
    for driver in unigateway_core::protocol::builtin_drivers(transport) {
        registry.register(driver);
    }

    let hooks = Arc::new(gateway::usage::hooks::OpenHubHooks {
        db: db_pool.clone(),
    });

    let engine = UniGatewayEngine::builder()
        .with_driver_registry(registry)
        .with_hooks(hooks)
        .build();

    let runtime = Arc::new(OpenHubRuntime {
        db: db_pool.clone(),
        engine,
        openai_base_url: "".to_string(),
        openai_api_key: "".to_string(),
        openai_model: "".to_string(),
        anthropic_base_url: "".to_string(),
        anthropic_api_key: "".to_string(),
        anthropic_model: "".to_string(),
    });

    // Start Phase 2: Active Synchronization
    gateway::sync::bootstrap::start_background_syncer(runtime.clone()).await;

    let app = api_router().with_state(runtime);

    let bind_addr = "0.0.0.0:8000";
    info!("OpenHub Gateway listening on http://{}", bind_addr);
    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
