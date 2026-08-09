---
name: jobber-fpx
description: >-
  Read your Jobber Client Hub — the customer portal a service business (pest
  control, lawn care, HVAC, cleaning) uses to send you appointments, quotes and
  invoices — from a shell with the fpx CLI (@fetchproxy/cli), instead of running
  the jobber-mcp server. Use when you want your Jobber data without the MCP, in
  a script, or on a machine where the MCP isn't installed.
---

# Jobber Client Hub via fpx (no MCP)

This reads the **customer** side of Jobber: the hub a business shares with you,
at `clienthub.getjobber.com`. It is not the Jobber Developer API — that one
serves the business running on Jobber and needs an OAuth app you cannot register
as their customer. See `references/why-not-the-api.md`.

`clienthub.getjobber.com` sits behind a Cloudflare managed challenge that
fingerprints the **TLS client**, so plain `curl` and Node get `403 Just a
moment` even with a current Chrome User-Agent and the full browser header set.
`fpx` issues the request from inside your own signed-in tab, which has already
cleared the challenge. There is no server-side path; the bridge is not optional
here.

## One-time setup

```sh
npm install -g @fetchproxy/cli               # provides `fpx`
fpx profile add jobber --domain getjobber.com # fetch capability only — no cookie scope needed
```

The first fetch prints a pair code to **stderr**; approve it in the Transporter
extension popup. Pairing persists — every later call reuses it.

Requirements: the **Transporter** extension installed in Chrome, an open
`clienthub.getjobber.com` tab signed into the hub, and the extension's Chrome
**Site access** allowing `getjobber.com`.

> Only the fetch capability is declared, deliberately. Cookies ride the tab
> automatically, so no cookie scope is needed — and widening scope *after* the
> first approval leaves fetches working on the old grant while the new
> capability errors. Everything this skill does is covered by the grant above.

## Your hub URL is a credential

Each business gives you a **different** hub, identified by a UUID:

```
https://clienthub.getjobber.com/client_hubs/<hub-uuid>/
```

Anyone holding that URL can read the hub, so treat it like a password: keep it
in an env var, never in a committed file or a shell history you share.

Get it from any email that vendor sent you — the "View Details" / "View
Invoice" button — or from the address bar of an open hub tab.

```sh
export JOBBER_HUB='https://clienthub.getjobber.com/client_hubs/<hub-uuid>'
```

One export per business. If two vendors both use Jobber, they are two hubs with
nothing in common; there is no combined view and no account that spans them.

## Core call

Fetch the page, pipe it through the parser, and you have JSON for `jq`:

```sh
PARSE="$(dirname "$0")/references/parse-clienthub.mjs"   # or an absolute path

fpx get -p jobber "$JOBBER_HUB/appointments" \
  | node "$PARSE" appointments \
  | jq '.'
```

The parser is dependency-free — a bare `node` runs it, no install step.

`jq` alone cannot do this job: the hub is server-rendered HTML, and its two page
families store data two different ways (JSON islands for appointments, plain
cards for everything else). The parser hides that split behind one interface.

| Command | Reads |
| --- | --- |
| `node "$PARSE" appointments` | visits — Today / Upcoming / Past |
| `node "$PARSE" invoices` | invoices, with section state (`Paid`, …) |
| `node "$PARSE" quotes` | quotes |
| `node "$PARSE" work_requests` | requests you raised |

Ready-to-run recipes — next visit, unpaid invoices, totals, a single record —
are in `references/recipes.md`.

## Pass the right kind — the failure is silent otherwise

`appointments` reads embedded JSON; the other three read HTML cards. Point the
appointments reader at the invoice page and it finds the page's one island — an
unrelated *referral widget* — which parses cleanly and contains no invoices. It
looks like "you have no invoices" rather than like a bug.

The parser warns on stderr whenever it returns an empty list, for exactly this
reason. An empty result with no warning means the page genuinely had none.

## Exit codes

The parser follows the `fpx` convention, so a pipeline can branch on either:

| Code | Meaning |
| --- | --- |
| `0` | parsed (possibly an empty list — check stderr) |
| `3` | Cloudflare interstitial, not a hub page — the request missed the tab |
| `64` | bad usage (unknown kind) |
| `65` | empty input — the upstream `fpx` call produced nothing |

From `fpx` itself: `2` bridge down, `3` bot wall, `4` upstream non-2xx.

```sh
fpx get -p jobber "$JOBBER_HUB/invoices" > page.html || {
  echo "fpx failed ($?) — is Chrome running with a signed-in hub tab?" >&2; exit 1; }
node "$PARSE" invoices < page.html
```

## What this cannot do

Read-only, by design and by capability:

- **No writes.** Submitting a work request, approving a quote or confirming an
  appointment are form POSTs with CSRF and, on some flows, a Turnstile token
  read from the DOM. `fpx` has no DOM-read verb, so it cannot complete them.
- **No PDF or file downloads.** Invoice and quote PDFs are served as
  `Content-Disposition: attachment`; the bridge does `fetch()`, not navigation,
  so these URLs can only be *resolved* for you to open, never fetched.
- **No payments.** Paying an invoice means entering card or bank details. Never
  automate that — open the hub and do it yourself.
