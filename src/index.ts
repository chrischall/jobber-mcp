#!/usr/bin/env node
import { runMcp } from '@chrischall/mcp-utils';
import { JobberClient } from './client.js';
import { JobberFetchproxyTransport } from './transport-fetchproxy.js';
import { registerRecordTools } from './tools/records.js';
import { registerHealthcheckTools } from './tools/healthcheck.js';
import { VERSION } from './version.js';

// Built here, in the caller, so the deferred-config-error pattern holds: with
// no JOBBER_HUB_ID set the server still boots and answers the host's
// install-time tools/list probe, and the missing-config error surfaces on the
// first tool call that actually needs a hub.
const client = new JobberClient({
  transport: new JobberFetchproxyTransport({ version: VERSION }),
});

await runMcp({
  name: 'jobber-mcp',
  version: VERSION,
  banner:
    '[jobber-mcp] This project was developed and is maintained by AI. Use at your own discretion.',
  deps: client,
  tools: [registerRecordTools, registerHealthcheckTools],
});
