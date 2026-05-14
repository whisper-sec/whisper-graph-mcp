import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startHttpTransport } from "../../src/transport/http";
import type { Config } from "../../src/config";
import { FakeBackend } from "../fake-backend";

const BASE_CONFIG: Config = {
  transport: "http",
  httpHost: "127.0.0.1",
  httpPort: 0, // ephemeral port
  allowedHosts: [],
  dbUrl: "https://graph.example.test",
  apiKey: "env-fallback-key",
  queryTimeoutMs: 60000,
  dbTimeoutMs: 10000,
  logLevel: "error",
};

function addressOf(server: Server): string {
  const info = server.address() as AddressInfo;
  return `http://127.0.0.1:${info.port}`;
}

describe("HTTP transport", () => {
  let backend: FakeBackend;
  let server: Server;

  beforeEach(async () => {
    backend = new FakeBackend();
    server = await startHttpTransport({ config: BASE_CONFIG, backend });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("serves a health check", async () => {
    const response = await fetch(`${addressOf(server)}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("rejects non-POST requests to the MCP endpoint", async () => {
    const response = await fetch(`${addressOf(server)}/`, { method: "GET" });
    expect(response.status).toBe(405);
  });

  it("handles an MCP session and lists tools", async () => {
    const client = new Client({ name: "http-test", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${addressOf(server)}/`));
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain("query");

    await client.close();
  });

  it("relays an inbound X-API-Key header to the backend", async () => {
    backend.executeImpl = async () => ({ rows: [{ label: "HOSTNAME", count: 1 }] });
    const client = new Client({ name: "http-test", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${addressOf(server)}/`), {
      requestInit: { headers: { "X-API-Key": "inbound-http-key" } },
    });
    await client.connect(transport);

    await client.callTool({ name: "list_labels", arguments: {} });

    expect(backend.lastExecuteCall.credential).toEqual({
      headerName: "X-API-Key",
      headerValue: "inbound-http-key",
    });
    await client.close();
  });

  it("falls back to the env credential when no auth header is sent", async () => {
    backend.executeImpl = async () => ({ rows: [] });
    const client = new Client({ name: "http-test", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${addressOf(server)}/`));
    await client.connect(transport);

    await client.callTool({ name: "list_labels", arguments: {} });

    expect(backend.lastExecuteCall.credential).toEqual({
      headerName: "X-API-Key",
      headerValue: "env-fallback-key",
    });
    await client.close();
  });
});
