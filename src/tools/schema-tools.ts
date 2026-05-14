import type { Credential } from "../credentials";
import type { GraphBackend } from "../backend/graph-backend";
import { log, describeError } from "../logger";

const LABEL_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const CACHE_TTL_MS = 5 * 60 * 1000;
const LABELS_KEY = "labels";

type Row = Record<string, unknown>;

/** A small time-to-live cache with bounded size and oldest-entry eviction. */
class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxSize: number,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.entries.size >= this.maxSize && !this.entries.has(key)) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.entries.clear();
  }
}

function isValidLabel(label: string | null | undefined): label is string {
  return label != null && LABEL_PATTERN.test(label);
}

/**
 * Backs `list_labels` and `describe_label`. These are server-issued, trusted
 * introspection queries, so they bypass the Cypher validator. Results are cached
 * for five minutes - schema changes are rare and this caps backend load.
 */
export class SchemaTools {
  private readonly labelsCache = new TtlCache<Row[]>(CACHE_TTL_MS, 1);
  private readonly labelDetailCache = new TtlCache<Row>(CACHE_TTL_MS, 64);

  constructor(private readonly backend: GraphBackend) {}

  async listLabels(credential: Credential | null): Promise<{ labels: Row[] }> {
    return { labels: await this.fetchLabelRows(credential) };
  }

  async describeLabel(
    label: string | null | undefined,
    credential: Credential | null,
  ): Promise<Row> {
    if (!isValidLabel(label)) {
      return {
        name: label ?? "",
        exists: false,
        error: "invalid label name",
        suggestion:
          "Labels are uppercase letters, digits, and underscores (e.g. HOSTNAME, IPV4). " +
          "See list_labels for the full list.",
      };
    }

    const cached = this.labelDetailCache.get(label);
    if (cached) return cached;

    const detail = await this.fetchLabelDetail(label, credential);
    this.labelDetailCache.set(label, detail);
    return detail;
  }

  /** Drops all cached schema info; useful for tests or after a known schema change. */
  invalidateAll(): void {
    this.labelsCache.clear();
    this.labelDetailCache.clear();
  }

  private async fetchLabelRows(credential: Credential | null): Promise<Row[]> {
    const cached = this.labelsCache.get(LABELS_KEY);
    if (cached) return cached;

    let rows: Row[];
    try {
      const raw = await this.backend.execute("CALL db.labels()", undefined, credential);
      rows = raw.rows ?? [];
    } catch (error) {
      // Schema introspection is best-effort: an unreachable backend yields an
      // empty list rather than failing the tool call.
      log.warn(`list_labels failed: ${describeError(error)}`);
      rows = [];
    }
    this.labelsCache.set(LABELS_KEY, rows);
    return rows;
  }

  private async fetchLabelDetail(label: string, credential: Credential | null): Promise<Row> {
    const detail: Row = { name: label };

    // Pull the count from the cached labels list rather than running count(n)
    // against a billion-node label.
    const count = await this.findLabelCount(label, credential);
    const labelExists = count !== null;
    if (count !== null) {
      detail.count = count;
    }
    detail.exists = labelExists;

    if (!labelExists) {
      detail.suggestion = "Label not found. Run list_labels for the full list.";
      return detail;
    }

    // Sample 100 nodes to enumerate observed property keys - bounded so it stays
    // cheap even on billion-scale labels.
    try {
      const cypher =
        `MATCH (n:${label}) WITH n LIMIT 100 ` +
        "UNWIND keys(n) AS k RETURN DISTINCT k AS property";
      const raw = await this.backend.execute(cypher, undefined, credential);
      detail.properties = (raw.rows ?? []).map((row) => String(row.property)).sort();
    } catch (error) {
      log.warn(`describe_label property sampling failed for "${label}": ${describeError(error)}`);
      detail.properties = [];
      detail.propertiesError = "Property sampling failed; see whisper://schema/full";
    }

    detail.edgesDoc = "whisper://schema/relationships";
    return detail;
  }

  private async findLabelCount(
    label: string,
    credential: Credential | null,
  ): Promise<number | null> {
    const rows = await this.fetchLabelRows(credential);
    for (const row of rows) {
      const name = row.label ?? row.name;
      if (label === String(name)) {
        return typeof row.count === "number" ? row.count : null;
      }
    }
    return null;
  }
}
