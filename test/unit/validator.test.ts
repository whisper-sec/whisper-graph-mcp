import { describe, it, expect } from "vitest";
import { CypherQueryValidator } from "../../src/query/cypher-query-validator";
import {
  type ValidationResult,
  shortestPathRule,
  limitExceededRule,
  unlabeledMatchRule,
  labelDisjunctionRule,
  unindexedTextOpRule,
  unanchoredLabelScanRule,
  limitRequiredRule,
} from "../../src/query/validation/index";

type InvalidResult = Extract<ValidationResult, { valid: false }>;

function assertInvalid(result: ValidationResult): asserts result is InvalidResult {
  expect(result.valid).toBe(false);
}

const validator = new CypherQueryValidator();

describe("CypherQueryValidator", () => {
  describe("rule set", () => {
    it("has seven rules", () => {
      expect(validator.getRules()).toHaveLength(7);
    });

    it("gives each rule a unique name", () => {
      const names = validator.getRules().map((rule) => rule.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe("valid queries", () => {
    it("accepts a valid anchored query", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME {name: "www.google.com"})-[:RESOLVES_TO]->(ip:IPV4) RETURN ip.name',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts a valid anchored query with LIMIT", () => {
      const result = validator.validate(
        'MATCH (ip:IPV4 {name: "104.16.123.96"})<-[:RESOLVES_TO]-(h:HOSTNAME) RETURN h.name LIMIT 20',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts a count query without LIMIT", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME {name: "x"})-[:RESOLVES_TO]->(ip) RETURN count(ip)',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts an EXPLAIN query", () => {
      const result = validator.validate(
        'EXPLAIN MATCH (h:HOSTNAME {name: "x"})-[:RESOLVES_TO]->(ip) RETURN ip.name',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts a lowercase explain query", () => {
      const result = validator.validate("explain MATCH (h:HOSTNAME) RETURN h.name");
      expect(result.valid).toBe(true);
    });

    it("accepts a small label without an anchor", () => {
      const result = validator.validate("MATCH (r:RIR) RETURN r.name LIMIT 5");
      expect(result.valid).toBe(true);
    });

    it("accepts the COUNTRY label without an anchor", () => {
      const result = validator.validate("MATCH (c:COUNTRY) RETURN c.name LIMIT 10");
      expect(result.valid).toBe(true);
    });

    it("accepts a UNION query", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME {name: "www.google.com"})-[:CHILD_OF]->(t) RETURN t.name AS name ' +
          'UNION MATCH (h:HOSTNAME {name: "www.google.com"})-[:RESOLVES_TO]->(t) RETURN t.name AS name',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts STARTS WITH with a LIMIT", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME) WHERE h.name STARTS WITH "www.google" RETURN h.name LIMIT 5',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts ENDS WITH with a LIMIT", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME) WHERE h.name ENDS WITH ".google.com" RETURN h.name LIMIT 5',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts CONTAINS with a LIMIT", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME) WHERE h.name CONTAINS "cloudflare" RETURN h.name LIMIT 5',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts OPTIONAL MATCH with a shared variable", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME {name: "www.google.com"}) OPTIONAL MATCH (h)-[:RESOLVES_TO]->(ip:IPV6) RETURN h.name, ip.name',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts a multi-hop chain", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME {name: "www.google.com"})-[:RESOLVES_TO]->(ip:IPV4)' +
          "-[:BELONGS_TO]->(p:PREFIX)<-[:ROUTES]-(a:ASN)-[:HAS_NAME]->(n:ASN_NAME) " +
          "RETURN h.name, ip.name, p.name, a.name, n.name",
      );
      expect(result.valid).toBe(true);
    });

    it("accepts a SIGNED_WITH edge to a small label", () => {
      const result = validator.validate(
        "MATCH (h:HOSTNAME)-[:SIGNED_WITH]->(alg:DNSSEC_ALGORITHM) RETURN h.name, alg.name LIMIT 10",
      );
      expect(result.valid).toBe(true);
    });

    it("allows a WITH bridge clause", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME {name: "x"})-[:RESOLVES_TO]->(ip) WITH ip MATCH (ip)-[:BELONGS_TO]->(p) RETURN p.name',
      );
      expect(result.valid).toBe(true);
    });

    it("allows a CALL subquery", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME {name: "x"}) CALL { WITH h MATCH (h)-[:RESOLVES_TO]->(ip) RETURN ip } RETURN ip.name',
      );
      expect(result.valid).toBe(true);
    });

    it("allows a multi-type edge", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME {name: "google.com"})<-[:NAMESERVER_FOR|MAIL_FOR]-(s) RETURN s.name LIMIT 10',
      );
      expect(result.valid).toBe(true);
    });

    it("allows a multi-type edge with both colons", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME {name: "x"})-[:CHILD_OF|:RESOLVES_TO]->(t) RETURN t.name',
      );
      expect(result.valid).toBe(true);
    });

    it("allows consecutive MATCH clauses", () => {
      const result = validator.validate(
        'MATCH (a:ASN {name: "AS15169"})-[:HAS_NAME]->(n) MATCH (a)-[:HAS_COUNTRY]->(c) RETURN n.name, c.name',
      );
      expect(result.valid).toBe(true);
    });

    it("allows WHERE name equality", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME) WHERE h.name = "www.google.com" RETURN h.name',
      );
      expect(result.valid).toBe(true);
    });

    it("allows WITH aggregation", () => {
      const result = validator.validate(
        'MATCH (a:ASN {name: "AS13335"})-[:ROUTES]->(p:PREFIX) WITH a, count(p) AS cnt RETURN a.name, cnt',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts a regex filter on an anchored traversal", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME {name: "google.com"})-[:RESOLVES_TO]->(ip:IPV4) WHERE ip.name =~ "142\\.250\\..*" RETURN ip.name LIMIT 5',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts a regex on a small label", () => {
      const result = validator.validate(
        "MATCH (c:COUNTRY) WHERE c.name =~ 'U.*' RETURN c.name LIMIT 5",
      );
      expect(result.valid).toBe(true);
    });

    it("accepts an anchored query without a LIMIT", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME {name: "www.google.com"}) RETURN h.name',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts a large label with a traversal and LIMIT", () => {
      const result = validator.validate(
        "MATCH (h:HOSTNAME)-[:RESOLVES_TO]->(ip) RETURN ip.name LIMIT 10",
      );
      expect(result.valid).toBe(true);
    });

    it("accepts an UNWIND batch lookup with a traversal", () => {
      const result = validator.validate(
        "UNWIND ['www.google.com', 'cloudflare.com'] AS h MATCH (n:HOSTNAME {name: h})-[:RESOLVES_TO]->(ip:IPV4) RETURN n.name, ip.name",
      );
      expect(result.valid).toBe(true);
    });

    it("accepts an UNWIND batch lookup with a LIMIT", () => {
      const result = validator.validate(
        "UNWIND ['1.1.1.1', '8.8.8.8'] AS ip MATCH (n:IPV4 {name: ip}) RETURN n.name LIMIT 10",
      );
      expect(result.valid).toBe(true);
    });

    it("does not reject keywords inside string literals", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME {name: "WITH clause test"}) RETURN h.name',
      );
      expect(result.valid).toBe(true);
    });

    it("strips LIMIT inside string literals", () => {
      const result = validator.validate('MATCH (h:HOSTNAME {name: "LIMIT 1000"}) RETURN h.name');
      expect(result.valid).toBe(true);
    });
  });

  describe("CALL procedure queries", () => {
    it("accepts CALL explain", () => {
      expect(validator.validate('CALL explain("185.220.101.1")').valid).toBe(true);
    });

    it("accepts CALL whisper.history with YIELD", () => {
      const result = validator.validate(
        'CALL whisper.history("8.8.8.8") YIELD indicator, type, origin, prefix, startTime, endTime, peersSeing RETURN * ORDER BY startTime LIMIT 25',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts CALL whisper.history for a domain", () => {
      const result = validator.validate(
        'CALL whisper.history("google.com") YIELD indicator, type RETURN * LIMIT 5',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts CALL db.labels()", () => {
      expect(validator.validate("CALL db.labels()").valid).toBe(true);
    });

    it("accepts CALL db.schema()", () => {
      expect(validator.validate('CALL db.schema("json")').valid).toBe(true);
    });

    it("accepts CALL db.relationshipTypes()", () => {
      expect(validator.validate("CALL db.relationshipTypes()").valid).toBe(true);
    });

    it("accepts CALL whisper.quota()", () => {
      expect(validator.validate("CALL whisper.quota()").valid).toBe(true);
    });
  });

  describe("rejected queries", () => {
    it("rejects an empty query", () => {
      const result = validator.validate("");
      assertInvalid(result);
      expect(result.errorMessage).toContain("empty");
    });

    it("rejects a null query", () => {
      const result = validator.validate(null);
      expect(result.valid).toBe(false);
    });

    it("rejects a whitespace-only query", () => {
      const result = validator.validate("   ");
      assertInvalid(result);
      expect(result.errorMessage).toContain("empty");
    });

    it("rejects an unbounded shortestPath", () => {
      const result = validator.validate(
        'MATCH p = shortestPath((a:HOSTNAME {name: "x"})-[*]-(b:HOSTNAME {name: "y"})) RETURN p',
      );
      assertInvalid(result);
      expect(result.errorMessage).toContain("bounded path length");
      expect(result.ruleName).toBe("shortest-path");
    });

    it("accepts a bounded shortestPath", () => {
      const result = validator.validate(
        'MATCH (a:HOSTNAME {name: "x"}), (b:HOSTNAME {name: "y"}) MATCH p = shortestPath((a)-[*1..6]-(b)) RETURN length(p) AS hops',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts allShortestPaths when bounded", () => {
      const result = validator.validate(
        'MATCH (a:HOSTNAME {name: "x"}), (b:HOSTNAME {name: "y"}) MATCH p = allShortestPaths((a)-[*1..4]-(b)) RETURN p',
      );
      expect(result.valid).toBe(true);
    });

    it("rejects a shortestPath without a range", () => {
      const result = validator.validate(
        'MATCH p = shortestPath((a:HOSTNAME {name: "x"})--(b:HOSTNAME {name: "y"})) RETURN p',
      );
      expect(result.valid).toBe(false);
    });

    it("rejects LIMIT over 500", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME) WHERE h.name STARTS WITH "www.google" RETURN h.name LIMIT 501',
      );
      assertInvalid(result);
      expect(result.errorMessage).toContain("500");
      expect(result.ruleName).toBe("limit-exceeded");
    });

    it("accepts LIMIT exactly 500", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME) WHERE h.name STARTS WITH "www.google" RETURN h.name LIMIT 500',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts LIMIT 100", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME) WHERE h.name STARTS WITH "www.google" RETURN h.name LIMIT 100',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts LIMIT 1", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME) WHERE h.name STARTS WITH "www" RETURN h.name LIMIT 1',
      );
      expect(result.valid).toBe(true);
    });

    it("accepts LIMIT 101", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME) WHERE h.name STARTS WITH "www" RETURN h.name LIMIT 101',
      );
      expect(result.valid).toBe(true);
    });

    it("rejects an unanchored label scan", () => {
      const result = validator.validate("MATCH (h:HOSTNAME) RETURN h.name LIMIT 10");
      assertInvalid(result);
      expect(result.errorMessage).toContain("anchor");
      expect(result.ruleName).toBe("unanchored-label-scan");
    });

    it("rejects an unanchored IPV4 scan", () => {
      const result = validator.validate("MATCH (ip:IPV4) RETURN ip.name LIMIT 10");
      expect(result.valid).toBe(false);
    });

    it("rejects an exploration query missing LIMIT", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME) WHERE h.name STARTS WITH "www.google" RETURN h.name',
      );
      assertInvalid(result);
      expect(result.suggestion).toContain("LIMIT");
      expect(result.ruleName).toBe("limit-required");
    });

    it("does not treat a regex filter as a name-equality anchor", () => {
      const result = validator.validate(
        'MATCH (h:HOSTNAME) WHERE h.name =~ "test.*" RETURN h.name LIMIT 5',
      );
      expect(result.valid).toBe(false);
    });

    it("accepts an aggregate on an unanchored label", () => {
      const result = validator.validate("MATCH (n:ASN) RETURN count(n)");
      expect(result.valid).toBe(true);
    });
  });
});

