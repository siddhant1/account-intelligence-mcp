# Demo video script (5 minutes)

A shot list for recording the walkthrough. Each beat maps to one evaluation area: tool discovery, tool execution,
authentication flow and error handling.

## Before recording

```bash
npm install && cp .env.example .env
npm run build && npm run db:seed     # reseeding resets enrichment, so the first enrich shows cached=false
npm run dev                          # terminal 1: keep visible, the logs are part of the story
```

- Claude Desktop: install `examples/claude_desktop_config.json` (stdio, absolute paths) or the `mcp-remote` variant, with
  `DEV_API_KEY` from `.env`. Restart Claude Desktop and confirm "account-intelligence" appears under connectors.
- Terminal 2: project root, font size large enough to read in the recording.
- Optional: `npm run inspector` in a browser tab, already connected with the `Authorization` header.

## Shot list

| Time         | Beat                                 | On screen                                    | Say                                                                                                                                                                                                                                                                                                                                                  |
| ------------ | ------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 to 0:30 | Intro and architecture               | The `src/` folders in the editor             | "An MCP server for account intelligence. Each folder is a layer: requests come in through `src/http` or `src/stdio.ts`, tools live in `src/mcp`, rules in `src/services`, and only `src/repositories` talks to the database."                                                                                                                        |
| 0:30 to 1:15 | **Authentication flow**              | Terminal 2: `npm run demo -- --section auth` | Point out the 401 with the `WWW-Authenticate` challenge, the SDK client failing with an invalid key, then succeeding with a valid one. Show the `authentication failed` warnings in terminal 1.                                                                                                                                                      |
| 1:15 to 1:45 | **Tool discovery**                   | `npm run demo -- --section discovery`        | "Five tools with input and output schemas and annotations. The read-only key only sees three: discovery is filtered by scope."                                                                                                                                                                                                                       |
| 1:45 to 3:15 | **Tool execution in Claude Desktop** | Claude Desktop, new chat                     | Prompt: _"Find AI companies in Australia. Pick the best match, find its engineers, enrich the most senior one and export all of them to CSV."_ Expand each tool call to show the arguments and structured results. Open the `downloadUrl` in a browser to download the CSV. Cut to terminal 1 to show the tool logs with durations.                  |
| 3:15 to 4:30 | **Error handling**                   | `npm run demo -- --section errors`           | Walk through the output: schema validation, `NOT_FOUND` with a hint, unknown country with valid options, atomic export rejection with `missingIds`, the scope-hidden tool, a tampered link (403), malformed JSON (-32700), and finally the 429 with `Retry-After`. Optionally ask Claude for "company cmp_9999" and show it recovering by searching. |
| 4:30 to 5:00 | Quality and wrap-up                  | `npm test`, then the README                  | "86 tests across services, the protocol, HTTP, stdio, the CLI and hostile input; lint, format and CI; generated tool docs. Next steps: OAuth 2.1, Postgres, Redis-backed limits."                                                                                                                                                                    |

## Tips

- If you record more than once within a minute, the read-only key may still be rate-limited from the previous run.
  Restart `npm run dev` (limits are in memory) or wait 60 seconds.
- Reseed (`npm run db:seed`) between takes so that enrichment shows a fresh provider call before the cached one.
- To make the recording shorter, use `--no-rate-limit` and demonstrate the 429 separately with a lower limit:
  `RATE_LIMIT_MAX=5 npm run dev`.
