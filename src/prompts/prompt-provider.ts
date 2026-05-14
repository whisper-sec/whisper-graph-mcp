import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";

const CYPHER = "```cypher";
const FENCE = "```";

function withDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function userPrompt(description: string, text: string): GetPromptResult {
  return {
    description,
    messages: [{ role: "user", content: { type: "text", text } }],
  };
}

/** Registers the eight investigation-workflow prompt templates. */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "investigate-ip",
    {
      title: "Investigate IP Address",
      description:
        "Investigate an IP address: trace network owner, reverse DNS, co-hosting, and GeoIP",
      argsSchema: { ip: z.string().describe("IP address to investigate (e.g., 104.16.123.96)") },
    },
    (args) => {
      const ip = withDefault(args.ip, "104.16.123.96");
      return userPrompt(
        `Investigate IP ${ip}`,
        `Investigate IP address ${ip} using the WhisperGraph query tool. Follow these 5 steps:

**Step 1**: Find which prefix and ASN owns the IP, plus ASN name and country.
${CYPHER}
MATCH (ip:IPV4 {name: "${ip}"})-[:BELONGS_TO]->(p:PREFIX)<-[:ROUTES]-(a:ASN)-[:HAS_NAME]->(n:ASN_NAME)
RETURN ip.name, p.name AS prefix, a.name AS asn, n.name AS asnName
${FENCE}

**Step 2**: Count how many hostnames resolve to this IP (reverse DNS).
${CYPHER}
MATCH (ip:IPV4 {name: "${ip}"})<-[:RESOLVES_TO]-(h:HOSTNAME)
RETURN count(h) AS cohostedDomains
${FENCE}

**Step 3**: Show a sample of co-hosted hostnames (up to 20).
${CYPHER}
MATCH (ip:IPV4 {name: "${ip}"})<-[:RESOLVES_TO]-(h:HOSTNAME)
RETURN h.name LIMIT 20
${FENCE}

**Step 4**: Check GeoIP data (IP → city → country).
${CYPHER}
MATCH (ip:IPV4 {name: "${ip}"})-[:LOCATED_IN]->(city:CITY)-[:HAS_COUNTRY]->(country:COUNTRY)
RETURN ip.name, city.name, country.name
${FENCE}

**Step 5**: Summarize findings: who owns this IP, where is it located, what's hosted on it.`,
      );
    },
  );

  server.registerPrompt(
    "map-attack-surface",
    {
      title: "Map Attack Surface",
      description:
        "Map the complete attack surface of a domain: DNS, mail, IP, ASN, and subdomains",
      argsSchema: { domain: z.string().describe("Domain to analyze (e.g., google.com)") },
    },
    (args) => {
      const domain = withDefault(args.domain, "google.com");
      return userPrompt(
        `Map attack surface for ${domain}`,
        `Map the complete attack surface for ${domain} using WhisperGraph. Follow these 7 steps:

**Step 1**: Resolve the domain and its www subdomain to IPs.
${CYPHER}
MATCH (h:HOSTNAME {name: "${domain}"})-[:RESOLVES_TO]->(ip:IPV4)
RETURN h.name, ip.name
${FENCE}
${CYPHER}
MATCH (h:HOSTNAME {name: "www.${domain}"})-[:RESOLVES_TO]->(ip:IPV4)
RETURN h.name, ip.name
${FENCE}

**Step 2**: Find all nameservers.
${CYPHER}
MATCH (h:HOSTNAME {name: "${domain}"})<-[:NAMESERVER_FOR]-(ns:HOSTNAME)
RETURN ns.name
${FENCE}

**Step 3**: Find all mail servers.
${CYPHER}
MATCH (h:HOSTNAME {name: "${domain}"})<-[:MAIL_FOR]-(mx:HOSTNAME)
RETURN mx.name
${FENCE}

**Step 4**: Check SPF includes.
${CYPHER}
MATCH (h:HOSTNAME {name: "${domain}"})-[:SPF_INCLUDE]->(target:HOSTNAME)
RETURN target.name
${FENCE}

**Step 5**: Find subdomains (indexed suffix scan).
${CYPHER}
MATCH (h:HOSTNAME) WHERE h.name ENDS WITH ".${domain}"
RETURN h.name LIMIT 25
${FENCE}

**Step 6**: Trace each IP to its prefix, ASN, and ASN name.
${CYPHER}
MATCH (h:HOSTNAME {name: "${domain}"})-[:RESOLVES_TO]->(ip:IPV4)
      -[:BELONGS_TO]->(p:PREFIX)<-[:ROUTES]-(a:ASN)-[:HAS_NAME]->(n:ASN_NAME)
RETURN h.name, ip.name, p.name, a.name, n.name
${FENCE}

**Step 7**: Summarize: how many IPs, how many ASNs, what infrastructure providers, what is the attack surface.`,
      );
    },
  );

  server.registerPrompt(
    "compare-domains",
    {
      title: "Compare Domain Infrastructure",
      description:
        "Compare infrastructure of two domains to find shared hosting, ASNs, or nameservers",
      argsSchema: {
        domain1: z.string().describe("First domain (e.g., google.com)"),
        domain2: z.string().describe("Second domain (e.g., youtube.com)"),
      },
    },
    (args) => {
      const domain1 = withDefault(args.domain1, "google.com");
      const domain2 = withDefault(args.domain2, "youtube.com");
      return userPrompt(
        `Compare ${domain1} vs ${domain2}`,
        `Compare the infrastructure of ${domain1} and ${domain2} using WhisperGraph. Follow these 5 steps:

**Step 1**: Resolve both domains to IPs and trace to ASNs.
${CYPHER}
MATCH (h:HOSTNAME {name: "${domain1}"})-[:RESOLVES_TO]->(ip:IPV4)
      -[:BELONGS_TO]->(p:PREFIX)<-[:ROUTES]-(a:ASN)-[:HAS_NAME]->(n:ASN_NAME)
RETURN h.name, ip.name, p.name, a.name, n.name
${FENCE}
${CYPHER}
MATCH (h:HOSTNAME {name: "${domain2}"})-[:RESOLVES_TO]->(ip:IPV4)
      -[:BELONGS_TO]->(p:PREFIX)<-[:ROUTES]-(a:ASN)-[:HAS_NAME]->(n:ASN_NAME)
RETURN h.name, ip.name, p.name, a.name, n.name
${FENCE}

**Step 2**: Check if they share any IPs (compare the results from Step 1).

**Step 3**: Check if they share ASNs (compare the ASN names from Step 1).

**Step 4**: Check if they share nameservers.
${CYPHER}
MATCH (h:HOSTNAME {name: "${domain1}"})<-[:NAMESERVER_FOR]-(ns:HOSTNAME)
RETURN ns.name
${FENCE}
${CYPHER}
MATCH (h:HOSTNAME {name: "${domain2}"})<-[:NAMESERVER_FOR]-(ns:HOSTNAME)
RETURN ns.name
${FENCE}

**Step 5**: Summarize: are these domains on related infrastructure? What do they share?`,
      );
    },
  );

  server.registerPrompt(
    "blast-radius",
    {
      title: "ASN Blast Radius Analysis",
      description: "Analyze blast radius if an ASN has a routing failure",
      argsSchema: { asn: z.string().describe("ASN number (e.g., AS13335)") },
    },
    (args) => {
      const asn = withDefault(args.asn, "AS13335");
      return userPrompt(
        `Blast radius analysis for ${asn}`,
        `Analyze the blast radius of ${asn} using WhisperGraph. Follow these 6 steps:

**Step 1**: Find the ASN's name and country.
${CYPHER}
MATCH (a:ASN {name: "${asn}"})-[:HAS_NAME]->(n:ASN_NAME)
RETURN a.name, n.name AS asnName
${FENCE}
${CYPHER}
MATCH (a:ASN {name: "${asn}"})-[:HAS_COUNTRY]->(c:COUNTRY)
RETURN a.name, c.name AS country
${FENCE}

**Step 2**: Count how many prefixes it routes.
${CYPHER}
MATCH (a:ASN {name: "${asn}"})-[:ROUTES]->(p:PREFIX)
RETURN count(p) AS prefixCount
${FENCE}

**Step 3**: Count how many BGP peers it has.
${CYPHER}
MATCH (a:ASN {name: "${asn}"})-[:PEERS_WITH]->(peer:ASN)
RETURN count(peer) AS peerCount
${FENCE}

**Step 4**: Sample some hostnames on its infrastructure.
${CYPHER}
MATCH (a:ASN {name: "${asn}"})-[:ROUTES]->(p:PREFIX)
      <-[:BELONGS_TO]-(ip:IPV4)<-[:RESOLVES_TO]-(h:HOSTNAME)
RETURN h.name LIMIT 20
${FENCE}

**Step 5**: Sample some peer ASNs.
${CYPHER}
MATCH (a:ASN {name: "${asn}"})-[:PEERS_WITH]->(peer:ASN)-[:HAS_NAME]->(n:ASN_NAME)
RETURN peer.name, n.name LIMIT 10
${FENCE}

**Step 6**: Summarize: what would be affected if this ASN went down? How many prefixes, peers, and what kind of services?`,
      );
    },
  );

  server.registerPrompt(
    "threat-triage",
    {
      title: "Threat Triage for an Indicator",
      description:
        "Comprehensive triage of an IP, domain, ASN, or CIDR: feed listings, threat score, recent activity, hosting context",
      argsSchema: {
        indicator: z
          .string()
          .describe("Indicator to triage (e.g. 185.220.101.1, example.org, AS13335, 3.64.0.0/12)"),
      },
    },
    (args) => {
      const indicator = withDefault(args.indicator, "185.220.101.1");
      return userPrompt(
        `Threat triage for ${indicator}`,
        `Triage the indicator ${indicator} using WhisperGraph. Use the dedicated tools where they
exist - they're cheaper and more authoritative than walking the graph by hand.

**Step 1**: Get the structured threat assessment.
Call the \`explain_indicator\` tool with indicator="${indicator}". The response includes a
score, level (NONE..CRITICAL), explanation, factors[], and a sources[] array of
feed listings with firstSeen/lastSeen/weight per feed.

**Step 2**: For an IP / domain - pull the full property profile (booleans,
timestamps) so you can speak to category coverage:
${CYPHER}
MATCH (n {name: "${indicator}"}) WHERE n:IPV4 OR n:IPV6 OR n:HOSTNAME
RETURN labels(n)[0] AS type, n.threatScore, n.threatLevel, n.threatSources,
       n.threatFirstSeen, n.threatLastSeen,
       n.isThreat, n.isAnonymizer, n.isC2, n.isMalware, n.isPhishing,
       n.isSpam, n.isBruteforce, n.isScanner, n.isBlacklist,
       n.isTor, n.isProxy, n.isVpn, n.isWhitelist
${FENCE}

**Step 3**: Hosting context - what network owns this? (Skip for ASN / CIDR
inputs.)
${CYPHER}
MATCH (ip:IPV4 {name: "${indicator}"})-[:BELONGS_TO]->(p:PREFIX)<-[:ROUTES]-(a:ASN)-[:HAS_NAME]->(n:ASN_NAME)
RETURN ip.name, p.name AS prefix, a.name AS asn, n.name AS network
${FENCE}

**Step 4**: BGP enrichment - is the announcing prefix a hijack candidate?
${CYPHER}
MATCH (ip:IPV4 {name: "${indicator}"})-[:ANNOUNCED_BY]->(ap:ANNOUNCED_PREFIX)
RETURN ap.name, ap.isMoas, ap.isAnycast, ap.isWithdrawn, ap.threatScore
${FENCE}

**Step 5**: History - when did this indicator first / last appear in BGP or
WHOIS data? Call the \`whisper_history\` tool with indicator="${indicator}". If the response
is \`{available: false, error: "timeout", retryAfter: N}\`, surface that to the user
and do NOT loop.

**Step 6**: Synthesize. Lead with the level and score. Quote 1-2 specific feeds
from sources[]. Mention the hosting ASN and any BGP red flags. End with a
recommended action (block / allow / investigate further).`,
      );
    },
  );

  server.registerPrompt(
    "whois-pivot",
    {
      title: "WHOIS Pivot from a Domain",
      description:
        "Find every domain that shares a contact email, phone, registrar, or registrant organization with a starting domain",
      argsSchema: { domain: z.string().describe("Starting domain (e.g. cloudflare.com)") },
    },
    (args) => {
      const domain = withDefault(args.domain, "cloudflare.com");
      return userPrompt(
        `WHOIS pivot from ${domain}`,
        `Pivot from ${domain} through WHOIS contact data to discover related domains. Run the
queries in order; stop early if a step is high-cardinality (the LIMITs cap each
branch at 25).

**Step 1**: Pull the WHOIS profile.
${CYPHER}
MATCH (h:HOSTNAME {name: "${domain}"})
OPTIONAL MATCH (h)-[:HAS_REGISTRAR]->(r:REGISTRAR)
OPTIONAL MATCH (h)-[:HAS_EMAIL]->(e:EMAIL)
OPTIONAL MATCH (h)-[:HAS_PHONE]->(p:PHONE)
OPTIONAL MATCH (h)-[:REGISTERED_BY]->(o:ORGANIZATION)
RETURN r.name AS registrar, e.name AS contactEmail,
       p.name AS contactPhone, o.name AS organization
${FENCE}

**Step 2**: Pivot on shared contact email (highest signal - uncommon emails
cluster very tightly).
${CYPHER}
MATCH (h:HOSTNAME {name: "${domain}"})-[:HAS_EMAIL]->(e:EMAIL)<-[:HAS_EMAIL]-(other:HOSTNAME)
WHERE other.name <> "${domain}"
RETURN e.name AS sharedEmail, other.name AS relatedDomain LIMIT 25
${FENCE}

**Step 3**: Pivot on shared phone.
${CYPHER}
MATCH (h:HOSTNAME {name: "${domain}"})-[:HAS_PHONE]->(p:PHONE)<-[:HAS_PHONE]-(other:HOSTNAME)
WHERE other.name <> "${domain}"
RETURN p.name AS sharedPhone, other.name AS relatedDomain LIMIT 25
${FENCE}

**Step 4**: Pivot on shared registrant organization.
${CYPHER}
MATCH (h:HOSTNAME {name: "${domain}"})-[:REGISTERED_BY]->(o:ORGANIZATION)<-[:REGISTERED_BY]-(other:HOSTNAME)
WHERE other.name <> "${domain}"
RETURN o.name AS organization, other.name AS relatedDomain LIMIT 25
${FENCE}

**Step 5**: Synthesize. Group related domains by which contact field connected
them. Email/phone/org pivots are stronger signals; registrar pivots usually only
indicate a popular service provider (e.g. all MarkMonitor customers) and are
rarely actionable.

**Step 6 (optional)**: For each tightly-clustered related domain, run
\`explain_indicator\` with that domain to see if it's already on a threat feed.`,
      );
    },
  );

  server.registerPrompt(
    "bgp-investigation",
    {
      title: "Full BGP Profile of an ASN",
      description:
        "Comprehensive ASN profile: identity, country, prefix inventory, peers, threat reputation, and conflict (MOAS) detection",
      argsSchema: { asn: z.string().describe("ASN number (e.g. AS13335, AS15169)") },
    },
    (args) => {
      const asn = withDefault(args.asn, "AS13335");
      return userPrompt(
        `BGP profile for ${asn}`,
        `Profile ${asn} using WhisperGraph. The chain of edges around an ASN is BGP-enriched
so you can answer ownership, scale, peering, and reputation in one workflow.

**Step 1**: Identity - name and country of registration.
${CYPHER}
MATCH (a:ASN {name: "${asn}"})-[:HAS_NAME]->(n:ASN_NAME)
MATCH (a)-[:HAS_COUNTRY]->(c:COUNTRY)
RETURN a.name, n.name AS networkName, c.name AS country
${FENCE}

**Step 2**: Scale - how many prefixes does it route, how many BGP peers?
${CYPHER}
MATCH (a:ASN {name: "${asn}"})-[:ROUTES]->(p:PREFIX)
RETURN count(p) AS prefixCount
${FENCE}
${CYPHER}
MATCH (a:ASN {name: "${asn}"})-[:PEERS_WITH]->(peer:ASN)
RETURN count(peer) AS peerCount
${FENCE}

**Step 3**: Sample inventories (cap at 25).
${CYPHER}
MATCH (a:ASN {name: "${asn}"})-[:ROUTES]->(p:PREFIX)
RETURN p.name AS prefix LIMIT 25
${FENCE}
${CYPHER}
MATCH (a:ASN {name: "${asn}"})-[:PEERS_WITH]->(peer:ASN)
RETURN peer.name LIMIT 25
${FENCE}

**Step 4**: Reputation - call the \`explain_indicator\` tool with indicator="${asn}".
Returns score, level, factors[], and a \`breakdown\` object with composite
sub-scores: threatDensityScore, graphMetricsScore, historicalScore,
prefixAgeScore.

**Step 5**: Conflict detection - does this ASN appear in any MOAS conflicts?
${CYPHER}
MATCH (a:ASN {name: "${asn}"})<-[:CONFLICTS_WITH]-(p:ANNOUNCED_PREFIX)
WHERE p.isMoas = true
RETURN p.name AS prefix, p.isMoas, p.wasMoas, p.hasOriginChanged LIMIT 25
${FENCE}

**Step 6 (optional)**: Historical announcement record.
Call the \`whisper_history\` tool with indicator="${asn}". Note this can be slow
(~9s for large networks) and may return \`{available:false, retryAfter}\` -
surface that to the user.

**Step 7**: Synthesize. Lead with the network name + country. Mention peer
count and prefix inventory as scale signals. Quote the threat level and any
breakdown sub-score that's elevated. Flag any MOAS conflicts.`,
      );
    },
  );

  server.registerPrompt(
    "typosquat-sweep",
    {
      title: "Typosquat / Brand-Protection Sweep",
      description:
        "Find registered lookalikes of a brand domain, enrich them with threat intel, and pivot to who registered them",
      argsSchema: { domain: z.string().describe("Brand domain to protect (e.g. paypal.com)") },
    },
    (args) => {
      const domain = withDefault(args.domain, "paypal.com");
      return userPrompt(
        `Typosquat sweep for ${domain}`,
        `Run a typosquatting / brand-protection sweep for ${domain} using WhisperGraph. Use the
dedicated tools - they're cheaper and more authoritative than walking the graph
by hand.

**Step 1**: Generate the lookalikes that actually exist.
Call the \`domain_variants\` tool with name="${domain}". By default it returns only
variants registered in the graph, each with a \`method\` (omission, homoglyph,
bitsquatting, TLD-swap, …) and a \`confidence\` score. Homoglyph hits on Unicode
confusables come back as punycode (xn--…). Treat "exists" as "registered", NOT
"malicious".

**Step 2**: Triage which registered lookalikes are weaponized. For the
higher-confidence variants, check threat-feed listings in one batch:
${CYPHER}
CALL whisper.variants("${domain}") YIELD variant, exists, confidence
WHERE exists = true
WITH variant, confidence ORDER BY confidence DESC LIMIT 50
MATCH (h:HOSTNAME {name: variant})
OPTIONAL MATCH (h)-[:LISTED_IN]->(f:FEED_SOURCE)
RETURN h.name, confidence, h.threatLevel, h.threatScore,
       collect(f.name) AS feeds
ORDER BY h.threatScore DESC
${FENCE}

**Step 3**: For each lookalike that is on a feed or otherwise suspicious, get
the full structured verdict. Call the \`explain_indicator\` tool with that
variant as the indicator - it returns score, level, factors[], and sources[].

**Step 4**: Attribution - who registered the worst offenders? For each
high-interest variant, pivot through WHOIS contact data:
${CYPHER}
MATCH (h:HOSTNAME {name: "<variant>"})
OPTIONAL MATCH (h)-[:HAS_REGISTRAR]->(r:REGISTRAR)
OPTIONAL MATCH (h)-[:HAS_EMAIL]->(e:EMAIL)
OPTIONAL MATCH (h)-[:REGISTERED_BY]->(o:ORGANIZATION)
RETURN r.name AS registrar, e.name AS contactEmail, o.name AS organization
${FENCE}
If a contact email is shared, pivot again to find the rest of the actor's
portfolio:
${CYPHER}
MATCH (e:EMAIL {name: "<contactEmail>"})<-[:HAS_EMAIL]-(other:HOSTNAME)
RETURN other.name AS relatedDomain LIMIT 25
${FENCE}

**Step 5**: Synthesize. Lead with how many registered lookalikes exist and how
many are weaponized. List the highest-risk variants with their method, threat
level, and the feeds that flagged them. Call out any shared registrant /
contact email that clusters them. End with a recommended action list:
monitor, report for takedown, or block.`,
      );
    },
  );
}
