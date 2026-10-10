# huismax: Dependencies

What huismax depends on, in four layers: packages, the Cloudflare platform, configuration (vars and secrets),
external services, and its own modules (which may import which).

No real secret values appear anywhere in this repository. Names only.

---

## 1. Packages

| Package | Kind | Used for | Where |
| --- | --- | --- | --- |
| `hono` ^4.13 | runtime | routing, middleware, cookies, `hono/jsx` server rendering | `src/` only (never in `client/`) |
| `esbuild` ^0.28 | dev | client bundle (`scripts/build.mjs`), test bundling (`scripts/test.mjs`) | build/test |
| `typescript` ^7 | dev | `npm run typecheck` (`tsconfig.json` = worker, `client/tsconfig.json` = DOM) | build |
| `wrangler` ^4 | dev | `dev`, `deploy`, previews, D1/KV/R2 provisioning | build/deploy |
| `@cloudflare/workers-types` | dev | `Env` binding types | `tsconfig.json` |

Policy:

- **The browser bundle has zero runtime dependencies.** It is vanilla TS + DOM. Adding a client library needs a reason
  in the PR, and it must be bundled (no CDN scripts).
- **The bridge has zero dependencies** (Node 22+ built-ins only). It is deployed by copying files.
- **Tests use `node:test`.** There is no test framework to add.
- A new runtime dependency for the worker must run on Workers (no Node-only APIs) and goes in `dependencies`. Ask
  first if it is large.

Node: 22+ (`scripts/test.mjs` targets `node22`).

---

## 2. Cloudflare platform

Declared in `wrangler.jsonc`. All bindings are **optional in code** (`src/lib/env.ts`), and branch previews get
none (`"previews": {}`).

| Binding | Type | Name in Cloudflare | Used by | Without it |
| --- | --- | --- | --- | --- |
| `ASSETS` | static assets | `./public` | everything (bundle, css, images) | — (required) |
| `DB` | D1 | `huismax-db` | `cms`, `content`, `reply`, `requests`, `db`, `admin-data` | Pages show defaults/fallbacks; forms answer 503; admin CMS answers 501 |
| `STATE` | KV | (auto) | `live`, `presence`, `spotify`, `reply`/`requests` limits, admin login limit, `db` (legacy `mixes`) | No live override, presence or Spotify; rate limits are skipped |
| `MEDIA` | R2 | `huismax-media` | `media`, photos/covers routes, `content.photos` | Galleries empty; uploads answer 501 |
| `caches.default` | Cache API | — | `edgeData`, `radio`, `homelab` cacher, `muse-release` | (always present on Workers; the code also tolerates `caches` being undefined in tests) |

Domains: `huismax.com`, `www.huismax.com` (custom domains, attached on deploy). DNS, Tunnel, Access and other zone
settings are **managed outside this repository**.

---

## 3. Configuration: vars and secrets

Set in `wrangler.jsonc` `vars` (public, committed) or as **Secrets** in Cloudflare → Workers → huismax → Settings →
Variables and Secrets (never committed). `keep_vars: true` keeps dashboard-added vars across deploys. For local dev,
copy `.dev.vars.example` → `.dev.vars` (git-ignored).

| Name | Kind | Read in | Purpose | If unset |
| --- | --- | --- | --- | --- |
| `ADMIN_TOKEN` | **secret** | `auth.ts` | /admin password + API bearer token; signs the `hm_admin` cookie | /admin shows "not set" (503); no admin |
| `SPOTIFY_CLIENT_ID` | var (public by design) | `spotify.ts` | Spotify app id | Spotify `unconfigured` |
| `SPOTIFY_CLIENT_SECRET` | **secret** | `spotify.ts` | Spotify app secret | Spotify `unconfigured` |
| `RESEND_API_KEY` | **secret** | `reply.ts` | Sends /reply messages as email | Messages kept in D1 only |
| `REPLY_TO` | var/secret | `reply.ts` | Fallback destination for /reply email (admin setting `replyTo` wins) | No email |
| `EMAIL_FROM` | var | `reply.ts` | Resend sender (admin setting `replyFrom` wins) | Resend test sender |
| `CHAT_BRIDGE_URL` | var | `chat.ts` | Tunnel address of the bridge (`https://…/chat`) | Chat answers 503 |
| `CHAT_BRIDGE_SECRET` | **secret** | `chat.ts` | Bearer the bridge expects | Chat answers 503 |
| `RADIO_STREAM_URL` | var | `radio.ts`, `live.ts` | Icecast mount browsers play | default `https://radio.huismax.com/live.mp3` |
| `RADIO_STATUS_URL` | var | `radio.ts` | Icecast `status-json.xsl` | next to the stream |
| `MONITORING_API_URL` | var | `homelab.ts` | Monitoring API base (`https://api.huismax.com`) | /homelab demo data |
| `MONITORING_API_TOKEN` | **secret** | `homelab.ts` | Bearer for the Monitoring API, if it needs one | sent without auth |
| `LIVE`, `LIVE_STREAM_URL`, `LIVE_SESSION_TITLE` | var | `live.ts` | Hand "live" switch without KV | not live (unless radio on air) |
| `ALLOW_MOCK` | dev var | `live.ts`, `index.tsx` | Allows `?live=1` / `?mock=` | mocks ignored |
| `PUBLIC_ORIGIN` | dev var | `spotify.ts` redirect, `chat.ts`, `homelab.ts` | Real origin under `wrangler dev` | request origin |
| `SPOTIFY_ACCOUNTS_BASE`, `SPOTIFY_API_BASE`, `LRCLIB_BASE` | test only | `spotify.ts`, `lyrics.ts` | Point at fakes in tests | real services |

