import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "./config";
import type { GraphBackend } from "./backend/graph-backend";
import { resolveCredential } from "./credentials";
import { CypherQueryValidator } from "./query/cypher-query-validator";
import { QueryTool } from "./tools/query-tool";
import { SchemaTools } from "./tools/schema-tools";
import { IndicatorTools } from "./tools/indicator-tools";
import {
  QUERY_TOOL_DESCRIPTION,
  LIST_LABELS_DESCRIPTION,
  DESCRIBE_LABEL_DESCRIPTION,
  EXPLAIN_INDICATOR_DESCRIPTION,
  WHISPER_HISTORY_DESCRIPTION,
  DOMAIN_VARIANTS_DESCRIPTION,
} from "./tools/descriptions";
import { registerResources, SERVER_INSTRUCTIONS } from "./resources/resource-provider";
import { registerPrompts } from "./prompts/prompt-provider";
import { SERVER_NAME, SERVER_TITLE, VERSION } from "./version";

export interface ServerDeps {
  readonly config: Config;
  readonly backend: GraphBackend;
}

export interface ServerTools {
  readonly queryTool: QueryTool;
  readonly schemaTools: SchemaTools;
  readonly indicatorTools: IndicatorTools;
}

/**
 * Builds the long-lived tool instances. `SchemaTools` holds the 5-minute schema
 * cache, so this must be created once and shared - not rebuilt per request.
 */
export function buildTools(deps: ServerDeps): ServerTools {
  const { config, backend } = deps;
  const validator = new CypherQueryValidator();
  return {
    queryTool: new QueryTool(backend, validator, config.queryTimeoutMs),
    schemaTools: new SchemaTools(backend),
    indicatorTools: new IndicatorTools(backend),
  };
}

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const rowSchema = z.record(z.string(), z.unknown());

const queryOutputShape = {
  success: z.boolean(),
  columns: z.array(z.string()),
  rows: z.array(rowSchema),
  statistics: z.object({ rowCount: z.number(), executionTimeMs: z.number() }).optional(),
  error: z.string().optional(),
  suggestion: z.string().optional(),
  errorCode: z.string().optional(),
  retryable: z.boolean().optional(),
};

const describeLabelOutputShape = {
  name: z.string(),
  exists: z.boolean(),
  count: z.number().optional(),
  properties: z.array(z.string()).optional(),
  edgesDoc: z.string().optional(),
  error: z.string().optional(),
  suggestion: z.string().optional(),
  propertiesError: z.string().optional(),
};

function toolResult(payload: object, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
    isError,
  };
}

/**
 * Builds a fully wired MCP server: 6 tools, 6 resources, 8 prompts. Cheap to
 * call - in HTTP mode a fresh server is created per request for stateless
 * request isolation, while `tools` (with its cache) is shared across requests.
 */
export function createServer(deps: ServerDeps, tools: ServerTools): McpServer {
  const { config, backend } = deps;
  const { queryTool, schemaTools, indicatorTools } = tools;

  const server = new McpServer(
    { name: SERVER_NAME, title: SERVER_TITLE, version: VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "query",
    {
      title: "WhisperGraph Cypher Query",
      description: QUERY_TOOL_DESCRIPTION,
      inputSchema: {
        cypher: z
          .string()
          .describe(
            "Cypher query string. Must include LIMIT for exploration queries. " +
              'Use {name: "value"} property syntax for lookups.',
          ),
      },
      outputSchema: queryOutputShape,
      annotations: { ...READ_ONLY_ANNOTATIONS, openWorldHint: true },
    },
    async (args, extra) => {
      const credential = resolveCredential(extra.requestInfo?.headers, config.apiKey);
      const result = await queryTool.run(args.cypher, credential);
      return toolResult(result, !result.success);
    },
  );

  server.registerTool(
    "list_labels",
    {
      title: "List WhisperGraph Labels",
      description: LIST_LABELS_DESCRIPTION,
      inputSchema: {},
      outputSchema: { labels: z.array(rowSchema) },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (_args, extra) => {
      const credential = resolveCredential(extra.requestInfo?.headers, config.apiKey);
      const result = await schemaTools.listLabels(credential);
      return toolResult(result);
    },
  );

  server.registerTool(
    "describe_label",
    {
      title: "Describe WhisperGraph Label",
      description: DESCRIBE_LABEL_DESCRIPTION,
      inputSchema: {
        label: z
          .string()
          .describe(
            "Label name. Uppercase letters, digits, underscores. Examples: HOSTNAME, IPV4, ASN.",
          ),
      },
      outputSchema: describeLabelOutputShape,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args, extra) => {
      const credential = resolveCredential(extra.requestInfo?.headers, config.apiKey);
      const result = await schemaTools.describeLabel(args.label, credential);
      return toolResult(result);
    },
  );

  server.registerTool(
    "explain_indicator",
    {
      title: "Threat Assessment for an Indicator",
      description: EXPLAIN_INDICATOR_DESCRIPTION,
      inputSchema: {
        indicator: z
          .string()
          .describe(
            'IPv4 / IPv6 / hostname / CIDR / ASN. Examples: "185.220.101.1", "google.com", "3.64.0.0/12", "AS13335".',
          ),
      },
      outputSchema: { rows: z.array(rowSchema) },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args, extra) => {
      const credential = resolveCredential(extra.requestInfo?.headers, config.apiKey);
      const result = await indicatorTools.explainIndicator(args.indicator, credential);
      return toolResult(result);
    },
  );

  server.registerTool(
    "whisper_history",
    {
      title: "Historical WHOIS / BGP for an Indicator",
      description: WHISPER_HISTORY_DESCRIPTION,
      inputSchema: {
        indicator: z
          .string()
          .describe(
            'IPv4 / IPv6 / hostname / CIDR / ASN. Examples: "8.8.8.8", "google.com", "8.8.8.0/24", "AS15169".',
          ),
      },
      outputSchema: { rows: z.array(rowSchema) },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args, extra) => {
      const credential = resolveCredential(extra.requestInfo?.headers, config.apiKey);
      const result = await indicatorTools.whisperHistory(args.indicator, credential);
      return toolResult(result);
    },
  );

  server.registerTool(
    "domain_variants",
    {
      title: "Typosquat / Brand-Protection Variants",
      description: DOMAIN_VARIANTS_DESCRIPTION,
      inputSchema: {
        name: z
          .string()
          .describe(
            'Domain or brand to generate variants for. Examples: "google.com", "paypal.com". Unicode allowed.',
          ),
        label: z
          .string()
          .optional()
          .describe("Optional node label to check existence against. Default: HOSTNAME."),
        includeNonExistent: z
          .boolean()
          .optional()
          .describe(
            "Optional. When true, also return generated variants that do not exist in the graph. Default: false.",
          ),
      },
      outputSchema: { rows: z.array(rowSchema) },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args, extra) => {
      const credential = resolveCredential(extra.requestInfo?.headers, config.apiKey);
      const result = await indicatorTools.domainVariants(
        args.name,
        args.label,
        args.includeNonExistent ?? false,
        credential,
      );
      return toolResult(result);
    },
  );

  registerResources(server, { backend, config });
  registerPrompts(server);

  return server;
}
