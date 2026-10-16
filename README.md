# Jobber Client Hub MCP

[![CI](https://github.com/chrischall/jobber-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/chrischall/jobber-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@chrischall/jobber-mcp)](https://www.npmjs.com/package/@chrischall/jobber-mcp)
[![license](https://img.shields.io/npm/l/@chrischall/jobber-mcp)](LICENSE)

A [Model Context Protocol](https://modelcontextprotocol.io) server that connects
Claude to the **Jobber Client Hub** — the customer portal that home-service
businesses (pest control, lawn care, HVAC, cleaning) use to send you
appointments, quotes and invoices.

> [!WARNING]
> **AI-developed project.** This codebase was built and is actively maintained
> by [Claude Code](https://www.anthropic.com/claude). No human has audited the
> implementation. Review all code and tool permissions before use.

## This is the customer side, not the business side

Jobber has two surfaces, and they share nothing:

| | Developer API | Client Hub (**this repo**) |
| --- | --- | --- |
| Serves | the business running on Jobber | that business's customers |
| Auth | OAuth2 app you register | the hub link your provider emailed you |
| Reachable from a server | yes | no — Cloudflare |

If you *run* a business on Jobber, you want the Developer API instead —
[`jobber-mcp`](https://www.npmjs.com/package/jobber-mcp) by justinvogel covers
that surface. This server is for being someone's customer, and the reasoning is
written up in [`skills/jobber-fpx/references/why-not-the-api.md`](skills/jobber-fpx/references/why-not-the-api.md).

## What you can do

- *"When is the exterminator coming next?"*
- *"Do I owe Queen Bee's anything?"*
- *"Show me every invoice they've sent this year."*
- *"What did I ask them to do in my last work request?"*

Read-only, and not by omission — see [Why there are no writes](#why-there-are-no-writes).

## Requirements

- [Claude Desktop](https://claude.ai/download) or [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Node.js](https://nodejs.org) 22 or later
- The **ContextMint Bridge** browser extension, installed from its
  [releases page](https://github.com/nullnet-app/contextmint-bridge/releases)
  (Chrome: load the chrome zip unpacked. Safari isn't available yet — it will
  ship inside the ContextMint app, which has no public download — so use Chrome
  for now), with Site access allowing `getjobber.com`, and a signed-in Client
  Hub tab. ContextMint Bridge is the fetchproxy browser extension under its new
  name, from the same maintainer — fetchproxy's own
  [README](https://github.com/chrischall/fetchproxy#extension) points to it. Its
  source is public at <https://github.com/nullnet-app/contextmint-bridge>: build
  it yourself, or check a release zip against the `.sha256` file published
  beside it (`shasum -a 256 -c contextmint-bridge-chrome-<version>.zip.sha256`).
- A Client Hub link from a provider — the "View Details" button in any of their
  emails

## Setup

```jsonc
{
  "mcpServers": {
    "jobber": {
      "command": "npx",
      "args": ["-y", "@chrischall/jobber-mcp"],
      "env": { "JOBBER_HUB_ID": "<the UUID from your hub URL>" }
    }
  }
}
```

Your hub URL looks like `clienthub.getjobber.com/client_hubs/<UUID>/`. The UUID
is the whole credential — anyone holding it can read the hub — so treat it like
a password.

Several providers, several hubs (there is no combined view):

```jsonc
"env": {
  "JOBBER_HUBS": "[{\"label\":\"queenbee\",\"hubId\":\"…\"},{\"label\":\"greenworx\",\"hubId\":\"…\"}]"
}
```

Then pass `hub: "greenworx"` to any tool. With one hub configured you never
need the argument.

Installed from the `.mcpb` bundle in Claude Desktop, the same three settings
appear as **Client Hub ID**, **Client Hub label** and **Several Client Hubs
(JSON)** — paste the JSON array above into the last one.

| Variable | Meaning |
| --- | --- |
| `JOBBER_HUB_ID` | Single hub UUID |
| `JOBBER_HUB_LABEL` | Name for that hub (default `default`) |
| `JOBBER_HUBS` | JSON array of `{label, hubId}` for several providers. Labels must be unique ignoring case (including the `JOBBER_HUB_ID` hub's label) |
| `JOBBER_WS_PORT` | fetchproxy concentrator port (default `37149` — don't change it) |
| `JOBBER_DEBUG_LOG` | Bridge debug logging to stderr |

## Tools

| Tool | Returns |
| --- | --- |
| `jobber_list_appointments` | Visits, grouped Today / Upcoming / Past |
| `jobber_list_invoices` | Invoices with number, subject and section (`Paid`, `Overdue`, …) |
| `jobber_list_quotes` | Quotes with their approval section |
| `jobber_list_work_requests` | Requests you raised |
| `jobber_read_page` | Readable text of an appointments, invoices, quotes or work-requests page, including detail pages |
| `jobber_list_hubs` | Configured hubs (labels only — never the ids) |
| `jobber_healthcheck` | Which layer is broken: bridge, config, or hub |

`jobber_list_*` keeps each record's metadata rows raw in `details` rather than
forcing a schema. Which rows a card shows depends on its state — an unpaid
invoice carries a balance row a paid one does not — so a fixed schema would
invent fields for some records and drop rows from others.

## Why the browser bridge is not optional

Verified live 2026-08-09: `clienthub.getjobber.com` sits behind a Cloudflare
managed challenge that fingerprints the **TLS client**, not the User-Agent.
curl and Node both get `403` with the `Just a moment` interstitial, and keep
getting it when handed a current Chrome UA and the full browser `Accept*`
header set. The identical request from inside a real tab returns 200.

There is also no JSON API to fall back on: the hub is a server-rendered Rails
app that makes zero API calls to its own origin. `clienthub.getjobber.com/api/graphql`
exists and answers introspection, but it serves the same staff schema as the
Developer API — it is not a client-facing endpoint.

## Hosting on mcp-host

[`mcp-host`](https://github.com/chrischall/mcp-host) can run this server as a
**bridged child**, which is how it reaches claude.ai and phones. The hub pages
are still fetched by your own signed-in browser tab: the ContextMint Bridge
extension pairs with the hosted child over the network, so the Cloudflare
challenge sees your real browser, never the datacenter. Nothing replays a lifted
cookie, which is why the `@fetchproxy/bootstrap` "lift the session once"
pattern is deliberately not used here.

[`mint.yaml`](mint.yaml) carries what a registration needs: register it with
`bridge: true` and give `JOBBER_WS_PORT` as the `bridgePortEnv` (the runner
injects a per-registration concentrator port through it; locally it defaults to
the fleet-shared 37149 via `readPortEnv`), keep `state.dataDir` so the bridge
identity and pairing survive restarts, and leave egress empty, since the
process itself never dials `getjobber.com`.

## Why there are no writes

The hub can submit work requests, approve quotes and pay invoices. None of them
are here:

- Those flows are form POSTs carrying CSRF tokens and, on some paths, a
  Turnstile token read from the DOM. The bridge does `fetch()`, not DOM reads,
  so it cannot complete them — a write tool would fail unpredictably rather
  than work.
- Paying an invoice means handling card or bank details. That belongs in your
  hands, in your browser, not in an agent's tool call.

## Without the MCP

[`skills/jobber-fpx/`](skills/jobber-fpx) does the same reads from a shell with
the [`fpx`](https://www.npmjs.com/package/@fetchproxy/cli) CLI — no server
process. Same bridge, same pages, one command.

## Development

```sh
npm install
npm run build
npm test
```

The suite mocks the network entirely; `tests/server-boot.test.ts` additionally
boots the real built artifacts — including the bundle in a directory with no
`node_modules`, as the `.mcpb` runs — and drives a full `initialize` +
`tools/list` handshake.

## Acknowledgement of terms

**1. This server accesses your own Client Hub.** Every request is dispatched
through your own signed-in browser session via the ContextMint Bridge extension,
reusing the session you already have. It does not — and cannot — reach anyone
else's hub.

**2. [Jobber's Terms of Service](https://getjobber.com/terms-of-service/)
govern your use of this server**, exactly as they govern your direct use of the
hub in a browser. Review them, and stop using this server if your use of it
would not comply.

## License

MIT
