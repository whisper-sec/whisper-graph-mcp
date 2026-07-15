import type { Credential } from "../credentials";
import { CypherExecutionException, WhisperDbException, extractErrorMessage } from "./errors";

/** One executed step of a multi-step flow, as surfaced to the MCP client. */
export interface FlowStep {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly status?: string;
  readonly columns?: string[];
  readonly rows?: Array<Record<string, unknown>>;
  readonly latencyMs?: number;
}

/** The aggregated result of running a flow to completion. */
export interface FlowRunResult {
  readonly slug: string;
  readonly totalLatencyMs?: number;
  readonly steps: FlowStep[];
}

/**
 * Runs a named multi-step catalog flow. Flows are keyed: the caller's key is
 * relayed to the gallery flow runner, which streams progress over SSE.
 */
export interface FlowRunner {
  run(
    slug: string,
    inputs: Record<string, unknown>,
    params: Record<string, unknown>,
    credential: Credential,
  ): Promise<FlowRunResult>;
}

export interface HostedFlowRunnerOptions {
  readonly runUrl: string;
  readonly timeoutMs: number;
  readonly userAgent: string;
}

interface SseEvent {
  readonly event: string;
  readonly data: string;
}

/**
 * Parse a Server-Sent-Events text buffer into discrete events. Events are
 * separated by a blank line; each carries an `event:` type and one or more
 * `data:` lines (joined with newlines, per the SSE spec).
 */
function parseSseBlock(block: string): SseEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).replace(/^ /, ""));
    }
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** Flow runner backed by the hosted gallery flow-run endpoint (SSE). */
export class HostedFlowRunner implements FlowRunner {
  private readonly runUrl: string;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(options: HostedFlowRunnerOptions) {
    this.runUrl = options.runUrl;
    this.timeoutMs = options.timeoutMs;
    this.userAgent = options.userAgent;
  }

  async run(
    slug: string,
    inputs: Record<string, unknown>,
    params: Record<string, unknown>,
    credential: Credential,
  ): Promise<FlowRunResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(this.runUrl, {
        method: "POST",
        headers: {
          "User-Agent": this.userAgent,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          [credential.headerName]: credential.headerValue,
        },
        body: JSON.stringify({ slug, inputs, params }),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (isAbortError(error)) {
        throw new CypherExecutionException(`Flow "${slug}" timed out after ${this.timeoutMs}ms`);
      }
      throw new WhisperDbException("Failed to reach the WhisperGraph flow runner", {
        cause: error,
      });
    }

    if (response.status === 401 || response.status === 403) {
      clearTimeout(timer);
      const detail = extractErrorMessage(await response.text());
      throw new CypherExecutionException(`Flow "${slug}" needs an API key: ${detail}`.trim());
    }
    if (response.status === 404) {
      clearTimeout(timer);
      throw new CypherExecutionException(
        `Flow "${slug}" is not runnable: ${extractErrorMessage(await response.text())}`,
      );
    }
    if (response.status !== 200 || !response.body) {
      clearTimeout(timer);
      throw new CypherExecutionException(
        `Flow "${slug}" failed (HTTP ${response.status}): ${extractErrorMessage(await response.text())}`,
      );
    }

    try {
      return await this.consume(slug, response.body);
    } finally {
      clearTimeout(timer);
    }
  }

  private async consume(slug: string, body: ReadableStream<Uint8Array>): Promise<FlowRunResult> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const steps: FlowStep[] = [];
    let totalLatencyMs: number | undefined;
    let buffer = "";

    const handle = (event: SseEvent): void => {
      if (event.event === "step") {
        const parsed = this.parseStep(event.data);
        if (parsed) steps.push(parsed);
      } else if (event.event === "complete") {
        try {
          const done = JSON.parse(event.data) as { totalLatencyMs?: number };
          totalLatencyMs = done.totalLatencyMs;
        } catch {
          // A malformed terminal event should not sink the collected steps.
        }
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const event = parseSseBlock(block);
        if (event) handle(event);
      }
    }
    const tail = parseSseBlock(buffer);
    if (tail) handle(tail);

    return { slug, totalLatencyMs, steps };
  }

  private parseStep(data: string): FlowStep | null {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return null;
    }
    if (typeof raw.id !== "string") return null;
    // Only surface completed steps that carry data; step-start frames and
    // in-progress frames add noise without adding facts.
    if (raw.status !== undefined && raw.status !== "done") return null;
    return {
      id: raw.id,
      title: typeof raw.title === "string" ? raw.title : undefined,
      description: typeof raw.description === "string" ? raw.description : undefined,
      status: typeof raw.status === "string" ? raw.status : undefined,
      columns: Array.isArray(raw.columns) ? (raw.columns as string[]) : undefined,
      rows: Array.isArray(raw.rows) ? (raw.rows as Array<Record<string, unknown>>) : undefined,
      latencyMs: typeof raw.latencyMs === "number" ? raw.latencyMs : undefined,
    };
  }
}
