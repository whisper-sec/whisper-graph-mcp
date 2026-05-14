import { describe, it, expect } from "vitest";
import {
  CypherExecutionException,
  WhisperDbException,
  extractErrorMessage,
  classifyExecutionError,
} from "../../src/backend/errors";

describe("error classes", () => {
  it("CypherExecutionException is an Error with the right name", () => {
    const error = new CypherExecutionException("boom");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CypherExecutionException");
    expect(error.message).toBe("boom");
  });

  it("WhisperDbException is an Error with the right name and carries a cause", () => {
    const cause = new Error("socket closed");
    const error = new WhisperDbException("unreachable", { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("WhisperDbException");
    expect(error.cause).toBe(cause);
  });
});

describe("extractErrorMessage", () => {
  it("prefers the RFC 7807 detail field", () => {
    const body = JSON.stringify({ title: "Bad Request", detail: "Unknown label FOO", status: 400 });
    expect(extractErrorMessage(body)).toBe("Unknown label FOO");
  });

  it("falls back to message when detail is absent", () => {
    expect(extractErrorMessage(JSON.stringify({ message: "legacy message" }))).toBe(
      "legacy message",
    );
  });

  it("falls back to title when detail and message are absent", () => {
    expect(extractErrorMessage(JSON.stringify({ title: "Internal Server Error" }))).toBe(
      "Internal Server Error",
    );
  });

  it("skips blank fields", () => {
    const body = JSON.stringify({ detail: "   ", message: "the real message" });
    expect(extractErrorMessage(body)).toBe("the real message");
  });

  it("returns a generic message for a non-JSON body", () => {
    expect(extractErrorMessage("<html>502 Bad Gateway</html>")).toBe("Query execution failed");
  });

  it("returns a generic message when no known key is present", () => {
    expect(extractErrorMessage(JSON.stringify({ code: 42 }))).toBe("Query execution failed");
  });
});

describe("classifyExecutionError", () => {
  it("classifies a timeout as DB_TIMEOUT and retryable", () => {
    const result = classifyExecutionError("Query timed out after 60000ms", 60000);
    expect(result.errorCode).toBe("DB_TIMEOUT");
    expect(result.retryable).toBe(true);
    expect(result.suggestion).toContain("60s");
  });

  it("classifies the word timeout as DB_TIMEOUT", () => {
    expect(classifyExecutionError("statement timeout reached", 30000).errorCode).toBe("DB_TIMEOUT");
  });

  it("classifies a budget breach as QUERY_TOO_EXPENSIVE and not retryable", () => {
    const result = classifyExecutionError("element budget exceeded", 60000);
    expect(result.errorCode).toBe("QUERY_TOO_EXPENSIVE");
    expect(result.retryable).toBe(false);
  });

  it("classifies anything else as a syntax error", () => {
    const result = classifyExecutionError("Unknown function frobnicate()", 60000);
    expect(result.errorCode).toBe("CYPHER_SYNTAX_ERROR");
    expect(result.retryable).toBe(false);
  });
});
