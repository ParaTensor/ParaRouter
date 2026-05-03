# ParaRouter Unified Workspace

## Structure
- `gateway/`: ParaRouter Gateway (Data Plane, Rust)
- `hub/`: ParaRouter Hub (Control Plane, Node.js BFF)
- `web/`: ParaRouter Console (Frontend UI, React/Vite)
- `packages/`: Shared libraries and types across workspaces

## Documentation

- `docs/README.md`: documentation index and topic directory overview
- `docs/project/structure.md`: repository architecture and module responsibilities
- `docs/unigateway/`: UniGateway migration, RFC, and design notes
- `docs/ui/`: UI principles, guidelines, and table standards
- `docs/billing/`: billing-specific testing and operational notes

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

For local full-stack development, prefer:
```bash
npm run dev:local
```

This starts three processes:

- Hub API on `http://127.0.0.1:3322`
- Gateway on `http://127.0.0.1:8000`
- Web Vite dev server with HMR on `http://127.0.0.1:5173`

Use `5173` as the frontend entry during development so page edits appear immediately. To avoid confusion, Hub no longer serves a stale local `dist/` build in this mode; if you open a page route on `3322`, Hub redirects it to the Vite frontend.

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

## Production Routing

For production, serve the built frontend bundle from nginx and proxy only the dynamic paths:

- `/` and SPA routes: static files from the Vite build output
- `/api/*`: Hub (Node.js control plane)
- `/v1/*`: Gateway (Rust data plane)

The frontend already supports an external API origin via `VITE_API_BASE_URL`. This makes it straightforward to split the public website and API onto separate domains, for example:

- `pararouter.com`: static site and console shell
- `api.pararouter.com`: Hub and Gateway entrypoints
- `cn.pararouter.com`: China-optimized static entry routed to a nearby POP

This split reduces homepage TTFB by avoiding the Node.js hop for static assets and gives you a clean path to region-specific DNS or reverse-proxy routing later.
