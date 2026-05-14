# WhisperGraph Complete Schema Reference

> Counts shown are recent snapshots (refreshed periodically). For live numbers call `list_labels` (MCP tool) or `CALL db.labels()`.

## Node Labels (20 types)

| Label | Count | Description | Example Values |
|-------|------:|-------------|----------------|
| HOSTNAME | 2,631,997,144 | Fully-qualified hostname | www.google.com, ns1.google.com |
| IPV4 | 618,914,961 | IPv4 address | 142.250.64.100, 104.16.123.96 |
| IPV6 | 819,803 | IPv6 address (zero-padded form) | 2606:4700:4700:0000:0000:0000:0000:1111 |
| PREFIX | 2,493,411 | IP prefix (CIDR block) | 142.250.64.0/24, 104.16.112.0/20 |
| ASN | 116,028 | Autonomous system number | AS1, AS13335, AS15169 |
| ASN_NAME | 107,720 | Autonomous system name (descriptive) | GOOGLE, CLOUDFLARENET |
| TLD | 1,743 | Top-level domain | com, net, org |
| CITY | 54,233 | City (GeoIP) | Mountain View, US; Sydney, AU |
| COUNTRY | 424 | ISO country codes + RIR special codes | US, DE, AU, AA |
| RIR | 5 | Regional Internet Registry | AFRINIC, APNIC, ARIN, LACNIC, RIPENCC |
| ORGANIZATION | 119,189,847 | Organization entity (RIR handles + WHOIS registrants) | cloudflare, inc.; data protected |
| TLD_OPERATOR | 737 | TLD registry operator | VeriSign, NISSAN MOTOR CO., LTD. |
| REGISTRAR | 50,660 | Domain registrar (WHOIS) | iana:292, registrar:markmonitor inc. |
| EMAIL | 237,065,663 | Contact email (WHOIS) | email:dns-admin@google.com |
| PHONE | 60,194,142 | Contact phone (WHOIS, E.164) | +16502530000 |
| DNSSEC_ALGORITHM | 8 | DNSSEC signing algorithm | ECDSAP256SHA256, RSASHA256, ED25519 |
| REGISTERED_PREFIX | 325,591 | RIR-allocated prefix (owner view; virtual) | 8.8.8.0/24, 1.1.1.0/24 |
| ANNOUNCED_PREFIX | 1,399,482 | BGP-announced prefix (routing view; virtual) | 1.0.0.0/24 |
| FEED_SOURCE | 40 | Threat intelligence feed source (virtual) | Dan Tor Exit, IPsum, Tranco Top 1M |
| CATEGORY | 18 | Threat category classification (virtual) | C2 Servers, TOR Network, Malware Distribution |

All nodes have a `name` property (string). Threat-listed nodes (IPV4/IPV6/HOSTNAME) also carry the threat properties documented below.

**Virtual labels**: `FEED_SOURCE`, `CATEGORY`, `REGISTERED_PREFIX`, and `ANNOUNCED_PREFIX` are synthesized by the threat intelligence + BGP enrichment layer. Access via edge traversal from anchored nodes — do not scan directly.

**WHOIS labels**: `REGISTRAR` nodes use IANA ID format (e.g., `iana:292`) or name format (e.g., `registrar:markmonitor inc.`). `EMAIL` nodes use `email:address` format. `PHONE` nodes use E.164 format.

## Edge Types

Physical edges (24 — counts are live):

