import type { GraphBackend } from "../src/backend/graph-backend";
import type { Credential } from "../src/credentials";
import type { RawQueryResponse, StatsResponse } from "../src/model/types";

export interface ExecuteCall {
  readonly cypher: string;
  readonly parameters: Record<string, unknown> | undefined;
  readonly credential: Credential | null;
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
