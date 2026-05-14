import { type QueryValidationRule, ValidationResult } from "./types";

/**
 * Rejects `WHERE n:A OR n:B` on the same variable - the classic defensive query a
 * model writes when unsure which label exists (e.g. `h:HOSTNAME OR h:DOMAIN`). The
 * OR forces the engine to evaluate every branch separately.
 *
 * Allowed (this rule does NOT trigger on):
 *   - `(h:A|B)` - native label-pipe syntax; the engine optimizes this
 *   - `WHERE h.x = 1 OR h.y = 2` - disjunction on properties
 *   - `WHERE h:A OR ip:B` - different variables
 *
 * The backreference (\1) keeps this from flagging label tests on different
 * variables. Group 1 captures the variable name.
 */
const SAME_VAR_LABEL_OR = /\b([a-zA-Z_]\w*)\s*:\s*\w+\s+OR\s+\1\s*:\s*\w+/i;

export const labelDisjunctionRule: QueryValidationRule = {
  name: "label-disjunction",

  validate(_normalized, stripped) {
    const match = SAME_VAR_LABEL_OR.exec(stripped);
    if (match) {
      const variable = match[1]!;
      return ValidationResult.invalid(
        `WHERE ${variable}:Label OR ${variable}:Label disjunction forces the engine to evaluate each branch separately and often scans multiple labels.`,
        `Pick the right label first. Call list_labels to see what exists (there is no DOMAIN/FQDN - only HOSTNAME). For a real multi-label lookup use UNION across separate MATCH clauses, or the label-pipe syntax \`(${variable}:A|B)\`.`,
      );
    }
    return ValidationResult.ok();
  },
};
