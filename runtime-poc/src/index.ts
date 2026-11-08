import { DurableObject } from "cloudflare:workers";

interface ContainerSnapshot {
  id: string;
  size: number;
  name?: string;
}

interface RuntimeEnv {
  WORKSPACE_RUNTIME: DurableObjectNamespace<WorkspaceRuntime>;
  RUNTIME_POC_TOKEN: string;
}

interface CommandPayload {
  command: string[];
  cwd?: string;
}

const MAX_COMMAND_ARGUMENTS = 48;
const MAX_ARGUMENT_LENGTH = 4_096;
const MAX_COMMAND_OUTPUT = 80_000;
const COMMAND_TIMEOUT_MS = 30_000;
const CONTAINER_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected runtime error";
}

function isSafeWorkspacePath(value: string): boolean {
  if (value !== "/workspace" && !value.startsWith("/workspace/")) {
    return false;
  }

  const segments = value.replaceAll("\\", "/").split("/");
  return !segments.includes("..");
}

export class WorkspaceRuntime extends DurableObject<RuntimeEnv> {
  private getContainer() {
    const container = this.ctx.container;

    if (!container) {
      throw new Error("Cloudflare did not attach a container to this Durable Object");
    }

    return container;
  }

  private async ensureRunning(): Promise<{ restored: boolean }> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const container = this.getContainer();

      if (container.running) {
        await container.setInactivityTimeout(CONTAINER_IDLE_TIMEOUT_MS);
        return { restored: false };
      }

      const snapshot = await this.ctx.storage.get<ContainerSnapshot>("containerSnapshot");

      if (snapshot) {
        container.start({
          containerSnapshot: snapshot,
          enableInternet: true,
          instance: "lite",
        });
        await container.setInactivityTimeout(CONTAINER_IDLE_TIMEOUT_MS);
        return { restored: true };
      }

      container.start({
        image: container.images.base,
        enableInternet: true,
        instance: "lite",
      });
      await container.setInactivityTimeout(CONTAINER_IDLE_TIMEOUT_MS);

