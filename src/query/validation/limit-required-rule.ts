import { type QueryValidationRule, ValidationResult } from "./types";

// Exploration queries (non-aggregate, non-anchored) must carry a LIMIT, otherwise
// they can return millions of rows. Aggregations and anchored lookups are exempt.
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

const LIMIT = /\bLIMIT\b/i;

function hasLimit(stripped: string): boolean {
  return LIMIT.test(stripped);
}

// `.name = ...` counts as an anchor, but `.name =~ ...` (regex) does not.
function hasNameEquality(stripped: string): boolean {
  const lower = stripped.toLowerCase();
  const marker = ".name =";
  let idx = lower.indexOf(marker);
  while (idx >= 0) {
    const afterEquals = idx + marker.length;
    if (afterEquals >= lower.length || lower[afterEquals] !== "~") {
      return true;
    }
    idx = lower.indexOf(marker, afterEquals);
  }
  return false;
}

function isExplorationQuery(stripped: string): boolean {
  const upperStripped = stripped.toUpperCase();

  const returnIdx = upperStripped.lastIndexOf("RETURN");
  if (returnIdx < 0) {
    return false;
  }

  const returnClause = upperStripped.substring(returnIdx);
  if (AGGREGATE_FUNCTIONS.some((agg) => returnClause.includes(`${agg.toUpperCase()}(`))) {
    return false;
  }

  if (stripped.includes("{name:") || stripped.includes("{ name:")) {
    return false;
  }

  if (hasNameEquality(stripped)) {
    return false;
  }

  return true;
}

export const limitRequiredRule: QueryValidationRule = {
  name: "limit-required",

  validate(_normalized, stripped) {
    if (isExplorationQuery(stripped) && !hasLimit(stripped)) {
      return ValidationResult.invalid(
        "Exploration query missing LIMIT clause. Without LIMIT, this could return millions of rows.",
        'Add LIMIT 25 (or up to 500) to the end of your query. Example: MATCH (h:HOSTNAME)-[:CHILD_OF]->(p:HOSTNAME {name: "google.com"}) RETURN h.name LIMIT 25',
      );
    }
    return ValidationResult.ok();
  },
};
