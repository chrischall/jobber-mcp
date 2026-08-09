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
