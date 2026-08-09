# Jobber Client Hub — captured surface

Captured 2026-08-09 against a live signed-in hub (Queen Bee's Pest Solutions).
All shapes below were verified by same-origin `fetch(..., {credentials:'include'})`
inside the signed-in tab — not guessed, not scraped from docs.

> The hub id is a per-vendor UUID and is a **credential** (secret URL). It is
> never committed here; it lives in `.env` as `JOBBER_CLIENT_HUB_ID`.

## Two surfaces — pick the right one

| Surface | Host | Auth | Reachable from Node? |
| --- | --- | --- | --- |
| Developer API | `api.getjobber.com/api/graphql` | OAuth2, registered app | ✅ yes — but **business-owner only** |
| Client Hub | `clienthub.getjobber.com` | secret hub URL + session cookie | ❌ **no** — Cloudflare |

The Developer API is the *seller* surface: it serves the business that runs on
Jobber. A customer receiving quotes and invoices has no app to register and no
account to authorize, so it is unusable from this side despite being the
better-documented one. Confirmed by probe: an unauthenticated query returns
`"The field account ... was hidden because you are unauthenticated"` and a bogus
bearer returns `{"message":"Token not recognized"}` — the identity is accepted,
the account is simply not ours to reach.

## Cloudflare fingerprints the TLS client, not the User-Agent

`clienthub.getjobber.com` returns **403 + `<title>Just a moment...`** to Node and
curl, and keeps returning it when a current Chrome UA and the full browser
`Accept*` header set are supplied. Only a request issued from inside the tab
succeeds. So this is the **fetchproxy archetype**: every read routes through the
signed-in browser session.

Note `clienthub.getjobber.com/api/graphql` is *not* challenged and answers
introspection — but it exposes the same 410-query staff schema as
`api.getjobber.com`, not a client-facing view. It is not a shortcut.

## Routes

All relative to `/client_hubs/<hub-uuid>/`:

| Path | What |
| --- | --- |
| `appointments` | visit list — Today / Upcoming / Past |
| `appointments/<id>` | single visit |
| `invoices` | invoice list |
| `invoices/<id>` | single invoice |
| `quotes` | quote list |
| `work_requests` | requests raised by the customer |
| `work_requests/new` | request form (write) |
| `wallet` | saved payment methods, Jobber Payments context |
| `contact_us` | vendor contact |
| `logout` | ends the session |

## Parsing — two different shapes on one site

**`appointments` embeds JSON.** React islands mount on `div[data-props]`
carrying entity-encoded JSON. Four islands on the page; three carry data, keyed
by `title` (`Today`, `Upcoming`, `Past`), each with an `appointments` array.

```jsonc
// element: div[data-props] -> JSON.parse(attr)
{
  "title": "Upcoming",
  "showMoreURL": "...",           // absent on the "Today" island
  "appointments": [{
    "location":      "string",
    "date":          "string",    // "Jun 28, 2026"
    "weekday":       "string",
    "time":          "string",
    "arrivalWindow": "string|null",
    "canViewTime":   "boolean",
    "url":           "string",    // -> appointments/<id>
    "confirmed":     "boolean|null",
    "duration":      "string|null"
  }]
}
```

**`invoices` / `quotes` / `work_requests` do not.** Their only `data-props`
island is an unrelated referral widget (`{requestUrl, shareMessage,
companyName}`) — a decoy. The records are plain server-rendered cards:

```
a.card-content--link                 -> href = invoices/<id>
  .card-header
    h4.card-headerTitle              -> subject, e.g. "For Services Rendered"
    .card-headerActions              -> number, e.g. "#15313"
  .row.row--tightColumns             -> repeated metadata rows
    .columns                         -> "Sent Mar 23, 2026 | Due Apr 07, 2026"
```

Section state (`Paid`, etc.) comes from the preceding `h3`. There are **no
`<table>` elements** on the invoice list — a table-based parser finds nothing.

## Gotchas already paid for

- **The `data-props` attribute is `data-props`, not `data-react-props`.** The
  latter selects zero elements and yields a silently empty parse.
- **Only appointments use islands.** Writing one island-based parser and
  pointing it at `invoices` returns the referral widget, which parses cleanly
  and contains no invoices — a false green.
- **A browser UA does not clear Cloudflare here.** Do not add UA-spoofing and
  assume it works; assert on `<title>Just a moment` / `_cf_chl_opt` instead.
