import { type QueryValidationRule, ValidationResult } from "./types";

/**
 * Rejects CONTAINS / STARTS WITH / ENDS WITH on properties other than `name`.
 * WhisperGraph's text indexes only cover the `name` property; using these
 * operators on any other property forces a full property scan. Exact-match `=`
 * on other properties is fine and is not flagged.
 *
 * Group 1 = variable, group 2 = property, group 3 = operator.
 */
const PROP_TEXT_OP = /\b([a-zA-Z_]\w*)\.(\w+)\s+(CONTAINS|STARTS\s+WITH|ENDS\s+WITH)\b/gi;

export const unindexedTextOpRule: QueryValidationRule = {
  name: "unindexed-text-op",

  validate(_normalized, stripped) {
    for (const match of stripped.matchAll(PROP_TEXT_OP)) {
      const variable = match[1]!;
      const property = match[2]!;
      const operator = match[3]!.toUpperCase().replace(/\s+/g, " ");

      if (property.toLowerCase() !== "name") {
        return ValidationResult.invalid(
          `Indexed text operations (CONTAINS, STARTS WITH, ENDS WITH) are only supported on the .name property. ${variable}.${property} ${operator} forces a full property scan.`,
          `Use exact-match equality on ${property} instead (e.g. WHERE ${variable}.${property} = "value"), or run describe_label to see which properties exist on this label.`,
        );
      }
    }
    return ValidationResult.ok();
  },
};
