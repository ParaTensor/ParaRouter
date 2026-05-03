# OpenAI Tool Loop Boundary

Status: Implemented upstream in UniGateway v1.9.0 and wired in ParaRouter

Date: 2026-05-03

## Summary

ParaRouter has verified that OpenAI-compatible tool calling for `gpt-5.5` now completes the full multi-turn tool loop after:

- UniGateway v1.9.0 added structured OpenAI raw-message passthrough
- ParaRouter started forwarding OpenAI raw `messages` plus the source metadata marker into `ProxyChatRequest`

What works now:

- the model can return `tool_calls`
- streaming and non-streaming both expose the first tool call correctly
- provider-specific top-level fields such as `reasoning_effort` already pass through via UniGateway v1.8.0
- second-turn `assistant.tool_calls` and `tool.tool_call_id` are preserved and reach the upstream provider unchanged
- the final assistant answer is returned normally after tool results are sent back

## Observed Behavior

Local ParaRouter tests against `gpt-5.5` show:

1. First-turn tool call works.
2. The response includes a normal OpenAI `tool_calls` array.
3. Streaming also emits tool-call deltas correctly.
4. Second-turn completion with `assistant.tool_calls` plus `tool.tool_call_id` now completes correctly and returns final assistant text.

## Boundary

### ParaRouter responsibility

ParaRouter previously flattened OpenAI chat messages too aggressively in its OpenAI translator.

That means message-level fields such as:

- `assistant.tool_calls`
- `tool.tool_call_id`

were not preserved as first-class structured input on the way into the core request model.

ParaRouter now preserves these OpenAI message shapes by forwarding the original raw `messages` array into `ProxyChatRequest.raw_messages` and tagging the source with the UniGateway OpenAI raw-message metadata key.

### UniGateway responsibility

UniGateway v1.8.0 solved top-level extra-field passthrough.

That is sufficient for:

- `reasoning_effort`
- `max_completion_tokens`

That was not sufficient for full OpenAI tool loops, because tool loops depend on structured message history, not only top-level request fields.

UniGateway v1.9.0 adds that missing path by preserving OpenAI raw messages and allowing the OpenAI renderer to pass them through directly when the request metadata marks them as OpenAI-originated.

## Practical Conclusion

The original gap was not a ParaRouter-only issue.

The final boundary is:

- ParaRouter preserves OpenAI structured messages instead of flattening them
- UniGateway renders those preserved OpenAI structured messages back to upstream OpenAI-compatible providers

Short version:

`OpenAI tool loop needs structured message passthrough, not only top-level extra passthrough.`

## Minimal Reproduction

Step 1: send a tool-enabled OpenAI chat request.

Expected result:

- `finish_reason = tool_calls`
- one function call is returned normally

Step 2: send the next turn with:

- the prior `assistant` message containing `tool_calls`
- a `tool` message containing `tool_call_id`

Observed result after the UniGateway v1.9.0 + ParaRouter translator update:

- request returns `200`
- final assistant content is returned normally
- full tool loop completes end to end

## Requested Direction

1. Keep ParaRouter forwarding structured OpenAI raw message history.
2. Keep UniGateway raw-message passthrough tests in place for future compatibility changes.
3. Re-run end-to-end tool loop regression tests whenever OpenAI translator or protocol layers change.