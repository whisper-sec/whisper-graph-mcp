# WhisperGraph Query Cookbook

Patterns organized by analyst persona. Every query has been validated against the hosted WhisperGraph API on live data — if a pattern doesn't work today, it's not here.

When in doubt about a label or property, call **`list_labels`** and **`describe_label`** first. They're cached server-side for 5 minutes and prevent the most common query bug (writing `WHERE h.fqdn = "..."` when the property is actually `h.name`).

Conventions:
- Every example anchors on a small label or an indexed lookup (`{name: "value"}`). Unanchored scans on HOSTNAME (2.6B), IPV4 (619M), or PREFIX (2.5M) will be rejected by the server-side validator.
- Every exploration query includes a `LIMIT` (max 500). Aggregations and `EXPLAIN`/`PROFILE` are exempt.
- Edge directions are strict. If a query returns 0 rows unexpectedly, run `EXPLAIN` and check the direction reference in the server instructions.

---

## For SOC analysts and incident responders

You have a flagged IP or domain. Triage it, find context, decide whether to escalate.

```cypher
-- 1. Trace an IP to its network owner
MATCH (ip:IPV4 {name: "104.16.123.96"})-[:BELONGS_TO]->(p:PREFIX)
      <-[:ROUTES]-(a:ASN)-[:HAS_NAME]->(n:ASN_NAME)
RETURN ip.name, p.name AS prefix, a.name AS asn, n.name AS network
```

```cypher
-- 2. Threat assessment for an IP (preferred over manual feed walks)
CALL explain("185.220.101.1")
```

```cypher
-- 3. Which feeds list this IP, and what's its current threat profile?
MATCH (ip:IPV4 {name: "185.220.101.1"})-[:LISTED_IN]->(f:FEED_SOURCE)
RETURN f.name, ip.threatScore, ip.threatLevel, ip.threatSources,
       ip.isThreat, ip.isAnonymizer, ip.isC2, ip.isMalware, ip.isPhishing,
       ip.isTor, ip.isProxy, ip.isVpn, ip.isBlacklist
```

```cypher
-- 4. Reverse DNS: what hostnames resolve to this IP?
MATCH (ip:IPV4 {name: "104.16.123.96"})<-[:RESOLVES_TO]-(h:HOSTNAME)
RETURN h.name LIMIT 25
```

```cypher
-- 5. Co-hosted domain count (don't enumerate first — count, then decide)
MATCH (ip:IPV4 {name: "104.16.123.96"})<-[:RESOLVES_TO]-(h:HOSTNAME)
RETURN count(h) AS cohostedDomains
```

```cypher
-- 6. GeoIP: where is this IP physically located?
MATCH (ip:IPV4 {name: "8.8.8.8"})-[:LOCATED_IN]->(city:CITY)
      -[:HAS_COUNTRY]->(country:COUNTRY)
RETURN city.name AS city, country.name AS country
```

```cypher
-- 7. Domain assessment: same shape as IP, single call
CALL explain("example.org")
```

```cypher
-- 8. Quick WHOIS profile for a flagged domain
MATCH (h:HOSTNAME {name: "google.com"})
OPTIONAL MATCH (h)-[:HAS_REGISTRAR]->(r:REGISTRAR)
OPTIONAL MATCH (h)-[:HAS_EMAIL]->(e:EMAIL)
OPTIONAL MATCH (h)-[:REGISTERED_BY]->(org:ORGANIZATION)
RETURN h.name, r.name AS registrar, e.name AS contact, org.name AS organization
```

```cypher
-- 9. Batch IOC enrichment (resolve a small list of hostnames in one call)
UNWIND ["google.com", "cloudflare.com", "github.com"] AS host
MATCH (h:HOSTNAME {name: host})-[:RESOLVES_TO]->(ip:IPV4)
RETURN h.name, collect(ip.name) AS ips
```

---

## For threat intelligence analysts

Pivot from a single indicator to a campaign or actor's broader infrastructure.

```cypher
-- 1. Pivot on shared registrant email (most reliable WHOIS pivot)
MATCH (h:HOSTNAME {name: "cloudflare.com"})-[:HAS_EMAIL]->(e:EMAIL)
      <-[:HAS_EMAIL]-(other:HOSTNAME)
WHERE other.name <> "cloudflare.com"
RETURN e.name AS sharedEmail, other.name AS relatedDomain LIMIT 25
```

