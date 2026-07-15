/**
 * Regenerate src/catalog/recipes.json from the canonical whisper-catalog.
 *
 * The catalog (whisper-sec/whisper-catalog `catalog.json`) is the single
 * machine-readable source of truth for every graph query and read flow. This
 * script distils it into the compact registry the MCP server ships and serves
 * through the `list_recipes` and `run_recipe` tools, so the two stay in sync
 * by regeneration rather than by hand.
 *
 * The distilled file is committed to the repo so the package is fully
 * self-contained at runtime (no cross-repo dependency when the server runs).
 * Re-run this whenever the catalog changes:
 *
 *   node scripts/sync-catalog.mjs [path-or-url-to-catalog.json]
 *
 * With no argument it reads ../whisper-catalog/catalog.json relative to the
 * repo root. Pass a path or an https URL to point it elsewhere.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "../src/catalog/recipes.json");
const source = process.argv[2] ?? resolve(here, "../../whisper-catalog/catalog.json");

async function loadCatalog(src) {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${src} failed: HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(await readFile(src, "utf8"));
}

function distilInputs(entry) {
  return (entry.inputs ?? []).map((input) => ({
    name: input.paramName ?? input.id,
    default: input.default,
    ...(input.examples ? { examples: input.examples } : {}),
  }));
}

function distilParams(entry) {
  return (entry.params ?? []).map((param) => ({
    name: param.name,
    kind: param.kind,
    default: param.default,
    ...(param.options ? { options: param.options } : {}),
  }));
}

function distilEntry(catalog, entry) {
  const docsBase = catalog.graph.docsBase.replace(/\/+$/, "");
  const mode = entry.exec.mode;
  const base = {
    slug: entry.id,
    title: entry.title,
    category: entry.category,
    purpose: entry.purpose,
    mode,
    access: entry.access,
    docsUrl: entry.docPath ? `${docsBase}${entry.docPath}` : docsBase,
    inputs: distilInputs(entry),
    params: distilParams(entry),
    columns: entry.columns ?? [],
  };
  if (mode === "direct") {
    base.cypher = entry.exec.cypher;
  }
  return base;
}

const catalog = await loadCatalog(source);
if (!catalog.entries || !catalog.graph) {
  throw new Error("catalog.json missing 'entries' or 'graph'");
}

const registry = {
  schemaVersion: catalog.schemaVersion,
  source: "whisper-sec/whisper-catalog catalog.json",
  generatedAt: new Date().toISOString(),
  graphEndpoint: catalog.graph.endpoint,
  docsBase: catalog.graph.docsBase.replace(/\/+$/, ""),
  flowRun: {
    endpoint: catalog.graph.flowRun.endpoint,
    method: catalog.graph.flowRun.method,
    transport: catalog.graph.flowRun.transport,
  },
  recipes: catalog.entries.map((entry) => distilEntry(catalog, entry)),
};

await writeFile(outPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
console.log(
  `Wrote ${registry.recipes.length} recipes to ${outPath} ` +
    `(${registry.recipes.filter((r) => r.mode === "direct").length} direct, ` +
    `${registry.recipes.filter((r) => r.mode === "flow").length} flow).`,
);
