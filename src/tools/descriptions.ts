export const QUERY_TOOL_DESCRIPTION = `Execute a Cypher query against WhisperGraph - the internet's largest infrastructure graph database (7.39B nodes, 39B edges, 5.6M threat intel edges). Returns JSON with columns, rows, and statistics.

Use this tool for any question involving domains, hostnames, IPs, DNS, BGP, GeoIP, web links, email infrastructure, WHOIS, DNSSEC, or threat intelligence.

NODE LABELS (20): HOSTNAME (2.6B), IPV4 (619M), IPV6 (820K), PREFIX (2.5M), ASN (116K), ASN_NAME (108K), ORGANIZATION (119M), CITY (54K), TLD (1.7K), COUNTRY (424), RIR (5), DNSSEC_ALGORITHM (8), TLD_OPERATOR (737), REGISTRAR (51K), EMAIL (237M), PHONE (60M), REGISTERED_PREFIX (326K, virtual), ANNOUNCED_PREFIX (1.4M, virtual), FEED_SOURCE (40, virtual), CATEGORY (18, virtual). All nodes have a "name" property. Threat-listed IPV4/IPV6/HOSTNAME nodes also carry: threatScore (Double), threatLevel (NONE/INFO/LOW/MEDIUM/HIGH/CRITICAL), threatSources, threatFirstSeen/threatLastSeen (epoch ms), and 13 boolean flags: isThreat, isAnonymizer, isC2, isMalware, isPhishing, isSpam, isBruteforce, isScanner, isBlacklist, isTor, isProxy, isVpn, isWhitelist. ANNOUNCED_PREFIX adds BGP-enrichment: isMoas, isAnycast, isWithdrawn, wasMoas, hasOriginChanged, threatScore, threatLevel, threatSourceCount, firstSeen, lastSeen. LISTED_IN edges carry firstSeen, lastSeen, weight.

KEY EDGES: RESOLVES_TO (HOSTNAME→IPV4/IPV6, forward only), CHILD_OF (child→parent: HOSTNAME→HOSTNAME→TLD), ALIAS_OF (CNAME), NAMESERVER_FOR / MAIL_FOR (NS/MX → domain - to list a domain's MX use (domain)<-[:MAIL_FOR]-(mx)), SPF_INCLUDE/SPF_IP/SPF_A/SPF_MX/SPF_EXISTS/SPF_REDIRECT (SPF policy; SPF_IP targets IPV4|IPV6|PREFIX), LINKS_TO (web hyperlinks, 10.8B), BELONGS_TO (3 semantics: IPV4/IPV6→PREFIX, PREFIX→RIR, FEED_SOURCE→CATEGORY), LOCATED_IN (IPV4/IPV6→CITY only - for country, chain through HAS_COUNTRY), HAS_COUNTRY (ASN/CITY/IPV4/HOSTNAME/PHONE/ANNOUNCED_PREFIX/REGISTERED_PREFIX→COUNTRY), ANNOUNCED_BY (IPV4/IPV6→ANNOUNCED_PREFIX, then ROUTES→ASN), ROUTES (ASN/ANNOUNCED_PREFIX→PREFIX/ASN, virtual), PEERS_WITH (ASN↔ASN, bidirectional, virtual), HAS_NAME (ASN→ASN_NAME, virtual; asn.name is the AS number - the network name lives on the ASN_NAME node), REGISTERED_BY (HOSTNAME/ASN/PREFIX→ORGANIZATION), HAS_REGISTRAR / PREV_REGISTRAR / HAS_EMAIL / HAS_PHONE (WHOIS), LISTED_IN (indicator→feed; threat intel for IPV4/IPV6/HOSTNAME), CONFLICTS_WITH (PREFIX/ANNOUNCED_PREFIX↔ASN, MOAS, bidirectional), OPERATES (TLD_OPERATOR→TLD).

TRAVERSAL CHAINS:
DNS: HOSTNAME→RESOLVES_TO→IPV4→BELONGS_TO→PREFIX←ROUTES←ASN→HAS_NAME→ASN_NAME
BGP-direct: IPV4→ANNOUNCED_BY→ANNOUNCED_PREFIX→ROUTES→ASN
GeoIP: HOSTNAME→RESOLVES_TO→IPV4→LOCATED_IN→CITY→HAS_COUNTRY→COUNTRY
WHOIS: HOSTNAME→HAS_REGISTRAR→REGISTRAR, HOSTNAME→HAS_EMAIL→EMAIL
Threat: IPV4/HOSTNAME→LISTED_IN→FEED_SOURCE→BELONGS_TO→CATEGORY

RULES:
- Use {name: "value"} or WHERE n.name = "value" for lookups - both indexed
- Always include LIMIT on exploration queries (max 500)
- shortestPath requires bounded depth: [*1..6]
- Never scan FEED_SOURCE or CATEGORY directly - access via LISTED_IN from anchored nodes
- STARTS WITH, ENDS WITH ".x", CONTAINS on .name are all indexed and fast
- SIGNED_WITH currently returns 0 rows on live data (DNSSEC layer empty)

PROCEDURES: CALL explain("indicator") for threat assessment, CALL whisper.history("indicator") for historical WHOIS/BGP data, CALL whisper.variants("name") for typosquatting / brand-protection variant generation, CALL whisper.quota() for rate limits, CALL db.labels() / db.relationshipTypes() / db.schema("json") for schema introspection.

EXAMPLES:
MATCH (h:HOSTNAME {name: "www.google.com"})-[:RESOLVES_TO]->(ip:IPV4) RETURN h.name, ip.name
MATCH (ip:IPV4 {name: "8.8.8.8"})<-[:RESOLVES_TO]-(h:HOSTNAME) RETURN h.name LIMIT 20
MATCH (h:HOSTNAME {name: "google.com"})-[:RESOLVES_TO]->(ip:IPV4)-[:LOCATED_IN]->(c:CITY) RETURN ip.name, c.name
MATCH (a:ASN {name: "AS15169"})-[:HAS_NAME]->(n:ASN_NAME) RETURN n.name
MATCH (h:HOSTNAME) WHERE h.name ENDS WITH ".google.com" RETURN h.name LIMIT 20
MATCH (ip:IPV4 {name: "185.220.101.1"})-[:LISTED_IN]->(f:FEED_SOURCE) RETURN f.name, ip.threatScore

DOCUMENTATION:
API reference: https://www.whisper.security/docs/cypher-api-reference
Cypher query guide: https://www.whisper.security/docs/cypher-query-guide
Cypher functions: https://www.whisper.security/docs/cypher-functions`;

