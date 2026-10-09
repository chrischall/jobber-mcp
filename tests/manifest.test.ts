import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { HubRegistry } from '../src/hubs.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

interface UserConfigField {
  type: string;
  title: string;
  description: string;
  sensitive?: boolean;
  required?: boolean;
}

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as {
  server: { mcp_config: { env: Record<string, string> } };
  user_config: Record<string, UserConfigField>;
};
const env = manifest.server.mcp_config.env;
const userConfig = manifest.user_config;

describe('.mcpb manifest', () => {
  // Every hub env var the server reads must be settable from a bundle install,
  // or a user with several providers can only ever configure one of them.
  it.each([
    ['JOBBER_HUB_ID', 'hub_id', true],
    ['JOBBER_HUB_LABEL', 'hub_label', false],
    ['JOBBER_HUBS', 'hubs_json', true],
  ])('maps %s to an optional user_config.%s', (envVar, key, sensitive) => {
    expect(env[envVar]).toBe(`\${user_config.${key}}`);
    const field = userConfig[key];
    expect(field).toBeDefined();
    expect(field?.type).toBe('string');
    expect(field?.required).toBe(false);
    expect(field?.sensitive ?? false).toBe(sensitive);
  });

  it('references only user_config keys that exist', () => {
    for (const value of Object.values(env)) {
      const m = /^\$\{user_config\.([^}]+)\}$/.exec(value);
      if (m) expect(Object.keys(userConfig)).toContain(m[1]);
    }
  });

  // A host that leaves an optional field blank may pass the literal
  // placeholder through; that must read as "unset", not as broken JSON.
  it('boots unconfigured when every hub field is left blank', () => {
    const registry = new HubRegistry({ ...env });
    expect(registry.configured).toBe(false);
    expect(() => registry.resolve()).toThrow(/No Jobber Client Hub configured/);
  });

  it('reads several hubs from the hubs_json field', () => {
    const registry = new HubRegistry({
      JOBBER_HUB_ID: '${user_config.hub_id}',
      JOBBER_HUB_LABEL: '${user_config.hub_label}',
      JOBBER_HUBS: JSON.stringify([
        { label: 'queenbee', hubId: '11111111-1111-1111-1111-111111111111' },
        { label: 'greenworx', hubId: '22222222-2222-2222-2222-222222222222' },
      ]),
    });
    expect(registry.list().map((h) => h.label)).toEqual(['queenbee', 'greenworx']);
  });
});

describe('install surfaces declare the env the server reads', () => {
  // src/hubs.ts reads the three hub keys; src/transport-fetchproxy.ts reads
  // JOBBER_WS_PORT (readPortEnv) and JOBBER_DEBUG_LOG (the bridge debugEnvVar).
  // An install path that does not declare a key leaves its users no way to
  // set it.
  const SERVER_KEYS = [
    'JOBBER_DEBUG_LOG',
    'JOBBER_HUBS',
    'JOBBER_HUB_ID',
    'JOBBER_HUB_LABEL',
    'JOBBER_WS_PORT',
  ];
  const SECRET_KEYS = ['JOBBER_HUBS', 'JOBBER_HUB_ID'];
  const serverJson = JSON.parse(readFileSync(join(root, 'server.json'), 'utf8')) as {
    packages: {
      environmentVariables?: { name: string; isRequired?: boolean; isSecret?: boolean }[];
    }[];
  };
  const serverVars = serverJson.packages.flatMap((p) => p.environmentVariables ?? []);

  it('wires each server key through manifest.json mcp_config.env', () => {
    expect(Object.keys(env).sort()).toEqual(SERVER_KEYS);
  });

  it('backs every ${user_config.*} reference with an optional user_config entry', () => {
    const refs = Object.values(env).flatMap((v) =>
      [...v.matchAll(/\$\{user_config\.([^}]+)\}/g)].map((m) => m[1]!),
    );
    expect(refs.sort()).toEqual(Object.keys(userConfig).sort());
    for (const k of refs) expect(userConfig[k]?.required, k).toBe(false);
  });

  it('declares each server key as optional in server.json, hub ids as secrets', () => {
    for (const k of SERVER_KEYS) {
      expect(serverVars.find((v) => v.name === k), k).toMatchObject({
        isRequired: false,
        isSecret: SECRET_KEYS.includes(k),
      });
    }
  });
});