describe("shortestPathRule", () => {
  it("is named shortest-path", () => {
    expect(shortestPathRule.name).toBe("shortest-path");
  });

  it("rejects an unbounded shortestPath", () => {
    const result = shortestPathRule.validate("x", "MATCH p = shortestPath((a)-[*]-(b)) RETURN p");
    assertInvalid(result);
    expect(result.errorMessage).toContain("bounded path length");
    expect(result.suggestion).toContain("[*1..6]");
  });

  it("rejects a shortestPath without a range", () => {
    const result = shortestPathRule.validate("x", "MATCH p = shortestPath((a)--(b)) RETURN p");
    expect(result.valid).toBe(false);
  });

  it("rejects unbounded allShortestPaths", () => {
    const result = shortestPathRule.validate(
      "x",
      "MATCH p = allShortestPaths((a)-[*]-(b)) RETURN p",
    );
    expect(result.valid).toBe(false);
  });

  it("accepts a bounded shortestPath", () => {
    const result = shortestPathRule.validate(
      "x",
      "MATCH p = shortestPath((a)-[*1..6]-(b)) RETURN p",
    );
    expect(result.valid).toBe(true);
  });

  it("accepts bounded allShortestPaths", () => {
    const result = shortestPathRule.validate(
      "x",
      "MATCH p = allShortestPaths((a)-[*1..4]-(b)) RETURN p",
    );
    expect(result.valid).toBe(true);
  });

  it("accepts a query without shortestPath", () => {
    const result = shortestPathRule.validate("x", 'MATCH (h:HOSTNAME {name: "x"}) RETURN h.name');
    expect(result.valid).toBe(true);
  });

  it("rejects uppercase SHORTESTPATH", () => {
    const result = shortestPathRule.validate("x", "MATCH p = SHORTESTPATH((a)-[*]-(b)) RETURN p");
    expect(result.valid).toBe(false);
  });

  it("rejects mixed-case ShortestPath", () => {
    const result = shortestPathRule.validate("x", "MATCH p = ShortestPath((a)-[*]-(b)) RETURN p");
    expect(result.valid).toBe(false);
  });

  it("accepts a bounded shortestPath with a large range", () => {
    const result = shortestPathRule.validate(
      "x",
      "MATCH p = shortestPath((a)-[*1..10]-(b)) RETURN p",
    );
    expect(result.valid).toBe(true);
  });

  it("rejects when any shortestPath is unbounded", () => {
    const result = shortestPathRule.validate(
      "x",
      "MATCH p1 = shortestPath((a)-[*]-(b)), p2 = shortestPath((c)-[*1..4]-(d)) RETURN p1, p2",
    );
    expect(result.valid).toBe(false);
  });

  it("accepts multiple bounded shortestPaths", () => {
    const result = shortestPathRule.validate(
      "x",
      "MATCH p1 = shortestPath((a)-[*1..6]-(b)) MATCH p2 = shortestPath((c)-[*1..4]-(d)) RETURN p1, p2",
    );
    expect(result.valid).toBe(true);
  });

  it("handles nested parentheses correctly", () => {
    const result = shortestPathRule.validate(
      "x",
      'MATCH p = shortestPath((a:HOSTNAME {name: "x"})-[*1..6]-(b:HOSTNAME {name: "y"})) RETURN nodes(p)',
    );
    expect(result.valid).toBe(true);
  });
});

