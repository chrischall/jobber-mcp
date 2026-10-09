import { describe, expect, it } from 'vitest';
import { JobberClient } from '../src/client.js';
import { HubRegistry } from '../src/hubs.js';
import { registerRecordTools } from '../src/tools/records.js';
import { registerHealthcheckTools } from '../src/tools/healthcheck.js';
import type { JobberTransport } from '../src/transport.js';

/**
 * Fleet annotation meta-test. `destructiveHint` DEFAULTS TO TRUE whenever
 * `readOnlyHint` is false, so a new write that forgets to declare it publishes
 * as destructive and nothing fails — a considered `false` and a forgotten one
 * leave identical annotations. This reads the REGISTERED config, not a
 * hand-kept list, so a new tool cannot skip the decision.
 */
interface Ann {
  readOnlyHint?: unknown;
  destructiveHint?: unknown;
  openWorldHint?: unknown;
}

const stubTransport: JobberTransport = {
  get: async () => ({ status: 200, body: '' }),
  status: async () => ({ role: 'host', port: 37149 }),
};

function registeredAnnotations(): Record<string, Ann | undefined> {
  const seen: Record<string, Ann | undefined> = {};
  const server = {
    registerTool: (name: string, cfg: { annotations?: Ann }) => {
      seen[name] = cfg.annotations;
    },
  } as never;
  const client = new JobberClient({ transport: stubTransport, hubs: new HubRegistry({}) });
  registerRecordTools(server, client);
  registerHealthcheckTools(server, client);
  return seen;
}

describe('every tool is annotated truthfully', () => {
  it('registers the full surface (guards against a registrar being dropped here)', () => {
    expect(Object.keys(registeredAnnotations())).toHaveLength(7);
  });

  it('sets an explicit boolean readOnlyHint and openWorldHint on all of them', () => {
    const missing = Object.entries(registeredAnnotations())
      .filter(([, a]) => typeof a?.readOnlyHint !== 'boolean' || typeof a?.openWorldHint !== 'boolean')
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('sets an explicit boolean destructiveHint on every write', () => {
    const undeclared = Object.entries(registeredAnnotations())
      .filter(([, a]) => a?.readOnlyHint === false && typeof a?.destructiveHint !== 'boolean')
      .map(([name]) => name);
    expect(undeclared).toEqual([]);
  });

  it('never lets a read claim to be destructive', () => {
    const contradictory = Object.entries(registeredAnnotations())
      .filter(([, a]) => a?.readOnlyHint === true && a?.destructiveHint === true)
      .map(([name]) => name);
    expect(contradictory).toEqual([]);
  });

  it('marks only jobber_list_hubs closed-world — it reads local config, the rest reach the hub', () => {
    const closed = Object.entries(registeredAnnotations())
      .filter(([, a]) => a?.openWorldHint !== true)
      .map(([name]) => name);
    expect(closed).toEqual(['jobber_list_hubs']);
  });

  it('is read-only end to end (jobber-mcp has no write tools)', () => {
    const writes = Object.entries(registeredAnnotations())
      .filter(([, a]) => a?.readOnlyHint !== true)
      .map(([name]) => name);
    expect(writes).toEqual([]);
  });
});
