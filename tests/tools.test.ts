import { describe, expect, it } from 'vitest';
import { createTestHarness, parseToolResult } from '@chrischall/mcp-utils/test';
import { JobberClient } from '../src/client.js';
import { HubRegistry } from '../src/hubs.js';
import { registerRecordTools } from '../src/tools/records.js';
import { registerHealthcheckTools } from '../src/tools/healthcheck.js';
import type { JobberTransport } from '../src/transport.js';

const HUB = '00000000-1111-2222-3333-444444444444';

const INVOICES_PAGE = `<html><body>
<h3>Overdue</h3>
<a class="card-content--link" href="/client_hubs/UUID/invoices/150208512">
  <div class="card-header"><h4 class="card-headerTitle">For Services Rendered</h4>
  <div class="card-headerActions">#15313</div></div>
  <div class="row"><div class="columns">Sent Mar 23, 2026 | Due Apr 07, 2026</div></div>
</a></body></html>`;

function harnessFor(
  page: { status: number; body: string },
  env: Record<string, string> = { JOBBER_HUB_ID: HUB },
) {
  const transport: JobberTransport = {
    get: async () => page,
    status: async () => ({ role: 'host', port: 37149 }),
  };
  const client = new JobberClient({
    transport,
    hubs: new HubRegistry(env as NodeJS.ProcessEnv),
  });
  return createTestHarness((server) => {
    registerRecordTools(server, client);
    registerHealthcheckTools(server, client);
  });
}

describe('tool roster', () => {
  it('advertises the read-only surface', async () => {
    const h = await harnessFor({ status: 200, body: INVOICES_PAGE });
    const names = (await h.listTools()).map((t) => t.name).sort();
    expect(names).toEqual([
      'jobber_healthcheck',
      'jobber_list_appointments',
      'jobber_list_hubs',
      'jobber_list_invoices',
      'jobber_list_quotes',
      'jobber_list_work_requests',
      'jobber_read_page',
    ]);
    await h.close();
  });

  it('exposes no write tools — the hub cannot be mutated through this server', async () => {
    const h = await harnessFor({ status: 200, body: INVOICES_PAGE });
    const names = (await h.listTools()).map((t) => t.name);
    expect(names.filter((n) => /create|update|delete|pay|approve|submit|cancel/i.test(n))).toEqual(
      [],
    );
    await h.close();
  });
});

describe('jobber_list_invoices', () => {
  it('returns parsed invoices with their section', async () => {
    const h = await harnessFor({ status: 200, body: INVOICES_PAGE });
    const out = parseToolResult<{ count: number; invoices: { number: string }[] }>(
      await h.callTool('jobber_list_invoices'),
    );
    expect(out.count).toBe(1);
    expect(out.invoices[0]).toMatchObject({ number: '#15313', section: 'Overdue' });
    await h.close();
  });

  it('flags an empty result rather than letting it read as "none"', async () => {
    const h = await harnessFor({ status: 200, body: '<html><body>client_hubs</body></html>' });
    const out = parseToolResult<{ count: number; note?: string }>(
      await h.callTool('jobber_list_invoices'),
    );
    expect(out.count).toBe(0);
    expect(out.note).toMatch(/layout changed|revoked/i);
    await h.close();
  });
});

describe('jobber_list_hubs', () => {
  it('lists labels and never the hub id', async () => {
    const h = await harnessFor({ status: 200, body: INVOICES_PAGE });
    const raw = JSON.stringify(await h.callTool('jobber_list_hubs'));
    expect(raw).toContain('default');
    expect(raw).not.toContain(HUB);
    await h.close();
  });
});

describe('jobber_read_page', () => {
  it('rejects an absolute URL so the tool cannot be pointed off-hub', async () => {
    const h = await harnessFor({ status: 200, body: INVOICES_PAGE });
    const res = await h.callTool('jobber_read_page', { path: 'https://evil.example/x' });
    expect(res.isError).toBe(true);
    await h.close();
  });

  it('rejects path traversal', async () => {
    const h = await harnessFor({ status: 200, body: INVOICES_PAGE });
    const res = await h.callTool('jobber_read_page', { path: '../../etc/passwd' });
    expect(res.isError).toBe(true);
    await h.close();
  });

  // The tool is annotated readOnlyHint/idempotentHint, so a host may run it
  // without asking. `logout` is a plain GET that ends the hub session, and
  // `work_requests/new` is a write form — neither is a read, so neither may
  // be reachable, whatever a prompt-injected page asks for.
  it.each([
    'logout',
    '/logout',
    'logout?x=1',
    'sign_out',
    'work_requests/new',
    'invoices/new',
    'invoices/150208512/pay',
    'quotes/42/approve',
    'wallet',
    'contact_us',
    'invoices/abc',
  ])('refuses the non-read route %s without fetching it', async (path) => {
    const fetched: string[] = [];
    const transport: JobberTransport = {
      get: async (url) => {
        fetched.push(url);
        return { status: 200, body: INVOICES_PAGE };
      },
      status: async () => ({}),
    };
    const client = new JobberClient({
      transport,
      hubs: new HubRegistry({ JOBBER_HUB_ID: HUB } as NodeJS.ProcessEnv),
    });
    const h = await createTestHarness((server) => registerRecordTools(server, client));
    const res = await h.callTool('jobber_read_page', { path });
    expect(res.isError).toBe(true);
    expect(fetched).toEqual([]);
    await h.close();
  });

  it.each([
    'appointments',
    'appointments/2236612358',
    'invoices',
    'invoices/150208512',
    '/invoices/150208512',
    'quotes',
    'quotes/42',
    'work_requests',
    'work_requests/7',
    'invoices?page=2',
  ])('reads the read-family route %s', async (path) => {
    const h = await harnessFor({ status: 200, body: INVOICES_PAGE });
    const res = await h.callTool('jobber_read_page', { path });
    expect(res.isError).toBeFalsy();
    await h.close();
  });
});