      return { restored: false };
    });
  }

  private async readCommandPayload(request: Request): Promise<CommandPayload | Response> {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    const rawBody = await request.text();

    if (contentLength > 24_000 || rawBody.length > 24_000) {
      return json({ error: "Command request is too large" }, 413);
    }

    let payload: unknown;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ error: "Expected a valid JSON request body" }, 400);
    }

    if (!payload || typeof payload !== "object") {
      return json({ error: "Expected a command object" }, 400);
    }

    const candidate = payload as Record<string, unknown>;
    const command = candidate.command;
    const cwd = candidate.cwd ?? "/workspace";

    if (
      !Array.isArray(command) ||
      command.length === 0 ||
      command.length > MAX_COMMAND_ARGUMENTS ||
      !command.every(
        (argument) =>
          typeof argument === "string" && argument.length <= MAX_ARGUMENT_LENGTH,
      )
    ) {
      return json(
        {
          error: "command must be a non-empty array of at most 48 strings",
        },
        400,
      );
    }

    if (typeof cwd !== "string" || !isSafeWorkspacePath(cwd)) {
      return json(
        { error: "cwd must be /workspace or a subdirectory without '..'" },
        400,
      );
    }

    return { command: command as string[], cwd };
  }

  private async runCommand(request: Request): Promise<Response> {
    const payload = await this.readCommandPayload(request);

    if (payload instanceof Response) {
      return payload;
    }

    const container = this.getContainer();
    const startResult = await this.ensureRunning();
    const process = await container.exec(payload.command, {
      cwd: payload.cwd,
      stdout: "pipe",
      stderr: "combined",
    });

    let timedOut = false;
    let exited = false;

    const timeout = setTimeout(() => {
      if (!exited) {
        timedOut = true;
        process.kill();
      }
    }, COMMAND_TIMEOUT_MS);

    const output = await process.output().finally(() => {
      exited = true;
      clearTimeout(timeout);
    });

    const decoder = new TextDecoder();
    const stdout = decoder.decode(output.stdout);
    const stderr = decoder.decode(output.stderr);
    const combined = stdout + stderr;

    return json({
      pid: process.pid,
      exitCode: output.exitCode,
      timedOut,
      restored: startResult.restored,
      output: combined.slice(0, MAX_COMMAND_OUTPUT),
      truncated: combined.length > MAX_COMMAND_OUTPUT,
    });
  }

  private async saveSnapshot(): Promise<ContainerSnapshot> {
    const container = this.getContainer();

    if (!container.running) {
      throw new Error("Start the workspace before saving a snapshot");
    }

    const snapshot = await container.snapshotContainer({
      name: "bolt-workspace-checkpoint",
    });

    await this.ctx.storage.put("containerSnapshot", snapshot);
    await this.ctx.storage.put("snapshotSavedAt", Date.now());

    return snapshot;
  }

  private async preview(request: Request): Promise<Response> {
    const container = this.getContainer();
    await this.ensureRunning();

    const port = container.getTcpPort(5173);
    const url = new URL(request.url);
    const previewPath = url.pathname.replace(/^\/preview(?=\/|$)/, "") || "/";

    url.protocol = "http:";
    url.host = "container";
    url.pathname = previewPath;

    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");

    let lastError: unknown;

    // Vite may take a moment to start after the command endpoint launches it.
    for (let attempt = 0; attempt < 24; attempt += 1) {
      try {
        return await port.fetch(forwarded);
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    return json(
      {
        error: "No preview server is listening on port 5173 yet",
        detail: messageFromError(lastError),
      },
      503,
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/status") {
        const snapshot =
          await this.ctx.storage.get<ContainerSnapshot>("containerSnapshot");

        return json({
          workspace: "demo",
          containerRunning: this.getContainer().running,
          hasSnapshot: Boolean(snapshot),
          snapshotSize: snapshot?.size ?? null,
          snapshotSavedAt:
            (await this.ctx.storage.get<number>("snapshotSavedAt")) ?? null,
        });
      }

      if (request.method === "POST" && url.pathname === "/start") {
        const result = await this.ensureRunning();
        return json({ status: "starting", ...result }, 202);
      }

      if (request.method === "POST" && url.pathname === "/commands") {
        return this.runCommand(request);
      }

      if (request.method === "POST" && url.pathname === "/snapshot") {
        await this.ensureRunning();
        const snapshot = await this.saveSnapshot();

        return json({
          status: "saved",
          id: snapshot.id,
          size: snapshot.size,
          name: snapshot.name ?? null,
        });
      }

      if (request.method === "POST" && url.pathname === "/stop") {
        const snapshot = await this.saveSnapshot();
        await this.getContainer().destroy();

        return json({
          status: "stopped",
          snapshotId: snapshot.id,
          snapshotSize: snapshot.size,
        });
      }

      if (
        (request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === "/preview" || url.pathname.startsWith("/preview/"))
      ) {
        return this.preview(request);
      }

      return json({ error: "Runtime endpoint not found" }, 404);
    } catch (error) {
      return json({ error: messageFromError(error) }, 500);
    }
  }
}

export default {
  async fetch(request: Request, env: RuntimeEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        service: "bolt-workspace-runtime-poc",
        status: "ok",
      });
    }

    if (
      !env.RUNTIME_POC_TOKEN ||
      request.headers.get("authorization") !== `Bearer ${env.RUNTIME_POC_TOKEN}`
    ) {
      return json({ error: "Unauthorized" }, 401);
    }

    const match = url.pathname.match(
      /^\/v1\/workspaces\/([a-zA-Z0-9_-]{1,64})(?:\/(.*))?$/,
    );

    if (!match) {
      return json({ error: "Runtime endpoint not found" }, 404);
    }

    // Keep the first experiment deliberately limited to one workspace.
    // Multi-user IDs will be enabled only after per-user authentication,
    // quotas, and workspace isolation are integrated into Bolt.
    if (match[1] !== "demo") {
      return json({ error: "This prototype only allows the demo workspace" }, 404);
    }

    const target = new URL(request.url);
    target.pathname = `/${match[2] ?? "status"}`;

    const id = env.WORKSPACE_RUNTIME.idFromName("bolt-runtime-poc:demo");
    const stub = env.WORKSPACE_RUNTIME.get(id);

    return stub.fetch(new Request(target, request));
  },
} satisfies ExportedHandler<RuntimeEnv>;
