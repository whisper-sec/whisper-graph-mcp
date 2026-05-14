import { type QueryValidationRule, ValidationResult } from "./types";

// Unbounded shortestPath / allShortestPaths ([*] or no range) can time out on a
// billion-scale graph. Bounded paths like [*1..6] are fine.
const SHORTEST_PATH = /\b(allShortestPaths|shortestPath)\s*\(/gi;
const BOUNDED_RANGE = /\[\*\d+\.\.\d+]/;

function findMatchingParen(s: string, openIndex: number): number {
  if (openIndex < 0) return -1;
  let depth = 0;
  for (let i = openIndex; i < s.length; i++) {
    if (s[i] === "(") {
      depth++;
    } else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export const shortestPathRule: QueryValidationRule = {
  name: "shortest-path",

  validate(_normalized, stripped) {
    for (const match of stripped.matchAll(SHORTEST_PATH)) {
      const afterMatch = stripped.substring(match.index);
      let closeParen = findMatchingParen(afterMatch, afterMatch.indexOf("("));
      if (closeParen < 0) {
        closeParen = afterMatch.length;
      }
      const pathContent = afterMatch.substring(0, closeParen);

      if (!BOUNDED_RANGE.test(pathContent)) {
        return ValidationResult.invalid(
          "shortestPath requires a bounded path length like [*1..6]. Unbounded paths may time out on a billion-scale graph.",
          'Add a bounded range, e.g., MATCH p = shortestPath((a:HOSTNAME {name: "a.com"})-[*1..6]-(b:HOSTNAME {name: "b.com"})) RETURN nodes(p)',
        );
      }
    }
    return ValidationResult.ok();
  },
};