describe("limitExceededRule", () => {
  it("is named limit-exceeded", () => {
    expect(limitExceededRule.name).toBe("limit-exceeded");
  });

  it("rejects LIMIT 501", () => {
    const result = limitExceededRule.validate("x", "MATCH (h:HOSTNAME) RETURN h LIMIT 501");
    assertInvalid(result);
    expect(result.errorMessage).toContain("500");
    expect(result.suggestion).toContain("LIMIT 500");
  });

  it("rejects LIMIT 1000", () => {
    expect(limitExceededRule.validate("x", "MATCH (h:HOSTNAME) RETURN h LIMIT 1000").valid).toBe(
      false,
    );
  });

  it("rejects LIMIT 9999", () => {
    expect(limitExceededRule.validate("x", "MATCH (h:HOSTNAME) RETURN h LIMIT 9999").valid).toBe(
      false,
    );
  });

  it("accepts LIMIT 500", () => {
    expect(limitExceededRule.validate("x", "MATCH (h:HOSTNAME) RETURN h LIMIT 500").valid).toBe(
      true,
    );
  });

  it("accepts LIMIT 100", () => {
    expect(limitExceededRule.validate("x", "MATCH (h:HOSTNAME) RETURN h LIMIT 100").valid).toBe(
      true,
    );
  });

  it("accepts LIMIT 1", () => {
    expect(limitExceededRule.validate("x", "MATCH (h:HOSTNAME) RETURN h LIMIT 1").valid).toBe(true);
  });

  it("accepts a query without LIMIT", () => {
    expect(limitExceededRule.validate("x", "MATCH (h:HOSTNAME) RETURN h").valid).toBe(true);
  });

  it("rejects lowercase limit 501", () => {
    expect(limitExceededRule.validate("x", "MATCH (h:HOSTNAME) RETURN h limit 501").valid).toBe(
      false,
    );
  });

  it("rejects mixed-case Limit 600", () => {
    expect(limitExceededRule.validate("x", "MATCH (h:HOSTNAME) RETURN h Limit 600").valid).toBe(
      false,
    );
  });

  it("suggestion includes pagination advice", () => {
    const result = limitExceededRule.validate("x", "MATCH (h:HOSTNAME) RETURN h LIMIT 501");
    assertInvalid(result);
    expect(result.suggestion).toContain("pagination");
    expect(result.suggestion.toUpperCase()).toContain("SKIP");
  });
});

