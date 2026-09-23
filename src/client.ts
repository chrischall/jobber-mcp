/**
 * Client Hub reader: resolves a hub, fetches a page through the transport,
 * and turns it into records.
 *
 * Read-only by construction. Every mutating flow in the hub (submitting a work
 * request, approving a quote, paying an invoice) is a form POST with CSRF and,
 * on some flows, a Turnstile token read from the DOM — which the bridge cannot
 * produce. Rather than ship writes that fail unpredictably, this client has no
 * write path at all.
 */
import { BotWallError, McpToolError, SessionNotAuthenticatedError } from '@chrischall/mcp-utils';
import { HubRegistry, type Hub } from './hubs.js';
import {
  looksChallenged,
  pageText,
  parseAppointments,
  parseCards,
  type Appointment,
  type CardRecord,
} from './parse.js';
import type { JobberTransport } from './transport.js';

/** What the hub id is replaced with in any page body this client returns. */
const HUB_ID_PLACEHOLDER = '[hub-id]';

/** Hub pages that hold card lists. `appointments` is deliberately not here. */
export type CardPage = 'invoices' | 'quotes' | 'work_requests';

export interface JobberClientOptions {
  transport: JobberTransport;
  hubs?: HubRegistry;
}

export class JobberClient {
  private readonly transport: JobberTransport;
  readonly hubs: HubRegistry;

  constructor(opts: JobberClientOptions) {
    this.transport = opts.transport;
    this.hubs = opts.hubs ?? new HubRegistry();
  }

  /**
   * Raw HTML of a hub page, with the failure modes classified.
   *
   * The hub id is scrubbed from the body before anything else reads it. Live
   * pages embed it in every link, and it is a bearer credential, so no parse
   * result, page text or error excerpt built from the body can carry it out.
   */
  async fetchPage(
    path: string,
    hubSelector?: string,
  ): Promise<{ html: string; url: string; hub: Hub }> {
    const hub: Hub = this.hubs.resolve(hubSelector);
    const url = this.hubs.urlFor(hub, path);
    const res = await this.transport.get(url);
    const status = res.status;
    // hubIds are validated UUIDs (hex and dashes), so safe as a pattern.
    const body = res.body.replace(new RegExp(hub.hubId, 'gi'), HUB_ID_PLACEHOLDER);

    // Order matters: a challenge is served as a 403, so classify it as a bot
    // wall rather than reporting "not found" or "signed out".
    if (looksChallenged(body)) {
      throw new BotWallError(path, 30, { vendor: 'Cloudflare' });
    }

    if (status === 401 || status === 403) {
      throw new SessionNotAuthenticatedError('Jobber Client Hub', 'clienthub.getjobber.com');
    }

    if (status === 404) {
      throw new McpToolError(
        `No such Client Hub page (HTTP 404): ${path}. Check the hub id is current — ` +
          'providers can revoke a hub link and issue a new one.',
      );
    }

    if (status < 200 || status >= 300) {
      throw new McpToolError(
        `Client Hub returned HTTP ${status} for ${path}. Body starts: ${body.slice(0, 200)}`,
      );
    }

    // A 2xx that is not a hub page is almost always a login redirect rendered
    // as 200 — the classic cookie-session expiry tell.
    if (/<form[^>]+(login|session)/i.test(body) && !/client_hubs/.test(body)) {
      throw new SessionNotAuthenticatedError('Jobber Client Hub', 'clienthub.getjobber.com');
    }

    return { html: body, url, hub };
  }

  async listAppointments(hubSelector?: string): Promise<Appointment[]> {
    const { html } = await this.fetchPage('appointments', hubSelector);
    return parseAppointments(html);
  }

  async listCards(page: CardPage, hubSelector?: string): Promise<CardRecord[]> {
    const { html } = await this.fetchPage(page, hubSelector);
    return parseCards(html);
  }

  /**
   * Readable text of a hub page — the escape hatch for detail pages.
   *
   * Reports the hub-relative path and the hub's label, never the absolute
   * URL: that carries the hub id, which is a credential.
   */
  async readPage(
    path: string,
    hubSelector?: string,
  ): Promise<{ text: string; path: string; hub: string }> {
    const { html, hub } = await this.fetchPage(path, hubSelector);
    return { text: pageText(html), path: path.replace(/^\/+/, ''), hub: hub.label };
  }

  async bridgeStatus(): Promise<Record<string, unknown>> {
    return await this.transport.status();
  }
}
