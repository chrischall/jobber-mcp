/**
 * `_meta.mint` hints (the mcp-host context-groups contract): which canonical
 * group a tool belongs to, what kind of ask it answers, which argument takes
 * the person's subject, and the everyday words its name and description lack.
 * Inert data to any other client. The shape is the host's, restated here
 * rather than imported: this server takes no dependency on mcp-host.
 *
 * `subject` and `when` name THIS tool's own argument names, never values;
 * `aliases` are lowercase, at most 8, each at most 40 chars.
 */
export type MintIntent =
  | 'whats-new'
  | 'whats-due'
  | 'whats-on'
  | 'lookup'
  | 'turn-on-off'
  | 'send'
  | 'change'
  | 'other';

export interface MintHint {
  domain: 'home';
  intent: MintIntent;
  canonical?: true;
  subject?: string;
  when?: { start: string; end: string };
  aliases?: string[];
}

/** `_meta` for a Jobber tool: every tool here is in the `home` domain. */
export function homeMeta(
  intent: MintIntent,
  extra: Omit<MintHint, 'domain' | 'intent'> = {},
): { mint: MintHint } {
  return { mint: { domain: 'home', intent, ...extra } };
}
