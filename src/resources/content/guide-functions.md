# WhisperGraph Function Reference

## Aggregation Functions

| Function | Syntax | Example |
|----------|--------|---------|
| count() | `count(expr)` | `MATCH (n:ASN) RETURN count(n)` |
| count(*) | `count(*)` | `MATCH (n:COUNTRY) RETURN count(*)` |
| count(DISTINCT) | `count(DISTINCT expr)` | `RETURN count(DISTINCT ns)` |
| sum | `sum(expr)` | `UNWIND [1,2,3] AS x RETURN sum(x)` |
| avg | `avg(expr)` | `UNWIND [1,2,3] AS x RETURN avg(x)` |
| min / max | `min(expr)`, `max(expr)` | `UNWIND [1,2,3] AS x RETURN min(x)` |
| collect | `collect(expr)` | Collects values into a list |
| stdev / stdevp | `stdev(expr)` | Sample / population standard deviation |
| percentile_disc / percentile_cont | `percentile_disc(expr, pct)` | Discrete / continuous percentile (aliases: `percentileDisc`, `percentileCont`) |

## String Functions

| Function | Syntax | Description |
|----------|--------|-------------|
| toUpper | `toUpper(str)` | Convert to uppercase |
| toLower | `toLower(str)` | Convert to lowercase |
| trim | `trim(str)` | Remove leading/trailing whitespace |
| ltrim / rtrim | `ltrim(str)` | Remove leading / trailing whitespace |
| reverse | `reverse(str)` | Reverse a string |
| size | `size(str)` | String length |
| replace | `replace(str, from, to)` | Substring replacement |
| substring | `substring(str, start[, len])` | Extract substring |
| split | `split(str, delimiter)` | Split into list |
| left / right | `left(str, n)` | First / last n characters |
| toString | `toString(val)` | Convert to string |

## Numeric Functions

| Function | Syntax | Description |
|----------|--------|-------------|
| abs | `abs(n)` | Absolute value |
| ceil / floor | `ceil(n)` | Round up / down |
| round | `round(n)` or `round(n, decimals)` | Round to nearest / to precision |
| sign | `sign(n)` | -1, 0, or 1 |
| sqrt | `sqrt(n)` | Square root |
| log / log10 | `log(n)` | Natural / base-10 logarithm |
| exp | `exp(n)` | Euler's number raised to power |
| rand | `rand()` | Random float [0, 1) |
| e / pi | `e()`, `pi()` | Mathematical constants |

## Trigonometric Functions

sin, cos, tan, asin, acos, atan, atan2, degrees, radians — all standard trigonometric functions are supported.

## Geospatial Functions

| Function | Syntax | Description |
|----------|--------|-------------|
| point | `point({latitude: lat, longitude: lon})` | Create a geographic point |
| point | `point(lat, lon)` | Shorthand form |
| distance | `distance(point1, point2)` | Haversine distance in meters |
| point.distance | `point.distance(p1, p2)` | Alias for `distance(point1, point2)` |

**Example**: Distance between San Francisco and New York:
```cypher
RETURN distance(
  point({latitude: 37.7749, longitude: -122.4194}),
  point({latitude: 40.7128, longitude: -74.0060})
) AS meters
```
Result: 4,129,086 meters (~4,129 km)

**Note**: Both `point.distance(p1, p2)` and `distance(p1, p2)` are supported.

## Collection Functions

| Function | Syntax | Description |
|----------|--------|-------------|
| head | `head(list)` | First element |
| last | `last(list)` | Last element |
| tail | `tail(list)` | All elements except first |
| range | `range(start, end[, step])` | Integer sequence |
| coalesce | `coalesce(v1, v2, ...)` | First non-null value |
| isEmpty | `isEmpty(coll_or_str)` | Check if empty |
| properties | `properties(node)` | Node metadata (id, label, name) |
| keys | `keys(map)` | All keys of a map |

## Node and Relationship Functions

| Function | Syntax | Description |
|----------|--------|-------------|
| id | `id(node)` | Internal node ID |
| labels | `labels(node)` | Node label list |
| elementId | `elementId(node)` | String-form ID (e.g., "4:whisper:560058031") |
| type | `type(rel)` | Relationship type name |
| startNode / endNode | `startNode(rel)` | Source / target node of relationship |
| nodes | `nodes(path)` | Node IDs along a path |
| relationships | `relationships(path)` | Edge types along a path |
| length | `length(path)` | Number of hops in a path |

## Type Conversion Functions

| Function | Description |
|----------|-------------|
| toInteger(val) | Convert to integer |
| toFloat(val) | Convert to float |
| toBoolean(val) | Convert to boolean |
| toString(val) | Convert to string |
| toIntegerList(list) | Convert list elements to integers |
| toFloatList(list) | Convert list elements to floats |
| toStringList(list) | Convert list elements to strings |
| toBooleanList(list) | Convert list elements to booleans |

## List Predicates

| Function | Example | Description |
|----------|---------|-------------|
| all | `all(x IN [2,4,6] WHERE x % 2 = 0)` | True if all elements match |
| any | `any(x IN [1,2,3] WHERE x > 2)` | True if any element matches |
| none | `none(x IN [1,2,3] WHERE x > 5)` | True if no element matches |
| single | `single(x IN [1,2,3] WHERE x = 2)` | True if exactly one matches |
| reduce | `reduce(t=0, x IN [1,2,3,4,5] \| t+x)` | Fold list to single value |

## Date/Time Functions

| Function | Description | Example Result |
|----------|-------------|----------------|
| timestamp() | Current epoch milliseconds | `1771870395517` |
| datetime() | Current ISO datetime | `"2026-02-23T18:13:15Z"` |
| date() | Current date | `"2026-02-23"` |
| randomUUID() | Generate a UUID | `"8677281a-1c58-..."` |
| datetime("ISO string") | Parse ISO 8601 datetime | `datetime("2024-01-15T10:30:00Z")` |
| duration("P1Y2M3D") | Create duration from ISO 8601 | |
| duration.between(dt1, dt2) | Duration between two datetimes | |

**Note**: Property access on datetime values: `.year`, `.month`, `.day`, `.hour`, `.minute`, `.second`.

## Schema Introspection Procedures

| Procedure | Description |
|-----------|-------------|
| `CALL db.labels()` | All node labels with counts |
| `CALL db.relationshipTypes()` | All edge types with counts |
| `CALL db.propertyKeys()` | All known property keys |
| `CALL db.schema.nodeTypeProperties()` | Property metadata per node type |
| `CALL db.schema.relTypeProperties()` | Property metadata per edge type |
| `CALL db.schema("format")` | Full schema (formats: "cypher", "json", "markdown", "details") |
| `CALL db.schema.visualization()` | Alias for `db.schema("cypher")` |
| `CALL db.schema()` | Full schema summary (no format argument needed) |
| `CALL whisper.quota()` | Plan tier, rate limits, usage, max query depth |
| `CALL explain("indicator")` | Threat assessment for IP, domain, ASN, or CIDR |
| `CALL whisper.history("indicator")` | Historical WHOIS/BGP data (domain, IP, ASN, CIDR, hash) |
| `CALL whisper.variants("name" [, "LABEL"] [, shouldCheckForExisting])` | Typosquatting / brand-protection variant generation (14 algorithms); yields `variant, method, exists, nodeId, label`, `confidence`, `confidenceLabel` |
