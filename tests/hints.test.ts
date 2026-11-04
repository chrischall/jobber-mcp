import { describe, expect, it } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { JobberClient } from '../src/client.js';
import { HubRegistry } from '../src/hubs.js';
import { registerRecordTools } from '../src/tools/records.js';
import { registerHealthcheckTools } from '../src/tools/healthcheck.js';
import type { JobberTransport } from '../src/transport.js';
import { APPOINTMENTS_HTML, INVOICES_HTML } from './fixtures/pages.js';

/**
 * Context-group hints (`_meta.mint`, the mcp-host contract), read off the
 * served `tools/list` — what a host actually sees.
 */
const HUB_A = '00000000-1111-2222-3333-444444444444';
const HUB_B = '55555555-6666-7777-8888-999999999999';

type Listed = {
  name: string;
  annotations?: { readOnlyHint?: boolean };
  inputSchema: { properties?: Record<string, Record<string, unknown>> };
  _meta?: { mint?: Record<string, unknown> };
};

const DOMAINS = ['school', 'home', 'work', 'family', 'health', 'money', 'travel', 'food'];
const INTENTS = ['whats-new', 'whats-due', 'whats-on', 'lookup', 'turn-on-off', 'send', 'change', 'other'];
const READ_INTENTS = ['whats-new', 'whats-due', 'whats-on'];
const KEYS = ['domain', 'intent', 'canonical', 'subject', 'when', 'aliases'];
const BRIEF_LINE = /^.+ — (\d{4}-\d{2}-\d{2}|no date) — .+$/;

const TWO_HUBS = { JOBBER_HUBS: JSON.stringify([{ label: 'Pest', hubId: HUB_A }, { label: 'Lawn', hubId: HUB_B }]) };

async function harness(env: Record<string, string> = TWO_HUBS, pages: Record<string, string> = {}) {
  const requested: string[] = [];
  const transport: JobberTransport = {
    get: async (url) => {
      requested.push(url);
      const page = Object.keys(pages).find((p) => url.endsWith(`/${p}`));
      return { status: 200, body: page ? (pages[page] as string) : '<html><body>client_hubs</body></html>' };
    },
    status: async () => ({ role: 'host', port: 37149 }),
  };
  const client = new JobberClient({ transport, hubs: new HubRegistry(env as NodeJS.ProcessEnv) });
  const h = await createTestHarness((server) => {
    registerRecordTools(server, client);
    registerHealthcheckTools(server, client);
  });
  return { h, requested };
}

async function served(env?: Record<string, string>): Promise<Listed[]> {
  const { h } = await harness(env);
  const { tools } = await h.client.listTools();
  await h.close();
  return tools as Listed[];
}

function text(result: CallToolResult): string {
  return (result.content as { type: string; text: string }[]).map((c) => c.text).join('\n');
}

const EXPECTED_INTENT: Record<string, string> = {
  jobber_list_appointments: 'whats-on',
  jobber_list_invoices: 'whats-due',
  jobber_list_quotes: 'lookup',
  jobber_list_work_requests: 'lookup',
  jobber_read_page: 'lookup',
  jobber_list_hubs: 'lookup',
};

describe('_meta.mint on tools/list', () => {
  it('every tool but the healthcheck declares domain home and its intent', async () => {
    const tools = await served();
    expect(tools.filter((t) => !t._meta?.mint).map((t) => t.name)).toEqual(['jobber_healthcheck']);
    const hinted = tools.filter((t) => t.name !== 'jobber_healthcheck');
    expect(hinted.map((t) => t.name).sort()).toEqual(Object.keys(EXPECTED_INTENT).sort());
    for (const t of hinted) {
      const m = t._meta!.mint!;
      expect(Object.keys(m).filter((k) => !KEYS.includes(k)), t.name).toEqual([]);
      expect(DOMAINS).toContain(m.domain);
      expect(m.domain, t.name).toBe('home');
      expect(INTENTS).toContain(m.intent);
      expect(m.intent, t.name).toBe(EXPECTED_INTENT[t.name]);
    }
  });

  it('canonical only on read-only whats-new/due/on reads, at most one per intent', async () => {
    const tools = await served();
    const canonical = tools.filter((t) => t._meta?.mint?.canonical !== undefined);
    for (const t of canonical) {
      expect(t._meta!.mint!.canonical, t.name).toBe(true);
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(READ_INTENTS, t.name).toContain(t._meta!.mint!.intent);
    }
    for (const intent of READ_INTENTS) {
      expect(canonical.filter((t) => t._meta!.mint!.intent === intent).length, intent).toBeLessThanOrEqual(1);
    }
    expect(canonical.map((t) => [t.name, t._meta!.mint!.intent]).sort()).toEqual([
      ['jobber_list_appointments', 'whats-on'],
      ['jobber_list_invoices', 'whats-due'],
    ]);
  });

  it('aliases are spoken words: at most 8, lowercase, at most 40 chars, never tool names', async () => {
    for (const t of await served()) {
      const aliases = t._meta?.mint?.aliases as string[] | undefined;
      if (!aliases) continue;
      expect(aliases.length, t.name).toBeLessThanOrEqual(8);
      for (const a of aliases) {
        expect(a.length, t.name).toBeLessThanOrEqual(40);
        expect(a, t.name).toBe(a.toLowerCase());
        expect(a, t.name).not.toMatch(/^jobber_/);
      }
    }
  });

  it('a declared subject or when names arguments the tool really takes', async () => {
    for (const t of await served()) {
      const m = t._meta?.mint;
      if (!m) continue;
      const props = t.inputSchema.properties ?? {};
      if (m.subject !== undefined) expect(props, t.name).toHaveProperty(m.subject as string);
      if (m.when !== undefined) {
        const when = m.when as { start: string; end: string };
        expect(Object.keys(when).sort(), t.name).toEqual(['end', 'start']);
        expect(props, t.name).toHaveProperty(when.start);
        expect(props, t.name).toHaveProperty(when.end);
      }
    }
  });

  it('the canonical reads name the hub as their subject; the visits read takes a range', async () => {
    const tools = await served();
    const on = tools.find((t) => t.name === 'jobber_list_appointments')!;
    expect(on._meta!.mint).toMatchObject({ subject: 'hub', when: { start: 'start', end: 'end' } });
    const due = tools.find((t) => t.name === 'jobber_list_invoices')!;
    expect(due._meta!.mint).toMatchObject({ subject: 'hub' });
    expect(due._meta!.mint).not.toHaveProperty('when');
    for (const t of [on, due]) expect(t.inputSchema.properties?.view?.enum, t.name).toEqual(['full', 'brief']);
    for (const t of tools.filter((x) => x._meta?.mint?.canonical === undefined)) {
      expect(t.inputSchema.properties ?? {}, t.name).not.toHaveProperty('view');
    }
  });
});

