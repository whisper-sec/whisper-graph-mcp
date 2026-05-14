import { type QueryValidationRule, ValidationResult } from "./types";

// LIMIT above 500 risks oversized result sets.
const LIMIT_VALUE = /\bLIMIT\s+(\d+)/i;
const MAX_LIMIT = 500;

export const limitExceededRule: QueryValidationRule = {
  name: "limit-exceeded",

  validate(_normalized, stripped) {
    const match = LIMIT_VALUE.exec(stripped);
    if (match) {
      const limitValue = Number.parseInt(match[1]!, 10);
      if (limitValue > MAX_LIMIT) {
        return ValidationResult.invalid(
          `LIMIT exceeds maximum of ${MAX_LIMIT}. Large result sets risk buffer overflows.`,
          `Use LIMIT ${MAX_LIMIT} or less. If you need more results, use SKIP for pagination or add tighter WHERE filters.`,
        );
      }
    }
    return ValidationResult.ok();
  },
};
