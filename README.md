<p align="center">
  <img src="./assets/whisper-logo.svg" alt="WhisperGraph" width="120" />
</p>

<h1 align="center">WhisperGraph MCP Server</h1>

<p align="center">
  The internet's infrastructure graph for AI agents — 46B nodes and edges mapping DNS, IPs, ASNs, BGP, WHOIS, Web links and threat intel. Sign up programmatically in 2 HTTP calls.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@whisper-security/whisper-graph-mcp"><img src="https://img.shields.io/npm/v/@whisper-security/whisper-graph-mcp.svg" alt="npm version" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node >= 20" />
</p>

---

**WhisperGraph** is an MCP server backed by the world's largest internet-infrastructure graph database — **46 billion nodes and edges across 20 entity types**, mapping every domain, IP, ASN, prefix, organization, Web link and threat-intelligence listing into a single Cypher-queryable graph. Used by security teams, incident responders, and AI agents for investigation, attribution, brand protection, and infrastructure forensics.

**Built for agents from day one.**

- **Programmatic signup in 2 HTTP calls.** No browser, no CAPTCHA, no human-in-the-loop. Email verification only. Working API key in ~5 seconds.
- **Free trial for everyone**, including agents. Paid tiers for higher quotas.

**What you can ask:**

- DNS: resolution, nameservers, MX, SPF chains, DNSSEC
- Routing: ASN ownership, BGP origin history, MOAS conflicts, peering
- Hosting & ownership: registrar, WHOIS contacts, organization mapping
- Threat intel: ~40 feeds across 18 categories, `CALL explain()` for full threat scoring
- Historical: WHOIS history, BGP route changes
- Web: 10.9B hyperlinks for inter-domain analysis