| Edge Type | Count | Source → Target | Description |
|-----------|------:|-----------------|-------------|
| CHILD_OF | 2,338,085,185 | HOSTNAME, EMAIL → HOSTNAME, TLD | DNS hierarchy and email domain association (child → parent) |
| RESOLVES_TO | 2,919,321,504 | HOSTNAME → IPV4/IPV6 | DNS A/AAAA record (forward only — no reverse-PTR view) |
| BELONGS_TO | 619,734,764 | IPV4, IPV6, PREFIX, FEED_SOURCE → PREFIX, RIR, CATEGORY | Three semantics: IP→prefix containment, prefix→RIR allocation, feed→category taxonomy |
| NAMESERVER_FOR | 8,881,831,888 | HOSTNAME, TLD → HOSTNAME | NS record (nameserver → domain it serves) |
| MAIL_FOR | 562,591,148 | HOSTNAME, TLD → HOSTNAME | MX record (mail server → domain it serves) |
| LINKS_TO | 10,851,011,448 | HOSTNAME → HOSTNAME | Web hyperlink (Common Crawl) |
| ALIAS_OF | 434,262,039 | HOSTNAME → HOSTNAME | CNAME record |
| SPF_INCLUDE | 248,657,397 | HOSTNAME → HOSTNAME, TLD | SPF include mechanism |
| SPF_IP | 184,041,835 | HOSTNAME → IPV4, IPV6, PREFIX | SPF ip4/ip6 mechanism (filtering on :IPV4 alone undercounts) |
| SPF_A | 93,812,710 | HOSTNAME → HOSTNAME | SPF a: mechanism |
| SPF_MX | 84,451,018 | HOSTNAME → HOSTNAME | SPF mx: mechanism |
| SPF_EXISTS | 327,825 | HOSTNAME → HOSTNAME | SPF exists: mechanism |
| SPF_REDIRECT | 2,751,803 | HOSTNAME → HOSTNAME | SPF redirect= modifier |
| HAS_COUNTRY | 194,925,670 | ASN, CITY, IPV4, HOSTNAME, PHONE, ANNOUNCED_PREFIX, REGISTERED_PREFIX → COUNTRY | Country association |
| REGISTERED_BY | 916,255,242 | HOSTNAME, ASN, PREFIX → ORGANIZATION | Organization registration (WHOIS + RIR) |
| LOCATED_IN | 118,196,249 | IPV4, IPV6 → CITY | GeoIP location (only IP→CITY; chain through HAS_COUNTRY for country) |
| OPERATES | 1,594 | TLD_OPERATOR → TLD | TLD registry operator |
| HAS_REGISTRAR | 649,320,946 | HOSTNAME → REGISTRAR | Current registrar (WHOIS) |
| HAS_EMAIL | 546,846,860 | HOSTNAME → EMAIL | Domain contact email (WHOIS) |
| HAS_PHONE | 550,324,627 | HOSTNAME → PHONE | Domain contact phone (WHOIS) |
| PREV_REGISTRAR | 618,353,159 | HOSTNAME → REGISTRAR | Historical registrar (WHOIS) |
| ANNOUNCED_BY | 3,680,737,368 | IPV4, IPV6 → ANNOUNCED_PREFIX | BGP announcement |
| LISTED_IN | 5,646,177 | IPV4, IPV6, HOSTNAME → FEED_SOURCE | Threat indicator on feed |
| CONFLICTS_WITH | 33,043 | PREFIX, ANNOUNCED_PREFIX → ASN | MOAS conflict (bidirectional) |

