import { type QueryValidationRule, ValidationResult } from "./validation/types";
import { DEFAULT_RULES } from "./validation/index";

const DOUBLE_QUOTED = /"(?:[^"\\]|\\.)*"/g;
const SINGLE_QUOTED = /'(?:[^'\\]|\\.)*'/g;

/**
 * Blanks out string literals so keyword/pattern matching never trips on text
 * inside quotes (e.g. a node named "LIMIT 1000").
 */
function stripStringLiterals(cypher: string): string {
  return cypher.replace(DOUBLE_QUOTED, '""').replace(SINGLE_QUOTED, "''");
}

/**
 * Validates a Cypher query against the safety rule set before it reaches the
 * graph backend. Rules run in order; the first failure wins. `EXPLAIN` queries
 * are always allowed - they are planned, not executed.
 */
export class CypherQueryValidator {
  private readonly rules: readonly QueryValidationRule[];

  constructor(rules: readonly QueryValidationRule[] = DEFAULT_RULES) {
    this.rules = rules;
  }

  validate(cypher: string | null | undefined): ValidationResult {
    if (cypher == null || cypher.trim() === "") {
      return ValidationResult.invalid("Query is empty.", "Provide a valid Cypher query.");
    }

    const normalized = cypher.trim();

    if (normalized.toUpperCase().startsWith("EXPLAIN")) {
      return ValidationResult.ok();
    }

    const stripped = stripStringLiterals(normalized);

    for (const rule of this.rules) {
      const result = rule.validate(normalized, stripped);
      if (!result.valid) {
        if (result.ruleName === undefined) {
          return ValidationResult.invalid(result.errorMessage, result.suggestion, rule.name);
        }
        return result;
      }
    }

    return ValidationResult.ok();
  }

  getRules(): readonly QueryValidationRule[] {
    return this.rules;
  }
}
