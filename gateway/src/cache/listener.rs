use crate::cache::ConfigCache;
use crate::db::DatabasePool;
use sqlx::postgres::PgListener;
use tracing::{error, info, warn};

/// Spawn a background task that listens to PostgreSQL NOTIFY events
/// and reloads the appropriate ConfigCache section.
///
/// Uses `sqlx::postgres::PgListener` — no external dependencies.
/// The channel name is `config_changed` and the payload indicates
/// which table was modified (e.g. "provider_keys", "provider_types", "pricing").
pub fn spawn_config_listener(
    db_pool: DatabasePool,
    cache: ConfigCache,
) {
    tokio::spawn(async move {
        let pool = match &db_pool {
            DatabasePool::Postgres(p) => p,
        };

        let mut listener = match PgListener::connect_with(pool).await {
            Ok(l) => l,
            Err(e) => {
                error!("Failed to create PG listener: {}. Config will not auto-refresh.", e);
                return;
            }
        };

        if let Err(e) = listener.listen("config_changed").await {
            error!("Failed to LISTEN on config_changed: {}. Config will not auto-refresh.", e);
            return;
        }

        info!("PG LISTEN started on channel 'config_changed'");

        loop {
            match listener.recv().await {
                Ok(notification) => {
                    let payload = notification.payload();
                    info!("config_changed notification received: '{}'", payload);

                    let result = match payload {
                        "provider_keys" => cache.reload_provider_keys(&db_pool).await,
                        "provider_types" => cache.reload_provider_types(&db_pool).await,
                        "pricing" => cache.reload_pricing(&db_pool).await,
                        "all" => cache.load_all(&db_pool).await,
                        other => {
                            warn!("Unknown config_changed payload: '{}', reloading all", other);
                            cache.load_all(&db_pool).await
                        }
                    };

                    if let Err(e) = result {
                        error!("Failed to reload config after notification '{}': {}", payload, e);
                    }
                }
                Err(e) => {
                    error!("PG listener error: {}. Attempting to reconnect...", e);
                    // sqlx PgListener auto-reconnects, but log it
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                }
            }
        }
    });
}
