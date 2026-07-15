import registry from "./recipes.json" with { type: "json" };

/** One declared input (or flow parameter) of a recipe. */
export interface RecipeInput {
  readonly name: string;
  readonly default?: unknown;
  readonly kind?: string;
  readonly examples?: readonly string[];
  readonly options?: readonly string[];
}

/**
 * One catalog recipe. `direct` recipes are a single graph procedure call
 * (keyless-capable); `flow` recipes are multi-step read flows run through the
 * gallery flow runner (keyed).
 */
export interface Recipe {
  readonly slug: string;
  readonly title: string;
  readonly category: string;
  readonly purpose: string;
  readonly mode: "direct" | "flow";
  readonly access: "keyless" | "keyed";
  readonly docsUrl: string;
  readonly inputs: readonly RecipeInput[];
  readonly params: readonly RecipeInput[];
  readonly columns: readonly string[];
  /** Present only for `direct` recipes: the graph Cypher to execute. */
  readonly cypher?: string;
}

export interface RecipeRegistry {
  readonly schemaVersion: number;
  readonly source: string;
  readonly generatedAt: string;
  readonly graphEndpoint: string;
  readonly docsBase: string;
  readonly flowRun: {
    readonly endpoint: string;
    readonly method: string;
    readonly transport: string;
  };
  readonly recipes: readonly Recipe[];
}

const REGISTRY = registry as RecipeRegistry;

const BY_SLUG = new Map<string, Recipe>(REGISTRY.recipes.map((recipe) => [recipe.slug, recipe]));

/** The distilled catalog, generated from whisper-catalog by scripts/sync-catalog.mjs. */
export function recipeRegistry(): RecipeRegistry {
  return REGISTRY;
}

/** All recipes, optionally filtered by mode and/or access. */
export function listRecipes(filter?: {
  mode?: "direct" | "flow";
  access?: "keyless" | "keyed";
}): Recipe[] {
  return REGISTRY.recipes.filter(
    (recipe) =>
      (filter?.mode == null || recipe.mode === filter.mode) &&
      (filter?.access == null || recipe.access === filter.access),
  );
}

/** Look up a recipe by its slug, or `undefined` if there is no such recipe. */
export function findRecipe(slug: string): Recipe | undefined {
  return BY_SLUG.get(slug);
}

/** Every known slug, sorted - used to build a helpful "did you mean" error. */
export function recipeSlugs(): string[] {
  return [...BY_SLUG.keys()].sort();
}

/**
 * Resolve a recipe's effective input/param values: caller-supplied values win,
 * otherwise the catalog default is used (dropping entries with no value). The
 * result is keyed by the wire name the graph procedure / flow runner expects.
 */
export function resolveValues(
  declared: readonly RecipeInput[],
  supplied: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const input of declared) {
    const provided = supplied?.[input.name];
    if (provided !== undefined && provided !== null && provided !== "") {
      out[input.name] = provided;
    } else if (input.default !== undefined && input.default !== null) {
      out[input.name] = input.default;
    }
  }
  return out;
}
