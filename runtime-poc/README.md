# Bolt workspace runtime — isolated proof of concept

This folder is a separate Cloudflare Worker and Container experiment. It does not alter Bolt's existing Worker configuration, preview deployment, or Vercel deployment feature.

## What this experiment tests

- A dedicated Linux container with Node.js, npm, pnpm, Git, Bash, and common build tools.
- A single authenticated demo workspace.
- Remote command execution inside that workspace.
- HTTP preview forwarding from port 5173 (Vite's default development port).
- Filesystem checkpoints using Cloudflare Container snapshots.
- Restore after stopping and recreating the container.

The prototype is intentionally limited to the workspace ID `demo`. It is not connected to Bolt's chat UI and is not a multi-user service.

## Billing and prerequisites

Cloudflare currently lists Containers as unavailable on the Free plan. The Workers Paid plan is US$5/month and includes a limited amount of Container usage; additional active CPU, memory, disk, Durable Object, and network usage can be billed separately.

The first deploy builds and pushes a Linux container image. Cloudflare's documented `wrangler deploy` flow uses Docker, so deployment requires a machine or CI runner with a working Docker engine.

Do not deploy this experiment until you have checked the plan and billing settings on the Cloudflare account.

References:
- https://developers.cloudflare.com/containers/get-started/
- https://developers.cloudflare.com/containers/platform/pricing/
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

To try Vite after starting the workspace, run these commands in sequence:

```json
{
  "command": [
    "bash",
    "-lc",
    "cd /workspace && npm create vite@latest preview-demo -- --template react --yes"
  ]
}
```

```json
{
  "command": ["bash", "-lc", "cd /workspace/preview-demo && npm install"]
}
```

```json
{
  "command": [
    "bash",
    "-lc",
    "cd /workspace/preview-demo && nohup npm run dev -- --host 0.0.0.0 --port 5173 > /tmp/vite.log 2>&1 < /dev/null &"
  ]
}
```

The preview route forwards to port 5173. Use the commands endpoint to inspect startup output:

```json
{
  "command": ["bash", "-lc", "tail -n 80 /tmp/vite.log"]
}
```

## Snapshot limitations

Snapshots capture filesystem state, not process memory or running processes. The Vite server must be started again after a restore. Snapshots are immutable, are tied to the container image they were created from, and currently have a 30-day time-to-live that refreshes when restored.

This is a checkpoint mechanism for the experiment, not yet the permanent project-backup design. The production architecture should use a Worker-managed R2 binding for durable source files and backups. R2 credentials should not be passed into containers that execute user code, because that code could read them.

## Smoke test

After deployment and setting the secret, run:

```bash
RUNTIME_POC_URL=https://YOUR-RUNTIME-WORKER.workers.dev RUNTIME_POC_TOKEN=YOUR_TOKEN node runtime-poc/smoke-test.mjs
```

On Windows PowerShell:

```powershell
$env:RUNTIME_POC_URL = "https://YOUR-RUNTIME-WORKER.workers.dev"
$env:RUNTIME_POC_TOKEN = "YOUR_TOKEN"
node runtime-poc/smoke-test.mjs
```

A successful run writes a file, snapshots and stops the container, restores it, and verifies that the file remains. The smoke test starts billable Cloudflare Container usage, so run it only after confirming that billing is enabled and understood.
