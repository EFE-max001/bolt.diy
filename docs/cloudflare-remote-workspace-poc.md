# Cloudflare Remote Workspace POC

This experiment is isolated on `experiment/cloudflare-runtime-poc`. It must not modify `main` or PR #1.

## Goal

Prove that one generated project can use a real Linux workspace rather than the current browser-only runtime:

1. Create a small Vite + React project in an isolated Cloudflare Container.
2. Install dependencies and run the Vite dev server.
3. Edit a source file and verify the browser preview updates through HMR.
4. Capture command output, server logs, and process exit codes.
5. Save the project directory to R2, stop/restart the Container, and restore the project.
6. Only after these pass, connect the runtime to Bolt's existing editor, terminal, and preview UI.

## Selected Cloudflare building blocks

Use Cloudflare's official `@cloudflare/sandbox` 1.x package with the Containers API:

- A Durable Object owns one workspace Container and serializes workspace operations.
- The Container runs Node.js, package managers, Vite, and generated project code.
- `Files` moves project files between the Worker and the Container.
- `DirectoryBackup` saves/restores the project directory in R2. R2 credentials stay in the Worker; they are never passed into generated code.
- Container port forwarding provides the preview path. A later UI phase can attach the existing xterm.js terminal to a persistent PTY.
- Worker authentication and per-workspace authorization must be in place before exposing command execution or preview URLs publicly.

Cloudflare's current 1.x API differs from the older 0.x Sandbox SDK. Do not copy 0.x examples such as `getSandbox()`, `startProcess()`, or `SandboxAddon` into this implementation. Follow the current Container API and 1.x examples.

## Security requirements

- Never place Cloudflare API tokens, R2 access keys, model API keys, or other secrets inside a project Container.
- Do not accept arbitrary workspace IDs as authorization. Bind each workspace to an authenticated owner.
- Keep generated code isolated from the Bolt Worker process and its bindings.
- Start with restricted outbound networking; enable package installation only through a controlled policy.
- Validate file paths and command arguments at the Worker boundary.
- Protect preview access with short-lived, workspace-scoped authorization.
- Apply CPU, memory, disk, command-time, and inactivity limits. Record process exit codes and useful logs.
- Do not deploy an unauthenticated command-execution endpoint.

## Persistence model

Treat Container disk as temporary. Store source files and project metadata durably in R2 / Durable Object storage. Exclude `node_modules`, build caches, and other reproducible data from project backups where practical. Restore the project before restarting its dev server.

The POC should first prove a manual save/restore cycle. Automatic checkpoints and version history come later.

## Compatibility requirements

- Keep the existing Cloudflare Worker hosting Bolt itself.
- Keep the existing Vercel deployment feature for apps users create inside Bolt.
- Do not remove or silently replace the current WebContainer path until the remote runtime passes the POC.
- Preserve the current editor and preview UI while connecting them to a runtime adapter.
- Keep this work on this experiment branch until the user reviews the working preview on a phone and desktop.

## Acceptance checklist

- [ ] Create a Vite + React workspace.
- [ ] `npm install` completes inside the Container.
- [ ] Vite starts and its port is reachable through the Worker.
- [ ] Editing a component updates the open preview through HMR.
- [ ] A failed command exposes stderr and a non-zero exit code.
- [ ] Server logs can be read while the process is running.
- [ ] A project backup is written to R2.
- [ ] After destroying/restarting the Container, restoring the backup recovers the project.
- [ ] Preview and command routes reject unauthenticated requests.
- [ ] No R2 or Cloudflare credentials are visible inside the project Container.

## Deployment note

Cloudflare Containers require the Workers Paid plan. Do not deploy the Container-backed runtime or incur Container usage until the account's plan, expected usage, and R2 bucket are confirmed. The existing Worker-only Bolt deployment can remain separate.