**Learn more:**
[Agent signup](https://www.whisper.security/docs/agent-signup) ·
[WhisperGraph intro](https://www.whisper.security/docs/whisper-graph-intro) ·
[Cypher API reference](https://www.whisper.security/docs/cypher-api-reference) ·
[Query guide](https://www.whisper.security/docs/cypher-query-guide) ·
[Cypher syntax](https://www.whisper.security/docs/cypher-syntax) ·
[Functions](https://www.whisper.security/docs/cypher-functions) ·
[Best practices](https://www.whisper.security/docs/cypher-best-practices) ·
[MCP setup](https://www.whisper.security/docs/mcp/setup)

## Quick start

You need a WhisperGraph API key. Get one either:

- **Programmatically** (recommended for agents) — see [Agent quickstart](#agent-quickstart) below.
- **Via the dashboard** (recommended for humans) — [console.whisper.security/sign-up](https://console.whisper.security/sign-up).

### Hosted remote server (no install)

Whisper runs a hosted MCP server at `https://mcp.whisper.security`. Point any MCP client that supports remote servers at it and authenticate with your API key:

```json
{
  "mcpServers": {
    "whisper": {
      "url": "https://mcp.whisper.security",
      "headers": { "Authorization": "Bearer <your_api_key>" }
    }
  }
}
```

### Claude Desktop / Claude Code / Cursor (stdio)

For local stdio transport, add this to your MCP client config:

```json
{
  "mcpServers": {
    "whisper-graph": {
      "command": "npx",
      "args": ["-y", "@whisper-security/whisper-graph-mcp"],
      "env": { "WHISPER_API_KEY": "your-api-key" }
    }
  }
}
```

Or with Claude Code:

```bash
claude mcp add whisper-graph -e WHISPER_API_KEY=your-api-key -- npx -y @whisper-security/whisper-graph-mcp
```

Self-hosting this repo is for teams who want to run the MCP layer in their own environment. See [How to set up](https://www.whisper.security/docs/mcp/setup).

## Agent quickstart

Get a working API key in two HTTP calls — no browser, no CAPTCHA, no waiting list.

**Step 1** — start signup (Whisper emails a verification code):

```http
POST https://console.whisper.security/api/signup
Content-Type: application/json

{"email":"your-agent@example.com","attribution":{"agent_name":"your-agent","source":"<registry-name>"}}
```

**Step 2** — verify with the emailed code:

```http
POST https://console.whisper.security/api/signup/verify
Content-Type: application/json

{"signup_id":"...","code":"..."}
```

The response contains `api_key`, `mcp_url`, `dashboard_url`, and `docs_url`. Use `api_key` in the MCP config snippet above. Full docs: [whisper.security/docs/agent-signup](https://www.whisper.security/docs/agent-signup).

## Tools

All six tools are read-only.

| Tool                | What it does                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `query`             | Execute a Cypher query against WhisperGraph. Validated against a safety rule set before it reaches the backend. |
| `list_labels`       | List every node label with counts. Call it before writing a query when you're unsure which label to anchor on.  |
| `describe_label`    | Confirm a label exists and enumerate its property keys.                                                         |
| `explain_indicator` | Threat assessment for an IP, hostname, CIDR, or ASN — score, level, factors, sources.                           |
| `whisper_history`   | Historical WHOIS or BGP data for an indicator.                                                                  |
| `domain_variants`   | Typosquatting / brand-protection variants of a domain, checked against the graph.                               |

### Resources

Six MCP resources: the full schema, the relationship map, a Cypher function reference, a query cookbook, plus live `whisper://stats` and `whisper://quota`.

### Prompts

Eight investigation-workflow prompt templates: `investigate-ip`, `map-attack-surface`, `compare-domains`, `blast-radius`, `threat-triage`, `whois-pivot`, `bgp-investigation`, `typosquat-sweep`.

## Self-hosting (Docker / HTTP)

For remote or team deployments, run the server over Streamable HTTP:

```bash
docker run -p 8080:8080 -e MCP_TRANSPORT=http \
  ghcr.io/whisper-sec/whisper-graph-mcp:latest
```

Or with Docker Compose:

```bash
docker compose up
```

In HTTP mode the server **does not authenticate inbound requests** — it relays the
caller's `X-API-Key` or `Authorization: Bearer` header to the hosted WhisperGraph
API, falling back to the `WHISPER_API_KEY` environment variable when no header is
present. Put it behind your own gateway if you need access control.

## Configuration

All configuration is via environment variables.

| Variable                   | Default                          | Description                                                                                                                   |
| -------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `WHISPER_API_KEY`          | _(none)_                         | Your WhisperGraph API key. Get one [programmatically in 2 HTTP calls](https://www.whisper.security/docs/agent-signup) or via the [dashboard](https://console.whisper.security/sign-up). |
| `MCP_TRANSPORT`            | `stdio`                          | `stdio` for local CLI use, `http` for remote/Docker.                                                                          |
| `HTTP_HOST`                | `0.0.0.0`                        | Bind host for the HTTP transport.                                                                                             |
| `HTTP_PORT`                | `8080`                           | Bind port for the HTTP transport.                                                                                             |
| `WHISPER_ALLOWED_HOSTS`    | _(none)_                         | Comma-separated `Host` header allowlist for DNS-rebinding protection in HTTP mode. Leave empty only behind a trusted gateway. |
| `WHISPER_DB_URL`           | `https://graph.whisper.security` | Base URL of the hosted WhisperGraph API.                                                                                      |
| `WHISPER_QUERY_TIMEOUT_MS` | `60000`                          | Hard per-query deadline forwarded to the API.                                                                                 |
| `WHISPER_DB_TIMEOUT_MS`    | `10000`                          | HTTP timeout for non-query calls.                                                                                             |
| `LOG_LEVEL`                | `info`                           | `debug`, `info`, `warn`, or `error`.                                                                                          |

## Development

```bash
npm install
npm run dev       # run from source over stdio
npm test          # unit + integration tests (no secrets needed)
npm run build     # bundle to dist/
npm run lint      # eslint
npm run typecheck # tsc --noEmit
```

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) and our
[Code of Conduct](./CODE_OF_CONDUCT.md). Security issues: see [SECURITY.md](./SECURITY.md).

## License

[Apache-2.0](./LICENSE). "Whisper", the Whisper logo, and "WhisperGraph" are
trademarks of Whisper Security — see [NOTICE](./NOTICE).