```cypher
-- 2. Pivot on shared registrar (low signal, but useful for unknown actors)
MATCH (h:HOSTNAME {name: "cloudflare.com"})-[:HAS_REGISTRAR]->(r:REGISTRAR)
      <-[:HAS_REGISTRAR]-(other:HOSTNAME)
WHERE other.name <> "cloudflare.com"
RETURN r.name AS registrar, other.name LIMIT 10
```

```cypher
-- 3. Nameserver clustering: domains sharing the same NS
MATCH (h:HOSTNAME {name: "cloudflare.com"})<-[:NAMESERVER_FOR]-(ns:HOSTNAME)
      -[:NAMESERVER_FOR]->(other:HOSTNAME)
WHERE other.name <> "cloudflare.com"
RETURN ns.name AS nameserver, other.name AS clusteredDomain LIMIT 25
```

```cypher
-- 4. ASN reputation (returns score, level, breakdown)
CALL explain("AS13335")
```

```cypher
-- 5. Network-level threat density for a CIDR
CALL explain("1.1.1.0/24")
```

```cypher
-- 6. Threat profile of the ASN that hosts this hostname
MATCH (h:HOSTNAME {name: "example.org"})-[:RESOLVES_TO]->(ip:IPV4)
      -[:BELONGS_TO]->(p:PREFIX)<-[:ROUTES]-(a:ASN)
RETURN h.name, ip.name, a.name, a.threatScore, a.threatLevel,
       a.maxThreatScore, a.avgThreatScore, a.overallThreatLevel
```

```cypher
-- 7. SPF authorization graph: which mechanisms does this domain use?
-- (Note: when matching multi-type edges, bind the relationship variable with `r:`.)
MATCH (h:HOSTNAME {name: "cloudflare.com"})-[r:SPF_INCLUDE|SPF_A|SPF_MX|SPF_REDIRECT]->(target)
RETURN type(r) AS mechanism, target.name LIMIT 25
```

```cypher
-- 8. Find ASN_NAMEs starting with a brand keyword (indexed prefix scan, fast)
-- Use STARTS WITH for prefix-anchored brand search; CONTAINS on ASN_NAME (107K nodes)
-- without an anchor will time out.
MATCH (n:ASN_NAME) WHERE n.name STARTS WITH "GOOGLE"
RETURN n.name LIMIT 25
```

```cypher
-- 9. Domain WHOIS history (note: may return {available:false, error:"timeout"};
-- if so, surface the retryAfter to the user and don't loop)
CALL whisper.history("google.com")
```

---

## For penetration testers and red teams

Map the perimeter before engagement. Subdomain enumeration, mail server inventory, SPF authorization graph.

```cypher
-- 1. Subdomain enumeration via indexed suffix scan
MATCH (h:HOSTNAME) WHERE h.name ENDS WITH ".target.com"
RETURN h.name LIMIT 100
```

```cypher
-- 2. Subdomain count first (avoid enumeration if too many)
MATCH (h:HOSTNAME) WHERE h.name ENDS WITH ".google.com"
RETURN count(h) AS subdomainCount
```

```cypher
-- 3. Co-hosted neighbours on the same prefix (lateral surface)
MATCH (h:HOSTNAME {name: "example.org"})-[:RESOLVES_TO]->(ip:IPV4)
      -[:BELONGS_TO]->(p:PREFIX)<-[:BELONGS_TO]-(neighbour:IPV4)
WHERE neighbour <> ip
RETURN p.name AS prefix, neighbour.name AS sharedSubnetIP LIMIT 25
```

```cypher
-- 4. Mail server inventory for a domain (MX is on source side — use reversed edge)
MATCH (h:HOSTNAME {name: "google.com"})<-[:MAIL_FOR]-(mx:HOSTNAME)
RETURN mx.name
```

```cypher
-- 5. CNAME chain following (one hop; chain manually for deeper)
MATCH (h:HOSTNAME {name: "www.google.com"})-[:ALIAS_OF]->(target:HOSTNAME)
RETURN h.name, target.name
```

```cypher
-- 6. SPF "ip4" mechanism: which IPs are pre-authorized to send mail?
MATCH (h:HOSTNAME {name: "cloudflare.com"})-[:SPF_IP]->(ip)
RETURN ip.name LIMIT 25
```