describe("unlabeledMatchRule", () => {
  it("is named unlabeled-match", () => {
    expect(unlabeledMatchRule.name).toBe("unlabeled-match");
  });

  it("rejects a standalone unlabeled MATCH", () => {
    const result = unlabeledMatchRule.validate("x", "MATCH (h) RETURN h LIMIT 10");
    assertInvalid(result);
    expect(result.errorMessage).toContain("no label");
    expect(result.errorMessage).toContain("7.39B");
  });

  it("rejects an unlabeled MATCH before WHERE", () => {
    const result = unlabeledMatchRule.validate(
      "x",
      'MATCH (h) WHERE h.name = "x" RETURN h LIMIT 1',
    );
    expect(result.valid).toBe(false);
  });

  it("suggestion refers to list_labels", () => {
    const result = unlabeledMatchRule.validate("x", "MATCH (n) RETURN n LIMIT 1");
    assertInvalid(result);
    expect(result.suggestion).toContain("list_labels");
    expect(result.suggestion).toContain(":HOSTNAME");
  });

  it.each([
    "MATCH (h) RETURN h LIMIT 1",
    'MATCH (n) WHERE n.name STARTS WITH "x" RETURN n LIMIT 5',
    "MATCH (whatever) WITH whatever AS x RETURN x LIMIT 1",
  ])("rejects standalone unlabeled MATCH: %s", (cypher) => {
    expect(unlabeledMatchRule.validate(cypher, cypher).valid).toBe(false);
  });

  it("allows a labeled MATCH", () => {
    expect(unlabeledMatchRule.validate("x", "MATCH (h:HOSTNAME) RETURN h LIMIT 10").valid).toBe(
      true,
    );
  });

  it("allows a relationship traversal with an unlabeled first node", () => {
    const result = unlabeledMatchRule.validate(
      "x",
      'MATCH (h)-[:RESOLVES_TO]->(ip:IPV4 {name: "8.8.8.8"}) RETURN h.name LIMIT 5',
    );
    expect(result.valid).toBe(true);
  });

  it("allows a node anchored via a property", () => {
    const result = unlabeledMatchRule.validate(
      "x",
      'MATCH (h {name: "www.google.com"}) RETURN h LIMIT 1',
    );
    expect(result.valid).toBe(true);
  });

  it("allows a CALL procedure", () => {
    expect(unlabeledMatchRule.validate("x", "CALL db.labels()").valid).toBe(true);
  });

  it("allows an incoming arrow after the parenthesis", () => {
    const result = unlabeledMatchRule.validate(
      "x",
      'MATCH (h)<-[:RESOLVES_TO]-(ip:IPV4 {name: "x"}) RETURN h.name LIMIT 5',
    );
    expect(result.valid).toBe(true);
  });
});

