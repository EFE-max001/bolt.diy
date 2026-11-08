const baseUrl = process.env.RUNTIME_POC_URL?.replace(/\/$/, "");
const token = process.env.RUNTIME_POC_TOKEN;

if (!baseUrl || !token) {
  console.error("Set RUNTIME_POC_URL and RUNTIME_POC_TOKEN before running this test.");
  process.exit(1);
}

const workspace = "/v1/workspaces/demo";

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...options.headers,
    },
  });

  const text = await response.text();
  let body;

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  return { response, body };
}

async function command(args) {
  const { response, body } = await call(`${workspace}/commands`, {
    method: "POST",
    body: JSON.stringify({ command: args }),
  });

  if (!response.ok || body.exitCode !== 0) {
    throw new Error(
      `Command failed (${response.status}, exit ${body.exitCode}): ${body.output ?? JSON.stringify(body)}`,
    );
  }

  return body;
}

const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

let workspaceStarted = false;

try {
  console.log("1/6 Starting the demo workspace...");
  const started = await call(`${workspace}/start`, { method: "POST" });
  if (!started.response.ok) {
    throw new Error(JSON.stringify(started.body));
  }
  workspaceStarted = true;
  console.log(started.body);

  console.log("2/6 Creating a Vite + React project and installing dependencies...");
  const bootstrap = await command([
    "bash",
    "-lc",
    "mkdir -p /workspace && nohup bash -lc 'cd /workspace && npm create vite@latest preview-demo -- --template react && cd /workspace/preview-demo && npm install' > /tmp/vite-bootstrap.log 2>&1 < /dev/null & echo $!",
  ]);
  console.log(`Bootstrap process: ${bootstrap.output.trim()}`);

  let installed = false;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const check = await call(`${workspace}/commands`, {
      method: "POST",
      body: JSON.stringify({
        command: [
          "bash",
          "-lc",
          "test -x /workspace/preview-demo/node_modules/.bin/vite && echo READY",
        ],
      }),
    });

    if (check.response.ok && check.body.exitCode === 0 && check.body.output?.includes("READY")) {
      installed = true;
      break;
    }

    await pause(2_000);
  }

  if (!installed) {
    const logs = await command([
      "bash",
      "-lc",
      "tail -n 60 /tmp/vite-bootstrap.log",
    ]);
    throw new Error(`Vite installation did not finish. Logs:\n${logs.output}`);
  }

  console.log("3/6 Starting the Vite server on port 5173...");
  const server = await command([
    "bash",
    "-lc",
    "cd /workspace/preview-demo && nohup npm run dev -- --host 0.0.0.0 --port 5173 --strictPort > /tmp/vite.log 2>&1 < /dev/null & echo $!",
  ]);
  console.log(`Vite process: ${server.output.trim()}`);

  console.log("4/6 Checking that the Worker can reach the Vite preview...");
  let previewReady = false;

  for (let attempt = 0; attempt < 45; attempt += 1) {
    const { response, body } = await call(`${workspace}/preview/`);
    const page = typeof body.raw === "string" ? body.raw : "";

    if (response.ok && page.includes('id="root"')) {
      previewReady = true;
      break;
    }

    await pause(2_000);
  }

  if (!previewReady) {
    const logs = await command(["bash", "-lc", "tail -n 80 /tmp/vite.log"]);
    throw new Error(`Preview did not become ready. Vite logs:\n${logs.output}`);
  }

  console.log("5/6 Editing a React component and checking the updated module...");
  await command([
    "bash",
    "-lc",
    "sed -i 's/Vite + React/Live preview changed/' /workspace/preview-demo/src/App.jsx",
  ]);

  const module = await call(`${workspace}/preview/src/App.jsx`);
  const moduleText =
    typeof module.body.raw === "string"
      ? module.body.raw
      : JSON.stringify(module.body);

  if (!module.response.ok || !moduleText.includes("Live preview changed")) {
    throw new Error("The preview did not return the updated React component.");
  }

  console.log("6/6 Saving, stopping, restoring, and checking the edited file...");
  const stopped = await call(`${workspace}/stop`, { method: "POST" });
  if (!stopped.response.ok) {
    throw new Error(JSON.stringify(stopped.body));
  }

  workspaceStarted = false;
  console.log(stopped.body);

  const restored = await call(`${workspace}/start`, { method: "POST" });
  if (!restored.response.ok) {
    throw new Error(JSON.stringify(restored.body));
  }
  workspaceStarted = true;
  console.log(restored.body);

  const persisted = await command([
    "grep",
    "-n",
    "Live preview changed",
    "/workspace/preview-demo/src/App.jsx",
  ]);

  if (!persisted.output.includes("Live preview changed")) {
    throw new Error("The edited component did not survive the snapshot restore.");
  }

  console.log(persisted.output);
  console.log("PASS: Vite preview, source editing, and snapshot restore all worked.");
} finally {
  // Save progress and stop the billable container when the test finishes.
  if (workspaceStarted) {
    try {
      const stopped = await call(`${workspace}/stop`, { method: "POST" });
      console.log("Workspace saved and stopped:", stopped.body);
    } catch (error) {
      console.error("Could not stop the workspace automatically:", error);
    }
  }
}
