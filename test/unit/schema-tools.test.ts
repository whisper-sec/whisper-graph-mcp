import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SchemaTools } from "../../src/tools/schema-tools";
import { WhisperDbException } from "../../src/backend/errors";
import { FakeBackend } from "../fake-backend";

const CREDENTIAL = { headerName: "X-API-Key", headerValue: "test-key" };

const LABEL_ROWS = [
  { label: "HOSTNAME", count: 2_600_000_000 },
  { label: "IPV4", count: 619_000_000 },
];

describe("SchemaTools", () => {
  let backend: FakeBackend;
  let tools: SchemaTools;

  beforeEach(() => {
    backend = new FakeBackend();
    tools = new SchemaTools(backend);
  });

  describe("listLabels", () => {
    it("calls db.labels() and wraps the rows", async () => {
      backend.executeImpl = async () => ({ rows: LABEL_ROWS });

      const result = await tools.listLabels(CREDENTIAL);

      expect(result).toEqual({ labels: LABEL_ROWS });
      expect(backend.lastExecuteCall.cypher).toBe("CALL db.labels()");
      expect(backend.lastExecuteCall.credential).toBe(CREDENTIAL);
    });

    it("caches the result for subsequent calls", async () => {
      backend.executeImpl = async () => ({ rows: LABEL_ROWS });

      await tools.listLabels(CREDENTIAL);
      await tools.listLabels(CREDENTIAL);

      expect(backend.executeCalls).toHaveLength(1);
    });

    it("returns an empty list when the backend is unreachable", async () => {
      backend.executeImpl = async () => {
        throw new WhisperDbException("unreachable");
      };

      const result = await tools.listLabels(CREDENTIAL);

      expect(result).toEqual({ labels: [] });
    });
  });

  describe("describeLabel", () => {
    it("rejects an invalid label name without calling the backend", async () => {
      const result = await tools.describeLabel("not a label", CREDENTIAL);

      expect(result.exists).toBe(false);
      expect(result.error).toBe("invalid label name");
      expect(backend.executeCalls).toHaveLength(0);
    });

    it("rejects a null label", async () => {
      const result = await tools.describeLabel(null, CREDENTIAL);
      expect(result).toMatchObject({ name: "", exists: false, error: "invalid label name" });
    });

    it("describes a label that exists, with count and sampled properties", async () => {
      backend.executeImpl = async (call) => {
        if (call.cypher === "CALL db.labels()") return { rows: LABEL_ROWS };
        return { rows: [{ property: "name" }, { property: "threatScore" }] };
      };

      const result = await tools.describeLabel("HOSTNAME", CREDENTIAL);

      expect(result).toMatchObject({
        name: "HOSTNAME",
        exists: true,
        count: 2_600_000_000,
        properties: ["name", "threatScore"],
        edgesDoc: "whisper://schema/relationships",
      });
    });

    it("sorts sampled property keys", async () => {
      backend.executeImpl = async (call) => {
        if (call.cypher === "CALL db.labels()") return { rows: LABEL_ROWS };
        return { rows: [{ property: "threatScore" }, { property: "name" }, { property: "isC2" }] };
      };

      const result = await tools.describeLabel("HOSTNAME", CREDENTIAL);

      expect(result.properties).toEqual(["isC2", "name", "threatScore"]);
    });

    it("reports a valid-but-unknown label as not existing", async () => {
      backend.executeImpl = async () => ({ rows: LABEL_ROWS });

      const result = await tools.describeLabel("NONEXISTENT", CREDENTIAL);

      expect(result).toMatchObject({ name: "NONEXISTENT", exists: false });
      expect(result.suggestion).toContain("list_labels");
    });

    it("records a propertiesError when property sampling fails", async () => {
      backend.executeImpl = async (call) => {
        if (call.cypher === "CALL db.labels()") return { rows: LABEL_ROWS };
        throw new WhisperDbException("sampling failed");
      };

      const result = await tools.describeLabel("HOSTNAME", CREDENTIAL);

      expect(result.exists).toBe(true);
      expect(result.properties).toEqual([]);
      expect(result.propertiesError).toContain("whisper://schema/full");
    });

    it("caches a label detail for subsequent calls", async () => {
      backend.executeImpl = async (call) => {
        if (call.cypher === "CALL db.labels()") return { rows: LABEL_ROWS };
        return { rows: [{ property: "name" }] };
      };

      await tools.describeLabel("HOSTNAME", CREDENTIAL);
      const callsAfterFirst = backend.executeCalls.length;
      await tools.describeLabel("HOSTNAME", CREDENTIAL);

      expect(backend.executeCalls).toHaveLength(callsAfterFirst);
    });
  });

  it("invalidateAll clears both caches", async () => {
    backend.executeImpl = async () => ({ rows: LABEL_ROWS });

    await tools.listLabels(CREDENTIAL);
    tools.invalidateAll();
    await tools.listLabels(CREDENTIAL);

    expect(backend.executeCalls).toHaveLength(2);
  });

  describe("cache expiry", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("re-fetches labels after the 5-minute TTL expires", async () => {
      vi.useFakeTimers();
      backend.executeImpl = async () => ({ rows: LABEL_ROWS });

      await tools.listLabels(CREDENTIAL);
      expect(backend.executeCalls).toHaveLength(1);

      vi.advanceTimersByTime(4 * 60 * 1000);
      await tools.listLabels(CREDENTIAL);
      expect(backend.executeCalls).toHaveLength(1); // still cached

      vi.advanceTimersByTime(61 * 1000);
      await tools.listLabels(CREDENTIAL);
      expect(backend.executeCalls).toHaveLength(2); // TTL expired, re-fetched
    });
  });
});
