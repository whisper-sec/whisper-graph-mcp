import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HostedBackend, type HostedBackendOptions } from "../../src/backend/hosted-backend";
import { CypherExecutionException, WhisperDbException } from "../../src/backend/errors";

const OPTIONS: HostedBackendOptions = {
  baseUrl: "https://graph.example.test",
  queryTimeoutMs: 60000,
  statsTimeoutMs: 10000,
  userAgent: "whisper-graph-mcp/test",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function lastRequest(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  return { url: call[0] as string, init: call[1] as RequestInit };
}

describe("HostedBackend", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("execute", () => {
    it("posts the query to /api/query and returns the parsed response", async () => {
      const raw = {
        columns: ["name"],
        rows: [{ name: "example.com" }],
        statistics: { rowCount: 1, executionTimeMs: 7 },
      };
      fetchMock.mockResolvedValue(jsonResponse(raw));

      const backend = new HostedBackend(OPTIONS);
      const result = await backend.execute("MATCH (h:HOSTNAME) RETURN h.name LIMIT 1", undefined, {
        headerName: "X-API-Key",
        headerValue: "secret-key",
      });

      expect(result).toEqual(raw);
      const { url, init } = lastRequest(fetchMock);
      expect(url).toBe("https://graph.example.test/api/query");
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ query: "MATCH (h:HOSTNAME) RETURN h.name LIMIT 1", timeout: 60000 });
      const headers = init.headers as Record<string, string>;
      expect(headers["X-API-Key"]).toBe("secret-key");
      expect(headers["User-Agent"]).toBe("whisper-graph-mcp/test");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("includes parameters in the request body when provided", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ columns: [], rows: [], statistics: { rowCount: 0, executionTimeMs: 1 } }),
      );

      const backend = new HostedBackend(OPTIONS);
      await backend.execute("CALL explain($indicator)", { indicator: "8.8.8.8" }, null);

      const body = JSON.parse(lastRequest(fetchMock).init.body as string);
      expect(body.parameters).toEqual({ indicator: "8.8.8.8" });
    });

    it("omits the parameters key when the map is empty", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ columns: [], rows: [], statistics: { rowCount: 0, executionTimeMs: 1 } }),
      );

      const backend = new HostedBackend(OPTIONS);
      await backend.execute("MATCH (h:HOSTNAME {name: 'x'}) RETURN h", {}, null);

      const body = JSON.parse(lastRequest(fetchMock).init.body as string);
      expect(body).not.toHaveProperty("parameters");
    });

    it("relays an Authorization credential", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ columns: [], rows: [], statistics: { rowCount: 0, executionTimeMs: 1 } }),
      );

      const backend = new HostedBackend(OPTIONS);
      await backend.execute("MATCH (h:HOSTNAME {name: 'x'}) RETURN h", undefined, {
        headerName: "Authorization",
        headerValue: "Bearer token-123",
      });

      const headers = lastRequest(fetchMock).init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer token-123");
      expect(headers).not.toHaveProperty("X-API-Key");
    });

    it("sends no auth header when there is no credential", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ columns: [], rows: [], statistics: { rowCount: 0, executionTimeMs: 1 } }),
      );

      const backend = new HostedBackend(OPTIONS);
      await backend.execute("MATCH (h:HOSTNAME {name: 'x'}) RETURN h", undefined, null);

      const headers = lastRequest(fetchMock).init.headers as Record<string, string>;
      expect(headers).not.toHaveProperty("X-API-Key");
      expect(headers).not.toHaveProperty("Authorization");
    });

    it("strips a trailing slash from the base URL", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ columns: [], rows: [], statistics: { rowCount: 0, executionTimeMs: 1 } }),
      );

      const backend = new HostedBackend({ ...OPTIONS, baseUrl: "https://graph.example.test/" });
      await backend.execute("MATCH (h:HOSTNAME {name: 'x'}) RETURN h", undefined, null);

      expect(lastRequest(fetchMock).url).toBe("https://graph.example.test/api/query");
    });

    it("throws CypherExecutionException with the extracted message on HTTP 400", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ detail: "Unknown label FOO" }, 400));

      const backend = new HostedBackend(OPTIONS);
      await expect(
        backend.execute("MATCH (n:FOO {name: 'x'}) RETURN n", undefined, null),
      ).rejects.toThrowError(new CypherExecutionException("Unknown label FOO"));
    });

    it("throws a timeout CypherExecutionException on HTTP 408", async () => {
      fetchMock.mockResolvedValue(new Response("", { status: 408 }));

      const backend = new HostedBackend(OPTIONS);
      await expect(
        backend.execute("MATCH (h:HOSTNAME {name: 'x'}) RETURN h", undefined, null),
      ).rejects.toMatchObject({
        name: "CypherExecutionException",
        message: "Query timed out after 60000ms",
      });
    });

    it("throws a timeout CypherExecutionException on HTTP 504", async () => {
      fetchMock.mockResolvedValue(new Response("", { status: 504 }));

      const backend = new HostedBackend(OPTIONS);
      await expect(
        backend.execute("MATCH (h:HOSTNAME {name: 'x'}) RETURN h", undefined, null),
      ).rejects.toBeInstanceOf(CypherExecutionException);
    });

    it("throws CypherExecutionException on an unexpected status without echoing the raw body", async () => {
      // A non-JSON upstream body (HTML error page, stack trace, ...) must not be
      // relayed verbatim to the MCP client.
      fetchMock.mockResolvedValue(
        new Response("<html><body>internal stack trace</body></html>", { status: 502 }),
      );

      const backend = new HostedBackend(OPTIONS);
      await expect(
        backend.execute("MATCH (h:HOSTNAME {name: 'x'}) RETURN h", undefined, null),
      ).rejects.toMatchObject({
        name: "CypherExecutionException",
        message: "Unexpected response status 502: Query execution failed",
      });
    });

    it("surfaces a structured RFC 7807 detail on an unexpected status", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ detail: "rate limit exceeded" }, 429));

      const backend = new HostedBackend(OPTIONS);
      await expect(
        backend.execute("MATCH (h:HOSTNAME {name: 'x'}) RETURN h", undefined, null),
      ).rejects.toMatchObject({
        name: "CypherExecutionException",
        message: "Unexpected response status 429: rate limit exceeded",
      });
    });

    it("maps an aborted request to a timeout CypherExecutionException", async () => {
      const abortError = new Error("This operation was aborted");
      abortError.name = "AbortError";
      fetchMock.mockRejectedValue(abortError);

      const backend = new HostedBackend(OPTIONS);
      await expect(
        backend.execute("MATCH (h:HOSTNAME {name: 'x'}) RETURN h", undefined, null),
      ).rejects.toMatchObject({
        name: "CypherExecutionException",
        message: "Query timed out after 60000ms",
      });
    });

    it("maps a network failure to a WhisperDbException", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

      const backend = new HostedBackend(OPTIONS);
      await expect(
        backend.execute("MATCH (h:HOSTNAME {name: 'x'}) RETURN h", undefined, null),
      ).rejects.toBeInstanceOf(WhisperDbException);
    });

    it("maps an unparseable 200 body to a WhisperDbException", async () => {
      fetchMock.mockResolvedValue(new Response("not json", { status: 200 }));

      const backend = new HostedBackend(OPTIONS);
      await expect(
        backend.execute("MATCH (h:HOSTNAME {name: 'x'}) RETURN h", undefined, null),
      ).rejects.toBeInstanceOf(WhisperDbException);
    });
  });

  describe("getStats", () => {
    it("fetches /api/query/stats and returns the parsed response", async () => {
      const stats = { total: { nodeCount: 100, edgeCount: 200 }, objectCount: 50 };
      fetchMock.mockResolvedValue(jsonResponse(stats));

      const backend = new HostedBackend(OPTIONS);
      const result = await backend.getStats({ headerName: "X-API-Key", headerValue: "secret-key" });

      expect(result).toEqual(stats);
      const { url, init } = lastRequest(fetchMock);
      expect(url).toBe("https://graph.example.test/api/query/stats");
      expect(init.method).toBe("GET");
      expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("secret-key");
    });

    it("throws a WhisperDbException on a non-200 status", async () => {
      fetchMock.mockResolvedValue(new Response("nope", { status: 503 }));

      const backend = new HostedBackend(OPTIONS);
      await expect(backend.getStats(null)).rejects.toBeInstanceOf(WhisperDbException);
    });

    it("throws a WhisperDbException on a network failure", async () => {
      fetchMock.mockRejectedValue(new Error("ENOTFOUND"));

      const backend = new HostedBackend(OPTIONS);
      await expect(backend.getStats(null)).rejects.toBeInstanceOf(WhisperDbException);
    });
  });
});
