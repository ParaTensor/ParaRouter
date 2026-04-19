use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

use unigateway_sdk::core::{Message, MessageRole, ProxyChatRequest};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PermissiveAnthropicMessage {
    pub role: String,
    pub content: String,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PermissiveAnthropicRequest {
    pub model: String,
    pub messages: Vec<PermissiveAnthropicMessage>,
    #[serde(rename = "max_tokens")]
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    #[serde(rename = "top_p")]
    pub top_p: Option<f32>,
    pub stream: Option<bool>,
    /// System prompt (anthropic-specific field at top level)
    pub system: Option<String>,

    /// When set, chat is routed to this provider account for the given logical `model` id.
    #[serde(default)]
    pub pararouter_provider_account_id: Option<String>,

    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

pub fn into_core_chat_request(
    permissive: PermissiveAnthropicRequest,
) -> Result<ProxyChatRequest, String> {
    let model = permissive.model;
    if model.is_empty() {
        return Err("missing required field: model".to_string());
    }

    if permissive.messages.is_empty() {
        return Err("missing required field: messages".to_string());
    }

    let mut core_messages = Vec::with_capacity(permissive.messages.len() + 1);

    // If system prompt is provided at top level (anthropic style), prepend as system message
    if let Some(system) = permissive.system {
        if !system.is_empty() {
            core_messages.push(Message {
                role: MessageRole::System,
                content: system,
            });
        }
    }

    for msg in permissive.messages {
        let role = match msg.role.to_lowercase().as_str() {
            "user" => MessageRole::User,
            "assistant" => MessageRole::Assistant,
            _ => MessageRole::User,
        };
        core_messages.push(Message {
            role,
            content: msg.content,
        });
    }

    let mut metadata = HashMap::new();
    if let Some(ref hint) = permissive.pararouter_provider_account_id {
        metadata.insert(
            "pararouter_provider_account_id".to_string(),
            hint.clone(),
        );
    }

    Ok(ProxyChatRequest {
        model,
        messages: core_messages,
        temperature: permissive.temperature,
        top_p: permissive.top_p,
        max_tokens: permissive.max_tokens,
        stream: permissive.stream.unwrap_or(false),
        metadata,
    })
}
