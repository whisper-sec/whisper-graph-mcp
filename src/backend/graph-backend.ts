import type { Credential } from "../credentials";
import type { RawQueryResponse, StatsResponse } from "../model/types";

/**
 * Abstraction over the hosted WhisperGraph API. The `credential` is the caller's
 * own key, relayed on every outbound request.
 */
export interface GraphBackend {
  execute(
    cypher: string,
    parameters: Record<string, unknown> | undefined,
    credential: Credential | null,
  ): Promise<RawQueryResponse>;

  getStats(credential: Credential | null): Promise<StatsResponse>;
}
