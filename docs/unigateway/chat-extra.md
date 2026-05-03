# UniGateway OpenAI Chat Extra Passthrough

Status: Implemented upstream in UniGateway v1.8.0

Date: 2026-05-03

Scope: Minimal upstream change request for OpenAI chat compatibility

## 1. Summary

ParaRouter needs a minimal UniGateway change so OpenAI-compatible chat requests can preserve provider-specific top-level fields instead of dropping them during translation.

The immediate driver is reasoning-oriented OpenAI-compatible models such as `gpt-5.5`, where callers may rely on controls like:

- `reasoning_effort`
- `max_completion_tokens`
- future provider-specific request fields that still belong on `/v1/chat/completions`

Today, UniGateway's OpenAI chat request path only preserves a fixed set of fields. Everything else is lost before the upstream request is rendered.

## 2. Why This Matters

ParaRouter intentionally behaves as a compatibility gateway, not a product that rewrites provider semantics by default.

That means:

- if the client explicitly sets a field, the gateway should preserve it whenever the upstream provider supports it
- if the client omits a field such as `max_tokens`, the gateway should prefer the upstream provider's default behavior instead of inventing a model-level policy

Without extra-field passthrough, reasoning-model tuning becomes impossible on the OpenAI chat route even though the client payload is otherwise valid.

## 3. Current Behavior

### 3.1 ParaRouter shell layer

ParaRouter's permissive OpenAI translator captures unknown request fields in `extra`, but currently drops them when converting into `ProxyChatRequest`.

That is visible in:

- `gateway/src/translators/openai.rs`

The current translator comment already states the limitation: unknown chat fields are captured but not forwarded.

### 3.2 UniGateway request model

`ProxyChatRequest` in `unigateway-core` currently exposes:

- model
- messages
- temperature
- top_p
- top_k
- max_tokens
- stop_sequences
- stream
- system
- tools
- tool_choice
- raw_messages
- metadata

It has no generic container for provider-specific OpenAI chat fields.

### 3.3 UniGateway OpenAI request renderer

The OpenAI request builder in `unigateway-core` serializes a fixed payload for `chat/completions`.

It inserts known fields such as:

- `model`
- `messages`
- `stream`
- `temperature`
- `top_p`
- `top_k`
- `max_tokens`
- `stop`
- `tools`
- `tool_choice`

No generic extra map is merged into the outgoing JSON body.

## 4. Reproduction Evidence

Using ParaRouter locally against `gpt-5.5`:

1. Simple prompts work on `/v1/chat/completions`.
2. Streamed responses can emit visible text normally.
3. Complex reasoning prompts may consume output budget in reasoning tokens.
4. Client attempts to send reasoning-specific controls on the current OpenAI chat path cannot be relied on, because those fields are dropped before the upstream request is built.

This means the current limitation is not just a product preference. It is a protocol-surface gap.

## 5. Requested Upstream Change

UniGateway should add a generic passthrough container for OpenAI chat request fields that are not modeled explicitly.

Minimal design:

1. Extend `ProxyChatRequest` with an `extra: HashMap<String, Value>` field.
2. In OpenAI-compatible payload translation, collect unknown top-level fields into `extra`.
3. In the OpenAI `chat/completions` request builder, merge `extra` into the outgoing JSON body after inserting the normalized core fields.
4. Keep explicit core fields authoritative when there is a key collision.

In other words:

- known fields remain normalized by UniGateway
- unknown but valid provider-specific fields remain intact

## 6. Acceptance Criteria

The change is sufficient if all of the following are true:

1. A client can send `reasoning_effort` on `/v1/chat/completions` and the field reaches the upstream OpenAI-compatible provider unchanged.
2. A client can send `max_completion_tokens` on `/v1/chat/completions` and the field reaches the upstream unchanged.
3. Existing normalized fields still work exactly as before.
4. Explicit UniGateway fields win over `extra` collisions.
5. Existing Anthropic translation behavior is unchanged.

## 7. Non-Goals

This request does not require UniGateway to:

- invent default `max_tokens` values per model
- reinterpret provider-specific semantics
- guarantee that every provider honors every extra field
- add new ParaRouter-specific policy behavior

The only goal is preserving valid client intent on the OpenAI chat compatibility surface.

## 8. Suggested Tests

At minimum, upstream tests should cover:

1. OpenAI payload translation preserves unknown top-level fields in `ProxyChatRequest.extra`.
2. OpenAI request rendering merges `extra` into the final `chat/completions` payload.
3. Known-field collisions prefer normalized request fields over `extra`.
4. Existing OpenAI tool and tool_choice tests still pass.

## 9. ParaRouter Follow-Up

With UniGateway v1.8.0, ParaRouter can make a small shell-layer change:

1. Preserve `PermissiveChatRequest.extra` when building `ProxyChatRequest`.
2. Document that `/v1/chat/completions` forwards provider-specific fields on a best-effort basis.

That lets ParaRouter stay policy-light while restoring expected OpenAI-compatible behavior for reasoning models.