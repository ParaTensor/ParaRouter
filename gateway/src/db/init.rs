use crate::db::pool::DatabasePool;
use anyhow::Result;
use sqlx::{Pool, Postgres};
use tracing::info;

/// Same source as Hub (`hub/db.ts` initSchema); keeps gateway usable on a fresh Postgres.
static SHARED_POSTGRES_SCHEMA: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../packages/shared/schema.sql"
));

/// Split SQL on `;` boundaries outside of `--` comments and single-quoted strings.
fn split_postgres_statements(sql: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut buf = String::new();
    let mut chars = sql.chars().peekable();
    let mut in_single_quote = false;

    while let Some(c) = chars.next() {
        if !in_single_quote {
            if c == '-' && chars.peek() == Some(&'-') {
                chars.next();
                while let Some(n) = chars.next() {
                    if n == '\n' {
                        break;
                    }
                }
                continue;
            }
        }

        if in_single_quote {
            buf.push(c);
            if c == '\'' {
                if chars.peek() == Some(&'\'') {
                    if let Some(q) = chars.next() {
                        buf.push(q);
                    }
                    continue;
                }
                in_single_quote = false;
            }
            continue;
        }

        if c == '\'' {
            in_single_quote = true;
            buf.push(c);
            continue;
        }

        if c == ';' {
            let s = buf.trim();
            if !s.is_empty() {
                out.push(s.to_string());
            }
            buf.clear();
            continue;
        }

        buf.push(c);
    }

    let tail = buf.trim();
    if !tail.is_empty() {
        out.push(tail.to_string());
    }
    out
}

pub async fn ensure_schema_postgres(pool: &Pool<Postgres>) -> Result<()> {
    let statements = split_postgres_statements(SHARED_POSTGRES_SCHEMA);
    let n = statements.len();
    for (i, stmt) in statements.iter().enumerate() {
        sqlx::query(stmt).execute(pool).await.map_err(|e| {
            anyhow::anyhow!(
                "schema statement {}/{} failed: {}\n---\n{}\n---",
                i + 1,
                n,
                e,
                stmt.chars().take(400).collect::<String>()
            )
        })?;
    }
    info!("Applied shared PostgreSQL schema ({} statements)", n);
    Ok(())
}

pub async fn try_database_with_url(url: Option<&str>) -> Result<DatabasePool> {
    let url = url.unwrap_or("postgresql://localhost:5432/pararouter");
    if !url.starts_with("postgres://") && !url.starts_with("postgresql://") {
        anyhow::bail!("DATABASE_URL must be a postgres/postgresql URL");
    }
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(url)
        .await?;
    ensure_schema_postgres(&pool).await?;
    Ok(DatabasePool::Postgres(pool))
}