Virtual edges (synthesized at query time — work via anchored queries but don't appear in `db.relationshipTypes()`):

| Edge Type | Source → Target | Description |
|-----------|-----------------|-------------|
| HAS_NAME | ASN → ASN_NAME | ASN descriptive name. `asn.name` is the AS number (`AS15169`); the human-readable network name is on the ASN_NAME node. |
| ROUTES | ANNOUNCED_PREFIX, ASN → ASN, PREFIX | ASN routes prefix via BGP |
| PEERS_WITH | ASN ↔ ASN | BGP peering (bidirectional) |
| SIGNED_WITH | HOSTNAME → DNSSEC_ALGORITHM | DNSSEC DS record. **Currently empty on live data** — DNSSEC bindings will return 0 today. |
| PARENT_OF | TLD, HOSTNAME → HOSTNAME | Reverse of CHILD_OF |

**WHOIS edges**: `HAS_REGISTRAR`, `HAS_EMAIL`, `HAS_PHONE`, `PREV_REGISTRAR` connect domain hostnames to their registration and contact data. `PREV_REGISTRAR` captures registrar changes over time.

## Edge-direction landmines (most common zero-result causes)

- **`(ip:IPV4)-[:ANNOUNCED_BY]->(:ASN)`** returns 0. ANNOUNCED_BY targets ANNOUNCED_PREFIX; reach the ASN via the next hop or via `BELONGS_TO`-`ROUTES`.
- **`(:IPV4)-[:LOCATED_IN]->(:COUNTRY)`** returns 0. LOCATED_IN only goes IP → CITY; chain through `HAS_COUNTRY`.
- **`(domain)-[:MAIL_FOR]->(mx)`** is reversed. The MX host is on the source side — use `(domain)<-[:MAIL_FOR]-(mx)`. Same for `NAMESERVER_FOR`.
- **`(:IPV4)-[:RESOLVES_TO]->(:HOSTNAME)`** returns 0. Forward DNS only — there is no reverse-PTR view. For "what hostnames resolve to this IP", use `(ip)<-[:RESOLVES_TO]-(h)`.
- **`(parent)-[:CHILD_OF]->(child)`** is reversed. CHILD_OF goes child → parent.
- **`(reverse) LISTED_IN`** returns 0. Indicator → feed only.
- **`(ip)-[:BELONGS_TO]->(:RIR)`** returns 0 — that's a 2-hop chain via PREFIX.

## Threat Intelligence Properties

### IPV4 / IPV6 / HOSTNAME — indicator threat properties

These properties are present when the node is listed in any threat feed.

| Property | Type | Description |
|---|---|---|
| `threatScore` | Double | Computed threat score (typical 0–100; can exceed for densely-listed indicators) |
| `threatLevel` | String | NONE / INFO / LOW / MEDIUM / HIGH / CRITICAL |
| `threatSources` | Long | Number of feeds listing this indicator |
| `threatFirstSeen` | Long | First seen across all feeds (epoch ms) |
| `threatLastSeen` | Long | Last seen across all feeds (epoch ms) |
| `isThreat` | Boolean | Listed in any threat feed |
| `isAnonymizer` | Boolean | Listed in any anonymizer feed (TOR/VPN/Proxy) |
| `isC2` | Boolean | C2 server feeds |
| `isMalware` | Boolean | Malware distribution feeds |
| `isPhishing` | Boolean | Phishing feeds |
| `isSpam` | Boolean | Spam-source feeds |
| `isBruteforce` | Boolean | Brute-force-attacker feeds |
| `isScanner` | Boolean | Scanner / probe feeds |
| `isBlacklist` | Boolean | General blacklists (Spamhaus, FireHOL, etc.) |
| `isTor` | Boolean | TOR exit-node feeds |
| `isProxy` | Boolean | Open-proxy feeds |
| `isVpn` | Boolean | VPN-exit feeds |
| `isWhitelist` | Boolean | Trusted/whitelisted reputation feeds |

### ANNOUNCED_PREFIX — BGP enrichment

| Property | Type | Description |
|---|---|---|
| `isMoas` | Boolean | Multiple-origin AS (BGP hijack indicator) |
| `isAnycast` | Boolean | Anycast prefix |
| `isWithdrawn` | Boolean | Currently withdrawn from BGP |
| `wasMoas` | Boolean | Was previously MOAS |
| `hasOriginChanged` | Boolean | Origin AS has changed over time |
| `threatScore` | Double | Aggregated prefix-level threat score |
| `threatLevel` | String | Prefix-level threat level |
| `threatSourceCount` | Long | Number of threatening IPs inside the prefix |
| `firstSeen` | Long | First seen in BGP (epoch ms) |
| `lastSeen` | Long | Last seen in BGP (epoch ms) |

### ASN enrichment

| Property | Type | Description |
|---|---|---|
| `threatScore` | Double | Max threat score across hosted IPs |
| `threatLevel` | String | Overall threat level |

### LISTED_IN edge properties

The LISTED_IN edge itself carries metadata about a single feed listing.

| Property | Type | Description |
|---|---|---|
| `firstSeen` | Long | First time this feed listed the indicator (epoch seconds) |
| `lastSeen` | Long | Last time this feed saw the indicator (epoch seconds) |
| `weight` | Float | Feed confidence weight |

## Schema Introspection Procedures

- `CALL db.labels()` — All node labels with counts
- `CALL db.relationshipTypes()` — All edge types with counts
- `CALL db.propertyKeys()` — All property keys
- `CALL db.schema.nodeTypeProperties()` — Property metadata per node type
- `CALL db.schema.relTypeProperties()` — Property metadata per edge type
- `CALL db.schema("json")` — Full schema as JSON (also: "cypher", "markdown", "details")
- `CALL db.schema()` — Full schema summary (no format argument needed)
- `CALL db.schema.visualization()` — Alias for `db.schema("cypher")`
- `CALL explain("indicator")` — Threat assessment for IP, domain, ASN, or CIDR
- `CALL whisper.history("indicator")` — Historical WHOIS/BGP data: IP/prefix returns routing history, domain returns WHOIS snapshots (queryTime, createDate, updateDate, expiryDate, registrar, nameServers)
- `CALL whisper.variants("name" [, "LABEL"] [, shouldCheckForExisting])` — Typosquatting / brand-protection variant generation (14 algorithms); yields `variant, method, exists, nodeId, label` plus `confidence`/`confidenceLabel`. Defaults to existing-graph-nodes only
- `CALL whisper.quota()` — Plan tier, rate limits, usage count, max query depth
