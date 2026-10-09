import type { McpServer } from '@modelcontextprotocol/server';
import { messageOf, minifiedResult } from '@chrischall/mcp-utils';
import type { JobberClient } from '../client.js';
import { JobberBridgeError } from '../transport.js';
import { z } from 'zod';

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
const BRIDGE_DOWN_HINT =
  'ContextMint Bridge is not reachable. Start Chrome with the ContextMint Bridge ' +
  'extension installed and its Site access allowing getjobber.com.';

/**
 * `bridgeErrorInfo` kinds that mean the request never reached the hub. `http`,
 * `edge_blocked` and `unknown` stay on the hub layer: the bridge carried the
 * request, or nothing says it did not.
 */
const BRIDGE_LAYER_KINDS: ReadonlySet<string> = new Set([
  'bridge_down',
  'session_not_ready',
  'timeout',
  'protocol',
  'capability_unavailable',
  'capability_denied',
]);

export function registerHealthcheckTools(server: McpServer, client: JobberClient): void {
  server.registerTool(
    'jobber_healthcheck',
    {
      title: 'Verify the bridge and hub are reachable',
      description:
        'Checks the ContextMint Bridge browser connection and, if a hub is configured, fetches its appointments page. Reports which layer failed and what to do about it. Read-only.',
      annotations: {
        title: 'Verify the bridge and hub are reachable',
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: z.object({}),
    },
    async () => {
      const start = Date.now();

      let bridge: Record<string, unknown> | { error: string };
      try {
        bridge = await client.bridgeStatus();
      } catch (err) {
        return minifiedResult({
          ok: false,
          layer: 'bridge',
          error: messageOf(err),
          hint: BRIDGE_DOWN_HINT,
        });
      }

      if (!client.hubs.configured) {
        return minifiedResult({
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
        return minifiedResult({
          ok: true,
          layer: 'hub',
          elapsed_ms: Date.now() - start,
          bridge,
          appointments_found: appointments.length,
          hint: 'Bridge and Client Hub are both reachable.',
        });
      } catch (err) {
        const error = messageOf(err);
        // status() does not throw for a missing or unpaired extension, so a
        // dead bridge surfaces here, from the fetch. Blame the bridge, with
        // its own remediation, rather than telling the user to re-open a hub
        // link that is fine.
        if (err instanceof JobberBridgeError && BRIDGE_LAYER_KINDS.has(err.kind)) {
          return minifiedResult({
            ok: false,
            layer: 'bridge',
            elapsed_ms: Date.now() - start,
            bridge,
            error,
            hint: err.hint ?? BRIDGE_DOWN_HINT,
          });
        }
        return minifiedResult({
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
