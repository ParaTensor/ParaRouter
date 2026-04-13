# ParaRouter Unified Workspace

## Structure
- `gateway/`: ParaRouter Gateway (Data Plane, Rust)
- `hub/`: ParaRouter Hub (Control Plane, Node.js BFF)
- `web/`: ParaRouter Console (Frontend UI, React/Vite)
- `packages/`: Shared libraries and types across workspaces

## Quick Start

### 1. Install dependencies
Run this command from the root of the workspace to install all dependencies for the Node.js/Frontend monorepo:
```bash
npm install
```

### 2. Start the Control Plane (Hub)
The Hub is a Node.js API that manages users, billing, API keys, and configurations.
```bash
# From workspace root
npm run dev
```

### 3. Start the Data Plane (Gateway)
The Gateway is a high-performance Rust proxy that handles LLM request forwarding.
```bash
cd gateway
cargo run
```

### 4. Start the Frontend (Web)
Build and preview the frontend dashboard:
```bash
# From workspace root
npm run build
npm run preview
```
