import type { Credential } from "../credentials";
import type { GraphBackend } from "../backend/graph-backend";
import type { FlowRunner, FlowStep } from "../backend/flow-runner";
import {
  findRecipe,
  listRecipes,
  recipeSlugs,
  resolveValues,
  type Recipe,
} from "../catalog/recipes";
import { CypherExecutionException, WhisperDbException } from "../backend/errors";
import { log, describeError } from "../logger";

type Row = Record<string, unknown>;

/** A recipe as summarised by `list_recipes`. */
interface RecipeSummary {
  readonly slug: string;
  readonly title: string;
  readonly purpose: string;
  readonly category: string;
  readonly mode: "direct" | "flow";
  readonly access: "keyless" | "keyed";
  readonly requiresKey: boolean;
  readonly inputs: Array<{ name: string; default?: unknown; examples?: readonly string[] }>;
  readonly params: Array<{ name: string; default?: unknown; options?: readonly string[] }>;
  readonly columns: readonly string[];
  readonly docsUrl: string;
}

function summarise(recipe: Recipe): RecipeSummary {
  return {
    slug: recipe.slug,
    title: recipe.title,
    purpose: recipe.purpose,
    category: recipe.category,
    mode: recipe.mode,
    access: recipe.access,
    requiresKey: recipe.access === "keyed",
    inputs: recipe.inputs.map((input) => ({
      name: input.name,
      default: input.default,
      ...(input.examples ? { examples: input.examples } : {}),
    })),
    params: recipe.params.map((param) => ({
      name: param.name,
      default: param.default,
      ...(param.options ? { options: param.options } : {}),
    })),
    columns: recipe.columns,
    docsUrl: recipe.docsUrl,
  };
}

/**
 * Backs the `list_recipes` and `run_recipe` tools - the full whisper.security
 * catalog exposed as MCP tools. `direct` recipes are single graph procedure
 * calls (keyless-capable); `flow` recipes are multi-step read flows run through
 * the gallery flow runner (keyed).
 */
export class RecipeTools {
  constructor(
    private readonly backend: GraphBackend,
    private readonly flowRunner: FlowRunner,
  ) {}

  listRecipes(filter?: { mode?: "direct" | "flow"; access?: "keyless" | "keyed" }): {
    recipes: RecipeSummary[];
  } {
    return { recipes: listRecipes(filter).map(summarise) };
  }

  async runRecipe(
    slug: string | null | undefined,
    inputs: Record<string, unknown> | undefined,
    params: Record<string, unknown> | undefined,
    credential: Credential | null,
  ): Promise<{
    success: boolean;
    recipe?: string;
    mode?: "direct" | "flow";
    columns?: string[];
    rows?: Row[];
    steps?: FlowStep[];
    totalLatencyMs?: number;
    statistics?: { rowCount: number; executionTimeMs: number };
    error?: string;
    suggestion?: string;
  }> {
    const recipe = slug ? findRecipe(slug) : undefined;
    if (!recipe) {
      return {
        success: false,
        error: `Unknown recipe "${slug ?? ""}".`,
        suggestion: `Call list_recipes to see all recipes. Known slugs: ${recipeSlugs().join(", ")}.`,
      };
    }

    const resolvedInputs = resolveValues(recipe.inputs, inputs);
    const resolvedParams = resolveValues(recipe.params, params);

    if (recipe.mode === "direct") {
      return this.runDirect(recipe, resolvedInputs);
    }
    return this.runFlow(recipe, resolvedInputs, resolvedParams, credential);
  }

  private async runDirect(
    recipe: Recipe,
    parameters: Record<string, unknown>,
  ): Promise<ReturnType<RecipeTools["runRecipe"]>> {
    if (!recipe.cypher) {
      return { success: false, recipe: recipe.slug, error: "Recipe has no query to run." };
    }
    try {
      const raw = await this.backend.execute(recipe.cypher, parameters, /* credential */ null);
      // Direct read procedures serve keyless; a null credential keeps them
      // keyless. (run_recipe passes the caller's key through runFlow only.)
      return {
        success: true,
        recipe: recipe.slug,
        mode: "direct",
        columns: raw.columns ?? [],
        rows: raw.rows ?? [],
        statistics: raw.statistics,
      };
    } catch (error) {
      log.warn(`run_recipe(${recipe.slug}) failed: ${describeError(error)}`);
      return {
        success: false,
        recipe: recipe.slug,
        mode: "direct",
        error: error instanceof Error ? error.message : String(error),
        suggestion: `See ${recipe.docsUrl} for this procedure.`,
      };
    }
  }

  private async runFlow(
    recipe: Recipe,
    inputs: Record<string, unknown>,
    params: Record<string, unknown>,
    credential: Credential | null,
  ): Promise<ReturnType<RecipeTools["runRecipe"]>> {
    if (!credential) {
      return {
        success: false,
        recipe: recipe.slug,
        mode: "flow",
        error: `Recipe "${recipe.slug}" is a multi-step flow and needs a WhisperGraph API key.`,
        suggestion:
          "Set WHISPER_API_KEY (stdio) or send X-API-Key / Authorization (HTTP). " +
          `Get a free key at https://console.whisper.security/sign-up. Docs: ${recipe.docsUrl}.`,
      };
    }
    try {
      const result = await this.flowRunner.run(recipe.slug, inputs, params, credential);
      return {
        success: true,
        recipe: recipe.slug,
        mode: "flow",
        steps: result.steps,
        totalLatencyMs: result.totalLatencyMs,
      };
    } catch (error) {
      log.warn(`run_recipe(${recipe.slug}) flow failed: ${describeError(error)}`);
      const retryable = error instanceof WhisperDbException;
      const message =
        error instanceof CypherExecutionException || error instanceof WhisperDbException
          ? error.message
          : String(error);
      return {
        success: false,
        recipe: recipe.slug,
        mode: "flow",
        error: message,
        suggestion: retryable
          ? "The flow runner was unreachable. Try again in a moment."
          : `See ${recipe.docsUrl} for this recipe.`,
      };
    }
  }
}
