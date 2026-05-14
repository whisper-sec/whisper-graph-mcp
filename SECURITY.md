# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities privately to **security@whisper.security**.
Do not open a public issue for security problems.

We will acknowledge your report, keep you updated on remediation progress, and
credit you (if you wish) once a fix is released.

## Scope

This policy covers the **whisper-graph-mcp** server in this repository — the MCP
protocol layer and its handling of credentials, configuration, and queries.

The hosted WhisperGraph API (`graph.whisper.security`) and the hosted MCP server
(`mcp.whisper.security`) are operated separately; report issues with those to the
same address.

## Notes

- The Cypher validator in this server is a **safety feature** — it blocks
  expensive or unbounded queries before they reach the backend. It is not a
  security boundary; the hosted API is read-only and enforces its own limits.
- In HTTP mode this server does not authenticate inbound requests. It relays the
  caller's credential to the hosted API. Deploy it behind your own gateway if you
  need access control.

## Supported versions

The latest released minor version receives security fixes.