describe("labelDisjunctionRule", () => {
  it("is named label-disjunction", () => {
    expect(labelDisjunctionRule.name).toBe("label-disjunction");
  });

  it("rejects two-label OR on the same variable", () => {
    const cypher = "MATCH (h) WHERE h:HOSTNAME OR h:DOMAIN RETURN h LIMIT 1";
    const result = labelDisjunctionRule.validate(cypher, cypher);
    assertInvalid(result);
    expect(result.errorMessage).toContain("disjunction");
  });

  it("rejects triple-label OR on the same variable", () => {
    const cypher = "MATCH (h) WHERE h:HOSTNAME OR h:DOMAIN OR h:FQDN RETURN h LIMIT 1";
    expect(labelDisjunctionRule.validate(cypher, cypher).valid).toBe(false);
  });

  it("suggestion mentions list_labels and UNION", () => {
    const cypher = "MATCH (h) WHERE h:HOSTNAME OR h:DOMAIN RETURN h LIMIT 1";
    const result = labelDisjunctionRule.validate(cypher, cypher);
    assertInvalid(result);
    expect(result.suggestion).toContain("list_labels");
    expect(result.suggestion).toContain("UNION");
  });

  it.each([
    "MATCH (h:HOSTNAME) WHERE h:HOSTNAME OR h:DOMAIN RETURN h LIMIT 1",
    'MATCH (h) WHERE (h:A OR h:B) AND h.name = "x" RETURN h LIMIT 1',
    "RETURN [h IN nodes(p) WHERE h:HOSTNAME OR h:DOMAIN | h.name]",
  ])("rejects same-variable label OR: %s", (cypher) => {
    expect(labelDisjunctionRule.validate(cypher, cypher).valid).toBe(false);
  });

  it("allows label-pipe syntax", () => {
    expect(
      labelDisjunctionRule.validate("x", "MATCH (h:HOSTNAME|IPV4) RETURN h LIMIT 5").valid,
    ).toBe(true);
  });

  it("allows property disjunction", () => {
    const result = labelDisjunctionRule.validate(
      "x",
      'MATCH (h:HOSTNAME) WHERE h.name = "a" OR h.name = "b" RETURN h LIMIT 5',
    );
    expect(result.valid).toBe(true);
  });

  it("allows label OR on different variables", () => {
    const cypher =
      "MATCH (h:HOSTNAME)-[:RESOLVES_TO]->(ip) WHERE h:HOSTNAME OR ip:IPV4 RETURN h.name LIMIT 5";
    expect(labelDisjunctionRule.validate(cypher, cypher).valid).toBe(true);
  });

  it("allows a single label test", () => {
    expect(
      labelDisjunctionRule.validate("x", "MATCH (h) WHERE h:HOSTNAME RETURN h LIMIT 1").valid,
    ).toBe(true);
  });
});

