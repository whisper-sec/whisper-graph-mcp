import { loadConfig } from "./config";
import { HostedBackend } from "./backend/hosted-backend";
import { HostedFlowRunner } from "./backend/flow-runner";
import { startStdioTransport } from "./transport/stdio";
import { startHttpTransport } from "./transport/http";
import { configureLogger, log, describeError } from "./logger";
import { VERSION } from "./version";

async function main(): Promise<void> {
  const config = loadConfig();
  configureLogger(config.logLevel);

  const userAgent = `whisper-graph-mcp/${VERSION}`;
  const backend = new HostedBackend({
    baseUrl: config.dbUrl,
    queryTimeoutMs: config.queryTimeoutMs,
    statsTimeoutMs: config.dbTimeoutMs,
    userAgent,
  });
  const flowRunner = new HostedFlowRunner({
    runUrl: config.flowRunUrl,
    timeoutMs: config.flowTimeoutMs,
    userAgent,
  });
  const deps = { config, backend, flowRunner };

  if (config.transport === "http") {
    await startHttpTransport(deps);
  } else {
    await startStdioTransport(deps);
  }
}

main().catch((error: unknown) => {
  log.error(`whisper-graph-mcp failed to start: ${describeError(error)}`);
  process.exitCode = 1;
});
