use axum::{
    body::Body,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use std::convert::Infallible;
use serde_json::{json, Value};
use futures_util::StreamExt;

use crate::endpoints::{error_response, ProxyState};
use llm_connector::types::{Function, Message, MessageBlock, Role, Tool};
use llm_connector::StreamFormat;

fn parse_messages(raw: Option<&Vec<Value>>) -> Result<Vec<Message>, String> {
    let raw = raw.ok_or_else(|| "Missing 'messages' field".to_string())?;
    let mut messages = Vec::with_capacity(raw.len());

    for item in raw {
        let role_str = item
            .get("role")
            .and_then(Value::as_str)
            .ok_or_else(|| "Message is missing 'role'".to_string())?;

        let role = match role_str {
            "system" => Role::System,
            "user" => Role::User,
            "assistant" => Role::Assistant,
            "tool" => Role::Tool,
            _ => return Err(format!("Unsupported role: {}", role_str)),
        };

        let content = match item.get("content") {
            Some(Value::String(text)) => vec![MessageBlock::Text { text: text.clone() }],
            Some(Value::Array(arr)) => {
                let mut blocks = Vec::new();
                for part in arr {
                    if let Some(text) = part.get("text").and_then(Value::as_str) {
                        blocks.push(MessageBlock::Text {
                            text: text.to_string(),
                        });
                    } else if let Some(text) = part.as_str() {
                        blocks.push(MessageBlock::Text {
                            text: text.to_string(),
                        });
                    }
                }
                if blocks.is_empty() {
                    vec![MessageBlock::Text {
                        text: String::new(),
                    }]
                } else {
                    blocks
                }
            }
            Some(Value::Null) | None => vec![MessageBlock::Text {
                text: String::new(),
            }],
            Some(other) => {
                return Err(format!("Unsupported content type: {}", other));
            }
        };

        let tool_calls = item
            .get("tool_calls")
            .and_then(|v| serde_json::from_value(v.clone()).ok());

        let tool_call_id = item
            .get("tool_call_id")
            .and_then(Value::as_str)
            .map(|s| s.to_string());

        messages.push(Message {
            role,
            content,
            name: None,
            tool_calls,
            tool_call_id,
            reasoning_content: None,
            reasoning: None,
            thought: None,
            thinking: None,
        });
    }

    Ok(messages)
}

fn parse_tools(raw: Option<&Vec<Value>>) -> Option<Vec<Tool>> {
    raw.map(|tools| {
        tools
            .iter()
            .filter_map(|tool| {
                let tool_type = tool
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or("function")
                    .to_string();
                let function = tool.get("function")?;
                Some(Tool {
                    tool_type,
                    function: Function {
                        name: function.get("name")?.as_str()?.to_string(),
                        description: function
                            .get("description")
                            .and_then(Value::as_str)
                            .map(|s| s.to_string()),
                        parameters: function
                            .get("parameters")
                            .cloned()
                            .unwrap_or_else(|| json!({})),
                    },
                })
            })
            .collect::<Vec<_>>()
    })
}

pub async fn handle_chat_completions(
    State(state): State<ProxyState>,
    Json(payload): Json<Value>,
) -> Response {
    let model = payload.get("model").and_then(Value::as_str);
    let provider_account_id = payload
        .get("provider")
        .and_then(Value::as_str)
        .or_else(|| payload.get("provider_account_id").and_then(Value::as_str));
    if let Some(model_name) = model {
        match state
            .cache
            .get_effective_pricing(model_name, provider_account_id)
            .await
        {
            Some(_) => {}
            None => {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    format!("pricing_not_found for model {} and provider {:?}", model_name, provider_account_id),
                    "pricing_not_found",
                )
                .into_response();
            }
        }
    }

    let messages = match parse_messages(payload.get("messages").and_then(Value::as_array)) {
        Ok(msgs) => msgs,
        Err(err) => {
            return error_response(StatusCode::BAD_REQUEST, err, "invalid_request").into_response();
        }
    };

    let tools = parse_tools(payload.get("tools").and_then(Value::as_array));
    let stream = payload
        .get("stream")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    if stream {
        let llm_service = state.llm_service.read().await;
        let stream_result = llm_service
            .chat_stream_openai(model, messages, tools, StreamFormat::SSE)
            .await;
        drop(llm_service);

        let output_stream = match stream_result {
            Ok(s) => s,
            Err(err) => {
                return error_response(
                    StatusCode::BAD_GATEWAY,
                    format!("LLM stream failed: {}", err),
                    "upstream_error",
                )
                .into_response();
            }
        };

        let body_stream = output_stream.map(Ok::<String, Infallible>);
        let body = Body::from_stream(body_stream);
        return Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "text/event-stream")
            .header("cache-control", "no-cache")
            .body(body)
            .unwrap_or_else(|_| {
                error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to build streaming response",
                    "internal_error",
                )
                .into_response()
            });
    }

    let llm_service = state.llm_service.read().await;
    let response = match llm_service.chat(model, messages, tools).await {
        Ok(resp) => resp,
        Err(err) => {
            return error_response(
                StatusCode::BAD_GATEWAY,
                format!("LLM request failed: {}", err),
                "upstream_error",
            )
            .into_response();
        }
    };

    let mut message = json!({
        "role": "assistant",
        "content": response.content,
    });

    if let Some(tool_calls) = response.tool_calls {
        message["tool_calls"] = tool_calls;
    }

    (
        StatusCode::OK,
        Json(json!({
            "id": format!("chatcmpl-{}", uuid::Uuid::new_v4().simple()),
            "object": "chat.completion",
            "created": chrono::Utc::now().timestamp(),
            "model": response.model,
            "choices": [{
                "index": 0,
                "message": message,
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens,
            }
        })),
    ).into_response()
}
