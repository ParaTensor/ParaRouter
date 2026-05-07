# BAI Thinking Compatibility Issue Draft

Status: Draft

Date: 2026-05-05

Scope: Issue draft for UniGateway reasoning compatibility when Anthropic downstream is bridged onto BAI's OpenAI-compatible upstream surface

## 1. Summary

When Claude models are called through BAI's OpenAI-compatible `/v1/chat/completions` surface, reasoning is returned as literal `<think>...</think>` text inside `message.content` and `delta.content` rather than as structured `reasoning_content` or `thinking` fields.

UniGateway currently preserves Anthropic thinking blocks only when the upstream OpenAI-compatible response exposes structured reasoning fields. It does not attempt to parse `<think>` tags out of plain text content.

As a result, an Anthropic downstream client bridged through UniGateway onto BAI's OpenAI-compatible upstream does not receive structured Anthropic `thinking` blocks or `signature` information.

This is not a ParaRouter handler bug. It is a protocol compatibility gap between:

- BAI's OpenAI-compatible reasoning representation
- UniGateway's current OpenAI-to-Anthropic response adaptation behavior

## 2. Confirmed Behavior

### 2.1 Direct BAI Anthropic endpoint

BAI's Anthropic-native endpoint returns structured Anthropic message content, including thinking blocks and signatures, when called through `/v1/messages`.

### 2.2 Direct BAI OpenAI-compatible endpoint

BAI's OpenAI-compatible endpoint returns reasoning as plain text:

- non-streaming: reasoning appears inside `choices[0].message.content`
- streaming: reasoning appears inside `choices[0].delta.content`
- the payload uses literal `<think>...</think>` text rather than structured `reasoning_content`

### 2.3 Local ParaRouter plus UniGateway bridge

With BAI configured as an OpenAI-compatible upstream, Anthropic downstream requests succeed, but structured thinking is not preserved because the upstream response already arrives as plain text.

ParaRouter itself does not parse `<think>` tags in the gateway shell. Its translator layer only recognizes structured reasoning fields such as `reasoning_content` and `thinking`.

## 3. Why This Is Not A ParaRouter Handler Bug

The ParaRouter Anthropic route writes UniGateway protocol responses back to the client. It does not rewrite completed JSON bodies into text and it does not parse `<think>` tags from upstream content.

The ParaRouter codebase also contains no special-case `<think>` parsing path in the relevant translator and response-adaptation surfaces. Current translator logic only tracks structured reasoning fields.

That means the observed degradation is not introduced by ParaRouter's HTTP handler layer.

## 4. Why This Still Matters For UniGateway

UniGateway already has explicit structured thinking handling for OpenAI-compatible upstreams when the upstream response includes:

- `reasoning_content`
- `thinking`

Completed responses and streaming responses both support this structured path.

The compatibility gap is narrower than "UniGateway loses reasoning".

The actual gap is:

**UniGateway does not currently offer an optional compatibility mode that reconstructs Anthropic thinking blocks from provider-specific `<think>` text emitted on an OpenAI-compatible upstream.**

## 5. Minimal Reproduction

### 5.1 Direct provider comparison

Use the same BAI Claude model on two upstream surfaces.

1. Call `https://api.b.ai/v1/messages` with Anthropic headers and a Claude model.
2. Observe structured Anthropic content blocks, including thinking.
3. Call `https://api.b.ai/v1/chat/completions` with the same logical task.
4. Observe reasoning emitted as literal `<think>...</think>` inside plain text content.

This establishes that the upstream OpenAI-compatible surface is already textifying reasoning.

### 5.2 Local bridge comparison

1. Configure BAI as `openai_compatible` in ParaRouter.
2. Send an Anthropic `/v1/messages` request through the local ParaRouter gateway.
3. Observe that the request succeeds, but structured thinking blocks are not returned.
4. Directly inspect BAI's OpenAI-compatible upstream response and confirm it did not provide structured reasoning fields to preserve.

## 6. Important Confounder: Anthropic Base URL Must Include `/v1`

There is a separate and easy-to-confuse issue when testing BAI through the Anthropic driver.

ParaRouter currently auto-normalizes root base URLs to `/v1` only for OpenAI-compatible upstreams. Anthropic upstreams are not rewritten this way.

That means these two BAI Anthropic configurations are materially different:

- `driver_type = anthropic`, `base_url = https://api.b.ai` -> requests go to `/messages` and fail with 403
- `driver_type = anthropic`, `base_url = https://api.b.ai/v1` -> requests go to `/v1/messages` and succeed

This base URL requirement is real, but it is a separate issue from the `<think>` compatibility gap.

It should not be used as evidence that UniGateway Anthropic headers or auth are incompatible with BAI.

## 7. Expected And Actual

### Expected

One of the following should be true:

- UniGateway documents that Anthropic structured thinking can only be preserved when the OpenAI-compatible upstream exposes structured reasoning fields
- or UniGateway offers an explicit opt-in compatibility mode that reconstructs Anthropic thinking blocks from known provider text conventions such as `<think>...</think>`

### Actual

Anthropic downstream clients bridged through UniGateway onto BAI's OpenAI-compatible surface receive plain text output instead of structured thinking blocks, because UniGateway does not reconstruct thinking from textual `<think>` content.

## 8. Proposed Direction

If UniGateway chooses to address this, the change should live in the protocol and conversion layer that renders OpenAI-compatible upstream responses into Anthropic downstream responses.

It should not be pushed into embedding gateway products such as ParaRouter.

Any such feature should be:

- explicit and opt-in
- provider-scoped or rule-scoped rather than universally enabled
- documented as heuristic only

## 9. Risks Of A Heuristic Fix

Reconstructing Anthropic thinking blocks from `<think>` text has clear risks:

- there is no real Anthropic signature to preserve
- providers may change formatting without notice
- ordinary assistant text may accidentally match the pattern
- behavior may differ between completed and streaming outputs

Because of that, an opt-in compatibility switch is safer than a silent global rewrite.

## 10. Non-Goals

This issue draft is not proposing:

- changes to ParaRouter HTTP handlers
- parsing `<think>` text inside product-specific gateway code
- treating the BAI Anthropic `/v1` base URL requirement as the same issue

## 11. Suggested Upstream Checkpoints

The relevant UniGateway surfaces to inspect are:

- completed OpenAI-to-Anthropic rendering
- streaming OpenAI-to-Anthropic rendering
- OpenAI message to Anthropic content block conversion

The current structured path already handles `reasoning_content` and `thinking`. The missing question is whether UniGateway should also support a guarded text-to-thinking reconstruction path for known provider behaviors.