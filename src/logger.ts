export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let threshold = LEVEL_RANK.info;

/** Sets the minimum level that will be written. Call once at startup. */
export function configureLogger(level: LogLevel): void {
  threshold = LEVEL_RANK[level];
}

// All logging goes to stderr — stdout is the protocol channel in stdio mode.
function write(level: LogLevel, message: string): void {
  if (LEVEL_RANK[level] >= threshold) {
    process.stderr.write(`[${level}] ${message}\n`);
  }
}

export const log = {
  debug: (message: string) => write("debug", message),
  info: (message: string) => write("info", message),
  warn: (message: string) => write("warn", message),
  error: (message: string) => write("error", message),
};

/** Renders an unknown thrown value as a short string for logging. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
