# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-07-15

### Added

- Two new tools that expose the full whisper.security catalog of ready-made
  recipes, generated from the canonical catalog so they stay in sync:
  - `list_recipes` - lists all 29 catalog recipes (14 keyless direct procedures
    - 15 keyed multi-step flows) with their inputs, params, columns, and docs
      link; optional `mode` / `access` filters.
  - `run_recipe` - runs any recipe by slug. Direct recipes (assess, identify,
    explain, variants, origins, history, walk, psl, asSet, lookupTorRelay,
    db.schema) run keyless and return columns/rows; flow recipes (attack-path,
    attack-surface, indicator-enrichment, infrastructure-mapping,
    subdomain-takeover, bgp-hijack-exposure, blast-radius, route-health,
    typosquat, and more) run through the gallery flow runner (SSE) with the
    caller's key and return the per-step results.
- `scripts/sync-catalog.mjs` (`npm run sync:catalog`) regenerates the vendored
  `src/catalog/recipes.json` from the canonical whisper.security catalog.
- `WHISPER_FLOW_RUN_URL` and `WHISPER_FLOW_TIMEOUT_MS` configuration for the
  flow runner endpoint and per-flow deadline.

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
