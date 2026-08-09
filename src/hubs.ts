/**
 * Client Hub configuration.
 *
 * A Jobber Client Hub is per-provider: each business that serves you shares a
 * different hub, identified by a UUID, and there is no account spanning them.
 * So the server holds a *list* of hubs and every tool takes an optional
 * selector; with one hub configured the selector is never needed.
 *
 * The hub id is a bearer credential — anyone holding the URL can read the hub —
 * so it is read from the environment, never logged, and never echoed back in a
 * tool result.
 */
import { McpToolError, readEnvVar } from '@chrischall/mcp-utils';

export const CLIENT_HUB_ORIGIN = 'https://clienthub.getjobber.com';

export interface Hub {
  /** Short name used to select this hub, e.g. `queenbee`. */
  label: string;
  hubId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Config errors are stored, not thrown.
 *
 * The server must still boot with no hub configured so the host's install-time
 * `tools/list` probe succeeds; the error surfaces on the first tool call that
 * actually needs a hub.
 */
export class HubRegistry {
  private readonly hubs: Hub[] = [];
  private readonly configError: string | undefined;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    try {
      this.hubs = loadHubs(env);
    } catch (err) {
      this.configError = err instanceof Error ? err.message : String(err);
    }
  }

  /** Configured hubs. Labels only — ids are credentials and stay internal. */
  list(): { label: string; isDefault: boolean }[] {
    return this.hubs.map((h, i) => ({ label: h.label, isDefault: i === 0 }));
  }

  get configured(): boolean {
    return this.hubs.length > 0;
  }

  /** Resolve a selector to a hub; the first configured hub is the default. */
  resolve(selector?: string): Hub {
    if (this.configError) throw new McpToolError(this.configError);

    if (this.hubs.length === 0) {
      throw new McpToolError(
        'No Jobber Client Hub configured. Set JOBBER_HUB_ID to the UUID from your ' +
          'hub URL (clienthub.getjobber.com/client_hubs/<UUID>/) — find it in any ' +
          'email your provider sent you. For several providers, set JOBBER_HUBS to a ' +
          'JSON array like [{"label":"queenbee","hubId":"<UUID>"}].',
      );
    }

    if (!selector) return this.hubs[0] as Hub;

    const wanted = selector.trim().toLowerCase();
    const found = this.hubs.find(
      (h) => h.label.toLowerCase() === wanted || h.hubId.toLowerCase() === wanted,
    );
    if (found) return found;

    throw new McpToolError(
      `Unknown hub "${selector}". Configured: ${this.hubs.map((h) => h.label).join(', ')}.`,
    );
  }

  /** Absolute URL for a hub-relative path, e.g. `invoices`. */
  urlFor(hub: Hub, path: string): string {
    const clean = path.replace(/^\/+/, '');
    return `${CLIENT_HUB_ORIGIN}/client_hubs/${hub.hubId}/${clean}`;
  }
}

function loadHubs(env: NodeJS.ProcessEnv): Hub[] {
  const hubs: Hub[] = [];

  const single = readEnvVar('JOBBER_HUB_ID', { env });
  if (single) hubs.push({ label: readEnvVar('JOBBER_HUB_LABEL', { env }) ?? 'default', hubId: single });

  const many = readEnvVar('JOBBER_HUBS', { env });
  if (many) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(many);
    } catch {
      throw new Error('JOBBER_HUBS is not valid JSON. Expected [{"label":"…","hubId":"…"}].');
    }
    if (!Array.isArray(parsed)) {
      throw new Error('JOBBER_HUBS must be a JSON array of {label, hubId} objects.');
    }
    for (const entry of parsed as Record<string, unknown>[]) {
      const label = typeof entry?.['label'] === 'string' ? entry['label'] : undefined;
      const hubId = typeof entry?.['hubId'] === 'string' ? entry['hubId'] : undefined;
      if (!label || !hubId) {
        throw new Error('Every JOBBER_HUBS entry needs a "label" and a "hubId".');
      }
      if (!hubs.some((h) => h.label === label)) hubs.push({ label, hubId });
    }
  }

  for (const h of hubs) {
    // A wrong id is otherwise a 404 through the bridge, which reads like an
    // outage rather than a typo.
    if (!UUID_RE.test(h.hubId)) {
      throw new Error(
        `Hub "${h.label}" has a hubId that is not a UUID. Copy the UUID out of the ` +
          'hub URL: clienthub.getjobber.com/client_hubs/<UUID>/',
      );
    }
  }

  return hubs;
}
