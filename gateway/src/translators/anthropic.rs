use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

use unigateway_sdk::core::{Message, MessageRole, ProxyChatRequest};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TextContent {
    #[serde(rename = "type")]
    pub content_type: String,
    pub text: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum Content {
    Simple(String),
    Blocks(Vec<TextContent>),
}

impl Content {
    pub fn extract_text(&self) -> String {
        match self {
            Content::Simple(s) => s.clone(),
            Content::Blocks(blocks) => {
                blocks.iter()
                    .filter(|b| b.content_type == "text")
                    .map(|b| b.text.clone())
                    .collect::<Vec<_>>()
                    .join("\n")
            }
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PermissiveAnthropicMessage {
    pub role: String,
    pub content: Content,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum SystemPrompt {
    Simple(String),
    Blocks(Vec<TextContent>),
}

impl SystemPrompt {
    pub fn extract_text(&self) -> String {
        match self {
            SystemPrompt::Simple(s) => s.clone(),
            SystemPrompt::Blocks(blocks) => {
                blocks.iter()
                    .filter(|b| b.content_type == "text")
                    .map(|b| b.text.clone())
                    .collect::<Vec<_>>()
                    .join("\n")
            }
        }
    }
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
    #[serde(rename = "top_k")]
    pub top_k: Option<u32>,
    pub tools: Option<Value>,
    pub tool_choice: Option<Value>,
    pub stop_sequences: Option<Value>,
    pub stream: Option<bool>,
    /// System prompt (anthropic-specific field at top level) - can be string or array of blocks
    pub system: Option<SystemPrompt>,

    /// When set, chat is routed to this provider account for the given logical `model` id.
    #[serde(default)]
    pub pararouter_provider_account_id: Option<String>,

    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

pub fn into_core_chat_request(
    permissive: PermissiveAnthropicRequest,
) -> Result<ProxyChatRequest, String> {
    let raw_messages = serde_json::to_value(&permissive.messages)
        .map_err(|error| format!("failed to serialize anthropic messages: {error}"))?;
    let system = permissive
        .system
        .as_ref()
        .map(serde_json::to_value)
        .transpose()
        .map_err(|error| format!("failed to serialize anthropic system prompt: {error}"))?;
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
        let system_text = system.extract_text();
        if !system_text.is_empty() {
            core_messages.push(Message {
                role: MessageRole::System,
                content: system_text,
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
            content: msg.content.extract_text(),
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
        top_k: permissive.top_k,
        max_tokens: permissive.max_tokens,
        stop_sequences: permissive.stop_sequences,
        stream: permissive.stream.unwrap_or(false),
        system,
        tools: permissive.tools,
        tool_choice: permissive.tool_choice,
        raw_messages: Some(raw_messages),
        metadata,
    })
}
