import { type QueryValidationRule, ValidationResult } from "./types";

// Rejects scanning all nodes of a large label without an anchor. Large labels
// (HOSTNAME, IPV4, ...) have billions of nodes; small reference labels are exempt.
const SMALL_LABELS = new Set([
  "COUNTRY",
  "RIR",
  "DNSSEC_ALGORITHM",
  "TLD",
  "TLD_OPERATOR",
  "CATEGORY",
]);

const AGGREGATE_FUNCTIONS = [
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "stdev",
  "stdevp",
  "percentile_disc",
  "percentile_cont",
];

const MATCH_LABEL = /\bMATCH\s+\(\s*(\w+)\s*:\s*(\w+)\s*\)/gi;
const LIMIT = /\bLIMIT\b/i;

function hasLimit(stripped: string): boolean {
  return LIMIT.test(stripped);
}

// `varName.name = ...` counts as an anchor, but `varName.name =~ ...` (regex) does not.
function hasNameEquality(strippedLower: string, varName: string): boolean {
  const marker = `${varName}.name =`;
  let idx = strippedLower.indexOf(marker);
  while (idx >= 0) {
    const afterEquals = idx + marker.length;
    if (afterEquals >= strippedLower.length || strippedLower[afterEquals] !== "~") {
      return true;
    }
    idx = strippedLower.indexOf(marker, afterEquals);
  }
  return false;
}

function isUnanchoredLabelScan(stripped: string): boolean {
  for (const match of stripped.matchAll(MATCH_LABEL)) {
    const variable = match[1]!;
    const label = match[2]!;

    if (SMALL_LABELS.has(label.toUpperCase())) {
      continue;
    }

    const matchContext = stripped.substring(match.index);
    const parenClose = matchContext.indexOf(")");
    const nodePattern = parenClose > 0 ? matchContext.substring(0, parenClose) : matchContext;
    if (nodePattern.includes("{")) {
      continue;
    }

    if (parenClose > 0 && parenClose + 1 < matchContext.length) {
      const afterParen = matchContext[parenClose + 1];
      if ((afterParen === "-" || afterParen === "<") && hasLimit(stripped)) {
        continue;
      }
    }

    const varName = variable.toLowerCase();
    const strippedLower = stripped.toLowerCase();
    const hasIndexedWhere =
      strippedLower.includes(`${varName}.name starts with`) ||
      strippedLower.includes(`${varName}.name ends with`) ||
      strippedLower.includes(`${varName}.name contains`) ||
      hasNameEquality(strippedLower, varName);

    if (!hasIndexedWhere) {
      const upper = stripped.toUpperCase();
      const returnIdx = upper.lastIndexOf("RETURN");
      if (returnIdx >= 0) {
        const returnClause = upper.substring(returnIdx);
        const hasAggregate = AGGREGATE_FUNCTIONS.some((agg) =>
          returnClause.includes(`${agg.toUpperCase()}(`),
        );
        if (hasAggregate) {
          continue;
        }
      }
      return true;
    }
  }
  return false;
}

export const unanchoredLabelScanRule: QueryValidationRule = {
  name: "unanchored-label-scan",

  validate(_normalized, stripped) {
    if (isUnanchoredLabelScan(stripped)) {
      return ValidationResult.invalid(
        "Query scans all nodes of a label without an anchor. On HOSTNAME (2.6B+ nodes) this takes ~30s.",
        'Add a {name: "value"} property constraint, or use WHERE with STARTS WITH / ENDS WITH / CONTAINS. Example: MATCH (h:HOSTNAME {name: "example.com"})-[:RESOLVES_TO]->(ip:IPV4) RETURN ip.name',
      );
    }
    return ValidationResult.ok();
  },
};
