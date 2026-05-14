import { type QueryValidationRule, ValidationResult } from "./types";

/**
 * Rejects standalone unlabeled MATCH patterns like `MATCH (h) WHERE ...` or
 * `MATCH (h) RETURN ...`. Without a label the engine has nothing to anchor on and
 * scans every node in the graph. This targets the defensive pattern an uncertain
 * model writes when it isn't sure which label exists.
 *
 * Allowed (this rule does NOT trigger on):
 *   - `MATCH (h:HOSTNAME)` - labeled
 *   - `MATCH (h)-[:RESOLVES_TO]->(ip:IPV4)` - anchored via a relationship traversal
 *   - `MATCH (h {name: "x"})` - anchored via a property constraint
 *
 * Group 1 captures the variable name, for the error message.
 */
const STANDALONE_UNLABELED = /\bMATCH\s+\(\s*([a-zA-Z_]\w*)\s*\)\s*(?![-<])/i;

export const unlabeledMatchRule: QueryValidationRule = {
  name: "unlabeled-match",

  validate(_normalized, stripped) {
    const match = STANDALONE_UNLABELED.exec(stripped);
    if (match) {
      const variable = match[1]!;
      return ValidationResult.invalid(
        `MATCH (${variable}) has no label. Without a label or anchor, the engine scans every node in the graph (7.39B+).`,
        `Add a label and an indexed lookup, e.g. \`MATCH (${variable}:HOSTNAME {name: "value"})\`. Use list_labels to see all available labels.`,
      );
    }
    return ValidationResult.ok();
  },
};
