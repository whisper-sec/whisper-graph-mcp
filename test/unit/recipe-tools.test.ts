import { describe, it, expect, beforeEach } from "vitest";
import { RecipeTools } from "../../src/tools/recipe-tools";
import { FakeBackend, FakeFlowRunner } from "../fake-backend";
import type { Credential } from "../../src/credentials";

const KEY: Credential = { headerName: "X-API-Key", headerValue: "k" };

describe("RecipeTools", () => {
  let backend: FakeBackend;
  let flowRunner: FakeFlowRunner;
  let tools: RecipeTools;

  beforeEach(() => {
    backend = new FakeBackend();
    flowRunner = new FakeFlowRunner();
    tools = new RecipeTools(backend, flowRunner);
  });

  it("lists 29 recipes split 14 direct / 15 flow", () => {
    const all = tools.listRecipes().recipes;
    expect(all).toHaveLength(29);
    expect(all.filter((r) => r.mode === "direct")).toHaveLength(14);
    expect(all.filter((r) => r.mode === "flow")).toHaveLength(15);
  });

  it("filters by mode and access", () => {
    expect(tools.listRecipes({ mode: "flow" }).recipes.every((r) => r.mode === "flow")).toBe(true);
    expect(
      tools.listRecipes({ access: "keyless" }).recipes.every((r) => r.access === "keyless"),
    ).toBe(true);
  });

  it("falls back to the catalog default when an input is omitted", async () => {
    backend.executeImpl = async () => ({ columns: ["host"], rows: [{ host: "8.8.8.8" }] });
    const out = await tools.runRecipe("assess", undefined, undefined, null);
    expect(out.success).toBe(true);
    expect(backend.lastExecuteCall.parameters).toEqual({ v: "8.8.8.8" });
  });

  it("runs a direct recipe keyless even when a credential is supplied", async () => {
    backend.executeImpl = async () => ({ columns: [], rows: [] });
    await tools.runRecipe("identify", { v: "github.com" }, undefined, KEY);
    expect(backend.lastExecuteCall.credential).toBeNull();
    expect(flowRunner.runCalls).toHaveLength(0);
  });

  it("refuses a keyed flow with a helpful error when no credential is present", async () => {
    const out = await tools.runRecipe("typosquat", { domain: "paypal.com" }, undefined, null);
    expect(out.success).toBe(false);
    expect(out.mode).toBe("flow");
    expect(out.suggestion).toContain("WHISPER_API_KEY");
    expect(flowRunner.runCalls).toHaveLength(0);
  });

  it("relays the credential to the flow runner for a keyed flow", async () => {
    flowRunner.runImpl = async (call) => ({ slug: call.slug, totalLatencyMs: 5, steps: [] });
    const out = await tools.runRecipe(
      "infrastructure-mapping",
      { value: "cloudflare.com" },
      { level: "deep" },
      KEY,
    );
    expect(out.success).toBe(true);
    expect(flowRunner.lastRunCall.credential).toEqual(KEY);
    expect(flowRunner.lastRunCall.params).toEqual({ level: "deep" });
  });

  it("returns a helpful error listing slugs for an unknown recipe", async () => {
    const out = await tools.runRecipe("bogus", undefined, undefined, KEY);
    expect(out.success).toBe(false);
    expect(out.suggestion).toContain("list_recipes");
    expect(backend.executeCalls).toHaveLength(0);
  });
});
