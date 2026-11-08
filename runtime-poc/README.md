# Bolt workspace runtime — isolated proof of concept

This folder is a separate Cloudflare Worker and Container experiment. It does not alter Bolt's existing Worker configuration, preview deployment, or Vercel deployment feature.

## What this experiment tests

- A dedicated Linux container with Node.js, npm, pnpm, Git, Bash, and common build tools.
- A single authenticated demo workspace.
- Remote command execution inside that workspace.
- HTTP preview forwarding from port 5173 (Vite's default development port).
- Filesystem checkpoints using Cloudflare Container snapshots.
- Restore after stopping and recreating the container.
- An inactivity timeout that stops keeping the test container active after five minutes without workspace requests.

The prototype is intentionally limited to the workspace ID `demo`. It is not connected to Bolt's chat UI and is not a multi-user service.

The preview check verifies HTTP preview delivery and updated source retrieval. It does **not** yet verify browser HMR WebSocket forwarding or a full interactive editor experience.

## Billing and prerequisites

Cloudflare currently lists Containers as unavailable on the Free plan. The Workers Paid plan is US$5/month and includes a limited amount of Container usage; additional active CPU, memory, disk, Durable Object, and network usage can be billed separately.

The first deploy builds and pushes a Linux container image. Cloudflare's documented `wrangler deploy` flow uses Docker, so deployment requires a machine or CI runner with a working Docker engine.

Do not deploy or run the smoke tests until the Cloudflare account owner has checked the plan and billing settings and approved the usage.

References:
- https://developers.cloudflare.com/containers/get-started/
- https://developers.cloudflare.com/containers/platform/pricing/
- https://developers.cloudflare.com/containers/api/durable-object-container/
- https://developers.cloudflare.com/containers/guides/snapshots/

## Deploy manually

From the repository root, with Docker running and Wrangler authenticated to the correct Cloudflare account:

```bash
pnpm exec wrangler deploy --config runtime-poc/wrangler.jsonc
```

After the first deployment, set the required API token as a Worker secret:

```bash
pnpm exec wrangler secret put RUNTIME_POC_TOKEN --config runtime-poc/wrangler.jsonc
```

Use a long, unique token. Do not put it in the repository, a browser bundle, or a chat message.

The deployed Worker URL is shown by Wrangler. Check its public health endpoint:

```bash
curl https://YOUR-RUNTIME-WORKER.workers.dev/health
```

## API

All workspace routes except `/health` require:

```http
Authorization: Bearer YOUR_RUNTIME_POC_TOKEN
```

Start the demo workspace:

```http
POST /v1/workspaces/demo/start
```

Execute a command:

```http
POST /v1/workspaces/demo/commands
Content-Type: application/json

{
  "command": ["bash", "-lc", "node --version && pwd"]
}
```

Save a filesystem snapshot without stopping the container:

```http
POST /v1/workspaces/demo/snapshot
```

Save a snapshot and stop the container:

```http
POST /v1/workspaces/demo/stop
```

Read status:

```http
GET /v1/workspaces/demo/status
```

Preview requests are forwarded to port 5173:

```text
https://YOUR-RUNTIME-WORKER.workers.dev/v1/workspaces/demo/preview/
```

## Smoke tests

The smaller test checks that a file survives a container stop and snapshot restore:

```bash
RUNTIME_POC_URL=https://YOUR-RUNTIME-WORKER.workers.dev RUNTIME_POC_TOKEN=YOUR_TOKEN node runtime-poc/smoke-test.mjs
```

The fuller preview test creates a Vite + React app, installs dependencies, starts Vite on port 5173, retrieves the preview, edits a component, checks that the updated source is served, snapshots/stops/restores the container, and verifies that the edit survived:

```bash
RUNTIME_POC_URL=https://YOUR-RUNTIME-WORKER.workers.dev RUNTIME_POC_TOKEN=YOUR_TOKEN node runtime-poc/preview-smoke.mjs
```

On Windows PowerShell:

```powershell
$env:RUNTIME_POC_URL = "https://YOUR-RUNTIME-WORKER.workers.dev"
$env:RUNTIME_POC_TOKEN = "YOUR_TOKEN"
node runtime-poc/preview-smoke.mjs
```

The test automatically attempts to snapshot and stop the workspace in its `finally` block. Still check the Cloudflare dashboard afterward to confirm the container stopped. These scripts start billable Container usage and make outbound package requests, so run them only after billing has been approved.

## Snapshot limitations

Snapshots capture filesystem state, not process memory or running processes. The Vite server must be started again after a restore. Snapshots are immutable, are tied to the container image they were created from, and currently have a 30-day time-to-live that refreshes when restored.

This is a checkpoint mechanism for the experiment, not yet the permanent project-backup design. The production architecture should use a Worker-managed R2 binding for durable source files and backups. R2 credentials should not be passed into containers that execute user code, because that code could read them.
