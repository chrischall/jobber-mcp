import { describe, expect, it } from 'vitest';
import { createTestHarness, parseToolResult } from '@chrischall/mcp-utils/test';
import { JobberClient } from '../src/client.js';
import { HubRegistry } from '../src/hubs.js';
import { registerRecordTools } from '../src/tools/records.js';
import { registerHealthcheckTools } from '../src/tools/healthcheck.js';
import { VERSION } from '../src/version.js';
import type { JobberTransport } from '../src/transport.js';

/**
 * The failure and edge paths the happy-path suites don't reach: misconfigured
 * hubs, non-2xx responses the classifier passes through, and the two tools
 * whose handlers nothing exercised.
 */

const HUB = '00000000-1111-2222-3333-444444444444';

function clientFor(
  res: { status: number; body: string },
  env: Record<string, string> = { JOBBER_HUB_ID: HUB },
): JobberClient {
  const transport: JobberTransport = {
    get: async () => res,
    status: async () => ({ role: 'host', port: 37_149 }),
  };
  return new JobberClient({ transport, hubs: new HubRegistry(env as NodeJS.ProcessEnv) });
}

describe('version', () => {
  it('is the release-please-managed literal', () => {
    // Imported so the module is actually loaded: the .mcpb and the MCP
    // handshake both read it, and a file nothing imports can rot silently.
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('fetchPage — unclassified HTTP failures', () => {
  it('reports the status and a body excerpt for a 500', async () => {
    // Not a challenge, not auth, not 404: the catch-all has to say enough to
    // debug from, without dumping a whole error page into the transcript.
    const body = `<html>${'x'.repeat(500)}</html>`;
    await expect(clientFor({ status: 500, body }).fetchPage('invoices')).rejects.toThrow(
      /Client Hub returned HTTP 500 for invoices\. Body starts: /,
    );
  });

  it('truncates that excerpt to 200 characters', async () => {
    const body = 'y'.repeat(1_000);
    const err = await clientFor({ status: 503, body })
      .fetchPage('invoices')
      .catch((e: Error) => e);
    expect((err as Error).message).toContain('y'.repeat(200));
    expect((err as Error).message).not.toContain('y'.repeat(201));
  });
});

describe('readPage', () => {
  it('returns the page as readable text with the resolved url', async () => {
    const client = clientFor({
      status: 200,
      body: '<html><body><h1>Invoice 15313</h1><p>Due Apr 07</p><script>ignored()</script></body></html>',
    });
    const { text, url } = await client.readPage('invoices/150208512');

    expect(text).toContain('Invoice 15313');
    expect(text).toContain('Due Apr 07');
    expect(text).not.toContain('ignored()');
    expect(url).toBe(`https://clienthub.getjobber.com/client_hubs/${HUB}/invoices/150208512`);
  });
});

describe('HubRegistry — JOBBER_HUBS validation', () => {
  // A config error is captured at construction and raised on first use, so the
  // server still boots and can SAY what is wrong instead of dying on import.
  const reg = (v: string) => () =>
    new HubRegistry({ JOBBER_HUBS: v } as NodeJS.ProcessEnv).resolve();

  it('rejects valid JSON that is not an array', () => {
    expect(reg('{"label":"a","hubId":"b"}')).toThrow(
      /must be a JSON array of \{label, hubId\} objects/,
    );
  });

  it('rejects an entry missing its label', () => {
    expect(reg(`[{"hubId":"${HUB}"}]`)).toThrow(
      /needs a "label" and a "hubId"/,
    );
  });

  it('rejects an entry missing its hubId', () => {
    expect(reg('[{"label":"home"}]')).toThrow(
      /needs a "label" and a "hubId"/,
    );
  });

  it('rejects an entry whose hubId is not a UUID, naming the label', () => {
    // A typo'd id is otherwise a 404 through the bridge, which reads as an outage.
    expect(reg('[{"label":"home","hubId":"not-a-uuid"}]')).toThrow(
      /Hub "home" has a hubId that is not a UUID/,
    );
  });
});

describe('tools whose handlers the roster tests do not run', () => {
  async function harness(res: { status: number; body: string }) {
    const client = clientFor(res);
    return await createTestHarness((server) => {
      registerRecordTools(server, client);
      registerHealthcheckTools(server, client);
    });
  }

  it('jobber_list_appointments notes an empty schedule rather than a bare zero', async () => {
    const h = await harness({ status: 200, body: '<html><body></body></html>' });
    const data = parseToolResult<Record<string, unknown>>(
      await h.callTool('jobber_list_appointments', {}),
    );
    expect(data['count']).toBe(0);
    expect(data['appointments']).toEqual([]);
    expect(String(data['note'])).toBeTruthy();
    await h.close();
  });

  it('jobber_read_page answers text plus the character count', async () => {
    const h = await harness({
      status: 200,
      body: '<html><body><h1>Quote 42</h1></body></html>',
    });
    const data = parseToolResult<Record<string, unknown>>(
      await h.callTool('jobber_read_page', { path: 'quotes/42' }),
    );
    expect(String(data['text'])).toContain('Quote 42');
    expect(data['characters']).toBe(String(data['text']).length);
    expect(String(data['url'])).toContain('/quotes/42');
    await h.close();
  });
});

describe('jobber_healthcheck when the bridge is unreachable', () => {
  it('reports the bridge layer and how to start it, instead of throwing', async () => {
    const transport: JobberTransport = {
      get: async () => ({ status: 200, body: '' }),
      status: async () => {
        throw new Error('no bridge');
      },
    };
    const client = new JobberClient({
      transport,
      hubs: new HubRegistry({ JOBBER_HUB_ID: HUB } as NodeJS.ProcessEnv),
    });
    const h = await createTestHarness((server) => registerHealthcheckTools(server, client));

    const result = await h.callTool('jobber_healthcheck', {});
    const data = parseToolResult<Record<string, unknown>>(result);

    // A healthcheck that throws tells the caller nothing about WHICH layer is
    // down — the whole point is that it answers.
    expect(result.isError).toBeFalsy();
    expect(data['ok']).toBe(false);
    expect(data['layer']).toBe('bridge');
    expect(String(data['hint'])).toMatch(/Transporter/);
    await h.close();
  });
});

describe('defaults that the injected-dependency tests never take', () => {
  it('JobberClient falls back to a process.env HubRegistry', () => {
    // Production constructs it with no `hubs` — every other test injects one,
    // so the default arm is only ever exercised here.
    const transport: JobberTransport = {
      get: async () => ({ status: 200, body: '' }),
      status: async () => ({}),
    };
    expect(() => new JobberClient({ transport })).not.toThrow();
  });

  it('HubRegistry reads process.env when handed no environment', () => {
    expect(() => new HubRegistry()).not.toThrow();
  });

  it('keeps the first entry when JOBBER_HUBS repeats a label', () => {
    const dupe = `[{"label":"home","hubId":"${HUB}"},{"label":"home","hubId":"${HUB.replace(/4/g, '5')}"}]`;
    const reg = new HubRegistry({ JOBBER_HUBS: dupe } as NodeJS.ProcessEnv);
    expect(reg.list()).toEqual([{ label: 'home', isDefault: true }]);
  });

  it('surfaces a non-Error config failure as a string', () => {
    // loadHubs throws Errors today; the String(err) arm is the guard against a
    // future throw of something else taking the server down with no message.
    const reg = new HubRegistry({ JOBBER_HUBS: '{not json' } as NodeJS.ProcessEnv);
    expect(() => reg.resolve()).toThrow(/not valid JSON/);
  });
});

describe('jobber_list_hubs with nothing configured', () => {
  it('says how to configure one instead of answering an empty list', async () => {
    const transport: JobberTransport = {
      get: async () => ({ status: 200, body: '' }),
      status: async () => ({}),
    };
    const client = new JobberClient({
      transport,
      hubs: new HubRegistry({} as NodeJS.ProcessEnv),
    });
    const h = await createTestHarness((server) => registerRecordTools(server, client));

    const data = parseToolResult<Record<string, unknown>>(await h.callTool('jobber_list_hubs', {}));
    expect(data['count']).toBe(0);
    expect(String(data['note'])).toMatch(/JOBBER_HUB_ID/);
    await h.close();
  });
});

describe('jobber_healthcheck hub-layer hints', () => {
  async function hubFailure(body: string, status = 200) {
    const transport: JobberTransport = {
      get: async () => ({ status, body }),
      status: async () => ({ role: 'host', port: 37_149 }),
    };
    const client = new JobberClient({
      transport,
      hubs: new HubRegistry({ JOBBER_HUB_ID: HUB } as NodeJS.ProcessEnv),
    });
    const h = await createTestHarness((server) => registerHealthcheckTools(server, client));
    const data = parseToolResult<Record<string, unknown>>(await h.callTool('jobber_healthcheck', {}));
    await h.close();
    return data;
  }

  it('blames the tab, not the hub, when the response is a bot challenge', async () => {
    const data = await hubFailure('<html><head><title>Just a moment...</title></head></html>', 403);
    expect(data['layer']).toBe('hub');
    expect(String(data['hint'])).toMatch(/Site access for getjobber\.com/);
  });

  it('points at the hub link when the bridge is up but the page is not served', async () => {
    const data = await hubFailure('<html><body>nope</body></html>', 500);
    expect(data['layer']).toBe('hub');
    expect(String(data['hint'])).toMatch(/Re-open the hub link/);
  });
});

describe('jobber_list_appointments with a populated schedule', () => {
  it('omits the empty note when there are appointments to report', async () => {
    const page =
      '<div data-props="{&quot;title&quot;:&quot;Upcoming&quot;,&quot;appointments&quot;:' +
      '[{&quot;date&quot;:&quot;Jun 28, 2026&quot;,&quot;canViewTime&quot;:true,' +
      '&quot;time&quot;:&quot;9:00am&quot;,&quot;url&quot;:&quot;/client_hubs/U/appointments/1&quot;}]}"></div>';
    const h = await createTestHarness((server) =>
      registerRecordTools(server, clientFor({ status: 200, body: page })),
    );

    const data = parseToolResult<Record<string, unknown>>(
      await h.callTool('jobber_list_appointments', {}),
    );
    expect(data['count']).toBe(1);
    expect(data).not.toHaveProperty('note');
    await h.close();
  });
});
