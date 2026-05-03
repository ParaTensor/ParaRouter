# RFC: UniGateway Core Crate

Status: Draft

Date: 2026-04-06

Authors: UniGateway maintainers

## 1. Summary

This RFC defines the target architecture and public API direction for a future `unigateway-core` crate.

The crate is intended to serve as a reusable, database-agnostic, in-memory LLM proxy and scheduling engine. It is designed to be embedded by upper-layer systems such as ParaRouter, which remain responsible for authentication, billing, control-plane storage, and routing-state production.

The core crate must remain focused on four concerns:

- accepting standardized requests and preconfigured pool targets
- selecting endpoints in memory
- executing retry and failover behavior
- producing transparent streaming and execution results

## 2. Motivation

The current UniGateway project is optimized as an end-user binary and local gateway product. That model mixes several responsibilities which are useful for the product but undesirable for a reusable crate:

- local configuration management
- admin APIs
- process operations
- product-facing CLI flows
- gateway API key lifecycle logic

For upper-layer systems such as ParaRouter, the desired integration model is different.

ParaRouter should own:

- authentication
- quota and billing checks
- database queries and watches
- route calculation and policy decisions
- audit and business logging

`unigateway-core` should own:

- execution against a supplied pool or candidate set
- in-memory scheduling
- retry and fallback
- stream handling
- provider protocol adaptation
- execution reporting

This split improves reuse, reduces coupling, and keeps the core crate transport- and policy-focused rather than product-focused.

## 3. Goals

This RFC proposes a core crate that:

- has zero dependency on any specific database stack
- stores runtime state purely in memory
- supports hot pool updates without process restart
- supports both chat and response-style streaming workflows
- supports embeddings in the same runtime model
- exposes its own stable public request, response, report, and plugin types
- provides built-in support for OpenAI-compatible and Anthropic-style upstreams
- allows custom drivers for non-standard upstream providers
- preserves clean execution reporting for billing and tracing use cases

## 4. Non-Goals

The initial version of `unigateway-core` does not attempt to provide:

- database clients or query code
- config-file persistence
- admin dashboards or admin APIs
- end-user authentication or API key management
- billing logic or quota enforcement
- image generation, audio, realtime, or rerank APIs
- background provider health probes
- built-in circuit-breaker systems
- secret storage backends
- `llm-connector` as a built-in core dependency

If future compatibility with `llm-connector` is desired, it should be implemented as an external optional adapter crate instead of being embedded into the core crate.

## 5. Terminology

This RFC uses the following terms:

- `Pool`: a runtime grouping of endpoints supplied by an upper-layer system
- `Endpoint`: a concrete upstream target with one base URL, one credential, one driver selection, and model policy metadata
- `Driver`: a protocol executor responsible for talking to a provider family
- `ExecutionPlan`: a per-request explicit candidate set supplied by an upper layer
- `Snapshot`: the immutable pool view captured by a request when execution starts

## 6. Normative Language

The key words “MUST”, “MUST NOT”, “SHOULD”, “SHOULD NOT”, and “MAY” in this RFC are to be interpreted as requirement levels for the design and future implementation.

## 7. Architecture Boundary

### 7.1 Core Responsibilities

`unigateway-core` MUST be responsible for:

- maintaining pure in-memory runtime state
- managing pool snapshots and endpoint lookup
- selecting endpoints according to built-in routing strategies
- applying retry and failover behavior
- executing standardized request types against registered drivers
- supporting streaming and non-streaming execution paths
- returning execution reports and usage metadata when available
- exposing asynchronous hook points for upper-layer systems

### 7.2 Out-of-Scope Responsibilities

`unigateway-core` MUST NOT be responsible for:

- database access
- control-plane persistence
- config-file lifecycle
- admin HTTP APIs
- user authentication
- quota checking
- billing enforcement
- tenant or account management

Upper-layer systems MUST own those concerns.

## 8. Zero Database Dependency

`unigateway-core` MUST have zero dependency on any specific database technology.

That includes, but is not limited to:

- PostgreSQL
- MySQL
- SQLite
- Redis
- ORM frameworks
- migration frameworks
- query builders

The crate MUST be able to operate purely from in-memory data supplied by the embedding application.

## 9. Control Plane Inversion

The engine MUST accept configuration passively from the embedding system.

The intended control flow is:

1. the upper layer reads its control plane or database
2. the upper layer materializes runtime pool definitions
3. the upper layer pushes the updated pool into the engine
4. the engine begins serving new requests from the new snapshot

The engine MUST NOT query or watch any control-plane source by itself.

## 10. State Model

The engine state MUST remain purely in memory and thread-safe.

This RFC intentionally does not require a specific internal container implementation such as `RwLock<HashMap<...>>`.

What the implementation MUST provide is:

- low-overhead in-memory reads
- thread-safe writes
- atomic pool replacement semantics
- stable per-request snapshots

Implementations MAY evolve internal data structures as long as those runtime guarantees remain true.

## 11. Packaging Model

The project SHOULD be split into two layers:

- `unigateway-core`: reusable engine crate
- `unigateway` or `unigateway-http`: product-facing HTTP, CLI, admin, and operational layer

The exact package naming MAY be finalized later, but the responsibility boundary described in this RFC SHOULD remain stable.

## 12. Built-In Protocol Support