export const LIST_LABELS_DESCRIPTION = `List all node labels in WhisperGraph with their counts.

Use this BEFORE writing a query when you're not sure which label to anchor on. It rules out hallucinated labels (e.g. there is no DOMAIN or FQDN - only HOSTNAME) and tells you which labels are large (HOSTNAME, IPV4) vs small (RIR, COUNTRY).

Returns: an array of {label, count} rows. Cached server-side for 5 minutes.

Tip: pair with describe_label to verify which properties exist on a label before referencing them in WHERE clauses.`;

export const DESCRIBE_LABEL_DESCRIPTION = `Describe a single label: confirm it exists, get its node count, and enumerate the property keys observed on that label.

Use this BEFORE writing a query that filters on a specific property. If you write WHERE h.fqdn = "..." but describe_label("HOSTNAME") returns properties = ["name", "threatScore", ...], your query will silently scan the entire label. Verify first.

Argument: label (string, required) - uppercase letters, digits, and underscores only.

Returns: {name, exists, count, properties[], edgesDoc}. Cached 5 minutes.

Tip: edge types are NOT in the response - see the whisper://schema/relationships resource for which edges connect this label to others.`;

export const EXPLAIN_INDICATOR_DESCRIPTION = `Run a comprehensive threat assessment on a single indicator. The indicator can be an IPv4, IPv6, hostname, CIDR network, or ASN - the procedure auto-detects the type.

Returns a single structured row: { indicator, type, available, cached, found, score, level (NONE/INFO/LOW/MEDIUM/HIGH/CRITICAL), explanation, factors[], sources[] }. For ASN inputs the row also includes a \`breakdown\` object with composite sub-scores (threatDensityScore, graphMetricsScore, historicalScore, prefixAgeScore). For CIDR inputs the explanation field carries threat-density stats (listed IPs, density %).

Prefer this tool over manual ASN→PREFIX→IP→LISTED_IN walks - those time out on large ASNs (AWS, GCP, Azure, Cloudflare). Performance: 3-25ms for IP/domain/network, up to ~80ms for ASN.

Argument: indicator (string, required). Allowed characters: letters, digits, '.', '-', ':', '/', '_'. Cypher-special characters are rejected.`;

export const WHISPER_HISTORY_DESCRIPTION = `Retrieve historical WHOIS or BGP data for a single indicator. The indicator can be an IPv4, IPv6, hostname, CIDR, or ASN - the procedure auto-detects the type.

Returns shape varies by indicator type:
  - IP / prefix (type=routing): { origin, prefix, startTime, endTime, peersSeing }
  - Domain (type=domain): WHOIS snapshots - { queryTime, createDate, updateDate, expiryDate, registrar, nameServers }
  - ASN (type=asn): prefix announcement history (slow, ~9s for large ASNs)

On upstream failure (the data source is rate-limiting or temporarily down), the row shape is: { available: false, error: "timeout" | ..., retryAfter: <seconds> }. Surface the retryAfter to the user - DO NOT loop on retry.

Argument: indicator (string, required). Allowed characters: letters, digits, '.', '-', ':', '/', '_'.`;

export const DOMAIN_VARIANTS_DESCRIPTION = `Generate typosquatting / brand-protection variants of a domain or brand name and check which ones actually exist in WhisperGraph.

Runs 14 mutation algorithms - character omission, repetition, transposition, QWERTY-adjacent replacement/insertion, vowel-swap, bitsquatting, homoglyph / Unicode confusables, hyphenation, dot insertion/omission, TLD-swap, TLD-addition, and subdomain-add. Unicode input is accepted (and expected) so IDN homoglyph lookalikes resolve correctly.

Returns { rows: [...] }. Each row: { variant, method, exists, nodeId, label, confidence (0.3-0.9), confidenceLabel (low/medium/high) }. By default only variants that EXIST as nodes are returned - the registered lookalikes worth investigating. Note that "exists" means registered/observed, NOT malicious: pivot each hit through explain_indicator for a threat verdict.

Arguments:
  - name (string, required) - the domain or brand to mutate, e.g. "google.com". Allowed characters: letters (including Unicode), digits, '.', '-', '_'.
  - label (string, optional, default HOSTNAME) - node label to check existence against.
  - includeNonExistent (boolean, optional, default false) - when true, also return generated variants that do NOT exist in the graph (larger, noisier result set).

Performance: typically <150ms. Results are capped at 500 rows.`;