**Bridge** (`bridge/chat-bridge.env.example`, on Max's server, not Cloudflare): `CHAT_BRIDGE_SECRET` (same value as
the worker's), `OPENCLAW_GATEWAY_TOKEN` (**never** leaves that server), `OPENCLAW_URL`, `HOST`, `PORT`,
`RATE_PER_MINUTE`, `RATE_PER_DAY`, `MAX_CONCURRENT`, `FIRST_TOKEN_TIMEOUT_MS`, `IDLE_TIMEOUT_MS`, `MAX_DURATION_MS`.

Rules: a new name goes in `Env` + `.dev.vars.example` (placeholder) + this table, with a defined "if unset"
behaviour. Secrets are read only in `src/lib` and never rendered, logged or sent to the browser.

---

## 4. External services

| Service | Address | Called by | Auth | Contract |
| --- | --- | --- | --- | --- |
| Spotify Accounts + Web API | `accounts.spotify.com`, `api.spotify.com` | `spotify.ts` | OAuth (refresh token in KV) | Spotify docs; scopes in `SCOPES` |
| LRCLIB | `lrclib.net` | `lyrics.ts` | none | `lyrics.ts` |
| Resend | `api.resend.com` | `reply.ts` | `RESEND_API_KEY` | `emailMessage` |
| Icecast radio | `radio.huismax.com` | `radio.ts` (status), browser (audio) | none | `parseIcecast` |
| Monitoring API (FastAPI) | `api.huismax.com` | `homelab.ts` / `homelab-api.ts` | optional `MONITORING_API_TOKEN` | [MONITORING_API.md](MONITORING_API.md) |
| Chat bridge → OpenClaw | Cloudflare Tunnel → Max's server | `chat.ts` | `CHAT_BRIDGE_SECRET` | CONTRACTS.md §5 |
| Muse downloads | `download.huismax.com/latest.json`, `github.com/huismaxx/companion/releases` | `muse-release.ts` | none | CONTRACTS.md §10 |
| Self-hosted services (cloud, meet, erp, odoo, status) | `*.huismax.com` | `homelab.checkServices` (GET up-check, no redirects followed) | none | https URLs from the `services` table |

Every outbound call has a timeout and a fallback. Not one of them is called from the browser, except the radio audio
stream and plain links.

---

## 5. Internal module dependencies

### 5.1 Server import graph (who imports whom, `src/`)

```
index.tsx ──▶ views/* ──(types + allowlisted constants)──▶ lib/*
    └──────────────────────────────────────────────────────▶ lib/*

lib/content.ts   ─▶ cms, db
lib/admin-data.ts─▶ cms, reply
lib/requests.ts  ─▶ cms, reply (Limit, rate limits)
lib/reply.ts     ─▶ cms (EMAIL, InputError, Settings)
lib/chat.ts      ─▶ reply (ipBucket)
lib/live.ts      ─▶ radio
lib/homelab.ts   ─▶ homelab-api, homelab-types
lib/db.ts        ─▶ migrations/*.sql (bundled as text)
lib/*            ─▶ env (type)
views/layout.tsx ─▶ generated/assets, views/components/*
```

`cms.ts` is the most-depended-on module: changes there are 🔴 (ARCHITECTURE.md §7.1).

### 5.2 Allowed imports matrix

✅ allowed · ⚠️ type-only or allowlisted · ❌ forbidden (enforced by `test/boundaries.test.ts`)

| from ↓ / to → | `src/lib` | `src/views` | `src/index.tsx` | `client/lib` | `client/pages` | `client/admin` | `bridge` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `src/index.tsx` | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ |
| `src/views` | ⚠️ types + `STATUS_PRESETS`, `MAX_NAME`, `MAX_REQUEST`, `RANGES` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `src/lib` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `client/main.ts` | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| `client/pages` | ⚠️ `import type` from `homelab-types.ts` | ❌ | ❌ | ✅ | ✅ | ⚠️ only `admin/h.ts` (to move in Phase 2) | ❌ |
| `client/lib` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `client/admin.ts`, `client/admin/*` | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| `bridge/*` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (`node:*` only) |

To widen an allowlist, edit `test/boundaries.test.ts` and this table in the same PR, and say why in the PR
description.
