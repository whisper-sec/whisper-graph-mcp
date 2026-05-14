export type ValidationResult =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly errorMessage: string;
      readonly suggestion: string;
      readonly ruleName?: string;
    };

export const ValidationResult = {
  ok(): ValidationResult {
    return { valid: true };
  },
  invalid(errorMessage: string, suggestion: string, ruleName?: string): ValidationResult {
    return { valid: false, errorMessage, suggestion, ruleName };
  },
};

/**
 * Strategy interface for a single Cypher safety check. Each rule receives the
 * trimmed query and a copy with string literals blanked out, so keyword matching
 * never trips on text inside quotes.
 */
export interface QueryValidationRule {
  readonly name: string;
  validate(normalized: string, stripped: string): ValidationResult;
}
