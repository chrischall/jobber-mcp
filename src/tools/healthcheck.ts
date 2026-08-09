import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { messageOf, textResult } from '@chrischall/mcp-utils';
import type { JobberClient } from '../client.js';

/**
 * `jobber_healthcheck` — one call that separates the three things that can be
 * wrong, because their remedies are different and their symptoms are not:
 *
 *   1. the bridge is down          -> start Chrome / install the extension
 *   2. the bridge is up, hub 403s  -> the hub link expired or was revoked
 *   3. no hub configured at all    -> set JOBBER_HUB_ID
 *
 * It reports the real port from the running bridge rather than the default
 * literal, so a port override is visible here instead of being invisible until
 * every fetch fails.
 */
export function registerHealthcheckTools(server: McpServer, client: JobberClient): void {
  server.registerTool(
    'jobber_healthcheck',
    {
      title: 'Verify the bridge and hub are reachable',
      description:
        'Checks the fetchproxy browser bridge and, if a hub is configured, fetches its appointments page. Reports which layer failed and what to do about it. Read-only.',
      annotations: {
        title: 'Verify the bridge and hub are reachable',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {},
    },
    async () => {
      const start = Date.now();

      let bridge: Record<string, unknown> | { error: string };
      try {
        bridge = await client.bridgeStatus();
      } catch (err) {
        return textResult({
          ok: false,
          layer: 'bridge',
          error: messageOf(err),
          hint:
            'The fetchproxy bridge is not running. Start Chrome with the Transporter ' +
            'extension installed and enabled for getjobber.com.',
        });
      }

      if (!client.hubs.configured) {
        return textResult({
          ok: false,
          layer: 'config',
          bridge,
          hint:
            'Bridge is up but no Client Hub is configured. Set JOBBER_HUB_ID to the ' +
            'UUID from your hub URL (clienthub.getjobber.com/client_hubs/<UUID>/).',
        });
      }

      try {
        const appointments = await client.listAppointments();
        return textResult({
          ok: true,
          layer: 'hub',
          elapsed_ms: Date.now() - start,
          bridge,
          appointments_found: appointments.length,
          hint: 'Bridge and Client Hub are both reachable.',
        });
      } catch (err) {
        const error = messageOf(err);
        return textResult({
          ok: false,
          layer: 'hub',
          elapsed_ms: Date.now() - start,
          bridge,
          error,
          hint: /challenge|cloudflare|bot/i.test(error)
            ? 'The request did not run inside a real tab. Open clienthub.getjobber.com in Chrome and confirm the extension has Site access for getjobber.com.'
            : 'The bridge is up but the hub did not serve the page. Re-open the hub link your provider emailed you, then retry.',
        });
      }
    },
  );
}