describe("unindexedTextOpRule", () => {
  it("is named unindexed-text-op", () => {
    expect(unindexedTextOpRule.name).toBe("unindexed-text-op");
  });

  it.each([
    'MATCH (h:HOSTNAME) WHERE h.description CONTAINS "foo" RETURN h LIMIT 5',
    'MATCH (h:HOSTNAME) WHERE h.fqdn STARTS WITH "www." RETURN h LIMIT 5',
    'MATCH (h:HOSTNAME) WHERE h.notes ENDS WITH ".com" RETURN h LIMIT 5',
  ])("rejects text ops on non-name properties: %s", (cypher) => {
    const result = unindexedTextOpRule.validate(cypher, cypher);
    assertInvalid(result);
    expect(result.errorMessage).toContain(".name property");
  });

  it("suggestion recommends exact match or describe_label", () => {
    const cypher = 'MATCH (h:HOSTNAME) WHERE h.description CONTAINS "foo" RETURN h LIMIT 5';
    const result = unindexedTextOpRule.validate(cypher, cypher);
    assertInvalid(result);
    expect(result.suggestion).toContain("=");
    expect(result.suggestion).toContain("describe_label");
  });

  it("error identifies the offending property", () => {
    const cypher = 'MATCH (h:HOSTNAME) WHERE h.fqdn STARTS WITH "x" RETURN h LIMIT 1';
    const result = unindexedTextOpRule.validate(cypher, cypher);
    assertInvalid(result);
    expect(result.errorMessage).toContain("h.fqdn");
    expect(result.errorMessage).toContain("STARTS WITH");
  });

  it.each([
    'MATCH (h:HOSTNAME) WHERE h.name CONTAINS "google" RETURN h LIMIT 5',
    'MATCH (h:HOSTNAME) WHERE h.name STARTS WITH "www." RETURN h LIMIT 5',
    'MATCH (h:HOSTNAME) WHERE h.name ENDS WITH ".com" RETURN h LIMIT 5',
  ])("allows text ops on the name property: %s", (cypher) => {
    expect(unindexedTextOpRule.validate(cypher, cypher).valid).toBe(true);
  });

  it("allows exact match on any property", () => {
    const cypher = "MATCH (h:HOSTNAME) WHERE h.threatScore = 100 RETURN h LIMIT 5";
    expect(unindexedTextOpRule.validate(cypher, cypher).valid).toBe(true);
  });

  it("allows case-insensitive name ops", () => {
    const cypher = 'match (h:HOSTNAME) where h.NAME contains "x" return h limit 1';
    expect(unindexedTextOpRule.validate(cypher, cypher).valid).toBe(true);
  });
});

