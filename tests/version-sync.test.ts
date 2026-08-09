import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { versionSyncTest } from '@chrischall/mcp-utils/test';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };

describe('version sync', () => {
  it('keeps every release-please-marked literal in sync with package.json', () => {
    expect(
      versionSyncTest({ srcDir: join(root, 'src'), pkgPath: join(root, 'package.json') }),
    ).toEqual([]);
  });

  // release-please rewrites these through `extra-files`; a manifest missing
  // from that list drifts silently until a release PR fails CI.
  it.each([
    ['manifest.json', (j: Record<string, any>) => j['version']],
    ['server.json', (j: Record<string, any>) => j['version']],
    ['server.json', (j: Record<string, any>) => j['packages'][0]['version']],
    ['.claude-plugin/plugin.json', (j: Record<string, any>) => j['version']],
    ['.claude-plugin/marketplace.json', (j: Record<string, any>) => j['metadata']['version']],
    ['.claude-plugin/marketplace.json', (j: Record<string, any>) => j['plugins'][0]['version']],
  ])('%s carries the package version', (file, pick) => {
    const json = JSON.parse(readFileSync(join(root, file), 'utf8')) as Record<string, unknown>;
    expect(pick(json)).toBe(pkg.version);
  });

  it('publishes under the scoped name, since bare jobber-mcp is taken on npm', () => {
    const full = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(full['name']).toBe('@chrischall/jobber-mcp');
    expect((full['publishConfig'] as Record<string, unknown>)['access']).toBe('public');
  });

  it('keeps the server.json description within the registry limit', () => {
    const server = JSON.parse(readFileSync(join(root, 'server.json'), 'utf8')) as {
      description: string;
    };
    // mcp-publisher 422s above 100 characters.
    expect(server.description.length).toBeLessThanOrEqual(100);
  });
});
