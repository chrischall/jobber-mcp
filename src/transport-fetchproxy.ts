/**
 * Browser-bridge transport: every Client Hub page is fetched as a same-origin
 * request inside the user's own signed-in tab, via `@fetchproxy/server` plus
 * the ContextMint Bridge extension.
 *
 * Why there is no server-side path (verified live 2026-08-09):
 * `clienthub.getjobber.com` sits behind a Cloudflare managed challenge that
 * fingerprints the TLS client, not the User-Agent. curl and Node both get
 * `403` with the `Just a moment` interstitial, and they keep getting it when
 * handed a current Chrome UA and the full browser `Accept*` header set. The
 * identical request from inside a real tab returns 200. There is no header set
 * and no replayed cookie that durably clears it — `cf_clearance` is bound to
 * IP, UA and TLS fingerprint together.
 */
import {
  bridgeErrorInfo,
  createFetchproxyTransport,
  type FetchproxyServer,
  type FetchproxyServerOpts,
} from '@chrischall/mcp-utils/fetchproxy';
import { memoizeAsync, readPortEnv, type AsyncMemo } from '@chrischall/mcp-utils';
import { JobberBridgeError, type JobberTransport } from './transport.js';

/**
 * The whole fetchproxy fleet shares ONE concentrator port — the ContextMint
 * Bridge extension dials that port, and servers host/peer-elect on it. A "unique"
 * port means the extension never connects. Override only for test isolation,
 * or for a future host that needs a port per registration.
 */
const DEFAULT_WS_PORT = 37_149;

/** The slice of the bridge this adapter drives — narrow so tests can fake it. */
export interface JobberBridge {
  start(): Promise<void>;
  fetch(init: {
    method: string;
    path: string;
    headers?: Record<string, string>;
  }): Promise<{ status: number; body: string; url?: string }>;
  status(): Promise<Record<string, unknown>> | Record<string, unknown>;
}

export interface FetchproxyTransportOptions {
  version?: string;
  /** Concentrator port. Default `JOBBER_WS_PORT` env, then 37149. */
  port?: number;
  timeoutMs?: number;
  /** Injected bridge (tests). */
  bridge?: JobberBridge;
  /** Test seam forwarded to `createFetchproxyTransport`. */
  createServer?: (opts: FetchproxyServerOpts) => FetchproxyServer;
}

export class JobberFetchproxyTransport implements JobberTransport {
  private readonly bridge: JobberBridge;
  /**
   * The bridge start, memoized under one key: concurrent and repeat callers
   * share the first successful start, and a rejected start is evicted so the
   * next call retries instead of sticking on the failure. `memoizeAsync`, not
   * `singleFlight` — singleFlight clears on success too, which would re-run
   * `start()` (re-listen, re-print the banner) on every request.
   */
  private readonly started: AsyncMemo<'bridge', void>;

  constructor(opts: FetchproxyTransportOptions = {}) {
    this.bridge =
      opts.bridge ??
      (createFetchproxyTransport({
        // Named per-MCP so a future per-registration host can attribute a
        // socket to this child, matching the rest of the bridge fleet.
        port: opts.port ?? readPortEnv('JOBBER_WS_PORT', DEFAULT_WS_PORT),
        serverName: 'jobber-mcp',
        version: opts.version ?? '0.0.0',
        // Matches clienthub.getjobber.com (exact host or any subdomain).
        domains: ['getjobber.com'],
        defaultSubdomain: 'clienthub',
        capabilities: ['fetch'],
        logListening: true,
        debugEnvVar: 'JOBBER_DEBUG_LOG',
        fetchTimeoutMs: opts.timeoutMs ?? 20_000,
        ...(opts.createServer ? { createServer: opts.createServer } : {}),
      }) as unknown as JobberBridge);
    this.started = memoizeAsync(() => this.bridge.start());
  }

  /** The bridge, started (once; a failed start retries on the next call). */
  private async ready(): Promise<JobberBridge> {
    await this.started.get('bridge');
    return this.bridge;
  }

  async get(url: string): Promise<{ status: number; body: string }> {
    const { pathname, search } = new URL(url);
    try {
      const bridge = await this.ready();
      const res = await bridge.fetch({
        method: 'GET',
        path: `${pathname}${search}`,
        headers: { accept: 'text/html,application/xhtml+xml' },
      });
      return { status: res.status, body: res.body };
    } catch (err) {
      // Bridge-layer failures (extension down, pairing pending, timeout) carry
      // a typed remediation hint — surface it instead of a bare message.
      const info = bridgeErrorInfo(err);
      // Typed, so the healthcheck can tell a dead bridge from a hub fault.
      throw new JobberBridgeError(
        info.type,
        `Jobber bridge: ${info.message}${info.hint ? ` ${info.hint}` : ''}`,
        info.hint,
      );
    }
  }

  async status(): Promise<Record<string, unknown>> {
    return await this.bridge.status();
  }
}