describe("unanchoredLabelScanRule", () => {
  it("is named unanchored-label-scan", () => {
    expect(unanchoredLabelScanRule.name).toBe("unanchored-label-scan");
  });

  it("rejects an unanchored HOSTNAME scan", () => {
    const result = unanchoredLabelScanRule.validate(
      "x",
      "MATCH (h:HOSTNAME) RETURN h.name LIMIT 10",
    );
    assertInvalid(result);
    expect(result.errorMessage).toContain("anchor");
    expect(result.suggestion).toContain("{name:");
  });

  it.each(["IPV4", "IPV6", "PREFIX", "ASN", "ORGANIZATION", "EMAIL"])(
    "rejects an unanchored %s scan",
    (label) => {
      const result = unanchoredLabelScanRule.validate(
        "x",
        `MATCH (n:${label}) RETURN n.name LIMIT 10`,
      );
      expect(result.valid).toBe(false);
    },
  );

  it.each(["COUNTRY", "RIR", "DNSSEC_ALGORITHM", "TLD", "TLD_OPERATOR", "CATEGORY"])(
    "accepts the small label %s without an anchor",
    (label) => {
      const result = unanchoredLabelScanRule.validate(
        "x",
        `MATCH (n:${label}) RETURN n.name LIMIT 10`,
      );
      expect(result.valid).toBe(true);
    },
  );

  it("accepts a property anchor", () => {
    const result = unanchoredLabelScanRule.validate(
      "x",
      'MATCH (h:HOSTNAME {name: "x"}) RETURN h.name',
    );
    expect(result.valid).toBe(true);
  });

  it("accepts a STARTS WITH filter", () => {
    const result = unanchoredLabelScanRule.validate(
      "x",
      'MATCH (h:HOSTNAME) WHERE h.name STARTS WITH "x" RETURN h.name LIMIT 5',
    );
    expect(result.valid).toBe(true);
  });

  it("accepts an ENDS WITH filter", () => {
    const result = unanchoredLabelScanRule.validate(
      "x",
      'MATCH (h:HOSTNAME) WHERE h.name ENDS WITH ".x" RETURN h.name LIMIT 5',
    );
    expect(result.valid).toBe(true);
  });

  it("accepts a CONTAINS filter", () => {
    const result = unanchoredLabelScanRule.validate(
      "x",
      'MATCH (h:HOSTNAME) WHERE h.name CONTAINS "x" RETURN h.name LIMIT 5',
    );
    expect(result.valid).toBe(true);
  });

  it("accepts name equality", () => {
    const result = unanchoredLabelScanRule.validate(
      "x",
      'MATCH (h:HOSTNAME) WHERE h.name = "x" RETURN h.name',
    );
    expect(result.valid).toBe(true);
  });

  it("accepts a traversal with a LIMIT", () => {
    const result = unanchoredLabelScanRule.validate(
      "x",
      "MATCH (h:HOSTNAME)-[:RESOLVES_TO]->(ip) RETURN ip.name LIMIT 10",
    );
    expect(result.valid).toBe(true);
  });

  it("rejects a traversal without a LIMIT", () => {
    const result = unanchoredLabelScanRule.validate(
      "x",
      "MATCH (h:HOSTNAME)-[:RESOLVES_TO]->(ip) RETURN ip.name",
    );
    expect(result.valid).toBe(false);
  });

  it("accepts a count aggregation on an unanchored label", () => {
    expect(unanchoredLabelScanRule.validate("x", "MATCH (n:ASN) RETURN count(n)").valid).toBe(true);
  });

  it("accepts a sum aggregation on an unanchored label", () => {
    expect(unanchoredLabelScanRule.validate("x", "MATCH (n:ASN) RETURN sum(n.value)").valid).toBe(
      true,
    );
  });

  it("does not treat a regex filter as name equality", () => {
    const result = unanchoredLabelScanRule.validate(
      "x",
      'MATCH (h:HOSTNAME) WHERE h.name =~ "test" RETURN h.name LIMIT 5',
    );
    expect(result.valid).toBe(false);
  });
});

