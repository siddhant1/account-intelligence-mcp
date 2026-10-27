import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { connectInMemory, createTestContainer, toolError } from './helpers.js';

const context = createTestContainer();

describe('MCP server (full-access key)', () => {
  let client: Client;
  let close: () => Promise<unknown>;

  beforeAll(async () => {
    ({ client, close } = await connectInMemory(context, context.principals.full));
  });
  afterAll(() => close());

  it('advertises server info and usage instructions', () => {
    expect(client.getServerVersion()).toMatchObject({ name: 'account-intelligence', version: '1.0.0' });
    expect(client.getInstructions()).toContain('search_companies');
  });

  it('lists all five tools with input and output schemas and annotations', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      'search_companies',
      'get_company',
      'search_contacts',
      'enrich_contact',
      'export_contacts',
    ]);
    for (const tool of tools) {
      expect(tool.description?.length).toBeGreaterThan(40);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.outputSchema?.type).toBe('object');
      expect(tool.annotations).toBeDefined();
    }
    const getCompany = tools.find((tool) => tool.name === 'get_company')!;
    expect(getCompany.inputSchema.required).toEqual(['companyId']);
    expect(tools.find((tool) => tool.name === 'search_companies')!.annotations?.readOnlyHint).toBe(true);
  });

  it('search_companies returns structured results matching the spec', async () => {
    const result = await client.callTool({
      name: 'search_companies',
      arguments: { query: 'AI companies', country: 'Australia', limit: 3 },
    });
    expect(result.isError).toBeFalsy();
    const content = result.structuredContent as { results: Record<string, unknown>[]; total: number };
    expect(content.results).toHaveLength(3);
    expect(Object.keys(content.results[0]!)).toEqual(expect.arrayContaining(['id', 'name', 'industry', 'employees']));
    // Text content mirrors the structured content for clients without structured output support.
    const [text] = result.content as { type: string; text: string }[];
    expect(JSON.parse(text!.text)).toEqual(content);
  });

  it('runs the full prospecting workflow end to end', async () => {
    const company = await client.callTool({ name: 'get_company', arguments: { companyId: 'cmp_1' } });
    expect(company.structuredContent).toMatchObject({ id: 'cmp_1', website: 'https://www.signalgrid.example' });

    const search = await client.callTool({
      name: 'search_contacts',
      arguments: { companyId: 'cmp_1', jobTitle: 'Engineer' },
    });
    const { contacts } = search.structuredContent as { contacts: { id: string; title: string; enriched: boolean }[] };
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts.every((contact) => contact.title.includes('Engineer'))).toBe(true);

    const enriched = await client.callTool({ name: 'enrich_contact', arguments: { contactId: contacts[0]!.id } });
    expect(enriched.structuredContent).toMatchObject({
      contactId: contacts[0]!.id,
      email: expect.stringContaining('@'),
    });

    const exported = await client.callTool({
      name: 'export_contacts',
      arguments: { contactIds: contacts.map((contact) => contact.id) },
    });
    expect(exported.structuredContent).toMatchObject({
      format: 'csv',
      contactCount: contacts.length,
      downloadUrl: expect.stringMatching(/^http:\/\/localhost:3100\/exports\/exp_.+signature=/),
    });
  });

  it('reports input validation failures as tool errors the model can read', async () => {
    const result = await client.callTool({ name: 'get_company', arguments: { companyId: 'acme' } });
    const error = toolError(result);
    expect(error.isError).toBe(true);
    expect(error.text).toContain('must be a company ID such as "cmp_1"');

    const tooMany = await client.callTool({ name: 'search_companies', arguments: { limit: 500 } });
    expect(toolError(tooMany).isError).toBe(true);
  });

  it('reports domain errors with a code and recovery hint', async () => {
    const result = await client.callTool({ name: 'get_company', arguments: { companyId: 'cmp_9999' } });
    expect(toolError(result).json?.error).toMatchObject({
      code: 'NOT_FOUND',
      hint: expect.stringContaining('search_companies'),
    });

    const country = await client.callTool({ name: 'search_companies', arguments: { country: 'Atlantis' } });
    expect(toolError(country).json?.error?.code).toBe('INVALID_ARGUMENT');
  });

  it('exposes company profiles as resources and a prospecting prompt', async () => {
    const { resources } = await client.listResources();
    expect(resources.length).toBe(62);
    const resource = await client.readResource({ uri: 'account-intel://companies/cmp_1' });
    expect(JSON.parse((resource.contents[0] as { text: string }).text)).toMatchObject({ name: 'Signalgrid' });

    const prompt = await client.getPrompt({
      name: 'build_prospect_list',
      arguments: { role: 'CTO', segment: 'AI companies' },
    });
    expect(JSON.stringify(prompt.messages)).toContain('enrich_contact');
  });
});

describe('MCP server (read-only key)', () => {
  it('only advertises tools the key is scoped for', async () => {
    const { client, close } = await connectInMemory(context, context.principals.readOnly);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['search_companies', 'get_company', 'search_contacts']);

    const result = await client.callTool({ name: 'enrich_contact', arguments: { contactId: 'cnt_1' } });
    expect(toolError(result)).toMatchObject({ isError: true, text: expect.stringContaining('not found') });
    await close();
  });
});
