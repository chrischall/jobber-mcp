import { describe, expect, it } from 'vitest';
import { JobberClient } from '../src/client.js';
import { HubRegistry } from '../src/hubs.js';
import type { JobberTransport } from '../src/transport.js';

const HUB = '00000000-1111-2222-3333-444444444444';

function registry(env: Record<string, string> = { JOBBER_HUB_ID: HUB }): HubRegistry {
  return new HubRegistry(env as NodeJS.ProcessEnv);
}

function transportReturning(
  res: { status: number; body: string },
  seen: string[] = [],
): JobberTransport {
  return {
    get: async (url) => {
      seen.push(url);
      return res;
    },
    status: async () => ({ role: 'host', port: 37149 }),
  };
}

const APPOINTMENTS_PAGE =
  '<html><body><div data-props="{&quot;title&quot;:&quot;Upcoming&quot;,&quot;appointments&quot;:' +
  '[{&quot;date&quot;:&quot;Jun 28, 2026&quot;,&quot;canViewTime&quot;:true,&quot;time&quot;:&quot;9:00am&quot;,' +
  '&quot;url&quot;:&quot;/client_hubs/UUID/appointments/1&quot;}]}"></div></body></html>';

describe('HubRegistry', () => {
  it('builds the hub URL from the configured id', () => {
    const urls: string[] = [];
    const client = new JobberClient({
      transport: transportReturning({ status: 200, body: APPOINTMENTS_PAGE }, urls),
      hubs: registry(),
    });
    return client.listAppointments().then(() => {
      expect(urls[0]).toBe(`https://clienthub.getjobber.com/client_hubs/${HUB}/appointments`);
    });
  });

  it('never exposes hub ids when listing hubs', () => {
    const listed = registry().list();
    expect(listed).toEqual([{ label: 'default', isDefault: true }]);
    expect(JSON.stringify(listed)).not.toContain(HUB);
  });

  it('defers the missing-config error to first use instead of throwing at construction', () => {
    const reg = registry({});
    expect(reg.configured).toBe(false);
    expect(() => reg.resolve()).toThrow(/No Jobber Client Hub configured/);
  });

  it('rejects a hubId that is not a UUID, rather than 404ing later', () => {
    const reg = registry({ JOBBER_HUB_ID: 'not-a-uuid' });
    expect(() => reg.resolve()).toThrow(/not a UUID/);
  });

  it('supports several providers and selects by label', () => {
    const reg = registry({
      JOBBER_HUBS: JSON.stringify([
        { label: 'queenbee', hubId: HUB },
        { label: 'greenworx', hubId: '11111111-2222-3333-4444-555555555555' },
      ]),
    });
    expect(reg.list().map((h) => h.label)).toEqual(['queenbee', 'greenworx']);
    expect(reg.resolve('greenworx').hubId).toBe('11111111-2222-3333-4444-555555555555');
    // Default is the first configured hub.
    expect(reg.resolve().label).toBe('queenbee');
  });

  it('names the configured hubs when the selector is unknown', () => {
    const reg = registry({ JOBBER_HUBS: JSON.stringify([{ label: 'queenbee', hubId: HUB }]) });
    expect(() => reg.resolve('nope')).toThrow(/Unknown hub "nope".*queenbee/s);
  });

  it('reports malformed JOBBER_HUBS as a config error, not a crash', () => {
    expect(() => registry({ JOBBER_HUBS: '{oops' }).resolve()).toThrow(/not valid JSON/);
  });
});

describe('JobberClient failure classification', () => {
  it('calls a Cloudflare interstitial a bot wall, not a missing page', async () => {
    // The challenge is served as 403; classifying on status alone would call
    // this a signed-out session and send the user to re-authenticate.
    const client = new JobberClient({
      transport: transportReturning({
        status: 403,
        body: '<html><head><title>Just a moment...</title></head></html>',
      }),
      hubs: registry(),
    });
    await expect(client.listAppointments()).rejects.toThrow(/bot|challenge|cloudflare/i);
  });

  it('treats a bare 403 as a session problem', async () => {
    const client = new JobberClient({
      transport: transportReturning({ status: 403, body: '<html><body>denied</body></html>' }),
      hubs: registry(),
    });
    await expect(client.listAppointments()).rejects.toThrow(/sign|session|auth/i);
  });

  it('explains a 404 as a possibly-revoked hub link', async () => {
    const client = new JobberClient({
      transport: transportReturning({ status: 404, body: 'nope' }),
      hubs: registry(),
    });
    await expect(client.listAppointments()).rejects.toThrow(/revoke/i);
  });

  it('detects a login page served as 200', async () => {
    const client = new JobberClient({
      transport: transportReturning({
        status: 200,
        body: '<html><body><form action="/login" id="session_form"></form></body></html>',
      }),
      hubs: registry(),
    });
    await expect(client.listAppointments()).rejects.toThrow(/sign|session|auth/i);
  });

  it('parses a healthy page', async () => {
    const client = new JobberClient({
      transport: transportReturning({ status: 200, body: APPOINTMENTS_PAGE }),
      hubs: registry(),
    });
    const appointments = await client.listAppointments();
    expect(appointments).toHaveLength(1);
    expect(appointments[0]?.date).toBe('Jun 28, 2026');
  });

  it('returns an empty list rather than throwing when a hub genuinely has none', async () => {
    const client = new JobberClient({
      transport: transportReturning({ status: 200, body: '<html><body>client_hubs</body></html>' }),
      hubs: registry(),
    });
    await expect(client.listCards('invoices')).resolves.toEqual([]);
  });
});
