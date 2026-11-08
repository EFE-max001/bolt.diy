const baseUrl = process.env.RUNTIME_POC_URL?.replace(/\/$/, "");
const token = process.env.RUNTIME_POC_TOKEN;

if (!baseUrl || !token) {
  console.error("Set RUNTIME_POC_URL and RUNTIME_POC_TOKEN before running this test.");
  process.exit(1);
}

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

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

const workspace = "/v1/workspaces/demo";

console.log("1/5 Starting the isolated workspace...");
console.log(await call(`${workspace}/start`, { method: "POST" }));

console.log("2/5 Writing a file inside the container...");
console.log(
  await call(`${workspace}/commands`, {
    method: "POST",
    body: JSON.stringify({
      command: [
        "bash",
        "-lc",
        "mkdir -p /workspace/poc-check && printf 'snapshot-restore-ok\\n' > /workspace/poc-check/proof.txt && node --version && cat /workspace/poc-check/proof.txt",
      ],
    }),
  }),
);

console.log("3/5 Saving the workspace and stopping the container...");
console.log(await call(`${workspace}/stop`, { method: "POST" }));

console.log("4/5 Restoring the saved workspace...");
console.log(await call(`${workspace}/start`, { method: "POST" }));

console.log("5/5 Checking that the file survived the restore...");
const check = await call(`${workspace}/commands`, {
  method: "POST",
  body: JSON.stringify({
    command: ["cat", "/workspace/poc-check/proof.txt"],
  }),
});

console.log(check);

if (!check.output?.includes("snapshot-restore-ok")) {
  throw new Error("Snapshot restore check failed: the proof file was not found.");
}

console.log("PASS: the workspace file survived a container stop and restore.");
