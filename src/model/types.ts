export interface QueryStatistics {
  readonly rowCount: number;
  readonly executionTimeMs: number;
}

/** The raw shape returned by the hosted WhisperGraph API for POST /api/query. */
export interface RawQueryResponse {
  readonly columns?: string[];
  readonly rows?: Array<Record<string, unknown>>;
  readonly statistics?: QueryStatistics;
}

/** The structured result a tool returns to the MCP client. */
export interface QueryResult {
  readonly success: boolean;
  readonly columns: string[];
  readonly rows: Array<Record<string, unknown>>;
  readonly statistics?: QueryStatistics;
  readonly error?: string;
  readonly suggestion?: string;
  readonly errorCode?: string;
  readonly retryable?: boolean;
}

export interface GraphCounts {
  readonly nodeCount: number;
  readonly edgeCount: number;
}

export interface ThreatIntel {
  readonly threatIntelLoaded?: boolean;
  readonly hasTaxonomy?: boolean;
  readonly feedSourceCount?: number;
  readonly categoryCount?: number;
  readonly totalListedInEdges?: number;
  readonly asnEnrichmentLoaded?: boolean;
  readonly prefixBgpEnrichmentLoaded?: boolean;
  readonly available?: boolean;
}

/**
 * The hosted WhisperGraph API reports counts in three buckets — physical
 * (on-disk), virtual (derived/enrichment), and total — plus an object count and
 * a threat-intel summary. Fields are optional so a shape change never throws.
 */
export interface StatsResponse {
  readonly physical?: GraphCounts;
  readonly virtual?: GraphCounts;
  readonly total?: GraphCounts;
  readonly objectCount?: number;
  readonly threatIntel?: ThreatIntel;
  readonly timestamp?: string;
}

export const QueryResult = {
  success(
    columns: string[],
    rows: Array<Record<string, unknown>>,
    statistics: QueryStatistics | undefined,
  ): QueryResult {
    return { success: true, columns, rows, statistics };
  },

  error(error: string, suggestion: string, errorCode?: string, retryable?: boolean): QueryResult {
    return { success: false, columns: [], rows: [], error, suggestion, errorCode, retryable };
  },
};
