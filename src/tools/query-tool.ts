import type { Credential } from "../credentials";
import type { GraphBackend } from "../backend/graph-backend";
import type { CypherQueryValidator } from "../query/cypher-query-validator";
import type { QueryResult, RawQueryResponse } from "../model/types";
import { QueryResult as QueryResultFactory } from "../model/types";
import {
  CypherExecutionException,
  WhisperDbException,
  classifyExecutionError,
} from "../backend/errors";

function transformRawResponse(raw: RawQueryResponse): QueryResult {
  return QueryResultFactory.success(raw.columns ?? [], raw.rows ?? [], raw.statistics);
}

/**
 * Backs the `query` tool: validate the Cypher, relay it to the hosted backend,
 * then shape the response (or a classified error) for the MCP client.
 */
export class QueryTool {
  constructor(
    private readonly backend: GraphBackend,
    private readonly validator: CypherQueryValidator,
    private readonly queryTimeoutMs: number,
  ) {}

  async run(cypher: string, credential: Credential | null): Promise<QueryResult> {
    const validation = this.validator.validate(cypher);
    if (!validation.valid) {
      return QueryResultFactory.error(
        validation.errorMessage,
        validation.suggestion,
        "VALIDATION_REJECTED",
        false,
      );
    }

    try {
      const raw = await this.backend.execute(cypher, undefined, credential);
      return transformRawResponse(raw);
    } catch (error) {
      if (error instanceof CypherExecutionException) {
        const classification = classifyExecutionError(error.message, this.queryTimeoutMs);
        return QueryResultFactory.error(
          error.message,
          classification.suggestion,
          classification.errorCode,
          classification.retryable,
        );
      }
      if (error instanceof WhisperDbException) {
        return QueryResultFactory.error(
          "Database temporarily unavailable",
          "Try again in a few seconds. If the problem persists, the database may be under maintenance.",
          "DB_UNAVAILABLE",
          true,
        );
      }
      throw error;
    }
  }
}
