use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

use unigateway_sdk::core::{Message, MessageRole, ProxyChatRequest, ProxyEmbeddingsRequest};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PermissiveChatMessage {
    pub role: Option<String>,
    pub content: Option<Value>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PermissiveChatRequest {
    pub model: Option<String>,
    pub messages: Option<Vec<PermissiveChatMessage>>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub top_k: Option<u32>,
    pub max_tokens: Option<u32>,
    pub stop: Option<Value>,
    pub stream: Option<bool>,
    pub tools: Option<Value>,
    pub tool_choice: Option<Value>,
    /// When set, chat is routed to this provider account for the given logical `model` id.
    #[serde(default)]
    pub pararouter_provider_account_id: Option<String>,

    // We capture unknown fields but core currently drops them for chat requests
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

pub fn into_core_chat_request(
    permissive: PermissiveChatRequest,
) -> Result<ProxyChatRequest, String> {
    let model = permissive.model.unwrap_or_default();
    if model.is_empty() {
        return Err("missing required field: model".to_string());
    }

    let raw_messages = permissive.messages.unwrap_or_default();
    if raw_messages.is_empty() {
        return Err("missing required field: messages".to_string());
    }

    let mut core_messages = Vec::with_capacity(raw_messages.len());
    for msg in raw_messages {
        let role_str = msg.role.unwrap_or_else(|| "user".to_string());
        let role = match role_str.to_lowercase().as_str() {
            "system" => MessageRole::System,
            "user" => MessageRole::User,
            "assistant" => MessageRole::Assistant,
            "tool" | "function" => MessageRole::Tool, // Fallback safely
            _ => MessageRole::User,                   // Permissive fallback
        };

        // Extract content defensively
        let content_str = match msg.content {
            Some(Value::String(s)) => s,
            Some(Value::Array(arr)) => {
                let mut parts = Vec::new();
                for item in arr {
                    if let Some(text) = item.get("text").and_then(Value::as_str) {
                        parts.push(text.to_string());
                    }
                }
                parts.join("\n")
            }
            Some(other) => other.to_string(),
            None => "".to_string(),
        };

        core_messages.push(Message {
            role,
            content: content_str,
        });
    }

    Ok(ProxyChatRequest {
        model,
        messages: core_messages,
        temperature: permissive.temperature,
        top_p: permissive.top_p,
        top_k: permissive.top_k,
        max_tokens: permissive.max_tokens,
        stop_sequences: permissive.stop,
        stream: permissive.stream.unwrap_or(false),
        system: None,
        tools: permissive.tools,
        tool_choice: permissive.tool_choice,
        raw_messages: None,
        metadata: HashMap::new(), // Auth layer will inject contextual metadata later
    })
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PermissiveEmbeddingsRequest {
    pub model: Option<String>,
    pub input: Option<Value>,
    pub encoding_format: Option<String>,
    #[serde(default)]
    pub pararouter_provider_account_id: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

pub fn into_core_embeddings_request(
    permissive: PermissiveEmbeddingsRequest,
) -> Result<ProxyEmbeddingsRequest, String> {
    let model = permissive.model.unwrap_or_default();
    if model.is_empty() {
        return Err("missing required field: model".to_string());
    }

    let mut inputs = Vec::new();
    match permissive.input {
        Some(Value::String(s)) => inputs.push(s),
        Some(Value::Array(arr)) => {
            for item in arr {
                if let Some(s) = item.as_str() {
                    inputs.push(s.to_string());
                }
            }
        }
        _ => return Err("invalid or missing input".to_string()),
    }

    if inputs.is_empty() {
        return Err("input must not be empty".to_string());
    }

    Ok(ProxyEmbeddingsRequest {
        model,
        input: inputs,
        encoding_format: permissive.encoding_format,
        metadata: HashMap::new(),
    })
}
