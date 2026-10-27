# Real LLM session

To check the server with a real model, not just scripted clients, Claude (Sonnet) was given the MCP server through
Claude Code in headless mode and asked to complete a multi-step prospecting task. No hints about tool names or IDs were
given; the model relied on tool discovery, the tool descriptions and the server instructions alone.

```bash
claude -p "<prompt below>" --model sonnet --strict-mcp-config --mcp-config mcp-config.json \
  --allowedTools mcp__account-intelligence --output-format stream-json --verbose
```

`mcp-config.json` points at `http://localhost:3100/mcp` with an `Authorization: Bearer <DEV_API_KEY>` header.

**Prompt:** _Using only the account-intelligence tools: 1) Find AI companies in Australia and pick the most relevant one. 2) Find its engineers and enrich the most senior one. 3) Export all of its engineers to CSV and give me the download
link. 4) Separately, who is the CTO of Kookaburra AI? 5) Which AI companies have between 100 and 300 employees? Be
concise._

## Tool calls the model made

| #   | Tool               | Arguments                                                                   | Result                                                                                                                                                                                                            |
| --- | ------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `search_companies` | `{"query": "AI companies", "country": "Australia", "industry": "AI"}`       | 4 matches: Kookaburra AI (Artificial Intelligence, 85), Southern Cross Analytics (Artificial Intelligence, 210), Lyrebird Voice (Artificial Intelligence, 48), Coral Vision (Artificial Intelligence, 34)         |
| 2   | `search_companies` | `{"query": "Kookaburra AI"}`                                                | 1 matches: Kookaburra AI (Artificial Intelligence, 85)                                                                                                                                                            |
| 3   | `search_companies` | `{"industry": "AI", "minEmployees": 100, "maxEmployees": 300, "limit": 50}` | 4 matches: Maple Neural (Artificial Intelligence, 230), Southern Cross Analytics (Artificial Intelligence, 210), Thamesbridge Analytics (Artificial Intelligence, 190), Straits AI (Artificial Intelligence, 140) |
| 4   | `search_contacts`  | `{"companyId": "cmp_2", "jobTitle": "Engineer", "limit": 100}`              | 1 contact: Ananya Lopez (Machine Learning Engineer)                                                                                                                                                               |
| 5   | `search_contacts`  | `{"companyId": "cmp_2", "jobTitle": "CTO"}`                                 | 1 contact: Freya Chen (Chief Technology Officer)                                                                                                                                                                  |
| 6   | `search_contacts`  | `{"companyId": "cmp_2", "department": "engineering", "limit": 100}`         | 1 contact: Ananya Lopez (Machine Learning Engineer)                                                                                                                                                               |
| 7   | `enrich_contact`   | `{"contactId": "cnt_11"}`                                                   | email ananyal@kookaburraai.example, LinkedIn https://www.linkedin.com/in/ananya-lopez-a740a5, cached=false                                                                                                        |
| 8   | `export_contacts`  | `{"contactIds": ["cnt_11"]}`                                                | 1 contact(s), signed link expiring 2026-10-26T15:05:36.608Z                                                                                                                                                       |

## Final answer (10 turns)

I've finished all five steps. Here are the results.

1. **Australian AI companies:** Kookaburra AI (Brisbane, 85 staff), Southern Cross Analytics (Melbourne, 210), Lyrebird Voice (Melbourne, 48) and Coral Vision (Cairns, 34). I picked **Kookaburra AI** (cmp_2) because it was the top result and is the company you asked about in question 4.

2. **Engineers and enrichment:** Kookaburra AI has one engineer on file, so she is also the most senior. She is **Ananya Lopez**, a Senior Machine Learning Engineer, working remotely from Australia. I enriched her record, which used one enrichment credit.
   - Email: ananyal@kookaburraai.example
   - LinkedIn: https://www.linkedin.com/in/ananya-lopez-a740a5
   - Phone: +61 277491657

3. **CSV export:** The file has 1 contact, Ananya Lopez, because she is the only engineer on file. It expires at 15:05 UTC today (2026-10-26), so download it soon. [Download the CSV](http://localhost:3100/exports/exp_0uiCmwm6obPmLV5y?expires=1793027136&signature=…)

4. **CTO of Kookaburra AI:** **Freya Chen**, Chief Technology Officer, based in Brisbane. I didn't enrich her.

5. **AI companies with 100–300 employees:**
   - Maple Neural, Toronto, Canada (230)
   - Southern Cross Analytics, Melbourne, Australia (210)
   - Thamesbridge Analytics, London, UK (190)
   - Straits AI, Singapore (140)

## What this shows

- **Discovery is enough.** The model found all five tools and used valid IDs from earlier results, with no
  hand-holding.
- **Filters are usable by a model as-is.** It used `industry: "AI"` (an alias for _Artificial Intelligence_) and
  `jobTitle: "CTO"` (which matches _Chief Technology Officer_) directly. On an earlier build, before those fixes, the same
  prompt made the model work around both: it fell back to `department: "executive"` and had to filter non-AI companies
  out of the results by hand.
- **Parallel calls work.** The model issued independent calls concurrently; the stateless HTTP transport serves each
  one with its own server instance.