```cypher
-- 7. Full SPF mechanism breakdown
MATCH (h:HOSTNAME {name: "cloudflare.com"})-[r:SPF_INCLUDE|SPF_IP|SPF_A|SPF_MX|SPF_EXISTS|SPF_REDIRECT]->(target)
RETURN type(r) AS mechanism, target.name LIMIT 25
```

```cypher
-- 8. Hostnames discoverable via web links (Common Crawl)
MATCH (h:HOSTNAME {name: "github.com"})-[:LINKS_TO]->(target:HOSTNAME)
RETURN target.name LIMIT 25
```

```cypher
-- 9. ASN prefix inventory (for an attacker's assumed network)
MATCH (a:ASN {name: "AS13335"})-[:ROUTES]->(p:PREFIX)
RETURN p.name LIMIT 25
```

---

## For brand protection and anti-phishing teams

Find lookalikes, typosquats, and impersonators.

The `whisper.variants()` procedure (and the `domain_variants` MCP tool that wraps it) is the
purpose-built starting point: it runs 14 mutation algorithms — omission, repetition,
transposition, QWERTY replace/insert, vowel-swap, bitsquatting, homoglyph / Unicode
confusables, hyphenation, dot insert/omit, TLD-swap, TLD-add, subdomain-add — and by default
returns only the variants that are actually registered as graph nodes.

| Method | confidence | confidenceLabel |
|---|---|---|
| `BITSQUATTING`, `HOMOGLYPH` | 0.9 | high |
| `KEYBOARD_REPLACEMENT` | 0.8 | high |
| `OMISSION`, `REPETITION`, `TRANSPOSITION` | 0.7 | medium |
| `KEYBOARD_INSERTION`, `VOWEL_SWAP` | 0.6 | medium |
| `TLD_SWAP`, `TLD_ADDITION` | 0.5 | medium |
| `SUBDOMAIN_ADD` | 0.4 | medium |
| `DOT_INSERTION`, `HYPHENATION` | 0.3 | low |

Each row yields `variant, method, exists, nodeId, label` plus `confidence` and
`confidenceLabel`. **`exists` means registered/observed, not malicious** — always pivot a hit
through `explain()` (or the `explain_indicator` tool) for a threat verdict.

```cypher
-- 1. Registered typosquats of a brand (the default — existing variants only)
CALL whisper.variants("google.com")
```

```cypher
-- 2. Every generated variant, including unregistered ones (pass false). Larger, noisier;
-- use it to seed a watchlist for domains an actor might register next.
CALL whisper.variants("paypal.com", false)
```

```cypher
-- 3. Registered lookalikes enriched with threat intel — which ones are weaponized?
CALL whisper.variants("paypal.com") YIELD variant, method, exists, confidence
WHERE exists = true
WITH variant, method, confidence ORDER BY confidence DESC LIMIT 50
MATCH (h:HOSTNAME {name: variant})
OPTIONAL MATCH (h)-[:LISTED_IN]->(f:FEED_SOURCE)
RETURN h.name, method, confidence, h.threatLevel, h.threatScore,
       collect(f.name) AS feeds
ORDER BY h.threatScore DESC
```

```cypher
-- 4. Unicode / IDN homoglyph check — Cyrillic, Greek and other confusable scripts are
-- accepted; homoglyph hits come back in punycode (xn--…) form.
CALL whisper.variants("gооgle.com")
```

```cypher
-- 5. Brand-name search via indexed substring (fallback when you want any host containing
-- the brand, not just algorithmic mutations)
MATCH (h:HOSTNAME) WHERE h.name CONTAINS "google"
RETURN h.name LIMIT 25
```

```cypher
-- 6. Hostnames that LINK_TO a brand (potential impersonation)
MATCH (h:HOSTNAME)-[:LINKS_TO]->(brand:HOSTNAME {name: "github.com"})
RETURN h.name LIMIT 25
```

```cypher
-- 7. From a known contact email, find every domain registered with it
-- (start from a specific email node to avoid scanning the 237M-node EMAIL label)
MATCH (e:EMAIL {name: "email:dns-admin@google.com"})<-[:HAS_EMAIL]-(h:HOSTNAME)
RETURN e.name AS contact, h.name AS domain LIMIT 25
```

```cypher
-- 8. Threat assessment for a suspicious lookalike
CALL explain("g00gle.com")
```

