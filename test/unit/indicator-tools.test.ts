import { describe, it, expect, beforeEach } from "vitest";
import { IndicatorTools } from "../../src/tools/indicator-tools";
import { CypherExecutionException } from "../../src/backend/errors";
import { FakeBackend } from "../fake-backend";

const CREDENTIAL = { headerName: "X-API-Key", headerValue: "test-key" };

describe("IndicatorTools", () => {
  let backend: FakeBackend;
  let tools: IndicatorTools;

  beforeEach(() => {
    backend = new FakeBackend();
    tools = new IndicatorTools(backend);
  });

  describe("explainIndicator", () => {
    it("calls explain() with the indicator as a bound parameter", async () => {
      backend.executeImpl = async () => ({ rows: [{ indicator: "8.8.8.8", level: "NONE" }] });

      const result = await tools.explainIndicator("8.8.8.8", CREDENTIAL);

      expect(result).toEqual({ rows: [{ indicator: "8.8.8.8", level: "NONE" }] });
      expect(backend.lastExecuteCall.cypher).toBe("CALL explain($indicator)");
      expect(backend.lastExecuteCall.parameters).toEqual({ indicator: "8.8.8.8" });
      expect(backend.lastExecuteCall.credential).toBe(CREDENTIAL);
    });

    it.each(["has spaces", "with'quote", "drop();", "{braces}", ""])(
      "rejects an invalid indicator without calling the backend: %j",
      async (indicator) => {
        const result = await tools.explainIndicator(indicator, CREDENTIAL);
        expect(result.rows[0]).toMatchObject({ available: false, error: "invalid_indicator" });
        expect(backend.executeCalls).toHaveLength(0);
      },
    );

    it("accepts IP, hostname, CIDR, and ASN forms", async () => {
      backend.executeImpl = async () => ({ rows: [] });
      for (const indicator of [
        "8.8.8.8",
        "2001:4860:4860::8888",
        "1.0.0.0/24",
        "AS13335",
        "www.google.com",
      ]) {
        await tools.explainIndicator(indicator, CREDENTIAL);
      }
      expect(backend.executeCalls).toHaveLength(5);
    });

    it("returns a structured lookup_failed row when the backend throws", async () => {
      backend.executeImpl = async () => {
        throw new CypherExecutionException("boom");
      };

      const result = await tools.explainIndicator("8.8.8.8", CREDENTIAL);

      expect(result.rows[0]).toMatchObject({
        indicator: "8.8.8.8",
        available: false,
        error: "lookup_failed",
      });
    });
  });

  describe("whisperHistory", () => {
    it("calls whisper.history() with the indicator as a bound parameter", async () => {
      backend.executeImpl = async () => ({ rows: [{ type: "domain" }] });

      const result = await tools.whisperHistory("google.com", CREDENTIAL);

      expect(result).toEqual({ rows: [{ type: "domain" }] });
      expect(backend.lastExecuteCall.cypher).toBe("CALL whisper.history($indicator)");
      expect(backend.lastExecuteCall.parameters).toEqual({ indicator: "google.com" });
    });

    it("rejects an invalid indicator", async () => {
      const result = await tools.whisperHistory("not valid!", CREDENTIAL);
      expect(result.rows[0]).toMatchObject({ available: false, error: "invalid_indicator" });
      expect(backend.executeCalls).toHaveLength(0);
    });

    it("passes a timeout row through unchanged and does not retry", async () => {
      backend.executeImpl = async () => ({
        rows: [{ available: false, error: "timeout", retryAfter: 30 }],
      });

      const result = await tools.whisperHistory("8.8.8.8", CREDENTIAL);

      expect(result.rows).toEqual([{ available: false, error: "timeout", retryAfter: 30 }]);
      expect(backend.executeCalls).toHaveLength(1);
    });
  });

  describe("domainVariants", () => {
    it("calls whisper.variants() with HOSTNAME and checkExisting by default", async () => {
      backend.executeImpl = async () => ({ rows: [{ variant: "g00gle.com" }] });

      const result = await tools.domainVariants("google.com", undefined, false, CREDENTIAL);

      expect(result).toEqual({ rows: [{ variant: "g00gle.com" }] });
      expect(backend.lastExecuteCall.cypher).toBe(
        "CALL whisper.variants($name, $label, $checkExisting)",
      );
      expect(backend.lastExecuteCall.parameters).toEqual({
        name: "google.com",
        label: "HOSTNAME",
        checkExisting: true,
      });
    });

    it("sets checkExisting false when includeNonExistent is true", async () => {
      backend.executeImpl = async () => ({ rows: [] });

      await tools.domainVariants("google.com", undefined, true, CREDENTIAL);

      expect(backend.lastExecuteCall.parameters).toMatchObject({ checkExisting: false });
    });

    it("uppercases a custom label", async () => {
      backend.executeImpl = async () => ({ rows: [] });

      await tools.domainVariants("acme.com", "mail_server", false, CREDENTIAL);

      expect(backend.lastExecuteCall.parameters).toMatchObject({ label: "MAIL_SERVER" });
    });

    it("accepts a Unicode (homoglyph) name", async () => {
      backend.executeImpl = async () => ({ rows: [] });

      await tools.domainVariants("gооgle.com", undefined, false, CREDENTIAL);

      expect(backend.executeCalls).toHaveLength(1);
    });

    it("rejects an invalid name", async () => {
      const result = await tools.domainVariants("bad name()", undefined, false, CREDENTIAL);
      expect(result.rows[0]).toMatchObject({ available: false, error: "invalid_name" });
      expect(backend.executeCalls).toHaveLength(0);
    });

    it("rejects an invalid label", async () => {
      const result = await tools.domainVariants("google.com", "123-bad", false, CREDENTIAL);
      expect(result.rows[0]).toMatchObject({ available: false, error: "invalid_label" });
      expect(backend.executeCalls).toHaveLength(0);
    });

    it("caps results at 500 rows", async () => {
      const overLimit = Array.from({ length: 600 }, (_, i) => ({ variant: `v${i}.com` }));
      backend.executeImpl = async () => ({ rows: overLimit });

      const result = await tools.domainVariants("google.com", undefined, false, CREDENTIAL);

      expect(result.rows).toHaveLength(500);
    });

    it("returns a structured lookup_failed row when the backend throws", async () => {
      backend.executeImpl = async () => {
        throw new CypherExecutionException("boom");
      };

      const result = await tools.domainVariants("google.com", undefined, false, CREDENTIAL);

      expect(result.rows[0]).toMatchObject({ available: false, error: "lookup_failed" });
    });
  });
});
