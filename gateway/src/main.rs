use anyhow::Result;
use clap::Parser;
use opengateway::cache::ConfigCache;
use opengateway::cache::listener::spawn_config_listener;
use opengateway::cli::{handle_command, Args};
use opengateway::config::{ConfigLoader, ConfigManager, ModelSyncer};
use opengateway::db::init::try_database_with_url;
use opengateway::engine::instance::init_instance_id;
use opengateway::pool::PoolManager;
use opengateway::router::build_multi_mode_app;
use opengateway::service::Service;
use opengateway::settings::{backend_from_provider, Settings};
use opengateway::trace::TraceClient;
use std::sync::Arc;
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let _ = dotenvy::dotenv();
    initialize_logging(&args);
    init_instance_id();

    if handle_command(&args).await? {
        return Ok(());
    }

    run_multi_mode(args).await
}

async fn run_multi_mode(args: Args) -> Result<()> {
    let config_manager = ConfigManager::load().await?;
    let mut config = config_manager.get();
    ConfigLoader::merge_cli_args(&mut config, &args);

    let database_url = std::env::var("DATABASE_URL")
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| config.database.url.clone());
    let db_pool = match try_database_with_url(Some(&database_url)).await {
        Ok(pool) => pool,
        Err(e) => {
            error!("Database initialization failed: {}", e);
            std::process::exit(1);
        }
    };

    if let Err(e) = ModelSyncer::sync(&db_pool).await {
        warn!("Model synchronization failed: {}", e);
    }

    let pool_manager = Arc::new(PoolManager::new(db_pool.clone()));
    if let Err(e) = pool_manager.init().await {
        warn!("Pool manager init failed: {}", e);
    }
    let _health_check = Arc::clone(&pool_manager).start_health_check();

    // Initialize in-memory config cache
    let config_cache = ConfigCache::new();
    if let Err(e) = config_cache.load_all(&db_pool).await {
        warn!("ConfigCache initial load failed: {}. Cache will be empty until next NOTIFY.", e);
    }

    // Spawn PG LISTEN background task for real-time cache invalidation
    spawn_config_listener(db_pool.clone(), config_cache.clone());

    let settings = settings_from_db_or_default(&db_pool).await;
    let llm_service = Arc::new(tokio::sync::RwLock::new(Service::new(&settings.llm_backend)?));
    let runtime_settings = Arc::new(tokio::sync::RwLock::new(settings));
    let trace = TraceClient::from_env();

    let app = build_multi_mode_app(
        db_pool.clone(),
        Arc::clone(&pool_manager),
        llm_service,
        runtime_settings,
        Arc::new(config.clone()),
        trace,
        config_cache,
    );

    let bind_addr = format!("{}:{}", config.server.host, config.server.port);
    info!("OpenGateway starting on http://{}", bind_addr);
    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    pool_manager.shutdown().await;
    Ok(())
}

async fn settings_from_db_or_default(db_pool: &opengateway::db::DatabasePool) -> Settings {
    let mut settings = Settings::default();
    if let Ok(keys) = db_pool.list_provider_keys().await {
        if let Some(primary) = keys.into_iter().find(|k| k.status == "active") {
            if let Some(backend) = backend_from_provider(&primary.provider, &primary.key, None) {
                settings.llm_backend = backend;
            }
        }
    }
    settings
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

fn initialize_logging(args: &Args) {
    let log_level = args
        .log_level
        .clone()
        .or_else(|| std::env::var("OPENGATEWAY_LOG_LEVEL").ok())
        .unwrap_or_else(|| "info".to_string());

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(log_level)),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();
}
