import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/config";

describe("loadConfig", () => {
  it("applies defaults for an empty environment", () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      transport: "stdio",
      httpHost: "0.0.0.0",
      httpPort: 8080,
      allowedHosts: [],
      dbUrl: "https://graph.whisper.security",
      queryTimeoutMs: 60000,
      dbTimeoutMs: 10000,
      logLevel: "info",
    });
    expect(config.apiKey).toBeUndefined();
  });

  it("reads values from the environment", () => {
    const config = loadConfig({
      MCP_TRANSPORT: "http",
      HTTP_HOST: "127.0.0.1",
      HTTP_PORT: "9000",
      WHISPER_ALLOWED_HOSTS: "mcp.example.com, localhost",
      WHISPER_DB_URL: "https://graph.example.test",
      WHISPER_API_KEY: "secret",
      WHISPER_QUERY_TIMEOUT_MS: "30000",
      LOG_LEVEL: "debug",
    });
    expect(config.transport).toBe("http");
    expect(config.httpPort).toBe(9000);
    expect(config.allowedHosts).toEqual(["mcp.example.com", "localhost"]);
    expect(config.dbUrl).toBe("https://graph.example.test");
    expect(config.apiKey).toBe("secret");
    expect(config.queryTimeoutMs).toBe(30000);
    expect(config.logLevel).toBe("debug");
  });

  it("rejects an invalid transport", () => {
    expect(() => loadConfig({ MCP_TRANSPORT: "carrier-pigeon" })).toThrowError(
      /Invalid configuration/,
    );
  });

  it("rejects a non-numeric port", () => {
    expect(() => loadConfig({ HTTP_PORT: "not-a-port" })).toThrowError(/Invalid configuration/);
  });

  it("rejects an out-of-range port", () => {
    expect(() => loadConfig({ HTTP_PORT: "70000" })).toThrowError(/Invalid configuration/);
  });

  it("rejects a non-URL database URL", () => {
    expect(() => loadConfig({ WHISPER_DB_URL: "not a url" })).toThrowError(/Invalid configuration/);
  });

  it("rejects a non-http(s) database URL", () => {
    expect(() => loadConfig({ WHISPER_DB_URL: "ftp://graph.example.test" })).toThrowError(
      /Invalid configuration/,
    );
  });

  it("rejects an invalid log level", () => {
    expect(() => loadConfig({ LOG_LEVEL: "loud" })).toThrowError(/Invalid configuration/);
  });
});