describe("limitRequiredRule", () => {
  it("is named limit-required", () => {
    expect(limitRequiredRule.name).toBe("limit-required");
  });

  it("rejects an exploration query without a LIMIT", () => {
    const result = limitRequiredRule.validate(
      "x",
      'MATCH (h:HOSTNAME) WHERE h.name STARTS WITH "x" RETURN h.name',
    );
    assertInvalid(result);
    expect(result.errorMessage).toContain("LIMIT");
    expect(result.suggestion).toContain("LIMIT");
  });

  it("accepts an exploration query with a LIMIT", () => {
    const result = limitRequiredRule.validate(
      "x",
      'MATCH (h:HOSTNAME) WHERE h.name STARTS WITH "x" RETURN h.name LIMIT 10',
    );
    expect(result.valid).toBe(true);
  });

  it("accepts a count aggregation without a LIMIT", () => {
    const result = limitRequiredRule.validate(
      "x",
      'MATCH (h:HOSTNAME) WHERE h.name STARTS WITH "x" RETURN count(h)',
    );
    expect(result.valid).toBe(true);
  });

  it.each([
    "MATCH (n) RETURN sum(n.value)",
    "MATCH (n) RETURN avg(n.value)",
    "MATCH (n) RETURN min(n.value), max(n.value)",
    "MATCH (n) RETURN percentile_disc(n.value, 0.5)",
    "MATCH (n) RETURN percentile_cont(n.value, 0.5)",
    "MATCH (n) RETURN stdev(n.value)",
  ])("accepts aggregation without a LIMIT: %s", (cypher) => {
    expect(limitRequiredRule.validate("x", cypher).valid).toBe(true);
  });

  it("accepts a property anchor without a LIMIT", () => {
    expect(
      limitRequiredRule.validate("x", 'MATCH (h:HOSTNAME {name: "x"}) RETURN h.name').valid,
    ).toBe(true);
  });

  it("accepts a property anchor with spaces without a LIMIT", () => {
    expect(
      limitRequiredRule.validate("x", 'MATCH (h:HOSTNAME { name: "x" }) RETURN h.name').valid,
    ).toBe(true);
  });

  it("accepts name equality without a LIMIT", () => {
    expect(
      limitRequiredRule.validate("x", 'MATCH (h:HOSTNAME) WHERE h.name = "x" RETURN h.name').valid,
    ).toBe(true);
  });

  it("does not treat a regex filter as name equality", () => {
    const result = limitRequiredRule.validate(
      "x",
      'MATCH (h:HOSTNAME) WHERE h.name =~ "test" RETURN h.name',
    );
    expect(result.valid).toBe(false);
  });

  it("accepts a query with no RETURN clause", () => {
    expect(limitRequiredRule.validate("x", "CALL db.labels()").valid).toBe(true);
  });
});
