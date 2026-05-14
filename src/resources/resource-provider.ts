import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GraphBackend } from "../backend/graph-backend";
import type { Config } from "../config";
import { resolveCredential } from "../credentials";
import { log, describeError } from "../logger";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "content");

function loadContent(filename: string): string {
  try {
    return readFileSync(join(CONTENT_DIR, filename), "utf8");
  } catch {
    return `Resource content unavailable: ${filename}`;
  }
}

/**
 * Loads a bundled file that the server cannot run correctly without — fails fast
 * at startup rather than silently degrading.
 */
function loadRequiredContent(filename: string): string {
  let content: string;
  try {
    content = readFileSync(join(CONTENT_DIR, filename), "utf8");
  } catch (error) {
    throw new Error(
      `Failed to load bundled resource "${filename}" from ${CONTENT_DIR}: ${describeError(error)}`,
    );
  }
  if (content.trim() === "") {
    throw new Error(`Bundled resource "${filename}" is empty`);
  }
  return content;
}

/**
 * The server instructions sent to every MCP client (the `instructions` field).
 * Load-bearing — a missing file fails startup instead of shipping a placeholder.
 */
export const SERVER_INSTRUCTIONS = loadRequiredContent("instructions.md");

const SCHEMA_ANNOTATIONS = { audience: ["assistant"] as const, priority: 1.0 };
const GUIDE_ANNOTATIONS = { audience: ["assistant"] as const, priority: 0.7 };
const DYNAMIC_ANNOTATIONS = { audience: ["user", "assistant"] as const, priority: 0.5 };

interface StaticResource {
  readonly name: string;
  readonly uri: string;
  readonly title: string;
  readonly description: string;
  readonly file: string;
  readonly annotations: {
    readonly audience: readonly ("user" | "assistant")[];
    readonly priority: number;
  };
}

const STATIC_RESOURCES: StaticResource[] = [
  {
    name: "Complete Schema",
    uri: "whisper://schema/full",
    title: "WhisperGraph Full Schema",
    description:
      "Full WhisperGraph schema: node labels with counts, edge types with directions, threat-intel and BGP-enrichment property tables, edge-direction landmines",
    file: "schema-full.md",
    annotations: SCHEMA_ANNOTATIONS,
  },
  {
    name: "Relationship Map",
    uri: "whisper://schema/relationships",
    title: "Entity Relationship Map",
    description: "Entity relationship diagram and verified multi-hop traversal chains",
    file: "schema-relationships.md",
    annotations: SCHEMA_ANNOTATIONS,
  },
  {
    name: "Function Reference",
    uri: "whisper://guide/functions",
    title: "Cypher Function Reference",
    description:
      "Cypher functions: aggregation, string, numeric, trig, collection, node/rel, type conversion, datetime",
    file: "guide-functions.md",
    annotations: GUIDE_ANNOTATIONS,
  },
  {
    name: "Query Cookbook",
    uri: "whisper://guide/cookbook",
    title: "Persona-Organized Query Cookbook",
    description:
      "Live-validated query patterns organized by analyst persona: SOC, threat intel, pen test, brand protection, DNS/email, BGP, compliance, researcher",
    file: "guide-cookbook.md",
    annotations: GUIDE_ANNOTATIONS,
  },
];

// Read the static resource markdown once at module load — not per request.
const STATIC_RESOURCE_CONTENT = new Map(
  STATIC_RESOURCES.map((resource) => [resource.file, loadContent(resource.file)] as const),
);

/** Registers the four static schema/guide resources plus the two dynamic ones. */
export function registerResources(
  server: McpServer,
  deps: { backend: GraphBackend; config: Config },
): void {
  const { backend, config } = deps;

  for (const resource of STATIC_RESOURCES) {
    const text = STATIC_RESOURCE_CONTENT.get(resource.file) ?? loadContent(resource.file);
    server.registerResource(
      resource.name,
      resource.uri,
      {
        title: resource.title,
        description: resource.description,
        mimeType: "text/markdown",
        annotations: {
          audience: [...resource.annotations.audience],
          priority: resource.annotations.priority,
        },
      },
      (uri) => ({
        contents: [{ uri: uri.href, mimeType: "text/markdown", text }],
      }),
    );
  }

  server.registerResource(
    "Database Statistics",
    "whisper://stats",
    {
      title: "Live Database Statistics",
      description:
        "Live WhisperGraph statistics: physical / virtual / total node and edge counts, object count, threat-intel summary, and timestamp",
      mimeType: "application/json",
      annotations: {
        audience: [...DYNAMIC_ANNOTATIONS.audience],
        priority: DYNAMIC_ANNOTATIONS.priority,
      },
    },
    async (uri, extra) => {
      const credential = resolveCredential(extra.requestInfo?.headers, config.apiKey);
      try {
        const stats = await backend.getStats(credential);
        return {
          contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(stats) }],
        };
      } catch (error) {
        log.warn(`whisper://stats lookup failed: ${describeError(error)}`);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: '{"error":"Database stats temporarily unavailable"}',
            },
          ],
        };
      }
    },
  );

  server.registerResource(
    "Plan Quota",
    "whisper://quota",
    {
      title: "Live Plan / Quota / Usage",
      description:
        "Caller's plan tier, max query depth, default/max timeout, response-row limit, and current usage",
      mimeType: "application/json",
      annotations: {
        audience: [...DYNAMIC_ANNOTATIONS.audience],
        priority: DYNAMIC_ANNOTATIONS.priority,
      },
    },
    async (uri, extra) => {
      const credential = resolveCredential(extra.requestInfo?.headers, config.apiKey);
      try {
        const raw = await backend.execute("CALL whisper.quota()", undefined, credential);
        // Re-shape the {key, value} rows into a flat object — easier for clients to read.
        const flat: Record<string, unknown> = {};
        for (const row of raw.rows ?? []) {
          const key = row.key;
          if (key != null) {
            flat[String(key)] = row.value;
          }
        }
        return {
          contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(flat) }],
        };
      } catch (error) {
        log.warn(`whisper://quota lookup failed: ${describeError(error)}`);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: '{"error":"Quota lookup temporarily unavailable"}',
            },
          ],
        };
      }
    },
  );
}
