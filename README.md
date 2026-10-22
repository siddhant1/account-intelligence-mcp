# Account Intelligence MCP Server

An [MCP](https://modelcontextprotocol.io) server for an Account Intelligence Platform. AI clients such as Claude
Desktop, Cursor, VS Code or any custom MCP client can **search companies, look up company details, find contacts,
enrich them with email/LinkedIn, and export results** as a downloadable file.

Built with Node.js, TypeScript (strict), the official MCP TypeScript SDK, Express 5, SQLite (FTS5) and Zod.

![Architecture](docs/architecture.png)

## Highlights

- **5 MCP tools** with Zod-generated input **and output** JSON Schemas, `structuredContent`, tool annotations
  (`readOnlyHint`, `idempotentHint`, `openWorldHint`) and LLM-oriented descriptions. Also includes company **resources**
  and a **prompt**.
- **Two transports** from one server factory: **Streamable HTTP** (stateless, horizontally scalable) and **stdio** (for
  Claude Desktop's local mode).
- **API key authentication** with hashed keys, **per-key scopes** (tools outside a key's scopes are hidden from
  discovery), revocation, `401` plus a `WWW-Authenticate` challenge, and brute-force throttling per IP.
- **Errors the model can recover from**: tool errors return a code, a message and a `hint` naming the next tool to call.
  Internals never leak.
- **Rate limiting** per API key with IETF `RateLimit` headers and `Retry-After`.
- **Structured logging** (pino) with request IDs, the API key ID, the tool name and timings. Secrets are redacted and
  logs go to stderr, so they can never corrupt the stdio protocol stream.
- **Relevance-ranked search**: SQLite FTS5 with BM25 ranking, stemming, filler-word removal ("AI companies in Australia")
  and synonym expansion ("AI" also matches machine learning and LLM).
- **Signed, expiring download links** for exports (HMAC, like S3 presigned URLs), with CSV formula-injection protection.
- **39 tests** covering services, the MCP protocol in-process, HTTP end to end (auth, rate limits, downloads, DNS-rebinding
  protection) and the stdio process.

## Contents

- [Quick start](#quick-start)
- [Connect an MCP client](#connect-an-mcp-client)
- [Tools](#tools)
- [Authentication](#authentication)
- [Error handling](#error-handling)
- [Rate limiting and logging](#rate-limiting-and-logging)
- [Data layer and seed data](#data-layer-and-seed-data)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Testing](#testing)
- [Demo](#demo)
- [Trade-offs and next steps](#trade-offs-and-next-steps)

## Quick start

Requires **Node.js 20.12+** (developed on Node 24).

```bash
npm install
cp .env.example .env      # includes two development API keys
npm run db:seed           # 62 companies, 287 contacts; registers the dev keys from .env
npm run dev               # MCP endpoint: http://localhost:3100/mcp
```

In a second terminal, run the demo client to watch the whole flow (auth, discovery, execution, errors):

```bash
npm run demo
```

Or call the endpoint directly:

```bash
./examples/curl.sh
```

`.env.example` contains two development keys: `DEV_API_KEY` (all scopes) and `DEV_READONLY_API_KEY` (read scopes only).
The seed script refuses to run when `NODE_ENV=production`. To create real keys, see [Managing keys](#managing-keys).

## Connect an MCP client

Copy-ready configurations are in [`examples/`](examples). Replace the placeholder with an API key, for example
`DEV_API_KEY` from your `.env`.

| Client | Transport | Config |
| --- | --- | --- |
| Claude Desktop (local) | stdio | [`examples/claude_desktop_config.json`](examples/claude_desktop_config.json) |
| Claude Desktop (remote server) | HTTP via `mcp-remote` | [`examples/claude_desktop_config.remote.json`](examples/claude_desktop_config.remote.json) |
| Cursor | HTTP | [`examples/cursor.mcp.json`](examples/cursor.mcp.json) → `.cursor/mcp.json` |
| VS Code (Copilot agent mode) | HTTP | [`examples/vscode.mcp.json`](examples/vscode.mcp.json) → `.vscode/mcp.json` (prompts for the key) |
| Claude Code | HTTP | `claude mcp add --transport http account-intelligence http://localhost:3100/mcp --header "Authorization: Bearer $ACCOUNT_INTEL_API_KEY"` |
| MCP Inspector | HTTP | `npm run inspector`, then choose *Streamable HTTP*, URL `http://localhost:3100/mcp`, header `Authorization: Bearer <key>` |
| Custom client | HTTP | [`scripts/demo-client.ts`](scripts/demo-client.ts) (`npm run demo`) |

**Claude Desktop, local mode.** Run `npm run build` first. Claude Desktop does not inherit your shell's `PATH` (for
example nvm), so use absolute paths: `which node` gives the `command`, and `args` points to `dist/stdio.js` in this
repository. Config file: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or
`%APPDATA%\Claude\claude_desktop_config.json` (Windows). Restart Claude Desktop afterwards. The database path is resolved
from the project root, so the working directory Claude Desktop uses does not matter.

**Claude Desktop, remote mode** uses [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) to bridge stdio to the HTTP
endpoint with your key as a header. This configuration was verified against the running server.

Try a prompt such as: *"Find AI companies in Australia, pick the most relevant one, find its engineers, enrich the most
senior one and export them all to CSV."*

## Tools

| Tool | Purpose | Scope | Hints |
| --- | --- | --- | --- |
| `search_companies` | Free-text and filtered company search (`query`, `country`, `industry`, `minEmployees`, `maxEmployees`, `limit`) | `companies:read` | read-only, idempotent |
| `get_company` | Full company profile, including the number of contacts on file | `companies:read` | read-only, idempotent |
| `search_contacts` | People by `companyId`, `jobTitle`, `seniority`, `department`; most senior first | `contacts:read` | read-only, idempotent |
| `enrich_contact` | Email, LinkedIn and phone from the enrichment provider; stored for later calls | `contacts:enrich` | idempotent, open-world |
| `export_contacts` | CSV/JSON export, returns a signed `downloadUrl` that expires after 15 minutes | `contacts:export` | creates a file |

Outputs are a superset of the specification. For example, `search_companies` returns
`{ results: [{ id, name, industry, employees, country, city }], total }`. The full reference, with JSON Schemas and real
example calls, is in **[docs/TOOLS.md](docs/TOOLS.md)** (generated with `npm run docs:tools`, so it cannot drift from the
code).

Also exposed:
- **Resources**: `account-intel://companies/{companyId}`, one JSON profile per company (listable).
- **Prompt**: `build_prospect_list(role, segment, country?)`, which runs the whole workflow. It adapts to the key's
  scopes, so a read-only key produces a table instead of an export.
- **Server instructions**: a short workflow guide that clients pass to the model at initialization.

## Authentication

Every request to `POST /mcp` must carry an API key:

```http
Authorization: Bearer aip_...      (preferred)
X-API-Key: aip_...                 (alternative)
```

| Situation | Response |
| --- | --- |
| No key | `401` · `WWW-Authenticate: Bearer realm="account-intelligence-mcp"` · JSON-RPC error `-32001` |
| Unknown, malformed or revoked key | `401` · `WWW-Authenticate: Bearer …, error="invalid_token"` |
| Too many failed attempts from one IP (default 20 per 15 min) | `429` + `Retry-After`, even if the next key is valid |
| Valid key | The request proceeds with the key's scopes. `tools/list` shows only the tools those scopes allow. |

**stdio transport:** the key comes from `ACCOUNT_INTEL_API_KEY`. It is verified before the server starts, and the
process exits with an error if the key is missing, invalid or revoked.

**Scopes:** `companies:read`, `contacts:read`, `contacts:enrich`, `contacts:export`. Tools a key cannot use are not
registered for that request at all (least privilege at discovery). The tool wrapper checks the scope again before
executing, as defence in depth.

**Storage:** keys are 192-bit random secrets. Only their SHA-256 digest and a 12-character display prefix are stored;
the plaintext is shown once at creation. Keys record `last_used_at` and can be revoked.

**Export downloads** do not need an API key: the link itself is the credential. An HMAC signature over the path and
expiry is checked in constant time. A modified link returns `403` and an expired one returns `410`.

### Managing keys

```bash
npm run keys -- create --name "Cursor - Jane" --scopes companies:read,contacts:read
npm run keys -- list
npm run keys -- revoke key_1a2b3c4d5e6f
```

## Error handling

Errors use two channels, chosen by who can fix the problem:

1. **Transport and protocol errors** (HTTP status + JSON-RPC error) for problems the model cannot fix: `401` auth,
   `429` rate limit, `400` malformed JSON (`-32700`), `403` disallowed `Host` header, `405` on `GET`/`DELETE /mcp`.
2. **Tool errors** (`isError: true` in the tool result) for problems the model *can* fix. The model sees the message and
   can retry:

```json
{ "error": { "code": "NOT_FOUND", "message": "Company cmp_9999 was not found", "hint": "Use search_companies to look up valid company IDs." } }
```

| Code | Example |
| --- | --- |
| Schema validation (SDK) | `Input validation error: … must be a company ID such as "cmp_1" at companyId` |
| `INVALID_ARGUMENT` | Unknown country (the hint lists valid ones); `minEmployees` > `maxEmployees` |
| `NOT_FOUND` | Unknown company or contact. An export with any unknown ID is rejected as a whole and lists `missingIds`. |
| `FORBIDDEN` | Missing scope (defence in depth) |
| `INTERNAL` | Anything unexpected. The stack trace is logged; the client receives a generic message. |

Domain code throws typed `AppError`s ([`src/domain/errors.ts`](src/domain/errors.ts)). The MCP adapter
([`src/mcp/registerTool.ts`](src/mcp/registerTool.ts)) and the HTTP adapter ([`src/http/errors.ts`](src/http/errors.ts))
translate them for their channel.

## Rate limiting and logging

- **Per-key quota:** 120 requests per minute by default (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`). Responses carry
  `RateLimit` and `RateLimit-Policy` headers (IETF draft 8); once the quota is used up, the server returns `429` with
  `Retry-After` and a JSON-RPC error. Each key has its own budget, so one noisy client cannot exhaust another's.
- **Failed-auth throttle:** only *failures* count toward the per-IP limit, so a burst of legitimate traffic is never
  mistaken for brute force.
- **Logs** are JSON lines on stderr (pretty-printed in development). Each request logs `requestId` (from a well-formed
  incoming `X-Request-Id`, otherwise generated, and echoed back), method, path, status, duration, `apiKeyId`, JSON-RPC
  method and tool name. Each tool call logs its outcome, error code and duration. Authorization headers are redacted,
  and query strings are never logged because signed URLs carry their signature there.

```text
INFO: tool call succeeded  tool="enrich_contact"  apiKeyId="key_69c326aa7ef8"  rpcId=4  durationMs=152
WARN: tool call rejected   tool="get_company"  code="NOT_FOUND"  message="Company cmp_9999 was not found"
WARN: authentication failed  ip="127.0.0.1"  reason="unknown"
```

## Data layer and seed data

SQLite (WAL mode, foreign keys, versioned migrations through `PRAGMA user_version`) behind repository classes. They are
the only code that contains SQL. Tables: `companies` with an external-content **FTS5** index kept in sync by triggers,
`contacts` (with enrichment columns), `api_keys`, and `exports`.

`npm run db:seed` loads a deterministic dataset of **62 companies** across 9 countries and 18 industries, and **287
contacts** with realistic titles, seniority bands and departments. The same IDs are produced on every run, so `cmp_1`
and `cnt_3` in the docs and demo always refer to the same records. All companies and people are fictional, and every
domain uses the reserved `.example` TLD.

Enrichment goes through an `EnrichmentProvider` interface. The bundled `SimulatedEnrichmentProvider` is deterministic,
uses one email pattern per company, finds a LinkedIn profile for about 90% of contacts and a phone number for about two
thirds, and adds configurable latency. A real vendor can replace it without touching the services.

## Architecture

```text
Clients ─▶ Transport (stdio | Express: host check → logging → auth → rate limit → Streamable HTTP)
        ─▶ MCP layer (per-principal server, scope-filtered tools, schemas, error mapping)
        ─▶ Services (search, contacts + enrichment port, exports + URL signer, API keys)
        ─▶ Repositories ─▶ SQLite (FTS5)
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the component diagram, request and export sequence diagrams,
and design decisions: stateless HTTP, scope-filtered discovery, the two error channels, search ranking and the scaling
path.

```text
src/
  http.ts / stdio.ts          entrypoints, one per transport
  container.ts                composition root (dependency wiring)
  config.ts  logger.ts        Zod-validated env config · pino logger
  auth/                       scopes, ApiKeyService (hashing, verification, revocation)
  domain/                     types, AppError hierarchy, clock
  db/                         SQLite connection + migrations, deterministic seed
  repositories/               SQL for companies (FTS5), contacts, api keys, exports
  services/                   CompanyService, ContactService, ExportService, query parser,
                              enrichment provider port, URL signer
  mcp/                        server factory, registerTool wrapper, shared schemas, tools/*
  http/                       Express app, routes (/mcp, /exports), middleware, error mapping
  cli/                        seed, key management
scripts/                      demo client, tool-docs generator
test/                         vitest: services, MCP in-process, HTTP e2e, stdio process
examples/                     client configurations + curl walkthrough
docs/                         TOOLS.md (generated), ARCHITECTURE.md, diagram, demo screenshots
```

## Configuration

All settings come from environment variables (or `.env` in the project root) and are validated with Zod at startup. An
invalid configuration fails fast with a readable message.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` / `HOST` | `3100` / `127.0.0.1` | HTTP bind address |
| `PUBLIC_BASE_URL` | `http://localhost:$PORT` | Base URL used in export download links |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | Accepted `Host` headers (DNS-rebinding protection) |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-For` (behind a load balancer) |
| `DATABASE_PATH` | `./data/account-intel.db` | SQLite file, resolved from the project root |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | `120` / `60000` | Per-key request quota |
| `AUTH_FAILURE_LIMIT` | `20` | Failed auth attempts per IP per 15 minutes |
| `EXPORT_URL_TTL_SECONDS` | `900` | Download link lifetime |
| `EXPORT_SIGNING_SECRET` | dev value | HMAC secret; **required** (32+ characters) in production |
| `ENRICHMENT_LATENCY_MS` | `150` | Simulated provider latency |
| `LOG_LEVEL` / `LOG_PRETTY` | `info` / `true` in development | Logging |
| `ACCOUNT_INTEL_API_KEY` | none | API key for the stdio transport and the demo client |

## Testing

```bash
npm test            # 39 tests, about 3 seconds
npm run typecheck   # strict TypeScript, including tests and scripts
```

| Suite | Covers |
| --- | --- |
| `test/services.test.ts` | Query parsing, search relevance, country aliases, AND→OR fallback, FTS injection safety, enrichment caching, export validation, CSV escaping |
| `test/mcp.test.ts` | Real SDK client over an in-memory transport: discovery, schemas, annotations, `structuredContent`, the full workflow, validation and domain errors, resources, prompt, scope filtering |
| `test/http.test.ts` | Real HTTP server: 401 challenges, both header styles, revocation, signed downloads and tampering, Host validation, malformed JSON, per-key 429 with headers, failed-auth throttling |
| `test/stdio.test.ts` | Spawns the stdio entrypoint: exits without a valid key and never writes to stdout; serves scoped tools with one |
| `test/seed.test.ts` | Dataset size, determinism, invariants |

## Demo

- **Screenshots** of the custom MCP client (`npm run demo`) are in [`docs/demo/`](docs/demo):
  [authentication](docs/demo/01-authentication.png) · [tool discovery](docs/demo/02-tool-discovery.png) ·
  [tool execution](docs/demo/03-tool-execution.png) · [error handling](docs/demo/04-error-handling.png) ·
  [server logs](docs/demo/05-server-logs.png). The full transcript is in
  [`docs/demo/demo-output.txt`](docs/demo/demo-output.txt).
- **Video script:** [`docs/demo/VIDEO_SCRIPT.md`](docs/demo/VIDEO_SCRIPT.md), a 5-minute walkthrough that uses Claude
  Desktop and the demo client.
- `npm run demo -- --section errors` runs one section (`auth`, `discovery`, `execution`, `errors`). Use
  `--no-rate-limit` to skip the burst that exhausts the read-only key's quota for a minute.

## Trade-offs and next steps

- **API keys rather than OAuth 2.1.** Keys suit server-to-server and developer-tool clients and keep setup to one
  header. The auth middleware already produces the SDK's `AuthInfo`, so adding OAuth 2.1 + PKCE (the SDK's
  `mcpAuthRouter` and `requireBearerAuth`, with protected-resource metadata) would change one middleware. Scopes map
  one to one.
- **SQLite** keeps setup to `npm install`. The repositories are the only SQL, so moving to PostgreSQL (`tsvector` for
  search) is contained to that layer.
- **Single-instance state:** rate-limit counters, failed-auth counters and export files are local. For several replicas,
  plug in Redis (express-rate-limit store) and object storage with native presigned URLs. MCP itself is already
  stateless.
- **Enrichment credits:** a per-key credit ledger and a `dryRun`/cost preview are natural additions before connecting a
  paid vendor.
- **Pagination:** searches return `total`, so a `cursor` parameter would be an additive change.
