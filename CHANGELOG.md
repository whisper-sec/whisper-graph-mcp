# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-15

### Added

- Initial release of the open-source WhisperGraph MCP server.
- Six read-only MCP tools: `query`, `list_labels`, `describe_label`,
  `explain_indicator`, `whisper_history`, `domain_variants`.
- Cypher safety validator with seven rules (bounded shortest paths, LIMIT cap,
  unlabeled-match rejection, label-disjunction rejection, unindexed text-op
  rejection, unanchored label-scan rejection, required LIMIT on exploration
  queries).
- Six MCP resources (full schema, relationship map, function reference, query
  cookbook, live stats, live quota) and eight investigation-workflow prompts.
- stdio and Streamable HTTP transports.
- Credential relay: the HTTP transport forwards the caller's `X-API-Key` /
  `Authorization` header to the hosted WhisperGraph API, with a
  `WHISPER_API_KEY` environment-variable fallback.
