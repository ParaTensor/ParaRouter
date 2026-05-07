# ParaRouter (Parallel Router) Product Overview

ParaRouter is a high-performance, Rust-built, next-generation **LLM API Routing Gateway** developed by **Parallel Tensor**. It is designed to provide developers and service providers with a unified, stable, and cost-effective solution for accessing large language models, enabling "Integrate Once, Call All Models in Parallel."

---

## 1. Core Positioning

ParaRouter is positioned as an **"Operator-Grade Intelligent Dispatch Center for LLM Traffic."** By adopting a decoupled architecture of Control Plane (Hub) and Data Plane (Gateway), ParaRouter—powered by **Parallel Tensor**'s core technology—solves key industry pain points such as multi-vendor management complexity, protocol inconsistency, billing chaos, and poor channel stability.

---

## 2. Core Feature Descriptions

### 2.1 Billing System: Granular Financial Management
ParaRouter features a powerful billing engine supporting USD-anchored and multi-dimensional pricing:
- **Real-time Billing**: Leveraging the Rust Gateway's \`GatewayHooks\` mechanism, balance deduction occurs in milliseconds the moment a streaming or non-streaming request ends, based on token consumption, model pricing, and user markup rates. This effectively prevents overdrafts.
- **Decoupled Pricing Architecture**: Supports separation between "Supplier Cost" and "User Sale Price." Administrators can set a global sale price for a model (e.g., GPT-4o) in the \`Model Pricing\` page once, with support for automatic markup generation, eliminating the need for repetitive entry for every channel.
- **Quotas and Limits**: Supports setting consumption caps (Quota) and QPS limits for specific API Keys, providing multi-dimensional protection for account assets and preventing overspending due to abnormal traffic.

### 2.2 Intelligent Dispatch: High-Availability Routing
ParaRouter implements flexible dynamic routing to ensure requests always flow to the most suitable channel:
- **Top Provider Fallback (Priority Routing)**: Administrators can mark specific suppliers as \`is_top_provider\`. The gateway prioritizes low-cost, stable primary channels. If a primary channel returns a 5xx error, runs out of balance, or experiences abnormal latency, traffic automatically falls back to secondary channels within milliseconds.
- **Health Feedback and Isolation**: The gateway layer possesses "Health Insight" capabilities. When it detects an upstream supplier key failure or continuous response anomalies, it automatically marks the provider as \`unhealthy\` and takes it offline from the dispatch pool to ensure business continuity.
- **Smart Strategy Distribution**: Supports request distribution based on Weight, effectively avoiding rate limits from single suppliers and achieving smooth traffic distribution.

### 2.3 Seamless Protocol Support: Native-Level OpenAI & Anthropic Compatibility
ParaRouter has deeply refactored and adapted to mainstream LLM protocols:
- **Full Interface Coverage**: Supports standard endpoints such as OpenAI \`/v1/chat/completions\`, \`/v1/embeddings\`, and Anthropic \`/v1/messages\`, with precise mapping for advanced features like Function Calling / Tool Use.
- **Zero-Cost Migration**: Developers only need to change their API Base URL to the ParaRouter address. Existing OpenAI/Anthropic SDKs will run directly without any code logic modifications.
- **Extreme Streaming Experience**: Fully supports Server-Sent Events (SSE) with specific optimizations during proxying to ensure Time to First Token (TTFT) remains at a native level.
- **Cross-Protocol Transformation Engine**: Supports transparently converting requests between different protocol formats (e.g., converting an OpenAI request for an Anthropic supplier), greatly expanding the flexibility of parallel model calls.

---

## 3. Product Characteristics

- **Extreme Performance (Rust-Powered)**: The data plane is built with Rust, offering memory safety and QPS throughput superior to traditional Python/Go solutions.
- **C/P Separation (Control/Data Plane Separation)**: The Hub handles business logic (Node.js) while the Gateway focuses on traffic forwarding (Rust). This ensures that even if the management console is down, core gateway traffic remains stable.
- **Hot Configuration Updates**: Automatically synchronizes database configurations every 60 seconds, enabling new models or price adjustments to go live without service restarts.
- **High Compliance**: Features detailed \`activity\` logging for auditing prompt, completion, and cost for every single request.

---

## 4. Use Cases

1. **Operator-Grade AI Proxy**: Acts as a unified internal gateway to control AI budgets and track usage across different teams or customers, managed by **Parallel Tensor**'s robust control plane.
2. **LLM Aggregation Platform**: Quickly build a commercial platform similar to OpenRouter, distributing low-cost resources from various suppliers with robust billing.
3. **High-Availability Production**: With automatic Fallback support, ParaRouter is the ideal fail-safe solution for production-grade AI applications (e.g., AI customer service, intelligent assistants).
4. **Multi-Model Testing and Comparison**: Quickly switch and test performance between GPT-4, Claude 3, DeepSeek, etc., under a single entry point.