describe('hub labels as the subject enum', () => {
  it('publishes the configured hub labels — never a hub id — on every hub argument', async () => {
    const withHub = (await served()).filter((t) => 'hub' in (t.inputSchema.properties ?? {}));
    expect(withHub.length).toBe(5);
    for (const t of withHub) {
      const hub = t.inputSchema.properties!.hub!;
      expect(hub.enum, t.name).toEqual(['Pest', 'Lawn']);
      expect(JSON.stringify(hub), t.name).not.toContain(HUB_A);
    }
  });

  it('publishes no enum (never an empty one) when no hub is configured', async () => {
    const withHub = (await served({})).filter((t) => 'hub' in (t.inputSchema.properties ?? {}));
    expect(withHub.length).toBe(5);
    for (const t of withHub) {
      expect(t.inputSchema.properties!.hub, t.name).not.toHaveProperty('enum');
      expect(t.inputSchema.properties!.hub!.type, t.name).toBe('string');
    }
  });

  it('accepts a label in any case and still lets a raw hub id through', async () => {
    const { h, requested } = await harness();
    await h.callTool('jobber_list_appointments', { hub: 'lawn' });
    await h.callTool('jobber_list_appointments', { hub: HUB_A });
    await h.close();
    expect(requested[0]).toContain(HUB_B);
    expect(requested[1]).toContain(HUB_A);
  });
});

describe("view: 'brief'", () => {
  it('visits: one line per visit, title — ISO date — status', async () => {
    const { h } = await harness(TWO_HUBS, { appointments: APPOINTMENTS_HTML });
    const lines = text(await h.callTool('jobber_list_appointments', { view: 'brief' })).split('\n');
    await h.close();
    expect(lines).toEqual([
      'Visit 9:00am at 123 Elm St — 2026-06-28 — upcoming',
      'Visit at 123 Elm St — 2026-03-23 — past, confirmed',
    ]);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(120);
      expect(line).toMatch(BRIEF_LINE);
    }
  });

  it('visits: start/end keep the visits dated inside the inclusive range, in both views', async () => {
    const { h } = await harness(TWO_HUBS, { appointments: APPOINTMENTS_HTML });
    const brief = text(
      await h.callTool('jobber_list_appointments', { view: 'brief', start: '2026-06-28', end: '2026-06-28' }),
    );
    const full = JSON.parse(
      text(await h.callTool('jobber_list_appointments', { start: '2026-01-01', end: '2026-04-01' })),
    ) as { count: number };
    await h.close();
    expect(brief).toBe('Visit 9:00am at 123 Elm St — 2026-06-28 — upcoming');
    expect(full.count).toBe(1);
  });

  it('invoices: one line per open invoice with its due date and section', async () => {
    const { h } = await harness(TWO_HUBS, { invoices: INVOICES_HTML });
    const raw = text(await h.callTool('jobber_list_invoices', { view: 'brief', hub: 'Pest' }));
    await h.close();
    // Invoice titles are provider-written, so the lines answer inside the
    // untrusted-data envelope as `data: string[]` — marker and note first.
    expect(raw.startsWith('{"untrusted_content":true,"note":')).toBe(true);
    const envelope = JSON.parse(raw) as { untrusted_content: boolean; note: string; data: string[] };
    expect(envelope.untrusted_content).toBe(true);
    expect(envelope.note).toContain('written by the service provider');
    const lines = envelope.data;
    expect(lines).toEqual(['#14992 Quarterly Service — 2026-01-01 — overdue']);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(120);
      expect(line).toMatch(BRIEF_LINE);
    }
  });

  it('answers zero lines when there is nothing to list, so a host counts no items', async () => {
    const { h } = await harness();
    const visits = text(await h.callTool('jobber_list_appointments', { view: 'brief' }));
    const invoices = text(await h.callTool('jobber_list_invoices', { view: 'brief' }));
    await h.close();
    expect(visits).toBe('');
    // No invoice means no provider text, so there is nothing to fence.
    expect(invoices).toBe('');
  });
});
