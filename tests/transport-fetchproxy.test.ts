import { describe, expect, it, vi } from 'vitest';
import {
  bridgeErrorInfo,
  FetchproxyBridgeDownError,
  type FetchproxyServer,
} from '@chrischall/mcp-utils/fetchproxy';
import {
  JobberFetchproxyTransport,
  type JobberBridge,
} from '../src/transport-fetchproxy.js';

/**
 * The bridge adapter. Everything here runs against an injected fake — either
 * the `bridge` seam (the adapter's own behaviour) or the `createServer` seam
 * (what it DECLARES to @fetchproxy/server), so no socket is ever opened.
 *
 * The declaration matters as much as the behaviour: a wrong port means the
 * Transporter extension never connects, and a wrong domain list means every
 * fetch is refused before it leaves the tab.
 */

function fakeBridge(over: Partial<JobberBridge> = {}): JobberBridge & {
  start: ReturnType<typeof vi.fn>;
  fetch: ReturnType<typeof vi.fn>;
} {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn().mockResolvedValue({ status: 200, body: '<html></html>' }),
    status: vi.fn().mockResolvedValue({ role: 'host', port: 37_149 }),
    ...over,
  } as never;
}

describe('JobberFetchproxyTransport — bridge declaration', () => {
  function declaredOpts(o: Record<string, unknown> = {}): Record<string, unknown> {
    let seen: Record<string, unknown> = {};
    new JobberFetchproxyTransport({
      createServer: (opts) => {
        seen = opts as unknown as Record<string, unknown>;
        return {
          listen: vi.fn(),
          close: vi.fn(),
          request: vi.fn(),
          bridgeHealth: vi.fn(),
        } as unknown as FetchproxyServer;
      },
      ...o,
    });
    return seen;
  }

  it('declares the fleet-shared concentrator port, not a unique one', () => {
    // A "unique" port is the classic mistake: the extension dials 37149 and
    // a server elsewhere would never be found.
    expect(declaredOpts()['port']).toBe(37_149);
  });

  it('honours an explicit port over the default', () => {
    expect(declaredOpts({ port: 41_000 })['port']).toBe(41_000);
  });

  it('scopes the bridge to getjobber.com, named for this server', () => {
    // `defaultSubdomain` is consumed by createFetchproxyTransport itself and
    // never reaches the server opts, so it is not assertable at this seam.
    const o = declaredOpts();
    expect(o['domains']).toEqual(['getjobber.com']);
    expect(o['serverName']).toBe('jobber-mcp');
  });

  it('asks only for fetch — this server never writes', () => {
    expect(declaredOpts()['capabilities']).toEqual(['fetch']);
  });

  it('passes the version through and defaults it when unset', () => {
    expect(declaredOpts({ version: '1.2.3' })['version']).toBe('1.2.3');
    expect(declaredOpts()['version']).toBe('0.0.0');
  });

  it('applies the default fetch timeout, and an override', () => {
    expect(declaredOpts()['fetchTimeoutMs']).toBe(20_000);
    expect(declaredOpts({ timeoutMs: 5_000 })['fetchTimeoutMs']).toBe(5_000);
  });
});

describe('JobberFetchproxyTransport — start lifecycle', () => {
  it('starts the bridge once across concurrent and repeat calls', async () => {
    const bridge = fakeBridge();
    const t = new JobberFetchproxyTransport({ bridge });

    await Promise.all([
      t.get('https://clienthub.getjobber.com/a'),
      t.get('https://clienthub.getjobber.com/b'),
    ]);
    await t.get('https://clienthub.getjobber.com/c');

    expect(bridge.start).toHaveBeenCalledTimes(1);
  });

  it('retries start after a failure instead of sticking on the rejection', async () => {
    // The single-flight promise has to be CLEARED on rejection: a transient
    // failure (extension not up yet) must not poison every later call.
    const bridge = fakeBridge({
      start: vi
        .fn()
        .mockRejectedValueOnce(new Error('extension not paired'))
        .mockResolvedValue(undefined),
    } as never);
    const t = new JobberFetchproxyTransport({ bridge });

    await expect(t.get('https://clienthub.getjobber.com/a')).rejects.toThrow(/Jobber bridge/);
    await expect(t.get('https://clienthub.getjobber.com/a')).resolves.toMatchObject({
      status: 200,
    });
    expect(bridge.start).toHaveBeenCalledTimes(2);
  });
});

describe('JobberFetchproxyTransport — get', () => {
  it('sends only the path and query, as a same-origin request', async () => {
    const bridge = fakeBridge();
    const t = new JobberFetchproxyTransport({ bridge });

    await t.get('https://clienthub.getjobber.com/client_hubs/UUID/invoices?page=2');

    expect(bridge.fetch).toHaveBeenCalledWith({
      method: 'GET',
      path: '/client_hubs/UUID/invoices?page=2',
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
  });

  it('returns the status and body the bridge answered with', async () => {
    const bridge = fakeBridge({
      fetch: vi.fn().mockResolvedValue({ status: 404, body: 'gone', url: 'x' }),
    } as never);
    const t = new JobberFetchproxyTransport({ bridge });

    // Non-2xx is the CLIENT's to interpret; the transport reports it faithfully.
    expect(await t.get('https://clienthub.getjobber.com/x')).toEqual({
      status: 404,
      body: 'gone',
    });
  });

  it('appends the remediation hint when the bridge error carries one', async () => {
    const cause = new FetchproxyBridgeDownError('bridge is down');
    const bridge = fakeBridge({ fetch: vi.fn().mockRejectedValue(cause) } as never);
    const t = new JobberFetchproxyTransport({ bridge });

    // A typed bridge failure knows what the user should DO about it; losing
    // that to a bare message is the whole reason this catch exists. Asserted
    // against bridgeErrorInfo rather than the literal copy, which is the
    // library's to change.
    const info = bridgeErrorInfo(cause);
    expect(info.hint).toBeTruthy();
    await expect(t.get('https://clienthub.getjobber.com/x')).rejects.toThrow(
      `Jobber bridge: ${info.message} ${info.hint}`,
    );
  });

  it('does not leave a dangling separator when there is no hint', async () => {
    const bridge = fakeBridge({
      fetch: vi.fn().mockRejectedValue(new Error('something odd')),
    } as never);
    const t = new JobberFetchproxyTransport({ bridge });

    await expect(t.get('https://clienthub.getjobber.com/x')).rejects.toThrow(
      'Jobber bridge: something odd',
    );
  });
});

describe('JobberFetchproxyTransport — real server construction', () => {
  it('builds a bridge with no injected seam at all', () => {
    // The default path: no `bridge`, no `createServer`. Construction alone must
    // not touch the network — the factory binds nothing until start().
    expect(() => new JobberFetchproxyTransport()).not.toThrow();
  });
});

describe('JobberFetchproxyTransport — status', () => {
  it('delegates to the bridge without starting it', async () => {
    const bridge = fakeBridge();
    const t = new JobberFetchproxyTransport({ bridge });

    expect(await t.status()).toEqual({ role: 'host', port: 37_149 });
    // status() is the healthcheck's first probe — it must report "not running"
    // rather than trying to start the thing it is reporting on.
    expect(bridge.start).not.toHaveBeenCalled();
  });
});
