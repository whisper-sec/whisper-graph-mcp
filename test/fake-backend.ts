import type { GraphBackend } from "../src/backend/graph-backend";
import type { FlowRunner, FlowRunResult } from "../src/backend/flow-runner";
import type { Credential } from "../src/credentials";
import type { RawQueryResponse, StatsResponse } from "../src/model/types";

export interface ExecuteCall {
  readonly cypher: string;
  readonly parameters: Record<string, unknown> | undefined;
  readonly credential: Credential | null;
}

export interface FlowRunCall {
  readonly slug: string;
  readonly inputs: Record<string, unknown>;
  readonly params: Record<string, unknown>;
  readonly credential: Credential;
}

const EMPTY_RESPONSE: RawQueryResponse = {
  columns: [],
  rows: [],
  statistics: { rowCount: 0, executionTimeMs: 0 },
};

/** In-memory GraphBackend test double that records calls and returns scripted responses. */
export class FakeBackend implements GraphBackend {
  readonly executeCalls: ExecuteCall[] = [];
  readonly statsCalls: Array<Credential | null> = [];

  executeImpl: (call: ExecuteCall) => Promise<RawQueryResponse> = async () => EMPTY_RESPONSE;
  statsImpl: (credential: Credential | null) => Promise<StatsResponse> = async () => ({});

  async execute(
    cypher: string,
    parameters: Record<string, unknown> | undefined,
    credential: Credential | null,
  ): Promise<RawQueryResponse> {
    const call: ExecuteCall = { cypher, parameters, credential };
    this.executeCalls.push(call);
    return this.executeImpl(call);
  }

  async getStats(credential: Credential | null): Promise<StatsResponse> {
    this.statsCalls.push(credential);
    return this.statsImpl(credential);
  }

  get lastExecuteCall(): ExecuteCall {
    const call = this.executeCalls.at(-1);
    if (!call) throw new Error("execute was not called");
    return call;
  }
}

/** In-memory FlowRunner test double that records calls and returns scripted results. */
export class FakeFlowRunner implements FlowRunner {
  readonly runCalls: FlowRunCall[] = [];

  runImpl: (call: FlowRunCall) => Promise<FlowRunResult> = async (call) => ({
    slug: call.slug,
    totalLatencyMs: 1,
    steps: [],
  });

  async run(
    slug: string,
    inputs: Record<string, unknown>,
    params: Record<string, unknown>,
    credential: Credential,
  ): Promise<FlowRunResult> {
    const call: FlowRunCall = { slug, inputs, params, credential };
    this.runCalls.push(call);
    return this.runImpl(call);
  }

  get lastRunCall(): FlowRunCall {
    const call = this.runCalls.at(-1);
    if (!call) throw new Error("run was not called");
    return call;
  }
}
