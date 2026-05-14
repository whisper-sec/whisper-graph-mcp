import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildTools, createServer, type ServerDeps } from "../server";
import { log } from "../logger";

/**
 * Serves the MCP server over stdio — the default transport for local CLI use
 * (Claude Desktop, Claude Code, Cursor). The outbound credential comes from the
 * `WHISPER_API_KEY` environment variable; there are no inbound headers to relay.
 */
export async function startStdioTransport(deps: ServerDeps): Promise<void> {
  const server = createServer(deps, buildTools(deps));
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("whisper-graph-mcp ready on stdio");
}