---

## For DNS and email security engineers

Operational visibility into nameservers, mail flows, and DNS-layer policy.

```cypher
-- 1. Nameserver inventory for a domain
MATCH (h:HOSTNAME {name: "cloudflare.com"})<-[:NAMESERVER_FOR]-(ns:HOSTNAME)
RETURN ns.name
```

```cypher
-- 2. Mail server inventory for a domain
MATCH (h:HOSTNAME {name: "google.com"})<-[:MAIL_FOR]-(mx:HOSTNAME)
RETURN mx.name
```

```cypher
-- 3. SPF include chain (one hop)
MATCH (h:HOSTNAME {name: "cloudflare.com"})-[:SPF_INCLUDE]->(target:HOSTNAME)
RETURN target.name
```

```cypher
-- 4. SPF authorized IP space (what addresses can send mail?)
MATCH (h:HOSTNAME {name: "cloudflare.com"})-[:SPF_IP]->(target)
RETURN target.name LIMIT 25
```

```cypher
-- 5. Full SPF mechanism audit (which mechanisms does this domain use?)
MATCH (h:HOSTNAME {name: "cloudflare.com"})-[r:SPF_INCLUDE|SPF_IP|SPF_A|SPF_MX|SPF_EXISTS|SPF_REDIRECT]->(target)
RETURN type(r) AS mechanism, count(target) AS occurrences
ORDER BY occurrences DESC
```

```cypher
-- 6. Domain hierarchy: parent domains and their TLD
MATCH (h:HOSTNAME {name: "www.google.com"})-[:CHILD_OF*1..3]->(parent)
RETURN labels(parent)[0] AS labelType, parent.name AS name
```

```cypher
-- 7. Batch nameserver audit
UNWIND ["google.com", "cloudflare.com", "github.com"] AS domain
MATCH (h:HOSTNAME {name: domain})<-[:NAMESERVER_FOR]-(ns:HOSTNAME)
RETURN h.name, collect(ns.name) AS nameservers
```

```cypher
-- 8. What TLDs does a registry operate? (anchor on the operator — reverse direction times out)
MATCH (op:TLD_OPERATOR {name: "VeriSign Global Registry Services"})-[:OPERATES]->(t:TLD)
RETURN t.name LIMIT 5
```

```cypher
-- 9. DNSSEC algorithm check (NOTE: SIGNED_WITH currently empty on live data — returns 0)
MATCH (h:HOSTNAME {name: "cloudflare.com"})-[:SIGNED_WITH]->(alg:DNSSEC_ALGORITHM)
RETURN alg.name
```

---

## For network and BGP security engineers

ASN profiling, peering analysis, MOAS detection, allocation history.

```cypher
-- 1. ASN profile (name + country in one go)
MATCH (a:ASN {name: "AS15169"})-[:HAS_NAME]->(n:ASN_NAME)
MATCH (a)-[:HAS_COUNTRY]->(c:COUNTRY)
RETURN a.name, n.name AS networkName, c.name AS country
```

```cypher
-- 2. BGP peer count
MATCH (a:ASN {name: "AS13335"})-[:PEERS_WITH]->(peer:ASN)
RETURN count(peer) AS peerCount
```

```cypher
-- 3. BGP peer list (sample)
MATCH (a:ASN {name: "AS13335"})-[:PEERS_WITH]->(peer:ASN)
RETURN peer.name LIMIT 25
```

```cypher
-- 4. ASN prefix count (how big is this network?)
MATCH (a:ASN {name: "AS15169"})-[:ROUTES]->(p:PREFIX)
RETURN count(p) AS prefixCount
```

```cypher
-- 5. ASN prefix inventory (sample)
MATCH (a:ASN {name: "AS15169"})-[:ROUTES]->(p:PREFIX)
RETURN p.name LIMIT 25
```

```cypher
-- 6. IP → BGP-announced prefix → ASN (the BGP-direct chain)
MATCH (ip:IPV4 {name: "8.8.8.8"})-[:ANNOUNCED_BY]->(p:ANNOUNCED_PREFIX)
      -[:ROUTES]->(a:ASN)
RETURN ip.name, p.name AS announcedPrefix, a.name AS asn
```

