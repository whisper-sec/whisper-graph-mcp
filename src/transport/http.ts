import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { buildTools, createServer, type ServerDeps } from "../server";
import { log, describeError } from "../logger";

/**
 * Serves the MCP server over Streamable HTTP at `/` for remote / Docker
 * self-hosting. Runs statelessly: a fresh transport and server per request keep
 * requests isolated, while the tool instances (and their cache) are shared.
 *
 * The server does not authenticate inbound requests — it relays the caller's
 * `X-API-Key` / `Authorization` header to the hosted API, falling back to
 * `WHISPER_API_KEY` when no header is present. Set `WHISPER_ALLOWED_HOSTS` to
 * enable Host-header (DNS-rebinding) validation, or run it behind a gateway.
 */
export async function startHttpTransport(deps: ServerDeps): Promise<Server> {
  const { config } = deps;
  const tools = buildTools(deps);

  const app = createMcpExpressApp(
    config.allowedHosts.length > 0
      ? { host: config.httpHost, allowedHosts: config.allowedHosts }
      : { host: config.httpHost },
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/", async (req, res) => {
    const server = createServer(deps, tools);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      log.error(`HTTP request failed: ${describeError(error)}`);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  app.all("/", (_req, res) => {
    res.status(405).json({ error: "Method not allowed" });
  });

  return new Promise<Server>((resolve) => {
    const httpServer = app.listen(config.httpPort, config.httpHost, () => {
      const address = httpServer.address() as AddressInfo;
      log.info(`whisper-graph-mcp ready on http://${config.httpHost}:${address.port}/`);
      resolve(httpServer);
    });
  });
}
