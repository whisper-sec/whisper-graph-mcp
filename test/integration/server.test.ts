import { describe, it, expect, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildTools, createServer } from "../../src/server";
import type { Config } from "../../src/config";
import { FakeBackend } from "../fake-backend";

const CONFIG: Config = {
  transport: "stdio",
  httpHost: "0.0.0.0",
  httpPort: 8080,
  allowedHosts: [],
  dbUrl: "https://graph.example.test",
  apiKey: "env-test-key",
  queryTimeoutMs: 60000,
  dbTimeoutMs: 10000,
  logLevel: "info",
};

async function connectClient(backend: FakeBackend): Promise<Client> {
  const deps = { config: CONFIG, backend };
  const server = createServer(deps, buildTools(deps));
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function firstText(contents: unknown[]): string {
  const first = contents[0];
  if (first && typeof first === "object" && "text" in first && typeof first.text === "string") {
    return first.text;
  }
  throw new Error("expected text content");
}

describe("MCP server (in-memory end-to-end)", () => {
  let backend: FakeBackend;

  beforeEach(() => {
    backend = new FakeBackend();
  });

  it("exposes the six read-only tools", async () => {
    const client = await connectClient(backend);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "describe_label",
      "domain_variants",
      "explain_indicator",
      "list_labels",
      "query",
      "whisper_history",
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
    }
    await client.close();
  });

  it("exposes the six resources", async () => {
    const client = await connectClient(backend);
    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri).sort()).toEqual([
      "whisper://guide/cookbook",
      "whisper://guide/functions",
      "whisper://quota",
      "whisper://schema/full",
      "whisper://schema/relationships",
      "whisper://stats",
    ]);
    await client.close();
  });

  it("exposes the eight prompt templates", async () => {
    const client = await connectClient(backend);
    const { prompts } = await client.listPrompts();
    expect(prompts).toHaveLength(8);
    expect(prompts.map((prompt) => prompt.name)).toContain("investigate-ip");
    await client.close();
  });

  it("runs a valid query through to the backend and relays the env credential", async () => {
    backend.executeImpl = async () => ({
      columns: ["name"],
      rows: [{ name: "example.com" }],
      statistics: { rowCount: 1, executionTimeMs: 3 },
    });
    const client = await connectClient(backend);

    const result = await client.callTool({
      name: "query",
      arguments: { cypher: 'MATCH (h:HOSTNAME {name: "example.com"}) RETURN h.name' },
    });

    expect(result.structuredContent).toMatchObject({ success: true, columns: ["name"] });
    expect(backend.lastExecuteCall.credential).toEqual({
      headerName: "X-API-Key",
      headerValue: "env-test-key",
    });
    await client.close();
  });

  it("rejects an invalid query without reaching the backend", async () => {
    const client = await connectClient(backend);

    const result = await client.callTool({
      name: "query",
      arguments: { cypher: "MATCH (h:HOSTNAME) RETURN h.name LIMIT 10" },
    });

    expect(result.structuredContent).toMatchObject({
      success: false,
      errorCode: "VALIDATION_REJECTED",
    });
    expect(result.isError).toBe(true);
    expect(backend.executeCalls).toHaveLength(0);
    await client.close();
  });

  it("runs list_labels", async () => {
    backend.executeImpl = async () => ({ rows: [{ label: "HOSTNAME", count: 2_600_000_000 }] });
    const client = await connectClient(backend);

    const result = await client.callTool({ name: "list_labels", arguments: {} });

    expect(result.structuredContent).toEqual({
      labels: [{ label: "HOSTNAME", count: 2_600_000_000 }],
    });
    await client.close();
  });

  it("runs explain_indicator with the indicator bound as a parameter", async () => {
    backend.executeImpl = async () => ({ rows: [{ indicator: "8.8.8.8", level: "NONE" }] });
    const client = await connectClient(backend);

    const result = await client.callTool({
      name: "explain_indicator",
      arguments: { indicator: "8.8.8.8" },
    });

    expect(result.structuredContent).toEqual({ rows: [{ indicator: "8.8.8.8", level: "NONE" }] });
    expect(backend.lastExecuteCall.cypher).toBe("CALL explain($indicator)");
    expect(backend.lastExecuteCall.parameters).toEqual({ indicator: "8.8.8.8" });
    await client.close();
  });

  it("reads a static markdown resource", async () => {
    const client = await connectClient(backend);
    const result = await client.readResource({ uri: "whisper://schema/full" });
    expect(result.contents[0]?.mimeType).toBe("text/markdown");
    expect(firstText(result.contents)).toContain("WhisperGraph");
    await client.close();
  });

  it("reads the dynamic stats resource from the backend", async () => {
    backend.statsImpl = async () => ({
      total: { nodeCount: 100, edgeCount: 200 },
      objectCount: 50,
    });
    const client = await connectClient(backend);

    const result = await client.readResource({ uri: "whisper://stats" });

    expect(JSON.parse(firstText(result.contents))).toMatchObject({
      total: { nodeCount: 100, edgeCount: 200 },
    });
    await client.close();
  });

  it("flattens the dynamic quota resource", async () => {
    backend.executeImpl = async () => ({
      rows: [
        { key: "plan", value: "free" },
        { key: "maxDepth", value: 3 },
      ],
    });
    const client = await connectClient(backend);

    const result = await client.readResource({ uri: "whisper://quota" });

    expect(JSON.parse(firstText(result.contents))).toEqual({ plan: "free", maxDepth: 3 });
    await client.close();
  });

  it("interpolates a prompt argument", async () => {
    const client = await connectClient(backend);
    const result = await client.getPrompt({
      name: "investigate-ip",
      arguments: { ip: "203.0.113.7" },
    });
    const message = result.messages[0];
    expect(message?.content.type).toBe("text");
    if (message?.content.type === "text") {
      expect(message.content.text).toContain("203.0.113.7");
    }
    await client.close();
  });
});
