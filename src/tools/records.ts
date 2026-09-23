import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { minifiedResult } from '@chrischall/mcp-utils';
import type { CardPage, JobberClient } from '../client.js';

const hubArg = z
  .string()
  .min(1)
  .optional()
  .describe('Which provider hub to read, by label. Omit when only one is configured.');

/**
 * The only hub routes jobber_read_page may fetch: the four read families, each
 * with an optional numeric detail id and an optional `key=value` query string.
 *
 * An allow-list, not a deny-list, because the tool is annotated read-only and
 * a host may run it unprompted. The hub serves side effects on plain GETs —
 * `logout` ends the session — plus write forms (`work_requests/new`) and the
 * payment-methods page (`wallet`); a prompt-injected page must not be able to
 * steer the model to any of them. Anything outside the pattern (including
 * `..`, a scheme or a host) is rejected before a request is made.
 */
const READ_PATH_RE =
  /^\/?(?:appointments|invoices|quotes|work_requests)(?:\/\d+)?(?:\?[A-Za-z0-9_]+=[A-Za-z0-9_-]*(?:&[A-Za-z0-9_]+=[A-Za-z0-9_-]*)*)?$/;

/**
 * Empty is a real answer here, and it is also what a broken parser returns, so
 * every list result says which it was rather than leaving the caller to guess.
 */
function emptyNote(kind: string): string {
  return `No ${kind} on this hub. If you expected some, the provider may have revoked the hub link, or the page layout changed — check jobber_read_page for the raw page.`;
}

export function registerRecordTools(server: McpServer, client: JobberClient): void {
  server.registerTool(
    'jobber_list_appointments',
    {
      title: 'List scheduled visits',
      description:
        "Scheduled visits from a provider's Jobber Client Hub, grouped Today / Upcoming / Past. Each visit carries date, weekday, time, arrival window, location and confirmation state. `time` is null when the provider chooses not to show times. Read-only.",
      annotations: {
        title: 'List scheduled visits',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: z.object({ hub: hubArg }),
    },
    async ({ hub }) => {
      const appointments = await client.listAppointments(hub);
      return minifiedResult({
        count: appointments.length,
        appointments,
        ...(appointments.length === 0 ? { note: emptyNote('appointments') } : {}),
      });
    },
  );

  registerCardTool(server, client, {
    name: 'jobber_list_invoices',
    page: 'invoices',
    title: 'List invoices',
    description:
      "Invoices a provider has sent through Jobber. Each carries its number, subject, the list section it sits under (`Paid`, `Overdue`, …) and the provider's own metadata rows verbatim in `details` — amounts and dates live there, kept raw because which rows appear depends on invoice state. Read-only; this cannot pay anything.",
  });

  registerCardTool(server, client, {
    name: 'jobber_list_quotes',
    page: 'quotes',
    title: 'List quotes',
    description:
      'Quotes a provider has sent through Jobber, with number, subject, section (approval state) and the raw metadata rows. Read-only — approving a quote is not possible through this server.',
  });

  registerCardTool(server, client, {
    name: 'jobber_list_work_requests',
    page: 'work_requests',
    title: 'List work requests',
    description:
      'Work requests you have raised with a provider through their Jobber Client Hub, with their current section (state) and metadata rows. Read-only.',
  });

  server.registerTool(
    'jobber_read_page',
    {
      title: 'Read a Client Hub page as text',
      description:
        'Fetch a read page of a Jobber Client Hub — `appointments`, `invoices`, `quotes` or `work_requests`, optionally with a numeric id — and return its readable text. Use for detail pages (e.g. `invoices/150208512`, `appointments/2236612358`) whose layout has no pinned schema, and to inspect a page when a list tool returns nothing. Other hub routes (logout, forms, payment pages) are refused. Read-only.',
      annotations: {
        title: 'Read a Client Hub page as text',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .regex(
            READ_PATH_RE,
            'Only the read pages are reachable: appointments, invoices, quotes or work_requests, ' +
              'optionally followed by a numeric id (e.g. "invoices/150208512") and a query string. ' +
              'Other hub routes (logout, forms, payment pages) are refused.',
          )
          .describe(
            'Hub-relative read path: "appointments", "invoices", "quotes" or "work_requests", ' +
              'optionally with a numeric id, e.g. "invoices/150208512".',
          ),
        hub: hubArg,
      }),
    },
    async ({ path, hub }) => {
      const page = await client.readPage(path, hub);
      return minifiedResult({
        hub: page.hub,
        path: page.path,
        characters: page.text.length,
        text: page.text,
      });
    },
  );

  server.registerTool(
    'jobber_list_hubs',
    {
      title: 'List configured Client Hubs',
      description:
        'The provider hubs this server is configured for, by label, and which is the default. Each Jobber-using business shares its own hub; there is no combined view across providers. Never returns hub ids, which are credentials. Read-only.',
      annotations: {
        title: 'List configured Client Hubs',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({}),
    },
    async () => {
      const hubs = client.hubs.list();
      return minifiedResult({
        count: hubs.length,
        hubs,
        ...(hubs.length === 0
          ? {
              note: 'No hub configured. Set JOBBER_HUB_ID to the UUID from your hub URL (clienthub.getjobber.com/client_hubs/<UUID>/).',
            }
          : {}),
      });
    },
  );
}

function registerCardTool(
  server: McpServer,
  client: JobberClient,
  opts: { name: string; page: CardPage; title: string; description: string },
): void {
  server.registerTool(
    opts.name,
    {
      title: opts.title,
      description: opts.description,
      annotations: {
        title: opts.title,
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: z.object({ hub: hubArg }),
    },
    async ({ hub }) => {
      const records = await client.listCards(opts.page, hub);
      return minifiedResult({
        count: records.length,
        [opts.page]: records,
        ...(records.length === 0 ? { note: emptyNote(opts.page.replace('_', ' ')) } : {}),
      });
    },
  );
}
