import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HostedFlowRunner, type HostedFlowRunnerOptions } from "../../src/backend/flow-runner";
import { CypherExecutionException } from "../../src/backend/errors";
import type { Credential } from "../../src/credentials";

const OPTIONS: HostedFlowRunnerOptions = {
  runUrl: "https://console.example.test/api/gallery/run",
  timeoutMs: 5000,
  userAgent: "whisper-graph-mcp/test",
};

const KEY: Credential = { headerName: "X-API-Key", headerValue: "test-key" };

/** Build a text/event-stream Response whose body streams `chunks` in order. */
function sseResponse(chunks: string[], status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("HostedFlowRunner", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts {slug,inputs,params} with the credential and Accept: text/event-stream", async () => {
    fetchMock.mockResolvedValue(sseResponse(["event: complete\ndata: {}\n\n"]));
    const runner = new HostedFlowRunner(OPTIONS);

    await runner.run("typosquat", { domain: "paypal.com" }, { level: "deep" }, KEY);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(OPTIONS.runUrl);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-API-Key"]).toBe("test-key");
    expect(headers.Accept).toBe("text/event-stream");
    expect(JSON.parse(init.body as string)).toEqual({
      slug: "typosquat",
      inputs: { domain: "paypal.com" },
      params: { level: "deep" },
    });
  });

  it("collects completed step events (with rows) and the terminal latency", async () => {
    const chunks = [
      'event: start\ndata: {"slug":"typosquat"}\n\n',
      'event: step-start\ndata: {"id":"registered","title":"Look-alikes"}\n\n',
      'event: step\ndata: {"id":"registered","title":"Look-alikes","status":"done","columns":["variant"],"rows":[{"variant":"paypa1.com"}],"latencyMs":12}\n\n',
      'event: complete\ndata: {"slug":"typosquat","totalLatencyMs":99}\n\n',
    ];
    fetchMock.mockResolvedValue(sseResponse(chunks));
    const runner = new HostedFlowRunner(OPTIONS);

    const result = await runner.run("typosquat", {}, {}, KEY);

    expect(result.slug).toBe("typosquat");
    expect(result.totalLatencyMs).toBe(99);
    // step-start is dropped (no rows / not done); only the completed step surfaces.
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({
      id: "registered",
      columns: ["variant"],
      rows: [{ variant: "paypa1.com" }],
      latencyMs: 12,
    });
  });

  it("reassembles events split across stream chunks", async () => {
    const chunks = [
      'event: step\ndata: {"id":"a","status":"done","rows":[{"x":1}]',
      "}\n\nevent: comple",
      'te\ndata: {"totalLatencyMs":7}\n\n',
    ];
    fetchMock.mockResolvedValue(sseResponse(chunks));
    const runner = new HostedFlowRunner(OPTIONS);

    const result = await runner.run("indicator", {}, {}, KEY);

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.rows).toEqual([{ x: 1 }]);
    expect(result.totalLatencyMs).toBe(7);
  });

  it("maps a 401 to a clear 'needs an API key' error", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: "AuthRequired", message: "Sign in to run workflows." }),
        {
          status: 401,
        },
      ),
    );
    const runner = new HostedFlowRunner(OPTIONS);

    await expect(runner.run("typosquat", {}, {}, KEY)).rejects.toBeInstanceOf(
      CypherExecutionException,
    );
  });

  it("maps a 404 to a clear 'not runnable' error", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "FlowNotFound", message: "No runnable flow." }), {
        status: 404,
      }),
    );
    const runner = new HostedFlowRunner(OPTIONS);

    await expect(runner.run("nope", {}, {}, KEY)).rejects.toThrow(/not runnable/i);
  });
});
