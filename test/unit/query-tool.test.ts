import { describe, it, expect, beforeEach } from "vitest";
import { QueryTool } from "../../src/tools/query-tool";
import { CypherQueryValidator } from "../../src/query/cypher-query-validator";
import { CypherExecutionException, WhisperDbException } from "../../src/backend/errors";
import { FakeBackend } from "../fake-backend";

const CREDENTIAL = { headerName: "X-API-Key", headerValue: "test-key" };

describe("QueryTool", () => {
  let backend: FakeBackend;
  let tool: QueryTool;

  beforeEach(() => {
    backend = new FakeBackend();
    tool = new QueryTool(backend, new CypherQueryValidator(), 60000);
  });

  it("validates, executes, and transforms a valid query", async () => {
    backend.executeImpl = async () => ({
      columns: ["name"],
      rows: [{ name: "example.com" }],
      statistics: { rowCount: 1, executionTimeMs: 4 },
    });

    const result = await tool.run(
      'MATCH (h:HOSTNAME {name: "example.com"}) RETURN h.name',
      CREDENTIAL,
    );

    expect(result.success).toBe(true);
    expect(result.columns).toEqual(["name"]);
    expect(result.rows).toEqual([{ name: "example.com" }]);
    expect(result.statistics).toEqual({ rowCount: 1, executionTimeMs: 4 });
    expect(backend.lastExecuteCall.cypher).toBe(
      'MATCH (h:HOSTNAME {name: "example.com"}) RETURN h.name',
    );
    expect(backend.lastExecuteCall.credential).toBe(CREDENTIAL);
  });

  it("rejects an invalid query without calling the backend", async () => {
    const result = await tool.run("MATCH (h:HOSTNAME) RETURN h.name LIMIT 10", CREDENTIAL);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("VALIDATION_REJECTED");
    expect(result.retryable).toBe(false);
    expect(result.error).toContain("anchor");
    expect(backend.executeCalls).toHaveLength(0);
  });

  it("defaults missing columns and rows to empty arrays", async () => {
    backend.executeImpl = async () => ({});

    const result = await tool.run('MATCH (h:HOSTNAME {name: "x"}) RETURN h.name', CREDENTIAL);

    expect(result.success).toBe(true);
    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("classifies a timeout as DB_TIMEOUT and retryable", async () => {
    backend.executeImpl = async () => {
      throw new CypherExecutionException("Query timed out after 60000ms");
    };

    const result = await tool.run('MATCH (h:HOSTNAME {name: "x"}) RETURN h.name', CREDENTIAL);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("DB_TIMEOUT");
    expect(result.retryable).toBe(true);
    expect(result.error).toBe("Query timed out after 60000ms");
  });

  it("classifies a budget breach as QUERY_TOO_EXPENSIVE", async () => {
    backend.executeImpl = async () => {
      throw new CypherExecutionException("row budget exceeded");
    };

    const result = await tool.run('MATCH (h:HOSTNAME {name: "x"}) RETURN h.name', CREDENTIAL);

    expect(result.errorCode).toBe("QUERY_TOO_EXPENSIVE");
    expect(result.retryable).toBe(false);
  });

  it("classifies an unknown execution error as a syntax error", async () => {
    backend.executeImpl = async () => {
      throw new CypherExecutionException("Unknown function frob()");
    };

    const result = await tool.run('MATCH (h:HOSTNAME {name: "x"}) RETURN h.name', CREDENTIAL);

    expect(result.errorCode).toBe("CYPHER_SYNTAX_ERROR");
    expect(result.retryable).toBe(false);
  });

  it("maps a backend failure to DB_UNAVAILABLE and retryable", async () => {
    backend.executeImpl = async () => {
      throw new WhisperDbException("unreachable");
    };

    const result = await tool.run('MATCH (h:HOSTNAME {name: "x"}) RETURN h.name', CREDENTIAL);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("DB_UNAVAILABLE");
    expect(result.retryable).toBe(true);
  });

  it("relays a null credential to the backend", async () => {
    await tool.run('MATCH (h:HOSTNAME {name: "x"}) RETURN h.name', null);
    expect(backend.lastExecuteCall.credential).toBeNull();
  });
});