describe('the hub id never reaches a tool result', () => {
  // The hub UUID is a bearer credential: anyone holding the hub URL can read
  // the provider's hub, invoices and payment-methods page. Live pages embed it
  // in every link, so every tool that returns page-derived data must strip it.
  const upper = HUB.toUpperCase();
  const APPTS = `<html><body><p>Your hub: /client_hubs/${upper}/ (bookmark it)</p>
<div data-props="{&quot;title&quot;:&quot;Upcoming&quot;,&quot;appointments&quot;:[{&quot;date&quot;:&quot;Jun 28, 2026&quot;,&quot;url&quot;:&quot;https://clienthub.getjobber.com/client_hubs/${HUB}/appointments/2236612358&quot;}]}"></div>
<h3>Overdue</h3>
<a class="card-content--link" href="/client_hubs/${HUB}/invoices/150208512">
  <div class="card-header"><h4 class="card-headerTitle">Hub ${HUB}</h4></div>
  <div class="row"><div class="columns">Link /client_hubs/${HUB}/wallet</div></div>
</a></body></html>`;

  it.each([
    ['jobber_list_appointments', {}],
    ['jobber_list_invoices', {}],
    ['jobber_list_quotes', {}],
    ['jobber_list_work_requests', {}],
    ['jobber_read_page', { path: 'invoices/150208512' }],
    ['jobber_healthcheck', {}],
  ] as const)('%s', async (tool, args) => {
    const h = await harnessFor({ status: 200, body: APPTS });
    const raw = JSON.stringify(await h.callTool(tool, args));
    expect(raw.toLowerCase()).not.toContain(HUB.toLowerCase());
    await h.close();
  });

  it('returns hub-relative record urls that jobber_read_page accepts', async () => {
    const h = await harnessFor({ status: 200, body: APPTS });
    const out = parseToolResult<{ appointments: { url: string }[] }>(
      await h.callTool('jobber_list_appointments'),
    );
    expect(out.appointments[0]?.url).toBe('appointments/2236612358');
    const read = await h.callTool('jobber_read_page', { path: out.appointments[0]?.url });
    expect(read.isError).toBeFalsy();
    await h.close();
  });

  it('is scrubbed from the body excerpt of an unexpected-status error', async () => {
    const h = await harnessFor({ status: 500, body: `oops /client_hubs/${HUB}/invoices` });
    const res = await h.callTool('jobber_list_invoices');
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res)).not.toContain(HUB);
    await h.close();
  });
});

describe('jobber_healthcheck', () => {
  it('names the config layer when no hub is set', async () => {
    const h = await harnessFor({ status: 200, body: INVOICES_PAGE }, {});
    const out = parseToolResult<{ ok: boolean; layer: string }>(
      await h.callTool('jobber_healthcheck'),
    );
    expect(out.ok).toBe(false);
    expect(out.layer).toBe('config');
    await h.close();
  });

  it('reports ok when bridge and hub both answer', async () => {
    const h = await harnessFor({
      status: 200,
      body:
        '<html><body><div data-props="{&quot;title&quot;:&quot;Upcoming&quot;,&quot;appointments&quot;:' +
        '[{&quot;date&quot;:&quot;Jun 28, 2026&quot;,&quot;url&quot;:&quot;/a/1&quot;}]}"></div></body></html>',
    });
    const out = parseToolResult<{ ok: boolean; layer: string; appointments_found: number }>(
      await h.callTool('jobber_healthcheck'),
    );
    expect(out).toMatchObject({ ok: true, layer: 'hub', appointments_found: 1 });
    await h.close();
  });

  it('blames the hub layer, not the bridge, when the page is challenged', async () => {
    const h = await harnessFor({
      status: 403,
      body: '<html><head><title>Just a moment...</title></head></html>',
    });
    const out = parseToolResult<{ ok: boolean; layer: string; hint: string }>(
      await h.callTool('jobber_healthcheck'),
    );
    expect(out.ok).toBe(false);
    expect(out.layer).toBe('hub');
    expect(out.hint).toMatch(/Site access|real tab/i);
    await h.close();
  });
});
