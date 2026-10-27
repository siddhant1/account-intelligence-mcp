/**
 * Custom MCP client demonstrating the server end to end:
 *   1. Authentication flow   2. Tool discovery   3. Tool execution   4. Error handling
 *
 * Usage: npm run demo [-- --section auth|discovery|execution|errors] [-- --no-rate-limit]
 * Requires a running server (npm run dev) and the dev keys from .env (npm run db:seed).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import pc from 'picocolors';

const root = path.resolve(import.meta.dirname, '..');
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

const { values: args } = parseArgs({
  options: { section: { type: 'string' }, 'no-rate-limit': { type: 'boolean', default: false } },
});

const MCP_URL = process.env.MCP_URL ?? `http://localhost:${process.env.PORT ?? 3100}/mcp`;
const FULL_KEY = process.env.DEV_API_KEY ?? process.env.ACCOUNT_INTEL_API_KEY;
const READONLY_KEY = process.env.DEV_READONLY_API_KEY;
if (!FULL_KEY || !READONLY_KEY) {
  console.error('Set DEV_API_KEY and DEV_READONLY_API_KEY (see .env.example), then run `npm run db:seed`.');
  process.exit(1);
}

// ---------------------------------------------------------------------------- output helpers

const mask = (key: string) => `${key.slice(0, 12)}…`;
const section = (title: string) => console.log(`\n${pc.bold(pc.magenta(`━━━ ${title} `.padEnd(78, '━')))}\n`);
const step = (title: string) => console.log(`${pc.bold(pc.cyan('▶'))} ${pc.bold(title)}`);
const note = (text: string) => console.log(pc.dim(`  ${text}`));
const ok = (text: string) => console.log(`  ${pc.green('✔')} ${text}`);
const rejected = (text: string) => console.log(`  ${pc.red('✖')} ${text}`);
const call = (tool: string, input: unknown) =>
  console.log(`  ${pc.yellow('→')} ${pc.yellow(tool)} ${pc.dim(JSON.stringify(input))}`);
const json = (value: unknown, maxLines = 24) => {
  const lines = JSON.stringify(value, null, 2).split('\n');
  const shown =
    lines.length > maxLines ? [...lines.slice(0, maxLines), `… (${lines.length - maxLines} more lines)`] : lines;
  console.log(shown.map((line) => `    ${pc.gray(line)}`).join('\n'));
};

function table(rows: Record<string, unknown>[], columns: string[]) {
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column] ?? '').length)),
  );
  const line = (cells: string[]) => `    ${cells.map((cell, index) => cell.padEnd(widths[index]!)).join('  ')}`;
  console.log(pc.bold(line(columns)));
  for (const row of rows) console.log(line(columns.map((column) => String(row[column] ?? ''))));
}

// ---------------------------------------------------------------------------- MCP helpers

async function connect(headers: Record<string, string>) {
  const client = new Client({ name: 'account-intel-demo-client', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { requestInit: { headers } }));
  return client;
}

async function invoke(client: Client, name: string, input: Record<string, unknown>) {
  call(name, input);
  return (await client.callTool({ name, arguments: input })) as CallToolResult;
}

function showToolError(result: CallToolResult) {
  const text = (result.content[0] as { text: string }).text;
  if (!result.isError) throw new Error('expected a tool error');
  rejected(`isError: true`);
  try {
    json(JSON.parse(text));
  } catch {
    console.log(`    ${pc.gray(text)}`);
  }
}

async function rawPost(headers: Record<string, string>, body: unknown) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(body),
  });
  return { res, body: await res.text() };
}

// ---------------------------------------------------------------------------- sections

async function authentication() {
  section('1. Authentication flow');

  step('Request with no API key');
  const anonymous = await rawPost({}, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  rejected(`HTTP ${anonymous.res.status} · WWW-Authenticate: ${anonymous.res.headers.get('www-authenticate')}`);
  json(JSON.parse(anonymous.body));

  step('MCP SDK client with an invalid key');
  try {
    await connect({ Authorization: 'Bearer aip_this_key_was_never_issued_0000' });
  } catch (error) {
    if (!(error instanceof StreamableHTTPError)) throw error;
    rejected(`connect() failed: StreamableHTTPError code=${error.code}`);
    note(error.message);
  }

  step(`MCP SDK client with a valid key (Authorization: Bearer ${mask(FULL_KEY!)})`);
  const client = await connect({ Authorization: `Bearer ${FULL_KEY}` });
  const server = client.getServerVersion();
  ok(`initialized: ${server?.title ?? server?.name} v${server?.version}`);
  note(`server instructions: "${client.getInstructions()?.split('\n')[0]}"`);
  await client.close();

  step(`X-API-Key header works too (${mask(READONLY_KEY!)})`);
  const readOnly = await connect({ 'X-API-Key': READONLY_KEY! });
  ok('initialized with the read-only key');
  await readOnly.close();
}

async function discovery() {
  section('2. Tool discovery');

  step('tools/list with the full-access key');
  const client = await connect({ Authorization: `Bearer ${FULL_KEY}` });
  const { tools } = await client.listTools();
  table(
    tools.map((tool) => ({
      tool: tool.name,
      required: (tool.inputSchema.required ?? []).join(', ') || '-',
      optional:
        Object.keys(tool.inputSchema.properties ?? {})
          .filter((key) => !(tool.inputSchema.required ?? []).includes(key))
          .join(', ') || '-',
      hints: [
        tool.annotations?.readOnlyHint ? 'read-only' : 'writes',
        tool.annotations?.openWorldHint ? 'external' : '',
      ]
        .filter(Boolean)
        .join(', '),
    })),
    ['tool', 'required', 'optional', 'hints'],
  );

  step('Input and output schema of search_companies (JSON Schema generated from Zod)');
  const search = tools.find((tool) => tool.name === 'search_companies')!;
  note(search.description ?? '');
  type Property = {
    type?: string;
    description?: string;
    minimum?: number;
    maximum?: number;
    maxLength?: number;
    default?: unknown;
  };
  const properties = Object.entries((search.inputSchema.properties ?? {}) as Record<string, Property>);
  table(
    properties.map(([name, schema]) => ({
      field: name,
      type: schema.type,
      constraints: [
        schema.maxLength !== undefined && `≤${schema.maxLength} chars`,
        schema.minimum !== undefined && `min ${schema.minimum}`,
        schema.maximum !== undefined && schema.maximum < Number.MAX_SAFE_INTEGER && `max ${schema.maximum}`,
        schema.default !== undefined && `default ${JSON.stringify(schema.default)}`,
      ]
        .filter(Boolean)
        .join(', '),
      description: (schema.description ?? '').slice(0, 60),
    })),
    ['field', 'type', 'constraints', 'description'],
  );
  note(`outputSchema: { ${Object.keys(search.outputSchema?.properties ?? {}).join(', ')} }`);

  step('Resources and prompts');
  const { resources } = await client.listResources();
  const { prompts } = await client.listPrompts();
  ok(`${resources.length} company resources, e.g. ${resources[0]?.uri} (${resources[0]?.name})`);
  ok(`prompts: ${prompts.map((prompt) => prompt.name).join(', ')}`);
  await client.close();

  step('tools/list with the read-only key (scopes: companies:read contacts:read)');
  const readOnly = await connect({ 'X-API-Key': READONLY_KEY! });
  const scoped = await readOnly.listTools();
  ok(`${scoped.tools.length} tools: ${scoped.tools.map((tool) => tool.name).join(', ')}`);
  note('enrich_contact and export_contacts are hidden: tools are filtered by API key scope');
  await readOnly.close();
}

async function execution() {
  section('3. Tool execution');
  const client = await connect({ Authorization: `Bearer ${FULL_KEY}` });

  step('Search companies');
  const search = await invoke(client, 'search_companies', { query: 'AI companies', country: 'Australia', limit: 5 });
  const { results, total } = search.structuredContent as { results: Record<string, unknown>[]; total: number };
  table(results, ['id', 'name', 'industry', 'employees', 'city']);
  note(`${results.length} of ${total} matches`);

  step('Filters: industry shorthand ("AI" = Artificial Intelligence) and headcount range');
  const filtered = await invoke(client, 'search_companies', { industry: 'AI', minEmployees: 100, maxEmployees: 300 });
  table((filtered.structuredContent as { results: Record<string, unknown>[] }).results, [
    'id',
    'name',
    'industry',
    'employees',
    'country',
  ]);

  step('Get company details');
  const companyId = 'cmp_1';
  const company = await invoke(client, 'get_company', { companyId });
  json(company.structuredContent);

  step('Search contacts');
  const contacts = await invoke(client, 'search_contacts', { companyId, jobTitle: 'Engineer' });
  const found = (contacts.structuredContent as { contacts: Record<string, unknown>[] }).contacts;
  table(found, ['id', 'name', 'title', 'seniority', 'enriched']);

  step('Title abbreviations work both ways ("CTO" finds "Chief Technology Officer")');
  const ctos = await invoke(client, 'search_contacts', { companyId: 'cmp_2', jobTitle: 'CTO' });
  table((ctos.structuredContent as { contacts: Record<string, unknown>[] }).contacts, [
    'id',
    'name',
    'title',
    'companyName',
  ]);

  step('Enrich contact');
  const contactId = String(found[0]!.id);
  const enriched = await invoke(client, 'enrich_contact', { contactId });
  json(enriched.structuredContent);
  const again = await invoke(client, 'enrich_contact', { contactId });
  ok(`second call served from storage: cached=${(again.structuredContent as { cached: boolean }).cached}`);

  step('Export contacts');
  const contactIds = found.map((contact) => String(contact.id));
  const exported = await invoke(client, 'export_contacts', { contactIds });
  json(exported.structuredContent);

  step('Download the export via its signed URL (no API key needed)');
  const { downloadUrl } = exported.structuredContent as { downloadUrl: string };
  const download = await fetch(downloadUrl);
  ok(
    `HTTP ${download.status} · ${download.headers.get('content-type')} · ${download.headers.get('content-disposition')}`,
  );
  const lines = (await download.text()).trim().split('\r\n');
  for (const line of lines.slice(0, 4))
    console.log(`    ${pc.gray(line.length > 110 ? `${line.slice(0, 110)}…` : line)}`);
  await client.close();
}

async function errors() {
  section('4. Error handling');
  const client = await connect({ Authorization: `Bearer ${FULL_KEY}` });

  step('Schema validation: malformed ID');
  showToolError(await invoke(client, 'get_company', { companyId: 'acme-corp' }));

  step('Schema validation: out-of-range limit');
  showToolError(await invoke(client, 'search_companies', { query: 'fintech', limit: 500 }));

  step('Not found, with a recovery hint for the model');
  showToolError(await invoke(client, 'get_company', { companyId: 'cmp_9999' }));

  step('Business validation: unknown country');
  showToolError(await invoke(client, 'search_companies', { query: 'fintech', country: 'Atlantis' }));

  step('Partial failure is rejected atomically: export with unknown IDs');
  showToolError(await invoke(client, 'export_contacts', { contactIds: ['cnt_1', 'cnt_424242'] }));
  await client.close();

  step('Scope enforcement: read-only key calls enrich_contact');
  const readOnly = await connect({ 'X-API-Key': READONLY_KEY! });
  showToolError(await invoke(readOnly, 'enrich_contact', { contactId: 'cnt_1' }));
  await readOnly.close();

  step('Browser request from an unknown Origin (MCP spec: servers must validate Origin)');
  const crossSite = await rawPost(
    { 'X-API-Key': FULL_KEY!, Origin: 'https://evil.example' },
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'ping',
    },
  );
  rejected(`HTTP ${crossSite.res.status}`);
  json(JSON.parse(crossSite.body));

  step('Tampered download link');
  const tampered = await fetch(`${MCP_URL.replace(/\/mcp$/, '')}/exports/exp_fake?expires=9999999999&signature=forged`);
  rejected(`HTTP ${tampered.status}`);
  json(await tampered.json());

  step('Malformed JSON-RPC body');
  const malformed = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'X-API-Key': FULL_KEY!,
    },
    body: '{"jsonrpc": "2.0", "method": ',
  });
  rejected(`HTTP ${malformed.status}`);
  json(await malformed.json());

  if (args['no-rate-limit']) return;
  step('Rate limiting: burst of pings with the read-only key');
  let attempts = 0;
  for (;;) {
    const batch = await Promise.all(
      Array.from({ length: 25 }, () =>
        rawPost({ 'X-API-Key': READONLY_KEY! }, { jsonrpc: '2.0', id: 1, method: 'ping' }),
      ),
    );
    attempts += batch.length;
    const limited = batch.find(({ res }) => res.status === 429);
    if (limited) {
      const accepted = batch.filter(({ res }) => res.status === 200).length + attempts - batch.length;
      ok(`${accepted} more requests accepted before the quota ran out (earlier demo calls count too), then:`);
      rejected(
        `HTTP 429 · Retry-After: ${limited.res.headers.get('retry-after')}s · RateLimit-Policy: ${limited.res.headers.get('ratelimit-policy')}`,
      );
      json(JSON.parse(limited.body));
      note('the read-only key is throttled until the window resets; other keys are unaffected');
      return;
    }
    if (attempts > 2000) throw new Error('rate limit never triggered');
  }
}

// ---------------------------------------------------------------------------- main

const SECTIONS = { auth: authentication, discovery, execution, errors } as const;
const selected = args.section ? [SECTIONS[args.section as keyof typeof SECTIONS]] : Object.values(SECTIONS);
if (selected.includes(undefined as never)) {
  console.error(`Unknown section "${args.section}". Use one of: ${Object.keys(SECTIONS).join(', ')}`);
  process.exit(1);
}

console.log(pc.bold(`Account Intelligence MCP demo client → ${MCP_URL}`));
try {
  for (const run of selected) await run();
  console.log(`\n${pc.green(pc.bold('Demo complete.'))}`);
} catch (error) {
  if (error instanceof TypeError && String(error.cause).includes('ECONNREFUSED')) {
    console.error(pc.red(`\nCannot reach ${MCP_URL}. Start the server first: npm run dev`));
  } else {
    console.error(error);
  }
  process.exit(1);
}
