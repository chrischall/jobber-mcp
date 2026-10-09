import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = JSON.parse(
  readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'),
) as Record<string, unknown>;

describe('Claude Code plugin manifest', () => {
  // Claude Code reads the MCP config from `mcpServers`; an `mcp` key is
  // silently ignored and only "works" while the path is the default.
  it('declares its MCP config under mcpServers, not mcp', () => {
    expect(plugin).not.toHaveProperty('mcp');
    expect(typeof plugin['mcpServers']).toBe('string');
  });

  it('points mcpServers at a file that exists', () => {
    expect(existsSync(join(root, plugin['mcpServers'] as string))).toBe(true);
  });
});