```cypher
-- 7. BGP enrichment: is this prefix MOAS / anycast / withdrawn?
MATCH (ip:IPV4 {name: "8.8.8.8"})-[:ANNOUNCED_BY]->(p:ANNOUNCED_PREFIX)
RETURN p.name, p.isMoas, p.isAnycast, p.isWithdrawn,
       p.wasMoas, p.hasOriginChanged, p.threatScore, p.threatLevel,
       p.firstSeen, p.lastSeen
```

```cypher
-- 8. ASN reputation
CALL explain("AS15169")
```

```cypher
-- 9. ASN organizational registration
MATCH (a:ASN {name: "AS13335"})-[:REGISTERED_BY]->(org:ORGANIZATION)
RETURN org.name
```

```cypher
-- 10. BGP routing history (note: may return {available:false, error:"timeout"})
CALL whisper.history("8.8.8.8")
```

---

## For compliance and risk-assessment teams

Document where infrastructure lives, who owns it, and how it has changed over time.

```cypher
-- 1. Country exposure for a domain (via IP geolocation, the reliable path)
MATCH (h:HOSTNAME {name: "cloudflare.com"})-[:RESOLVES_TO]->(ip:IPV4)
      -[:LOCATED_IN]->(city:CITY)-[:HAS_COUNTRY]->(country:COUNTRY)
RETURN ip.name, city.name AS city, country.name AS country
```

```cypher
-- 2. Registrar verification
MATCH (h:HOSTNAME {name: "google.com"})-[:HAS_REGISTRAR]->(r:REGISTRAR)
RETURN r.name AS currentRegistrar
```

```cypher
-- 3. Historical registrar (changes over time)
MATCH (h:HOSTNAME {name: "google.com"})-[:PREV_REGISTRAR]->(r:REGISTRAR)
RETURN r.name AS previousRegistrar
```

```cypher
-- 4. Registrant organization
MATCH (h:HOSTNAME {name: "cloudflare.com"})-[:REGISTERED_BY]->(org:ORGANIZATION)
RETURN org.name
```

```cypher
-- 5. Full security profile in one call (combine OPTIONAL MATCH for sparse fields)
MATCH (h:HOSTNAME {name: "cloudflare.com"})
OPTIONAL MATCH (h)-[:HAS_REGISTRAR]->(r:REGISTRAR)
OPTIONAL MATCH (h)-[:HAS_EMAIL]->(e:EMAIL)
OPTIONAL MATCH (h)-[:HAS_PHONE]->(p:PHONE)
OPTIONAL MATCH (h)-[:REGISTERED_BY]->(org:ORGANIZATION)
RETURN h.name, r.name AS registrar, e.name AS email,
       p.name AS phone, org.name AS organization
```

```cypher
-- 6. ASN country-of-registration check (where is the network legally domiciled?)
MATCH (a:ASN {name: "AS13335"})-[:HAS_COUNTRY]->(c:COUNTRY)
RETURN a.name, c.name AS country
```

```cypher
-- 7. Domain WHOIS history for evidence (timestamps, registrar changes)
CALL whisper.history("google.com")
```

```cypher
-- 8. Batch domain audit — registrar + organization for a portfolio
UNWIND ["google.com", "cloudflare.com", "github.com"] AS domain
MATCH (h:HOSTNAME {name: domain})
OPTIONAL MATCH (h)-[:HAS_REGISTRAR]->(r:REGISTRAR)
OPTIONAL MATCH (h)-[:REGISTERED_BY]->(org:ORGANIZATION)
RETURN h.name, r.name AS registrar, org.name AS organization
```

---

## For security researchers and academics

Schema introspection, taxonomies, graph-shape analyses.

```cypher
-- 1. Schema introspection — all labels with counts
CALL db.labels()
```

```cypher
-- 2. Schema introspection — all edge types with counts
CALL db.relationshipTypes()
```

```cypher
-- 3. Schema as JSON
CALL db.schema("json")
```

```cypher
-- 4. Threat feed catalog (40 feeds total). LIMIT is required by the validator
-- on every exploration query, even on small labels.
MATCH (f:FEED_SOURCE) RETURN f.name, f.id LIMIT 50
```

```cypher
-- 5. Threat category taxonomy (18 categories total)
MATCH (c:CATEGORY) RETURN c.name, c.id LIMIT 25
```

```cypher
-- 6. DNSSEC algorithm reference (8 total)
MATCH (a:DNSSEC_ALGORITHM) RETURN a.name LIMIT 10
```

