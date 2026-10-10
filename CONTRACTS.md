# huismax: Contracts

Every interface one part of the site relies on from another. If something is listed here, other code depends on it:
change it only **by addition** (ARCHITECTURE.md §7.2), and update this file in the same PR.

Types named in the tables are the source of truth in code. This file says where they live and adds what code can't say
(statuses, caching, who may call).

Contents: [1 Conventions](#1-http-conventions) · [2 Pages](#2-pages) · [3 Public API](#3-public-http-api) ·
[4 Admin API](#4-admin-http-api) · [5 Chat](#5-live-chat-sse-and-the-bridge) · [6 Islands](#6-server--client-json-islands) ·
[7 DOM hooks and client modules](#7-client-contracts-pageinit-scope-dom-hooks) · [8 Service modules](#8-server-service-modules-srclib) ·
[9 Storage](#9-storage-d1-kv-r2-edge-cache) · [10 External](#10-external-contracts) · [11 Versioning](#11-change-rules-and-versioning)

---

## 1. HTTP conventions

| Rule | Detail |
| --- | --- |
| Errors under `/api/*` | Always JSON `{ "error": string }`, including unknown paths (`404 { error: 'not found' }`). The text is safe to show. It never contains secrets or upstream messages. |
| Errors on pages | HTML: `/404` page with status 404. Unhandled error: `500 text/plain "something broke."`. |
| Success shapes | Write endpoints answer `{ ok: true }` or the saved object. Read endpoints answer the object directly (no envelope). |
| Status codes | `400` invalid input · `401` not admin · `403` bad origin · `404` unknown/hidden · `409` stale (lyrics) · `429` rate-limited · `501` binding not connected (admin) · `503` feature offline / upstream down |
| Live data | Polled endpoints answer `Cache-Control: no-store` (the edge cache sits behind them, server-side). |
| Browser writes | Every POST/PUT/PATCH/DELETE must pass `sameOrigin()`: the `Origin` header is absent or equals this site's origin. |
| Admin | `isAdmin()`: cookie `hm_admin` (set by `/admin/login`) **or** `Authorization: Bearer <ADMIN_TOKEN>`. Admin writes check both admin and same-origin (`guard`/`guardDb`); a Bearer call from a script sends no Origin and passes. |
| Hidden pages | A page switched off in /admin → `settings.pages[key] === false` → 404 for visitors, on its page **and** its API (`/api/reply`, `/api/dj/requests`, `/api/homelab*`). Admins still see it. |
| Canonical URL | `www.` → 301 to apex. Trailing slash → 301 without it. `/trail-runner` → `/hiking`, `/lab` → `/reply`. |

---

## 2. Pages

All are `GET` and server-rendered inside `Layout`. **Key** is the value of `data-page` on `<body>` and `<main>`, and
the key in `client/main.ts` `pages`.

| Path | Key | View | Client init | Hideable (`PAGE_KEYS`) | Data |
| --- | --- | --- | --- | --- | --- |
| `/` | `home` | `pages/home.tsx` | `initHome` | no | identities, presence, projects |
| `/photographer` | `photographer` | `pages/album.tsx` | `initAlbum` | yes | `photo-data` |
| `/hiking` | `hiking` | `pages/album.tsx` | `initAlbum` | yes | `photo-data` |
| `/dj` | `dj` | `pages/dj.tsx` | `initDJ` | yes | `mix-data`, published requests |
| `/vibe-coder` | `vibe-coder` | `pages/coder.tsx` | `initCoder` | yes | `project-data` |
| `/music` | `music` | `pages/music.tsx` | `initMusic` | yes | music items |
| `/now` | `now` | `pages/now.tsx` | — | yes | now items |
| `/reply` | `reply` | `pages/reply.tsx` | `initReply` | yes | — |
| `/homelab` | `homelab` | `pages/homelab.tsx` | `initHomelab` | yes | client fetches `/api/homelab*` |
| `/homelab/:id` | `homelab` | `HomelabServer` | `initHomelab` | (with homelab) | |
| `/muse` | `muse` | `pages/muse.tsx` | — | no | `museRelease()` |
| `/404` + any unknown | `not-found` | `pages/notfound.tsx` | `initNotFound` | — | |
| `/admin` | (own document) | `admin.tsx` | `client/admin.ts` | — | `admin-initial` |
| `/media/:key` | — | R2 object | — | — | published media for everyone, drafts for admins only |

Router contract: the client router requests pages with header `X-Router: 1` and swaps only `<main>`. A server page
must therefore put **everything page-specific inside `<main>`** (including its JSON islands), and nothing
page-specific outside it. Links with `data-no-router`, `target`, `download`, or to `/api/*` load normally.

---

## 3. Public HTTP API

| Method & path | Request | 200 response | Other statuses | Caching | Code |
| --- | --- | --- | --- | --- | --- |
| `POST /api/reply` | JSON `{ name?: string≤60, email?: string≤200, message: string≤2000, website?: honeypot }` | `{ ok: true }` | 400, 403, 404 (page hidden), 429, 503 (no D1) | — | `lib/reply.ts` |
| `POST /api/dj/requests` | JSON `{ request: string≤200, name?: string≤40, website? }` | `{ ok: true }` (saved unpublished) | 400, 403, 404, 429, 503 | — | `lib/requests.ts` |
| `POST /api/chat` | JSON `{ message: string≤2000, history?: {role,content}[] (last 8) }` | `text/event-stream` (§5) | JSON `{error}`: 400, 403, 413, 415, 429 (+`Retry-After`), 502, 503, 504 | no-store | `lib/chat.ts` |
| `GET /api/live-status` | — | `LiveStatus` (`lib/live.ts`) | — | no-store | `lib/live.ts` |
| `GET /api/dj-status` | — | `{ live: boolean, listeners: number }` | — | no-store | `lib/radio.ts` |
| `GET /api/presence` | — | `{ live: boolean } & Presence` (`lib/presence.ts`) | — | no-store | `lib/presence.ts` |
| `GET /api/spotify/now` | — | `NowResult & { ageMs: number }` (`lib/spotify.ts`) | — | edge 10 s (playing/paused/recent/idle only), browser no-store | `lib/spotify.ts` |
| `GET /api/spotify/recent` | — | `RecentResult` | — | edge 60 s (state `ok`) | `lib/spotify.ts` |
| `GET /api/spotify/lyrics?id=<22-char track id>` | — | `Lyrics` = `{ state: 'synced'\|'plain'\|'instrumental'\|'none'\|'error', lines: {t,text}[] }` | 400 bad id · **409** `{state:'stale'}` when `id` is not the track now showing | edge 1 day–1 week by state, browser per `LYRICS_BROWSER`; key includes `LYRICS_VERSION` | `lib/lyrics.ts` |
| `GET /api/homelab` | — | `Overview` (`lib/homelab-types.ts`) | 404 hidden · 503 `{error:'monitoring is not answering'}` | edge via `cacher`, browser no-store | `lib/homelab.ts` |
| `GET /api/homelab/services` | — | `{ checkedAt: string, services: ServiceStatus[] }` | 404 | edge 60 s | `lib/homelab.ts` |
| `GET /api/homelab/:id/history?range=1h\|24h\|7d` | `id` matches `SERVER_ID` | `History` | 400, 404, 503 | edge via `cacher` | `lib/homelab.ts` |
| `GET /api/spotify/login` | admin cookie | 302 → Spotify | 302 → `/admin?spotify=…` | — | `lib/spotify.ts` |
| `GET /api/spotify/callback` | `code`, `state` | 302 → `/admin?spotify=connected\|failed\|<error>` | — | — | `lib/spotify.ts` |

`source: 'api' | 'demo'` and `stale` on homelab answers tell the page whether it is showing real or demo data
(no `MONITORING_API_URL` → demo).

---

## 4. Admin HTTP API

Every route below requires admin (§1). The ones marked **D1** also return `501` when `DB` isn't bound, and run
`ensureDb` first. `:name` is a `CollectionName` (`identities | projects | music | now | photos | dj | requests | services | links`).
An unknown name → `404 { error: 'unknown collection' }`. Validation errors → `400 { error }` with a message meant for
the admin. Shapes: `Item` (`lib/cms.ts`), `Settings` (`lib/cms.ts`), `Message` (`lib/reply.ts`).
**Client mirror:** `client/admin/api.ts` (kept in sync by hand until Phase 2).

| Method & path | Body | Response |
| --- | --- | --- |
| `POST /admin/login` | form `password` | 303 → `/admin` + cookie · 401 wrong · 429 after 5 fails / 5 min |
| `POST /admin/logout` | — | 303 → `/admin` |
| `POST /api/live-status` | `{ isLive?: boolean, sessionTitle?: string≤120, streamUrl?: https string≤300 }` | `LiveStatus` · 501 no KV |
| `POST /api/admin/presence` | `{ status?: string≤48, listening?: { title, artist } \| null }` | `Presence` |
| `POST /api/spotify/disconnect` | — | `{ ok: true }` (also purges the Spotify edge cache) |
| `GET /api/admin/c/:name` **D1** | query: filters in `def.filters` (`?album=hiking`, `?kind=artist`) | `Item[]` in the collection's order |
| `POST /api/admin/c/:name` **D1** | fields of `COLLECTIONS[name].fields` (+ flag) | `201 Item` · not for `photos` (use upload) |
| `PUT /api/admin/c/:name/order` **D1** | `{ ids: string[] }` | `{ ok: true }` |
| `PATCH /api/admin/c/:name/:id` **D1** | any subset of fields (+ flag) | `Item` · 404 |
| `DELETE /api/admin/c/:name/:id` **D1** | — | `{ ok: true }` (also deletes its R2 keys) · 404 |
| `POST /api/admin/photos` **D1+R2** | multipart: `image` (≤15 MB jpg/png/webp/avif), `thumb?` (≤3 MB), `width`, `height`, `published` (`'1'`), photo fields | `201 Item` |
| `PUT /api/admin/photos/:id/image` **D1+R2** | multipart: `image`, `thumb?`, `width`, `height` | `Item` |
| `PUT /api/admin/dj/:id/cover` **D1+R2** | multipart: `image` (≤3 MB) | `Item` |
| `DELETE /api/admin/dj/:id/cover` **D1** | — | `Item` |
| `GET /api/admin/settings` **D1** | — | `Settings` (includes private fields: admin only) |
| `PUT /api/admin/settings` **D1** | partial `Settings` | `Settings` |
| `GET /api/admin/messages` **D1** | — | `Message[]` |
| `PATCH /api/admin/messages/:id` **D1** | `{ read: boolean }` | `{ ok: true }` |
| `DELETE /api/admin/messages/:id` **D1** | — | `{ ok: true }` |

---

## 5. Live chat: SSE and the bridge

```
browser (client/lib/assistant-api.ts) ──POST /api/chat──▶ worker (src/lib/chat.ts) ──POST CHAT_BRIDGE_URL──▶ bridge (bridge/chat-bridge.mjs) ──▶ OpenClaw
```

**Browser ↔ worker** (`/api/chat`): request as in §3. A successful answer is `text/event-stream`, with events relayed
unchanged from the bridge:

| event | data | meaning |
| --- | --- | --- |
| `ready` | `{}` | the bridge accepted the question |
| `token` | `{ content: string }` | the next piece of the answer |
| `done` | `{ done: true, model?: string }` | finished |
| `error` | `{ error: string }` | stopped. The client maps it to its own text (`ERROR_TEXT`) and never shows server text. |

Client timeouts: first token 90 s, idle 45 s (`TIMEOUTS`). Aborting the fetch aborts the bridge and OpenClaw.

**Worker ↔ bridge** (`POST <CHAT_BRIDGE_URL>`, path `/chat`):

- headers: `Authorization: Bearer <CHAT_BRIDGE_SECRET>`, `Content-Type: application/json`,
  `Accept: text/event-stream`, `X-Chat-Visitor: <32-hex hash of the IP bucket>`.
- body: `{ message, history }`. Redirects are not followed.
- The bridge answers with the SSE above, or JSON errors. 401 = bad secret, 429 = rate limited (the bridge owns chat
  limits), 400/504 are passed on, and everything else becomes 502/503.
- `CHAT_BRIDGE_URL` must be https (plain http only to localhost during local dev).

Changing this protocol means changing `assistant-api.ts`, `chat.ts`, `chat-bridge.mjs` **and redeploying the bridge
by hand**. Treat it as frozen. Add events, never rename them.

---

## 6. Server → client: JSON islands

`<script type="application/json" id="…">`, escaped by `json()` (`<` → `<`), read with `readJSON<T>(id, root?)`,
which returns `null` on a missing or broken island. Readers must cope with `null`.

| id | Where | Shape | Reader |
| --- | --- | --- | --- |
| `site-nav` | `layout.tsx` (every page, outside `<main>`) | `{ menu: {href,label}[], pages: {href,label}[] }` (never settings) | `client/lib/nav.ts`, `client/lib/chat.ts` |
| `live-initial` | `layout.tsx` | `LiveStatus` (+`label`) | `client/lib/live.ts` |
| `photo-data` | `album.tsx` (in `<main>`) | `PublicPhoto[]` (`lib/content.ts`) | `client/pages/album.ts` |
| `mix-data` | `dj.tsx` (in `<main>`) | `{ id, no, title, audioUrl }[]` (from `PublicSession`) | `client/pages/dj.ts` |
| `project-data` | `coder.tsx` (in `<main>`) | `Project[]` | `client/pages/coder.ts` |
| `admin-initial` | `admin.tsx` | `{ live, presence, data: AdminData \| null }` (**admin page only**: it contains private settings) | `client/admin.ts` |

Page islands are read with `root = main`, so a swapped-in page reads its own copy.

---

## 7. Client contracts: PageInit, Scope, DOM hooks

**Page module** (`client/pages/<x>.ts`):

```ts
export type PageInit = (main: HTMLElement, scope: Scope, nav: (href: string) => void) => void;
```

- It is called once per visit, after the swap. Work only inside `main`. Use `nav(href)` for in-site navigation.
- Register **every** listener, interval, observer, rAF loop and fetch-abort on `scope` (`scope.on`, `scope.loop`,
  `scope.add`). The router calls `scope.dispose()` before the next page. Anything left over is a leak and a bug.
- Never throw out of `init`: a thrown init leaves a half-working page (the white-screen class of bug).
- Register it in `client/main.ts` `pages` under its `data-page` key.

**Shared client services** (`client/lib`), started once in `main.ts`: `startRouter`, `startPalette`, `startMenu`,
`startChat`, `startAudioBar`, `startLivePolling`, `spotify.subscribe`, `proximity`. Pages use them through their
exports, never by reaching into their DOM.

**Global DOM hooks** (any view may put these on elements; the owning client module wires them):

| Hook | Owner | Effect |
| --- | --- | --- |
| `data-page` on body/main | router/main | which `PageInit` runs |
| `data-chat-open` | `lib/chat.ts` | opens the chat panel |
| `data-menu-open`, `data-menu-link`, `data-menu-act` | `lib/menu.ts` | menu |
| `data-nav="<page>"` | layout | current-page marker in the header nav |
| `data-listen-live` | `main.ts` → `audiobar` | plays the live stream |
| `data-live-mark`, `data-live-root`, `data-live-label`, `data-live-session`, `data-live-card` | `lib/live.ts` | live indicators kept in sync by polling |
| `data-presence*` | `lib/live.ts` | presence line |
| `data-listening-*` | `lib/listening.ts` | the now-playing widget |
| `data-player-*`, `data-audiobar`, `data-play-mix` | `lib/audiobar.ts`, `lib/player.ts` | global audio player |
| `data-prox` | `lib/proximity.ts` | pointer-proximity effect |
| `data-reveal`, `data-typewriter` | CSS / page modules | entrance animations |
| `data-no-router` | `lib/router.ts` | forces a full page load |
| `data-route-announcer` | router | screen-reader page announcements |

Page-local hooks (`data-hl-*` homelab, `data-lb-*` lightbox, `data-coll` admin, …) are private to their page module.

**CSS contract:** design tokens (custom properties) live in `client/styles/tokens.css` and are the only shared visual
API. Each page stylesheet uses its own class prefix: `home-`/`index-` home, `lb-`/`frame-` album, `console-`/`mix-` dj,
`p-`/`project-` coder, `np-`/`artist-` music, `now-`, `reply-`, `nf-` 404, `hl-`/`chart-` homelab, `mu-` muse.
New pages pick a new prefix. Don't style another page's prefix.

---

## 8. Server service modules (`src/lib`)

| Rule | Why |
| --- | --- |
| Signature: `fn(env: Env, …args)`. No globals, no module-level state except caches keyed by input. | Testable with a fake `env` (see `test/*.test.ts`) |
| **Public reads never throw.** Return a fallback (`content.ts`, `museRelease`, `getLiveStatus`, `radioStatus`) and `console.error` the cause. | A broken upstream must not take a page down |
| Every binding is optional: check `env.DB` / `env.STATE` / `env.MEDIA` and degrade. | Previews and local dev have none |
| Input validation lives in the service (`validate*`, `cms.validate`) and throws `InputError` / `UploadError`; routes map those to 400. | One rule for every caller |
| Outbound fetches have a timeout (`AbortSignal.timeout`) and an allowlist when the URL comes from data. | No hanging requests, no SSRF |
| Upstream text never reaches a visitor. Map it to our own message. | No leaks |

Public functions each module offers to others (others call **only** these):

| Module file | Public API |
| --- | --- |
| `content.ts` | `settings`, `site`, `items`, `identities`, `requests`, `photos`, `sessions`, `mediaUrl`, types `Site`, `PublicPhoto`, `PublicSession`, `PublicRequest` |
| `cms.ts` | `COLLECTIONS`, `isCollection`, `list/get/create/update/remove/reorder`, `validate`, `getSettings/saveSettings`, `PAGE_KEYS`, `NAV_KEYS`, `PRIVATE_SETTINGS`, `InputError`, `newId`, types |
| `db.ts` | `ensureDb` |
| `auth.ts` | `COOKIE`, `isAdmin`, `sameOrigin`, `checkPassword`, `sessionValue` |
| `live.ts` / `radio.ts` / `presence.ts` | `getLiveStatus`, `setLiveStatus` / `radioStatus`, `radioStreamUrl` / `getPresence`, `setPresence`, `STATUS_PRESETS` |
| `spotify.ts` / `lyrics.ts` | `nowPlaying`, `recent`, `authorizeUrl`, `handleCallback`, `disconnect`, `connectedAs`, `configured`, `setupHints` / `findLyrics` |
| `reply.ts` / `requests.ts` | `validateReply`, `allowed`, `underCap`, `saveMessage`, `emailMessage`, `listMessages`, `ipBucket`, `Limit` / `validateRequest`, `saveRequest`, `underRequestCap`, `REQUEST_LIMIT`, `MAX_NAME`, `MAX_REQUEST` |
| `media.ts` | `readImage`, `putImage`, `deleteKeys`, `serve`, `validKey`, `dim`, `LIMITS`, `UploadError` |
| `chat.ts` | `chat(env, req)` |
| `homelab.ts` (+`homelab-api.ts`, `homelab-types.ts`) | `overview`, `history`, `checkServices`, `cacher`, `SERVER_ID`, types in `homelab-types.ts` |
| `muse-release.ts` | `museRelease()`, `FALLBACK`, type `MuseRelease` |
| `admin-data.ts` | `adminData` (admin only: includes private settings) |

---

## 9. Storage: D1, KV, R2, edge cache

### D1 (`DB`): one owner per table

| Table | Owner | Notes |
| --- | --- | --- |
| `settings` (key, value, updated_at) | `cms.ts` | Site settings as `Settings`. Internal flag `cms.seeded` (`db.ts`). |
| `identities`, `projects`, `music_items`, `now_items`, `links`, `services` | `cms.ts` (`COLLECTIONS`) | flag `visible` |
| `photos` | `cms.ts` + `media.ts` | flag `published` (draft by default); `image_key`/`thumb_key` → R2 |
| `dj_sessions` | `cms.ts` | `number` is unique (enforced in code); `cover_key` → R2 |
| `dj_requests` | `requests.ts` writes, `cms.ts` admin | unpublished until approved |
| `messages` | `reply.ts` | private, admin only |
| `d1_migrations` | `db.ts` | applied migration names (same table `wrangler` uses) |

Every collection table has `id TEXT PK` (12 hex chars from `newId`), `sort_order`, its flag, `created_at`,
`updated_at` (ISO strings). Migrations: `migrations/NNNN_name.sql`, numbered, **additive only**, idempotent
(`IF NOT EXISTS`, `INSERT OR IGNORE`, guarded `UPDATE`). Register new files in `MIGRATIONS` in `db.ts`.

### KV (`STATE`): one owner per key or prefix

| Key | Owner | Value · TTL |
| --- | --- | --- |
| `live` | `live.ts` | `LiveOverride` JSON |
| `presence` | `presence.ts` | `Presence` JSON |
| `spotify:refresh`, `spotify:access`, `spotify:user` | `spotify.ts` | token / `{token,exp}` / display name |
| `spotify:oauth:<state>` | `spotify.ts` | `'1'` · 600 s |
| `<limit.key>:recent:<hash>`, `<limit.key>:day:<hash>` | `reply.ts` `allowed()` | rate limits for `reply` and `request` · 60 s / 1 day |
| `admin:fail:<ip>` | `index.tsx` login | failure count · 300 s |
| `mixes` | `db.ts` (read once, legacy) | pre-CMS DJ mixes, kept as backup |

New features pick a new prefix (`<module>:…`) and add a row here.

### R2 (`MEDIA`)

Keys: `photos/photography/<id>-<rand>[-t].<ext>`, `photos/hiking/…`, `covers/<id>-<rand>.<ext>`
(`validKey` in `media.ts` is the definition). Written only by `media.putImage`, deleted by `media.deleteKeys`,
served only through `/media/:key`.

### Edge cache (`caches.default`)

| Key | Owner | TTL |
| --- | --- | --- |
| `<origin>/api/spotify/now`, `/api/spotify/recent` | `index.tsx` `edgeData` | 10 s / 60 s, good states only |
| `<origin>/api/spotify/lyrics?id=…&v=<LYRICS_VERSION>` | `index.tsx` | by state |
| radio status | `radio.ts` | 10 s |
| homelab keys via `cacher(origin)` | `homelab.ts` | per call |
| `https://huismax.com/__cache/muse-release` | `muse-release.ts` | 300 s |

---

## 10. External contracts

| Service | Direction | Contract lives in | Failure behaviour |
| --- | --- | --- | --- |
| Monitoring API (`MONITORING_API_URL`) | worker → | [MONITORING_API.md](MONITORING_API.md) (`/v1/servers`, with legacy endpoints as fallback) | 503 on the API, page shows "not answering"; unset → demo data |
| Muse release (`download.huismax.com/latest.json`) | worker → | `{ version: "x.y.z", installer_urls: string[] }`, written by Muse Companion's release process; URLs allowlisted in `muse-release.ts` | `FALLBACK` release |
| Icecast (`RADIO_STREAM_URL`, `RADIO_STATUS_URL` = `status-json.xsl`) | worker →, browser streams | `parseIcecast` in `radio.ts` | not live |
| Spotify Web API + Accounts | worker → | `spotify.ts` (scopes `SCOPES`) | `state: 'error' \| 'disconnected' \| 'unconfigured'` |
| LRCLIB | worker → | `lyrics.ts` | `state: 'error'` (cached 2 min) |
| Resend | worker → | `reply.ts` `emailMessage` | message kept in D1 with `emailed = 0` |
| Chat bridge → OpenClaw | worker → tunnel → | §5, `bridge/chat-bridge.mjs` | 503 |

---

## 11. Change rules and versioning

1. **Additive by default.** New optional fields, endpoints, islands, hooks, keys, tables, columns.
2. **Breaking = new name.** Need a different shape? Add `/api/foo2`, field `fooV2`, island `foo-data-v2`, key
   `foo:v2:…`, and keep the old one until every reader has moved (a separate cleanup PR).
3. **Cached answers** whose shape changes bump their version in the cache key (`LYRICS_VERSION` pattern).
4. **Client/server type sharing:** until Phase 2, a change to a shape in §3/§4/§6 must update both the server type
   and its client mirror (`client/admin/api.ts`, page-local types) in the same PR.
5. **Frozen without a coordinated plan:** the chat protocol (§5, needs a manual bridge redeploy), auth cookie name and
   HMAC label, R2 key format, the D1 schema's existing columns, and `latest.json`'s fields.
6. Update this file in the same PR as the change.
