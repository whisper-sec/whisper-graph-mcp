/**
 * Manual smoke test against the live hosted WhisperGraph API.
 *
 * Usage:  WHISPER_API_KEY=<key> node scripts/smoke-hosted.mjs
 *
 * Spawns the built server (dist/index.js) over stdio, connects a real MCP
 * client, and exercises every tool, resource, and prompt against the hosted
 * API. The API key is read from the environment and is never printed.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const apiKey = process.env.WHISPER_API_KEY;
if (!apiKey) {
  console.error("Set WHISPER_API_KEY to run the hosted smoke test.");
  process.exit(1);
}

let failures = 0;
const pass = (label, detail) => console.log(`  PASS  ${label}${detail ? ` - ${detail}` : ""}`);
const fail = (label, detail) => {
  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ""}`);
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

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, WHISPER_API_KEY: apiKey, LOG_LEVEL: "warn" },
});
const client = new Client({ name: "smoke-hosted", version: "0.0.0" });

await client.connect(transport);
console.log("Connected to whisper-graph-mcp over stdio.\n");

const { tools } = await client.listTools();
const { resources } = await client.listResources();
const { prompts } = await client.listPrompts();
console.log(
  `Discovered ${tools.length} tools, ${resources.length} resources, ${prompts.length} prompts.\n`,
);
if (tools.length !== 8) fail("tool count", `expected 8, got ${tools.length}`);
if (resources.length !== 6) fail("resource count", `expected 6, got ${resources.length}`);
if (prompts.length !== 8) fail("prompt count", `expected 8, got ${prompts.length}`);

console.log("Tools:");

await check("list_labels", async () => {
  const out = structured(await client.callTool({ name: "list_labels", arguments: {} }));
  const count = out.labels?.length ?? 0;
  if (count === 0) throw new Error("no labels returned");
  return `${count} labels`;
});

await check("describe_label HOSTNAME", async () => {
  const out = structured(
    await client.callTool({ name: "describe_label", arguments: { label: "HOSTNAME" } }),
  );
  if (!out.exists) throw new Error("HOSTNAME reported as not existing");
  return `count=${out.count}, ${out.properties?.length ?? 0} properties`;
});

await check("query (anchored lookup)", async () => {
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
});

await check("query (validator rejects unanchored scan)", async () => {
  // A validation rejection is the expected outcome here, so read the structured
  // content directly rather than going through structured() (which throws on isError).
  const result = await client.callTool({
    name: "query",
    arguments: { cypher: "MATCH (h:HOSTNAME) RETURN h.name LIMIT 10" },
  });
  const out = result.structuredContent ?? {};
  if (out.success) throw new Error("expected validation rejection");
  if (out.errorCode !== "VALIDATION_REJECTED")
    throw new Error(`unexpected errorCode ${out.errorCode}`);
  return `rejected by ${out.errorCode}`;
});

await check("explain_indicator 8.8.8.8", async () => {
  const out = structured(
    await client.callTool({ name: "explain_indicator", arguments: { indicator: "8.8.8.8" } }),
  );
  const row = out.rows?.[0] ?? {};
  return `level=${row.level ?? "n/a"}, available=${row.available}`;
});

await check("whisper_history 8.8.8.8", async () => {
  const out = structured(
    await client.callTool({ name: "whisper_history", arguments: { indicator: "8.8.8.8" } }),
  );
  return `${out.rows?.length ?? 0} rows`;
});

await check("domain_variants google.com", async () => {
  const out = structured(
    await client.callTool({ name: "domain_variants", arguments: { name: "google.com" } }),
  );
  return `${out.rows?.length ?? 0} variants`;
});

await check("list_recipes", async () => {
  const out = structured(await client.callTool({ name: "list_recipes", arguments: {} }));
  const count = out.recipes?.length ?? 0;
  if (count === 0) throw new Error("no recipes returned");
  return `${count} recipes`;
});

await check("run_recipe assess (direct, keyless)", async () => {
  const out = structured(
    await client.callTool({
      name: "run_recipe",
      arguments: { recipe: "assess", inputs: { v: "8.8.8.8" } },
    }),
  );
  if (!out.success) throw new Error(out.error);
  return `mode=${out.mode}, ${out.rows?.length ?? 0} rows`;
});

await check("run_recipe typosquat (flow, keyed)", async () => {
  const out = structured(
    await client.callTool({
      name: "run_recipe",
      arguments: { recipe: "typosquat", inputs: { domain: "paypal.com" } },
    }),
  );
  if (!out.success) throw new Error(out.error);
  return `mode=${out.mode}, ${out.steps?.length ?? 0} steps, ${out.totalLatencyMs}ms`;
});

console.log("\nResources:");

await check("whisper://stats", async () => {
  const result = await client.readResource({ uri: "whisper://stats" });
  const stats = JSON.parse(result.contents[0].text);
  if (stats.error) throw new Error(stats.error);
  return `nodes total=${stats.total?.nodeCount ?? "?"}, edges total=${stats.total?.edgeCount ?? "?"}`;
});

await check("whisper://quota", async () => {
  const result = await client.readResource({ uri: "whisper://quota" });
  const quota = JSON.parse(result.contents[0].text);
  if (quota.error) throw new Error(quota.error);
  return Object.keys(quota).join(", ") || "(empty)";
});

await check("whisper://schema/full", async () => {
  const result = await client.readResource({ uri: "whisper://schema/full" });
  const len = result.contents[0].text.length;
  if (len < 100) throw new Error("schema content too short");
  return `${len} chars`;
});

console.log("\nPrompts:");

await check("investigate-ip prompt", async () => {
  const result = await client.getPrompt({ name: "investigate-ip", arguments: { ip: "8.8.8.8" } });
  const text = result.messages[0]?.content?.text ?? "";
  if (!text.includes("8.8.8.8")) throw new Error("argument not interpolated");
  return `${result.messages.length} message(s)`;
});

await client.close();

console.log(
  `\n${failures === 0 ? "All hosted smoke checks passed." : `${failures} check(s) FAILED.`}`,
);
process.exit(failures === 0 ? 0 : 1);