```cypher
-- 7. Regional Internet Registries (5 total — the only label-scan that's safe)
MATCH (r:RIR) RETURN r.name LIMIT 10
```

```cypher
-- 8. ASN peering degree for a hub network
MATCH (a:ASN {name: "AS3356"})-[:PEERS_WITH]->(peer:ASN)
RETURN count(peer) AS peeringDegree
```

```cypher
-- 9. Web-graph outbound link degree for a popular domain
MATCH (h:HOSTNAME {name: "github.com"})-[:LINKS_TO]->(target:HOSTNAME)
RETURN count(target) AS outboundLinkDegree
```

```cypher
-- 10. Shortest path between two hostnames (bounded depth required)
MATCH (a:HOSTNAME {name: "cloudflare.com"}), (b:HOSTNAME {name: "google.com"})
MATCH p = shortestPath((a)-[*1..6]-(b))
RETURN length(p) AS hops, [n IN nodes(p) | n.name] AS path
```

---

## Cross-cutting recipes

### Threat assessment for a CIDR range

```cypher
-- One-shot density assessment
CALL explain("3.64.0.0/12")
```

### Parameterized batch lookup (preferred for production)

```
POST /api/query
{
  "query": "UNWIND $domains AS d MATCH (h:HOSTNAME {name: d})-[:RESOLVES_TO]->(ip:IPV4) RETURN h.name, collect(ip.name) AS ips",
  "parameters": { "domains": ["google.com", "cloudflare.com", "github.com"] }
}
```

### Plan-tier check before a deep-traversal query

```cypher
CALL whisper.quota()
-- inspect the maxQueryDepth row before writing 5+ hop chains
```

---

## Quick reference

### Edge-direction one-liners (most common 0-result causes)

| Wrong | Right |
|---|---|
| `(ip:IPV4)-[:ANNOUNCED_BY]->(:ASN)` | `(ip)-[:ANNOUNCED_BY]->(:ANNOUNCED_PREFIX)-[:ROUTES]->(:ASN)` |
| `(:IPV4)-[:LOCATED_IN]->(:COUNTRY)` | `(:IPV4)-[:LOCATED_IN]->(:CITY)-[:HAS_COUNTRY]->(:COUNTRY)` |
| `(domain)-[:MAIL_FOR]->(mx)` | `(domain)<-[:MAIL_FOR]-(mx)` |
| `(:IPV4)-[:RESOLVES_TO]->(:HOSTNAME)` | `(:IPV4)<-[:RESOLVES_TO]-(:HOSTNAME)` |
| `(parent)-[:CHILD_OF]->(child)` | `(child)-[:CHILD_OF]->(parent)` |
| `RETURN asn.name` (gives `"AS15169"`) | `(asn)-[:HAS_NAME]->(n:ASN_NAME) RETURN n.name` |

### Performance expectations

- Anchored single-property lookup `{name: "..."}`: **<5 ms**
- 2–3-hop traversal from anchored node: **5–50 ms**
- `CALL explain()` for IP/domain/network: **3–25 ms**
- `CALL explain()` for ASN: **up to ~80 ms**
- `CALL whisper.history()` for IP/prefix: **~10 ms** (when service is healthy; may return `available:false` with `retryAfter`)
- `CALL whisper.history()` for domain: **~1 ms** (same caveat)
- `CALL whisper.history()` for ASN: **~9 s** for large networks
- `CALL whisper.variants()`: **server-side <30 ms** (default existing-only form)
- Unanchored label scan on HOSTNAME / IPV4 / PREFIX: **timeout** — rejected by validator

### Procedures cheat sheet

| Procedure | Use for |
|---|---|
| `CALL explain("indicator")` | IP / domain / ASN / CIDR threat assessment |
| `CALL whisper.history("indicator")` | WHOIS or BGP history snapshots |
| `CALL whisper.variants("name")` | Typosquatting / brand-protection variant generation (14 algorithms) |
| `CALL whisper.quota()` | Plan tier, current usage, max query depth |
| `CALL db.labels()` | All node labels with counts |
| `CALL db.relationshipTypes()` | All physical edge types with counts |
| `CALL db.schema("json")` | Full schema as JSON |
| `EXPLAIN <query>` | Show query plan without executing |
| `PROFILE <query>` | Execute and report per-operator timing |
