import { z } from "zod";

const TRANSPORTS = ["stdio", "http"] as const;
const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

const ConfigSchema = z.object({
  /** Transport to serve on: `stdio` for local CLI use, `http` for remote/Docker. */
  transport: z.enum(TRANSPORTS).default("stdio"),
  /** Bind host for the HTTP transport. */
  httpHost: z.string().min(1).default("0.0.0.0"),
  /** Bind port for the HTTP transport. */
  httpPort: z.coerce.number().int().positive().max(65535).default(8080),
  /**
   * Comma-separated allowlist of `Host` header values accepted by the HTTP
   * transport (DNS-rebinding protection). Empty means no Host validation -
   * intended only when a trusted gateway sits in front of the server.
   */
  allowedHosts: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(",")
        .map((host) => host.trim())
        .filter((host) => host.length > 0),
    ),
  /** Base URL of the hosted WhisperGraph API. */
  dbUrl: z
    .string()
    .url()
    .refine((url) => /^https?:\/\//i.test(url), "must be an http(s) URL")
    .default("https://graph.whisper.security"),
  /** API key relayed to the hosted API in stdio mode, and as the HTTP fallback. */
  apiKey: z.string().optional(),
  /** Hard per-query deadline (ms) forwarded to the hosted API. */
  queryTimeoutMs: z.coerce.number().int().positive().default(60000),
  /** HTTP timeout (ms) for non-query calls such as /api/query/stats. */
  dbTimeoutMs: z.coerce.number().int().positive().default(10000),
  logLevel: z.enum(LOG_LEVELS).default("info"),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Reads and validates configuration from the environment, failing fast with a
 * readable message if anything is malformed.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse({
    transport: env.MCP_TRANSPORT,
    httpHost: env.HTTP_HOST,
    httpPort: env.HTTP_PORT,
    allowedHosts: env.WHISPER_ALLOWED_HOSTS,
    dbUrl: env.WHISPER_DB_URL,
    apiKey: env.WHISPER_API_KEY,
    queryTimeoutMs: env.WHISPER_QUERY_TIMEOUT_MS,
    dbTimeoutMs: env.WHISPER_DB_TIMEOUT_MS,
    logLevel: env.LOG_LEVEL,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  return parsed.data;
}
