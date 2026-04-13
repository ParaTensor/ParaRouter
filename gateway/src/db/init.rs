use crate::db::pool::DatabasePool;
use anyhow::Result;

pub async fn try_database_with_url(url: Option<&str>) -> Result<DatabasePool> {
    let url = url.unwrap_or("postgresql://localhost:5432/pararouter");
    if !url.starts_with("postgres://") && !url.starts_with("postgresql://") {
        anyhow::bail!("DATABASE_URL must be a postgres/postgresql URL");
    }
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(url)
        .await?;
    // ensure_schema_postgres(&pool).await?;
    Ok(DatabasePool::Postgres(pool))
}

