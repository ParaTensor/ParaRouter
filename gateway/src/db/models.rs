use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ProviderType {
    pub id: String,
    pub label: String,
    pub base_url: String,
    pub models: String, // Stored as JSON string
    pub driver_type: String,
    pub enabled: i32,
    pub sort_order: i32,
    pub docs_url: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewProviderType {
    pub id: String,
    pub label: String,
    pub base_url: String,
    pub driver_type: String,
    pub models: Vec<ModelInfo>,
    pub enabled: Option<bool>,
    pub sort_order: Option<i32>,
    pub docs_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub supports_tools: Option<bool>,
    pub context_length: Option<u32>,
    pub input_price: Option<f64>,
    pub output_price: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Provider {
    pub id: i64,
    pub name: String,
    pub r#type: String,
    pub config: String,
    pub enabled: i32,
    pub priority: i32,
    pub endpoint: Option<String>,
    pub secret_id: Option<String>,
    pub secret_key: Option<String>,
    pub owner_id: Option<i64>,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ApiKey {
    pub id: i64,
    pub owner_id: Option<i64>,
    pub project_id: Option<i64>,
    pub key_hash: String,
    pub name: String,
    pub scope: String,
    pub provider_ids: Option<String>,
    pub protocol: String,
    pub strategy: String,
    pub fallback_chain: Option<String>,
    pub qps_limit: f64,
    pub concurrency_limit: i32,
    pub status: String,
    pub expires_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RequestLog {
    pub id: i64,
    pub api_key_id: Option<i64>,
    pub project_id: Option<i64>,
    pub org_id: Option<i64>,
    pub provider_id: Option<i64>,
    pub provider_name: String,
    pub model: String,
    pub requested_model: Option<String>,
    pub status: String,
    pub latency_ms: i64,
    pub queue_wait_ms: i64,
    pub queue_position_at_admission: Option<i64>,
    pub queue_timed_out: i32,
    pub tokens_used: i64,
    pub error_message: Option<String>,
    pub request_type: String,
    pub request_content: Option<String>,
    pub response_content: Option<String>,
    pub session_id: Option<String>,
    pub turn_id: Option<String>,
    pub run_id: Option<String>,
    pub step_id: Option<String>,
    pub trace_id: Option<String>,
    pub request_id: Option<String>,
    pub step_type: Option<String>,
    pub attempt_index: Option<i64>,
    pub is_fallback: i32,
    pub fallback_count: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewProvider {
    pub name: String,
    pub provider_type: String,
    pub config: String,
    pub enabled: bool,
    pub priority: i32,
    pub endpoint: Option<String>,
    pub secret_id: Option<String>,
    pub secret_key: Option<String>,
    pub owner_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProvider {
    pub name: Option<String>,
    pub provider_type: Option<String>,
    pub config: Option<String>,
    pub enabled: Option<bool>,
    pub priority: Option<i32>,
    pub endpoint: Option<String>,
    pub secret_id: Option<String>,
    pub secret_key: Option<String>,
    pub expected_version: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewApiKey {
    pub owner_id: Option<i64>,
    pub project_id: Option<i64>,
    pub key_hash: String,
    pub name: String,
    pub scope: String,
    pub provider_ids: Option<String>,
    pub protocol: String,
    pub strategy: String,
    pub fallback_chain: Option<String>,
    pub qps_limit: f64,
    pub concurrency_limit: i32,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateApiKey {
    pub name: Option<String>,
    pub provider_ids: Option<String>,
    pub protocol: Option<String>,
    pub strategy: Option<String>,
    pub fallback_chain: Option<String>,
    pub qps_limit: Option<f64>,
    pub concurrency_limit: Option<i32>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ModelRecord {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub description: Option<String>,
    pub context: Option<String>,
    pub pricing_prompt: Option<String>,
    pub pricing_completion: Option<String>,
    pub tags: String,
    pub is_popular: i32,
    pub latency: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewModelRecord {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub description: String,
    pub context: String,
    pub pricing_prompt: String,
    pub pricing_completion: String,
    pub tags: Vec<String>,
    pub is_popular: bool,
    pub latency: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ProviderKeyRecord {
    pub provider: String,
    pub key: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct GatewayRecord {
    pub instance_id: String,
    pub status: String,
    pub last_seen: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewActivityRecord {
    pub model: String,
    pub tokens: i32,
    pub latency: i32,
    pub status: i32,
    pub user_id: String,
    pub cost: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ActivityRecord {
    pub id: i64,
    pub timestamp: i64,
    pub model: String,
    pub tokens: i32,
    pub latency: i32,
    pub status: i32,
    pub user_id: Option<String>,
    pub cost: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserApiKeyRecord {
    pub id: String,
    pub name: String,
    pub key: String,
    pub uid: String,
    pub created_at: i64,
    pub last_used: Option<String>,
    pub usage: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewUserApiKeyRecord {
    pub id: String,
    pub name: String,
    pub key: String,
    pub uid: String,
    pub created_at: i64,
    pub last_used: String,
    pub usage: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PricingRecord {
    pub model: String,
    pub provider_account_id: Option<String>,
    pub price_mode: String,
    pub input_price: Option<f64>,
    pub output_price: Option<f64>,
    pub cache_read_price: Option<f64>,
    pub cache_write_price: Option<f64>,
    pub markup_rate: Option<f64>,
    pub currency: String,
    pub version: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PricingDraftRecord {
    pub model: String,
    pub provider_account_id: Option<String>,
    pub price_mode: String,
    pub input_price: Option<f64>,
    pub output_price: Option<f64>,
    pub cache_read_price: Option<f64>,
    pub cache_write_price: Option<f64>,
    pub markup_rate: Option<f64>,
    pub currency: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PricingReleaseRecord {
    pub version: String,
    pub status: String,
    pub summary: serde_json::Value,
    pub operator: String,
    pub created_at: i64,
    pub config_version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewPricingDraftRecord {
    pub model: String,
    pub provider_account_id: Option<String>,
    pub price_mode: String,
    pub input_price: Option<f64>,
    pub output_price: Option<f64>,
    pub cache_read_price: Option<f64>,
    pub cache_write_price: Option<f64>,
    pub markup_rate: Option<f64>,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingPublishResult {
    pub version: String,
    pub config_version: i64,
    pub affected_models: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PricingStateRecord {
    pub current_version: String,
    pub config_version: i64,
}
