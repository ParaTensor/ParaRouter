use std::sync::Arc;

use anyhow::Result;
use gateway::api::api_router;
use gateway::db::try_database_with_url;
use gateway::runtime::ParaRouterRuntime;
use gateway::usage::stream::DatabaseStreamObservationSink;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use unigateway_sdk::core::UniGatewayEngine;
use unigateway_sdk::core::registry::InMemoryDriverRegistry;
use unigateway_sdk::core::transport::ReqwestHttpTransport;

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

    info!("Starting ParaRouter Gateway (powered by UniGateway v1.7.1)");

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let db_pool = match try_database_with_url(Some(&database_url)).await {
        Ok(gateway::db::DatabasePool::Postgres(pool)) => pool,
        Err(e) => {
            error!("Database initialization failed: {}", e);
            std::process::exit(1);
        }
    };

    let transport = Arc::new(ReqwestHttpTransport::new(reqwest::Client::new()));
    let registry = Arc::new(InMemoryDriverRegistry::new());
    for driver in unigateway_sdk::core::protocol::builtin_drivers(transport) {
        registry.register(driver);
    }

    let hooks = Arc::new(gateway::usage::hooks::ParaRouterHooks {
        db: db_pool.clone(),
    });

    let engine = UniGatewayEngine::builder()
        .with_driver_registry(registry)
        .with_hooks(hooks)
        .build()?;

    let stream_observation_sink = Arc::new(DatabaseStreamObservationSink::new(db_pool.clone()));
    let runtime = Arc::new(ParaRouterRuntime::new(
        db_pool.clone(),
        engine,
        stream_observation_sink,
    ));

    // Start Phase 2: Active Synchronization
    gateway::sync::bootstrap::start_background_syncer(runtime.clone()).await;

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = api_router().layer(cors).with_state(runtime);

    let bind_addr = "0.0.0.0:8000";
    info!("ParaRouter Gateway listening on http://{}", bind_addr);
    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
