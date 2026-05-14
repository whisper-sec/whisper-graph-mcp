import type { Credential } from "../credentials";
import type { GraphBackend } from "../backend/graph-backend";
import { log, describeError } from "../logger";

type Row = Record<string, unknown>;

/**
 * Conservative whitelist for indicators: letters, digits, dot, dash, colon
 * (IPv6), slash (CIDR), underscore. Cypher-special characters are excluded and
 * the length is capped to head off pathological input.
 */
const INDICATOR_PATTERN = /^[A-Za-z0-9._:/-]{1,256}$/;

/**
 * Variant-name whitelist for `whisper.variants()`. Admits Unicode letters and
 * digits — homoglyph / IDN detection feeds on confusable scripts — while still
 * excluding Cypher-special characters. Capped at a domain name's RFC limit.
 */
const VARIANT_NAME_PATTERN = /^[\p{L}\p{N}._-]{1,255}$/u;

/** Node label names: uppercase ASCII letters and underscores. */
const LABEL_PATTERN = /^[A-Z_]{1,40}$/;

/** Hard cap on variant rows returned — mirrors the validator's LIMIT ceiling. */
const MAX_VARIANT_ROWS = 500;

function isValidIndicator(indicator: string | null | undefined): indicator is string {
  return indicator != null && INDICATOR_PATTERN.test(indicator);
}

function isValidVariantName(name: string | null | undefined): name is string {
  return name != null && VARIANT_NAME_PATTERN.test(name);
}

/**
 * Backs the `explain_indicator`, `whisper_history`, and `domain_variants` tools.
 * Inputs flow through Cypher as bound parameters (never interpolated) and pass a
 * strict regex check first. On failure these tools return a structured
 * `{ available: false, error, explanation }` row rather than throwing, so the
 * agent always gets actionable JSON.
 */
export class IndicatorTools {
  constructor(private readonly backend: GraphBackend) {}

  async explainIndicator(
    indicator: string | null | undefined,
    credential: Credential | null,
  ): Promise<{ rows: Row[] }> {
    if (!isValidIndicator(indicator)) {
      return {
        rows: [
          {
            indicator: indicator ?? "",
            available: false,
            error: "invalid_indicator",
            explanation:
              "Indicator must be an IP, hostname, CIDR, or ASN. " +
              "Allowed characters: letters, digits, '.', '-', ':', '/', '_'.",
          },
        ],
      };
    }
    try {
      const raw = await this.backend.execute("CALL explain($indicator)", { indicator }, credential);
      return { rows: raw.rows ?? [] };
    } catch (error) {
      log.warn(`explain_indicator failed for "${indicator}": ${describeError(error)}`);
      return {
        rows: [
          {
            indicator,
            available: false,
            error: "lookup_failed",
            explanation: "Threat assessment is temporarily unavailable. Try again in a moment.",
          },
        ],
      };
    }
  }

  async whisperHistory(
    indicator: string | null | undefined,
    credential: Credential | null,
  ): Promise<{ rows: Row[] }> {
    if (!isValidIndicator(indicator)) {
      return {
        rows: [
          {
            indicator: indicator ?? "",
            available: false,
            error: "invalid_indicator",
            explanation: "Indicator must be an IP, hostname, CIDR, or ASN.",
          },
        ],
      };
    }
    try {
      const raw = await this.backend.execute(
        "CALL whisper.history($indicator)",
        { indicator },
        credential,
      );
      return { rows: raw.rows ?? [] };
    } catch (error) {
      log.warn(`whisper_history failed for "${indicator}": ${describeError(error)}`);
      return {
        rows: [
          {
            indicator,
            available: false,
            error: "lookup_failed",
            explanation: "History lookup is temporarily unavailable. Try again in a moment.",
          },
        ],
      };
    }
  }

  async domainVariants(
    name: string | null | undefined,
    label: string | null | undefined,
    includeNonExistent: boolean,
    credential: Credential | null,
  ): Promise<{ rows: Row[] }> {
    if (!isValidVariantName(name)) {
      return {
        rows: [
          {
            name: name ?? "",
            available: false,
            error: "invalid_name",
            explanation:
              "Name must be a domain or hostname. Allowed characters: letters " +
              "(including Unicode, for homoglyph detection), digits, '.', '-', '_'.",
          },
        ],
      };
    }

    const resolvedLabel =
      label == null || label.trim() === "" ? "HOSTNAME" : label.trim().toUpperCase();
    if (!LABEL_PATTERN.test(resolvedLabel)) {
      return {
        rows: [
          {
            name,
            available: false,
            error: "invalid_label",
            explanation:
              "Label must be uppercase letters and underscores only (e.g. HOSTNAME, MAIL_SERVER).",
          },
        ],
      };
    }

    try {
      const raw = await this.backend.execute(
        "CALL whisper.variants($name, $label, $checkExisting)",
        { name, label: resolvedLabel, checkExisting: !includeNonExistent },
        credential,
      );
      const rows = raw.rows ?? [];
      return { rows: rows.length > MAX_VARIANT_ROWS ? rows.slice(0, MAX_VARIANT_ROWS) : rows };
    } catch (error) {
      log.warn(`domain_variants failed for "${name}": ${describeError(error)}`);
      return {
        rows: [
          {
            name,
            available: false,
            error: "lookup_failed",
            explanation: "Variant generation is temporarily unavailable. Try again in a moment.",
          },
        ],
      };
    }
  }
}
