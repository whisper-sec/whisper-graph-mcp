/** A query that the hosted WhisperGraph API rejected or could not finish. */
export class CypherExecutionException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CypherExecutionException";
  }
}

/** A failure to reach or parse a response from the hosted WhisperGraph API. */
export class WhisperDbException extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WhisperDbException";
  }
}

export type ErrorCode =
  | "DB_UNAVAILABLE"
  | "VALIDATION_REJECTED"
  | "CYPHER_SYNTAX_ERROR"
  | "DB_TIMEOUT"
  | "QUERY_TOO_EXPENSIVE";

const ERROR_MESSAGE_KEYS = ["detail", "message", "title"] as const;

/**
 * Pulls a human-readable message out of an error body. The hosted API returns
 * RFC 7807 problem+json (`{type, title, status, detail}`); older shapes used
 * `{message}`. Prefer `detail`, then `message`, then `title`, then a generic
 * fallback (which also covers a non-JSON body).
 */
export function extractErrorMessage(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      for (const key of ERROR_MESSAGE_KEYS) {
        const value = record[key];
        if (typeof value === "string" && value.trim() !== "") {
          return value;
        }
      }
    }
  } catch {
    // Body was not JSON — fall through to the generic message.
  }
  return "Query execution failed";
}

export interface ExecutionErrorClassification {
  readonly errorCode: ErrorCode;
  readonly retryable: boolean;
  readonly suggestion: string;
}

function buildTimeoutSuggestion(queryTimeoutMs: number): string {
  const seconds = Math.max(1, Math.floor(queryTimeoutMs / 1000));
  return (
    `Query exceeded the ${seconds}s server deadline. Anchor the MATCH with ` +
    '{name: "value"}, add or tighten LIMIT, or reduce traversal depth. ' +
    "See https://www.whisper.security/docs/cypher-query-guide for query budgets."
  );
}

function buildBudgetSuggestion(): string {
  return (
    "The query materialized too many intermediate rows. Add or tighten LIMIT, " +
    'anchor the MATCH with {name: "value"}, narrow the pattern, or avoid ' +
    "chained CALL ... YIELD expansions. " +
    "See https://www.whisper.security/docs/cypher-query-guide for query budgets."
  );
}

/**
 * Classifies a CypherExecutionException message into a typed error code. A
 * timeout is retryable; a budget breach (too many intermediate rows) is not —
 * retrying it unchanged won't help — and anything else is treated as a syntax
 * or schema error.
 */
export function classifyExecutionError(
  message: string,
  queryTimeoutMs: number,
): ExecutionErrorClassification {
  const lower = message.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return {
      errorCode: "DB_TIMEOUT",
      retryable: true,
      suggestion: buildTimeoutSuggestion(queryTimeoutMs),
    };
  }

  if (lower.includes("budget")) {
    return {
      errorCode: "QUERY_TOO_EXPENSIVE",
      retryable: false,
      suggestion: buildBudgetSuggestion(),
    };
  }

  return {
    errorCode: "CYPHER_SYNTAX_ERROR",
    retryable: false,
    suggestion: "Check your query syntax against the schema in the server instructions.",
  };
}
