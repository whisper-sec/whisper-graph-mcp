/**
 * The WhisperGraph API credential to attach to an outbound request, expressed
 * as a single header. The hosted API accepts either `X-API-Key: <key>` or
 * `Authorization: Bearer <key>`.
 */
export interface Credential {
  readonly headerName: string;
  readonly headerValue: string;
}

export type InboundHeaders = Record<string, string | string[] | undefined>;

function firstHeaderValue(headers: InboundHeaders, name: string): string | undefined {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    const resolved = Array.isArray(value) ? value[0] : value;
    if (resolved && resolved.trim() !== "") {
      return resolved;
    }
  }
  return undefined;
}

/**
 * Resolves the credential for an outbound request. Over HTTP the server relays
 * whatever auth header the caller sent (it never validates it — the hosted API
 * does). Over stdio there are no inbound headers, so the `WHISPER_API_KEY`
 * environment variable is used. The env key is also the fallback for an HTTP
 * request that arrives without an auth header (single-tenant self-hosting).
 */
export function resolveCredential(
  inboundHeaders: InboundHeaders | undefined,
  fallbackApiKey: string | undefined,
): Credential | null {
  if (inboundHeaders) {
    const apiKey = firstHeaderValue(inboundHeaders, "x-api-key");
    if (apiKey) {
      return { headerName: "X-API-Key", headerValue: apiKey };
    }
    const authorization = firstHeaderValue(inboundHeaders, "authorization");
    if (authorization) {
      return { headerName: "Authorization", headerValue: authorization };
    }
  }
  if (fallbackApiKey && fallbackApiKey.trim() !== "") {
    return { headerName: "X-API-Key", headerValue: fallbackApiKey };
  }
  return null;
}
