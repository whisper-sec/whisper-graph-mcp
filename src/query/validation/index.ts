import { type QueryValidationRule } from "./types";
import { shortestPathRule } from "./shortest-path-rule";
import { limitExceededRule } from "./limit-exceeded-rule";
import { unlabeledMatchRule } from "./unlabeled-match-rule";
import { labelDisjunctionRule } from "./label-disjunction-rule";
import { unindexedTextOpRule } from "./unindexed-text-op-rule";
import { unanchoredLabelScanRule } from "./unanchored-label-scan-rule";
import { limitRequiredRule } from "./limit-required-rule";

/**
 * The default rule set, in evaluation order. Order matters: rules run
 * sequentially and the first failure wins, so the most specific
 * defensive-pattern rules come first and the broad `limit-required` rule last.
 */
export const DEFAULT_RULES: readonly QueryValidationRule[] = [
  shortestPathRule,
  limitExceededRule,
  unlabeledMatchRule,
  labelDisjunctionRule,
  unindexedTextOpRule,
  unanchoredLabelScanRule,
  limitRequiredRule,
];

export { type QueryValidationRule, ValidationResult } from "./types";
export {
  shortestPathRule,
  limitExceededRule,
  unlabeledMatchRule,
  labelDisjunctionRule,
  unindexedTextOpRule,
  unanchoredLabelScanRule,
  limitRequiredRule,
};
