import type { Credential } from "../credentials";
import type { RawQueryResponse, StatsResponse } from "../model/types";
import type { GraphBackend } from "./graph-backend";
import { CypherExecutionException, WhisperDbException, extractErrorMessage } from "./errors";

/**
 * Grace period added on top of the query deadline so the hosted API can return a
 * structured timeout before the HTTP client aborts.
 */
const HTTP_GRACE_MS = 5000;

export interface HostedBackendOptions {
  readonly baseUrl: string;
  readonly queryTimeoutMs: number;
  readonly statsTimeoutMs: number;
  readonly userAgent: string;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** HTTP client for the hosted WhisperGraph API. */
export class HostedBackend implements GraphBackend {
  private readonly baseUrl: string;
  private readonly queryTimeoutMs: number;
  private readonly statsTimeoutMs: number;
  private readonly userAgent: string;

  constructor(options: HostedBackendOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.queryTimeoutMs = options.queryTimeoutMs;
    this.statsTimeoutMs = options.statsTimeoutMs;
    this.userAgent = options.userAgent;
  }

  async execute(
    cypher: string,
    parameters: Record<string, unknown> | undefined,
    credential: Credential | null,
  ): Promise<RawQueryResponse> {
    const body: Record<string, unknown> = {
      query: cypher,
      timeout: this.queryTimeoutMs,
    };
    if (parameters && Object.keys(parameters).length > 0) {
      body.parameters = parameters;
    }

    // HTTP read timeout = query deadline + grace, so the API returns a
    // structured DB_TIMEOUT before the client aborts the connection.
    const httpTimeoutMs = this.queryTimeoutMs + HTTP_GRACE_MS;

    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${this.baseUrl}/api/query`,
        {
          method: "POST",
          headers: this.buildHeaders(credential, { "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        },
        httpTimeoutMs,
      );
    } catch (error) {
      if (isAbortError(error)) {
        throw new CypherExecutionException(`Query timed out after ${this.queryTimeoutMs}ms`);
      }
      throw new WhisperDbException("Failed to communicate with WhisperGraph database", {
        cause: error,
      });
    }

    const responseBody = await response.text();

    if (response.status === 408 || response.status === 504) {
      throw new CypherExecutionException(`Query timed out after ${this.queryTimeoutMs}ms`);
    }
    if (response.status === 400) {
      throw new CypherExecutionException(extractErrorMessage(responseBody));
    }
    if (response.status !== 200) {
      // Run the body through extractErrorMessage rather than echoing it raw -
      // a misbehaving upstream could otherwise relay an HTML page or stack
      // trace straight back to the MCP client.
      throw new CypherExecutionException(
        `Unexpected response status ${response.status}: ${extractErrorMessage(responseBody)}`,
      );
    }

    try {
      return JSON.parse(responseBody) as RawQueryResponse;
    } catch (error) {
      throw new WhisperDbException("Failed to parse the WhisperGraph response", { cause: error });
    }
  }

  async getStats(credential: Credential | null): Promise<StatsResponse> {
    try {
      const response = await fetchWithTimeout(
        `${this.baseUrl}/api/query/stats`,
        { method: "GET", headers: this.buildHeaders(credential, {}) },
        this.statsTimeoutMs,
      );
      const responseBody = await response.text();
      if (response.status !== 200) {
        throw new WhisperDbException(
          `Unexpected response status ${response.status} from /api/query/stats`,
        );
      }
      return JSON.parse(responseBody) as StatsResponse;
    } catch (error) {
      if (error instanceof WhisperDbException) {
        throw error;
      }
      throw new WhisperDbException("Failed to fetch database statistics", { cause: error });
    }
  }

  private buildHeaders(
    credential: Credential | null,
    extra: Record<string, string>,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": this.userAgent,
      ...extra,
    };
    if (credential) {
      headers[credential.headerName] = credential.headerValue;
    }
    return headers;
  }
}
