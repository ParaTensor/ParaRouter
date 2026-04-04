use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    pub server: ServerSettings,
    pub database: DatabaseSettings,
    pub llm_backend: LlmBackendSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerSettings {
    pub host: String,
    pub port: u16,
}

impl Default for ServerSettings {
    fn default() -> Self {
        Self {
            host: "0.0.0.0".to_string(),
            port: 3321,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseSettings {
    pub url: String,
}

impl Default for DatabaseSettings {
    fn default() -> Self {
        Self {
            url: "postgresql://localhost:5432/openhub".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum LlmBackendSettings {
    OpenAI {
        api_key: String,
        base_url: Option<String>,
        region: Option<String>,
        model: String,
    },
    Anthropic {
        api_key: String,
        region: Option<String>,
        model: String,
    },
    Ollama {
        base_url: Option<String>,
        region: Option<String>,
        model: String,
    },
    Zhipu {
        api_key: String,
        base_url: Option<String>,
        region: Option<String>,
        model: String,
    },
    Aliyun {
        api_key: String,
        region: Option<String>,
        model: String,
    },
    Volcengine {
        api_key: String,
        region: Option<String>,
        model: String,
    },
    Tencent {
        api_key: String,
        model: String,
        region: Option<String>,
        secret_id: Option<String>,
        secret_key: Option<String>,
    },
    Longcat {
        api_key: String,
        region: Option<String>,
        model: String,
    },
    Moonshot {
        api_key: String,
        region: Option<String>,
        model: String,
    },
    Minimax {
        api_key: String,
        base_url: Option<String>,
        region: Option<String>,
        model: String,
    },
    DeepSeek {
        api_key: String,
        base_url: Option<String>,
        region: Option<String>,
        model: String,
    },
}

impl Default for LlmBackendSettings {
    fn default() -> Self {
        Self::Ollama {
            base_url: Some("http://localhost:11434".to_string()),
            region: None,
            model: "llama2".to_string(),
        }
    }
}

pub fn default_model_for_provider(provider: &str) -> &'static str {
    match provider {
        "deepseek" => "deepseek-chat",
        "openai" => "gpt-4o-mini",
        "anthropic" => "claude-3-5-sonnet-latest",
        "google" => "gemini-1.5-pro",
        "zhipu" => "glm-4-plus",
        "aliyun" => "qwen-plus",
        "volcengine" => "doubao-pro-32k",
        "tencent" => "hunyuan-lite",
        "moonshot" => "moonshot-v1-8k",
        "minimax" => "abab6.5s-chat",
        "longcat" => "longcat-flash-chat",
        _ => "gpt-4o-mini",
    }
}

pub fn backend_from_provider(
    provider: &str,
    api_key: &str,
    model_override: Option<String>,
) -> Option<LlmBackendSettings> {
    if api_key.trim().is_empty() {
        return None;
    }
    let model = model_override.unwrap_or_else(|| default_model_for_provider(provider).to_string());
    let provider = provider.trim().to_lowercase();
    match provider.as_str() {
        "deepseek" => Some(LlmBackendSettings::DeepSeek {
            api_key: api_key.to_string(),
            base_url: None,
            region: None,
            model,
        }),
        "openai" => Some(LlmBackendSettings::OpenAI {
            api_key: api_key.to_string(),
            base_url: None,
            region: None,
            model,
        }),
        "anthropic" => Some(LlmBackendSettings::Anthropic {
            api_key: api_key.to_string(),
            region: None,
            model,
        }),
        "google" => Some(LlmBackendSettings::OpenAI {
            api_key: api_key.to_string(),
            base_url: Some("https://generativelanguage.googleapis.com/v1beta/openai".to_string()),
            region: None,
            model,
        }),
        "zhipu" => Some(LlmBackendSettings::Zhipu {
            api_key: api_key.to_string(),
            base_url: None,
            region: None,
            model,
        }),
        "aliyun" => Some(LlmBackendSettings::Aliyun {
            api_key: api_key.to_string(),
            region: None,
            model,
        }),
        "volcengine" => Some(LlmBackendSettings::Volcengine {
            api_key: api_key.to_string(),
            region: None,
            model,
        }),
        "tencent" => Some(LlmBackendSettings::Tencent {
            api_key: api_key.to_string(),
            model,
            region: None,
            secret_id: None,
            secret_key: None,
        }),
        "moonshot" => Some(LlmBackendSettings::Moonshot {
            api_key: api_key.to_string(),
            region: None,
            model,
        }),
        "minimax" => Some(LlmBackendSettings::Minimax {
            api_key: api_key.to_string(),
            base_url: None,
            region: None,
            model,
        }),
        "longcat" => Some(LlmBackendSettings::Longcat {
            api_key: api_key.to_string(),
            region: None,
            model,
        }),
        _ => None,
    }
}