Version 1 of `unigateway-core` MUST provide built-in support for exactly two provider categories:

- `OpenAiCompatible`
- `Anthropic`

These two built-in drivers are expected to cover the majority of upstream integrations.

## 13. Core Must Not Depend on `llm-connector`

`unigateway-core` MUST NOT depend on `llm-connector` as part of its core design.

The rationale is straightforward:

- the core crate should own its execution abstractions directly
- the public API should not be shaped by a third-party provider abstraction layer
- long-tail provider complexity should not leak into the engine core

If future `llm-connector` interoperability is needed, it SHOULD be implemented as a separate optional adapter crate.

## 14. Prefer Upper-Layer Normalization

When a provider can be normalized by an upper layer into a standard OpenAI-compatible or Anthropic-compatible request, that normalization SHOULD happen before calling `unigateway-core`.

The preferred order of integration is:

1. use the built-in OpenAI-compatible driver
2. use the built-in Anthropic driver
3. normalize provider quirks in the upper layer when possible
4. only introduce a custom driver when standardization outside the engine is not realistic

This keeps the core crate narrow, stable, and easier to reason about.

## 15. Execution Modes

The engine MUST support two execution modes:

- execution by `pool_id`
- execution by an explicit `ExecutionPlan`

Execution by `pool_id` is intended for ordinary embedded use.

Execution by `ExecutionPlan` is intended for upper layers that want to precompute a candidate queue or apply custom policy per request.

## 16. Version 1 Capability Scope

Version 1 of the core crate MUST include:

- chat
- responses
- embeddings

Other endpoint families are outside the scope of this RFC.

## 17. Routing and Retry Requirements

### 17.1 Built-In Routing Strategies

Version 1 MUST provide exactly two built-in routing strategies:

- `Random`
- `RoundRobin`

The design SHOULD preserve room for future plugin-style routing extensions.

Version 1 SHOULD NOT freeze a public routing strategy extension trait unless a concrete extension need emerges.

### 17.2 Retry Surface

Version 1 retry behavior MUST only cover:

- HTTP `429`
- HTTP `500..=599`
- timeout failures
- transport failures

Other error classes SHOULD be treated as non-retriable by default.

### 17.3 Streaming Retry Boundary

Transparent retry MUST NOT occur after the first downstream stream event has been emitted.

Retry and failover are only valid before downstream streaming output begins.

## 18. Snapshot Semantics

Pool updates MUST use snapshot semantics.

Specifically:

- new requests MUST observe the most recently committed pool snapshot
- in-flight requests MUST continue using the snapshot they started with
- later pool updates MUST NOT mutate the candidate set of an already-running request

This behavior is required for predictable concurrency and safe hot updates.

## 19. Driver Model

### 19.1 Endpoint Data Must Stay Pure

`Endpoint` MUST remain a pure data structure.

It MUST NOT directly store `Arc<dyn ProviderDriver>` or any equivalent behavior object.

Instead:

- `Endpoint` MUST store `provider_kind`
- `Endpoint` MUST store `driver_id`
- the engine MUST resolve behavior through a driver registry

This keeps pool snapshots comparable, serializable, and replaceable.

### 19.2 Public Driver Traits Must Not Expose `reqwest`

The public plugin boundary MUST NOT expose `reqwest::Request` or `reqwest::Response`.

Driver traits MUST consume and produce core-owned stable types.

This prevents transport implementation details from becoming permanent API constraints.

### 19.3 Driver Usage Intent

Custom drivers SHOULD be reserved for providers that cannot be reasonably normalized by the upper layer into OpenAI-compatible or Anthropic-compatible execution.

Examples include:

- custom signing requirements
- non-standard authentication headers
- incompatible streaming wire formats

## 20. Streaming and Result Model

Streaming execution MUST use a dual-return model.

That means a streaming request returns:

- a stream that can be forwarded immediately
- a completion handle that resolves after upstream completion

The completion handle MUST carry the final result and execution report when available.

This is required because usage data often becomes available only after the stream has fully completed.

## 21. Observability and Reporting

The engine MUST return execution results that expose:

- request identity
- selected endpoint identity
- attempt trail
- usage when available
- total latency
- caller-provided metadata

The result model MUST expose `selected_endpoint_id` and MUST NOT expose raw upstream secret values.

## 22. Hooks

The engine MUST provide asynchronous hook points.

Hooks are intended for:

- billing record creation
- trace logging
- metrics emission
- audit and risk integration

Hook failures SHOULD NOT fail the proxy request itself.

Implementations MAY surface hook failure information as diagnostics, but the main request path SHOULD remain independent from hook success.

## 23. Public API Draft

*(API traits omitted here for brevity, referencing Section 23 of original document)*

## 24. Suggested Internal Module Layout

```text
unigateway-core/
  src/
    lib.rs
    engine.rs
    pool.rs
    ...
```

## 25. Open Questions

### 25.1 Pool Mutation API Shape
Current recommendation: keep `upsert_pool` as the primary atomic mutation API.

### 25.2 Secret Read Semantics
Current recommendation: read APIs should redact or omit raw secret values.

### 25.3 Embeddings Failover Semantics
Current recommendation: use the same retry model.

### 25.4 HTTP Layer Packaging Name
Current recommendation: keep `unigateway` as the CLI/HTTP layer and introduce `unigateway-core`.
