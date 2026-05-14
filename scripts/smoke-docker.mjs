/**
 * Docker integration smoke test: builds and runs the container in HTTP mode,
 * then exercises every tool, resource, and prompt against the live hosted
 * WhisperGraph API through a real MCP client.
 *
 * It also verifies the credential relay end-to-end: a request with an inbound
 * `X-API-Key` header, one with `Authorization: Bearer`, and one with no header
 * at all (which must fall back to the container's `WHISPER_API_KEY`).
 *
 * Usage:  node scripts/smoke-docker.mjs
 *   Reads configuration from .env.local (WHISPER_API_KEY is required and is
 *   never printed). Set KEEP_CONTAINER=1 to leave the container running for
 *   manual inspection afterwards.
 *
 * This is maintainer tooling — it needs Docker and a real API key, so it is
 * deliberately not part of CI (CI runs with zero secrets).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const IMAGE = "whisper-graph-mcp:smoke";
const CONTAINER = "whisper-graph-mcp-smoke";
const HOST_PORT = 8080;
const BASE_URL = `http://127.0.0.1:${HOST_PORT}`;

// ---- Load .env.local --------------------------------------------------------

function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    console.error("Could not read .env.local — copy .env.example and set WHISPER_API_KEY.");
    process.exit(1);
  }
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const envLocal = loadEnvLocal();
const apiKey = envLocal.WHISPER_API_KEY;
if (!apiKey) {
  console.error("WHISPER_API_KEY is not set in .env.local.");
  process.exit(1);
}
const dbUrl = envLocal.WHISPER_DB_URL || "https://graph.whisper.security";

// ---- Result tracking --------------------------------------------------------

let failures = 0;
const pass = (label, detail) => console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
const fail = (label, detail) => {
  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
};

async function check(label, fn) {
  try {
    const detail = await fn();
    pass(label, detail);
  } catch (error) {
    fail(label, error instanceof Error ? error.message : String(error));
  }
}

function structured(result) {
  if (result.isError) {
    throw new Error(JSON.stringify(result.structuredContent ?? result.content));
  }
  return result.structuredContent ?? {};
}

// ---- Docker lifecycle -------------------------------------------------------

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function removeContainer() {
  spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf8" });
}

async function waitForHealth(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) {
        const body = await response.json();
        if (body.status === "ok") return;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  // Surface container logs to make a startup failure debuggable.
  const logs = spawnSync("docker", ["logs", CONTAINER], { encoding: "utf8" });
  throw new Error(
    `Container did not become healthy within ${timeoutMs}ms.\n${logs.stderr || logs.stdout}`,
  );
}

// ---- MCP client helper ------------------------------------------------------

/** Opens an MCP client over Streamable HTTP, optionally with an inbound auth header. */
async function withClient(headers, fn) {
  const client = new Client({ name: "smoke-docker", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE_URL}/`), {
    requestInit: headers ? { headers } : undefined,
  });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

// ---- Main -------------------------------------------------------------------

async function main() {
  console.log("Building Docker image...");
  run("docker", ["build", "-t", IMAGE, "."], { cwd: new URL("..", import.meta.url).pathname });

  console.log("Starting container (HTTP mode)...");
  removeContainer();
  run("docker", [
    "run",
    "-d",
    "--name",
    CONTAINER,
    "-p",
    `${HOST_PORT}:8080`,
    "-e",
    "MCP_TRANSPORT=http",
    "-e",
    `WHISPER_API_KEY=${apiKey}`,
    "-e",
    `WHISPER_DB_URL=${dbUrl}`,
    "-e",
    "LOG_LEVEL=warn",
    IMAGE,
  ]);

  await waitForHealth();
  console.log(`Container healthy at ${BASE_URL}\n`);

  // ---- Protocol surface -----------------------------------------------------

  await withClient(null, async (client) => {
    const { tools } = await client.listTools();
    const { resources } = await client.listResources();
    const { prompts } = await client.listPrompts();
    console.log(
      `Discovered ${tools.length} tools, ${resources.length} resources, ${prompts.length} prompts.\n`,
    );
    if (tools.length !== 6) fail("tool count", `expected 6, got ${tools.length}`);
    if (resources.length !== 6) fail("resource count", `expected 6, got ${resources.length}`);
    if (prompts.length !== 8) fail("prompt count", `expected 8, got ${prompts.length}`);

    for (const tool of tools) {
      if (tool.annotations?.readOnlyHint !== true || tool.annotations?.destructiveHint !== false) {
        fail("tool annotations", `${tool.name} is missing read-only/non-destructive hints`);
      }
    }
  });

  // ---- Tools (against the real hosted API) ----------------------------------

  console.log("Tools:");

  await check("list_labels", async () =>
    withClient(null, async (client) => {
      const out = structured(await client.callTool({ name: "list_labels", arguments: {} }));
      const count = out.labels?.length ?? 0;
      if (count === 0) throw new Error("no labels returned");
      return `${count} labels`;
    }),
  );

  await check("describe_label HOSTNAME", async () =>
    withClient(null, async (client) => {
      const out = structured(
        await client.callTool({ name: "describe_label", arguments: { label: "HOSTNAME" } }),
      );
      if (!out.exists) throw new Error("HOSTNAME reported as not existing");
      return `count=${out.count}, ${out.properties?.length ?? 0} properties`;
    }),
  );

  await check("query (anchored lookup)", async () =>
    withClient(null, async (client) => {
      const out = structured(
        await client.callTool({
          name: "query",
          arguments: {
            cypher:
              'MATCH (h:HOSTNAME {name: "www.google.com"})-[:RESOLVES_TO]->(ip:IPV4) RETURN ip.name LIMIT 5',
          },
        }),
      );
      if (!out.success) throw new Error(out.error);
      return `${out.rows?.length ?? 0} rows`;
    }),
  );

  await check("query (validator rejects unanchored scan)", async () =>
    withClient(null, async (client) => {
      const result = await client.callTool({
        name: "query",
        arguments: { cypher: "MATCH (h:HOSTNAME) RETURN h.name LIMIT 10" },
      });
      const out = result.structuredContent ?? {};
      if (out.success) throw new Error("expected validation rejection");
      if (out.errorCode !== "VALIDATION_REJECTED") {
        throw new Error(`unexpected errorCode ${out.errorCode}`);
      }
      return `rejected by ${out.errorCode}`;
    }),
  );

  await check("explain_indicator 8.8.8.8", async () =>
    withClient(null, async (client) => {
      const out = structured(
        await client.callTool({ name: "explain_indicator", arguments: { indicator: "8.8.8.8" } }),
      );
      const row = out.rows?.[0] ?? {};
      return `level=${row.level ?? "n/a"}, available=${row.available}`;
    }),
  );

  await check("whisper_history 8.8.8.8", async () =>
    withClient(null, async (client) => {
      const out = structured(
        await client.callTool({ name: "whisper_history", arguments: { indicator: "8.8.8.8" } }),
      );
      return `${out.rows?.length ?? 0} rows`;
    }),
  );

  await check("domain_variants google.com", async () =>
    withClient(null, async (client) => {
      const out = structured(
        await client.callTool({ name: "domain_variants", arguments: { name: "google.com" } }),
      );
      return `${out.rows?.length ?? 0} variants`;
    }),
  );

  // ---- Resources ------------------------------------------------------------

  console.log("\nResources:");

  await check("whisper://stats", async () =>
    withClient(null, async (client) => {
      const result = await client.readResource({ uri: "whisper://stats" });
      const stats = JSON.parse(result.contents[0].text);
      if (stats.error) throw new Error(stats.error);
      return `nodes total=${stats.total?.nodeCount ?? "?"}, edges total=${stats.total?.edgeCount ?? "?"}`;
    }),
  );

  await check("whisper://quota", async () =>
    withClient(null, async (client) => {
      const result = await client.readResource({ uri: "whisper://quota" });
      const quota = JSON.parse(result.contents[0].text);
      if (quota.error) throw new Error(quota.error);
      return Object.keys(quota).join(", ") || "(empty)";
    }),
  );

  for (const uri of [
    "whisper://schema/full",
    "whisper://schema/relationships",
    "whisper://guide/functions",
    "whisper://guide/cookbook",
  ]) {
    await check(uri, async () =>
      withClient(null, async (client) => {
        const result = await client.readResource({ uri });
        const len = result.contents[0].text.length;
        if (len < 100) throw new Error("resource content too short");
        return `${len} chars`;
      }),
    );
  }

  // ---- Prompts --------------------------------------------------------------

  console.log("\nPrompts:");

  await check("investigate-ip prompt", async () =>
    withClient(null, async (client) => {
      const result = await client.getPrompt({
        name: "investigate-ip",
        arguments: { ip: "8.8.8.8" },
      });
      const text = result.messages[0]?.content?.text ?? "";
      if (!text.includes("8.8.8.8")) throw new Error("argument not interpolated");
      return `${result.messages.length} message(s)`;
    }),
  );

  await check("all 8 prompts interpolate", async () =>
    withClient(null, async (client) => {
      const { prompts } = await client.listPrompts();
      for (const prompt of prompts) {
        const args = {};
        for (const arg of prompt.arguments ?? []) {
          args[arg.name] = "example.com";
        }
        const result = await client.getPrompt({ name: prompt.name, arguments: args });
        if (!result.messages?.length) throw new Error(`${prompt.name} returned no messages`);
      }
      return `${prompts.length} prompts produced messages`;
    }),
  );

  // ---- Credential relay -----------------------------------------------------

  console.log("\nCredential relay:");

  await check("inbound X-API-Key header is relayed", async () =>
    withClient({ "X-API-Key": apiKey }, async (client) => {
      const out = structured(await client.callTool({ name: "list_labels", arguments: {} }));
      if ((out.labels?.length ?? 0) === 0) throw new Error("no labels returned");
      return "accepted";
    }),
  );

  await check("inbound Authorization: Bearer header is relayed", async () =>
    withClient({ Authorization: `Bearer ${apiKey}` }, async (client) => {
      const out = structured(await client.callTool({ name: "list_labels", arguments: {} }));
      if ((out.labels?.length ?? 0) === 0) throw new Error("no labels returned");
      return "accepted";
    }),
  );

  await check("no header falls back to WHISPER_API_KEY env", async () =>
    withClient(null, async (client) => {
      const out = structured(await client.callTool({ name: "list_labels", arguments: {} }));
      if ((out.labels?.length ?? 0) === 0) throw new Error("no labels returned");
      return "env fallback accepted";
    }),
  );
}

main()
  .catch((error) => {
    failures += 1;
    console.error(`\nFATAL: ${error instanceof Error ? error.stack : String(error)}`);
  })
  .finally(() => {
    if (process.env.KEEP_CONTAINER === "1") {
      console.log(`\nKEEP_CONTAINER=1 — leaving "${CONTAINER}" running on ${BASE_URL}`);
    } else {
      removeContainer();
    }
    console.log(
      `\n${failures === 0 ? "All Docker smoke checks passed." : `${failures} check(s) FAILED.`}`,
    );
    process.exit(failures === 0 ? 0 : 1);
  });
