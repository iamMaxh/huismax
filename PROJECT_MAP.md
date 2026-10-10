# huismax: Project map

Where each file lives, which module it belongs to (ARCHITECTURE.md §3), and how risky it is to change.

**Zones:**

- 🟢 **module-owned**: change freely inside a task for that module.
- 🟠 **shared contract**: other modules read it. Additive changes only, and update CONTRACTS.md.
- 🔴 **platform core**: many things depend on it. Change it only when the task is about it, or with a minimal additive
  edit that the PR description calls out. Never two parallel tasks on the same 🔴 file.

---

## 1. Directory tree

```
huismax/
├── wrangler.jsonc            🔴 platform   Worker config: bindings, vars, domains, previews
├── package.json              🔴 platform   scripts: dev · build · deploy · typecheck · test · bridge
├── tsconfig.json             🔴 platform   worker TS (src/, Workers types)
├── .dev.vars.example         🟠 platform   local env names (placeholders only)
├── README.md                 🟢 docs       setup and operations
├── ARCHITECTURE.md · PROJECT_MAP.md · DEPENDENCIES.md · CONTRACTS.md   🟠 docs (this set)
├── SITE_FEATURES.md          🟠 chat       what the AI assistant may tell visitors about the site
├── MONITORING_API.md         🟠 homelab    contract with the Monitoring API
│
├── src/                      SERVER: one Cloudflare Worker
│   ├── index.tsx             🔴 platform   every route, middleware, page(), guards, edge cache, fallbacks (Phase 1 splits it)
│   ├── sql.d.ts              🔴 platform   lets *.sql import as text
│   ├── generated/assets.ts   (generated, git-ignored) hashed bundle names
│   ├── lib/                  L1/L2: contracts and services, env in → data out, no views
│   └── views/                L3: pure hono/jsx rendering, props in → HTML out
│
├── client/                   BROWSER: vanilla TS, bundled by esbuild
│   ├── main.ts               🔴 platform   public bundle entry: page registry, router hooks, global services
│   ├── admin.ts              🔴 admin      admin bundle entry
│   ├── tsconfig.json         🔴 platform   DOM TS
│   ├── lib/                  C1: shared browser services
│   ├── pages/                C2: one PageInit per data-page
│   ├── admin/                C2: /admin UI
│   └── styles/               tokens → base → layout → components → chat → pages/*
│
├── migrations/               🔴 cms        D1 schema, numbered, additive only
├── public/                   static assets (ASSETS binding)
│   ├── _headers              🔴 platform   immutable caching for /assets/*
│   ├── favicon.svg, robots.txt
│   ├── muse/*.webp           🟢 muse       tutorial screenshots
│   └── assets/               (generated, git-ignored) bundles
├── bridge/                   STANDALONE Node 22, runs on Max's server, deployed by hand
├── scripts/                  🔴 platform   build.mjs (client bundle + manifest), test.mjs (esbuild + node:test)
└── test/                     node:test suites (*.test.ts)
```

---

## 2. Server: `src/lib`

| File | Module | Zone | Responsibility |
| --- | --- | --- | --- |
| `env.ts` | platform | 🔴 | `Env` type: every binding, var and secret |
| `auth.ts` | platform/admin | 🔴 | admin cookie, `isAdmin`, `sameOrigin`, password check |
| `cms.ts` | cms | 🔴 | `COLLECTIONS` definitions, validation, CRUD, settings, `PAGE_KEYS`/`NAV_KEYS` |
| `db.ts` | cms | 🔴 | migrations runner (`ensureDb`), first seed, legacy KV import |
| `content.ts` | cms | 🟠 | public read side: never throws, falls back; `Public*` shapes |
| `admin-data.ts` | admin | 🟠 | everything /admin renders with (private) |
| `media.ts` | gallery | 🟠 | R2 image validation, keys, upload, serve |
| `live.ts` | live | 🟠 | `LiveStatus`: radio + hand switch + env |
| `radio.ts` | live | 🟢 | Icecast status (edge-cached) |
| `presence.ts` | live | 🟠 | personal status line, `STATUS_PRESETS` |
| `spotify.ts` | spotify | 🟠 | OAuth, now playing, recent; `Track`, `NowResult`, `RecentResult` |
| `lyrics.ts` | spotify | 🟢 | LRCLIB lookup, LRC parsing |
| `reply.ts` | reply | 🟠 | /reply validation, rate limits (`allowed`, `Limit`, `ipBucket`, also used by dj + chat), email |
| `requests.ts` | dj | 🟢 | DJ song requests |
| `chat.ts` | chat | 🟠 | `/api/chat` → bridge proxy |
| `homelab.ts` | homelab | 🟢 | Monitoring API client, health assessment, demo data, service checks |
| `homelab-api.ts` | homelab | 🟢 | legacy-endpoint adapter (combine, mergeHistory) |
| `homelab-types.ts` | homelab | 🟠 | types shared with the browser (`import type` in `client/pages/homelab.ts`) |
| `muse-release.ts` | muse | 🟢 | which installer /muse offers (latest.json + HEAD check + fallback) |

## 3. Server: `src/views`

| File | Module | Zone | Renders |
| --- | --- | --- | --- |
| `layout.tsx` | platform | 🔴 | `<html>` shell, header/nav, audio bar, chat shell, `site-nav`/`live-initial` islands; `PageKey` |
| `components/site.ts` | platform | 🔴 | menu/palette links, hidden-page logic, `SiteContext`, `PATHS` |
| `components/head.tsx` | platform | 🟠 | page title + intro, the `Data` island helper |
| `components/live.tsx` | live | 🟠 | `LiveMark` |
| `components/listening.tsx` | spotify | 🟠 | now-playing widget markup (`data-listening-*`) |
| `components/audiobar.tsx` | platform | 🟠 | global player markup (`data-player-*`) |
| `pages/home.tsx` | pages-static | 🟢 | `/` |
| `pages/album.tsx` | gallery | 🟢 | `/photographer`, `/hiking` |
| `pages/dj.tsx` | dj | 🟢 | `/dj` |
| `pages/coder.tsx` | pages-static | 🟢 | `/vibe-coder` |
| `pages/music.tsx` | spotify | 🟢 | `/music` |
| `pages/now.tsx` | pages-static | 🟢 | `/now` |
| `pages/reply.tsx` | reply | 🟢 | `/reply` |
| `pages/homelab.tsx` | homelab | 🟢 | `/homelab`, `/homelab/:id` |
| `pages/muse.tsx` | muse | 🟢 | `/muse` |
| `pages/notfound.tsx` | platform | 🟢 | 404 |
| `admin.tsx` | admin | 🟢 | `/admin` + login |

## 4. Client: `client/`

| File | Module | Zone | Role |
| --- | --- | --- | --- |
| `lib/dom.ts` | platform | 🔴 | `$`, `$$`, `Scope`, `readJSON`, `fitCanvas`, `withTransition` |
| `lib/router.ts` | platform | 🔴 | `<main>` swap navigation, prefetch, scroll restore |
| `lib/nav.ts`, `lib/menu.ts`, `lib/palette.ts` | platform | 🟠 | menu overlay, ⌘K palette (read `site-nav`) |
| `lib/theme.ts` | platform | 🟢 | theme toggle |
| `lib/proximity.ts`, `lib/viz.ts`, `lib/chart.ts`, `lib/units.ts` | platform/homelab | 🟢 | effects, canvas charts, number formats |
| `lib/live.ts` | live | 🟠 | polls `/api/live-status` + presence, paints `data-live-*` |
| `lib/audiobar.ts`, `lib/player.ts` | platform | 🟠 | global audio player (live stream + mixes) |
| `lib/spotify.ts`, `lib/listening.ts`, `lib/lyrics.ts` | spotify | 🟠 | Spotify polling store, widget painter, synced lyrics |
| `lib/chat.ts`, `lib/chat-format.ts`, `lib/assistant-api.ts`, `lib/sse.ts` | chat | 🟠 | chat panel, safe formatting, `/api/chat` client, SSE parser |
| `pages/home.ts` | pages-static | 🟢 | homepage effects |
| `pages/album.ts` | gallery | 🟢 | grid/index + lightbox |
| `pages/dj.ts`, `pages/dj-lyrics.ts`, `pages/dj-requests.ts` | dj | 🟢 | console, mixes, request form |
| `pages/coder.ts` | pages-static | 🟢 | project previews |
| `pages/music.ts`, `pages/music-lyrics.ts` | spotify | 🟢 | now playing + lyrics |
| `pages/reply.ts` | reply | 🟢 | contact form |
| `pages/homelab.ts` | homelab | 🟢 | dashboard (imports `admin/h.ts`: allowlisted until Phase 2) |
| `pages/notfound.ts` | platform | 🟢 | 404 effect |
| `admin/api.ts` | admin | 🟠 | **manual mirror** of server types + `api()`/`upload()` |
| `admin/state.ts`, `admin/nav.ts`, `admin/h.ts` | admin | 🟠 | admin store, tabs, element builder |
| `admin/collection.ts`, `form.ts`, `order.ts`, `sortable.ts` | admin | 🟢 | generic collection editor built from `defs` |
| `admin/photos.ts`, `image.ts`, `dj.ts` | admin | 🟢 | uploads (client-side resize), covers |
| `admin/settings.ts`, `status.ts`, `inbox.ts` | admin | 🟢 | settings, live/presence/Spotify panel, messages |
| `styles/tokens.css`, `base.css`, `layout.css`, `components.css` | platform | 🔴 | design tokens and shared components |
| `styles/chat.css` | chat | 🟢 | chat panel |
| `styles/index.css` | platform | 🔴 | import order (add one line per new page) |
| `styles/pages/<page>.css` | that page's module | 🟢 | page-only styles with the page's class prefix |

## 5. Other

| Path | Module | Zone | Notes |
| --- | --- | --- | --- |
| `bridge/chat-bridge.mjs` | chat | 🟠 | the bridge: auth, limits, OpenClaw streaming → SSE |
| `bridge/server.mjs` | chat | 🟢 | starts the bridge, loads its env |
| `bridge/chat-bridge.service`, `chat-bridge.env.example` | chat | 🟢 | systemd unit, settings names |
| `migrations/0001_cms.sql` … `0004_*.sql` | cms | 🔴 | applied; **never edit**, add `0005_*.sql` |
| `test/chat-bridge.test.ts`, `live-chat.test.ts` | chat | 🟢 | |
| `test/homelab.test.ts` | homelab | 🟢 | one clock-dependent case is flaky |
| `test/lyrics.test.ts` | spotify | 🟢 | |
| `test/radio.test.ts` | live | 🟢 | |
| `test/redirect.test.ts` | platform | 🟢 | canonical URL rules |
| `test/requests.test.ts` | dj | 🟢 | |
| `test/muse-release.test.ts` | muse | 🟢 | |
| `test/boundaries.test.ts` | platform | 🔴 | import rules (ARCHITECTURE.md §2) |

---

## 6. Feature → files index

Which files to touch for a change, and the most likely shared file to watch.

| To change… | Touch (🟢 unless noted) | Watch out for |
| --- | --- | --- |
| Homepage text/identities | /admin (data), `views/pages/home.tsx`, `client/pages/home.ts`, `styles/pages/home.css` | identities fallback in `content.ts` 🟠 |
| Galleries | `views/pages/album.tsx`, `client/pages/album.ts`, `styles/pages/album.css` | `media.ts` 🟠, `photo-data` island 🟠 |
| DJ page / requests | `views/pages/dj.tsx`, `client/pages/dj*.ts`, `lib/requests.ts`, `styles/pages/dj.css` | `mix-data` island, `player.ts` 🟠 |
| Live / radio | `lib/live.ts`, `lib/radio.ts`, `client/lib/live.ts` 🟠 | `LiveStatus` shape is read everywhere |
| Spotify / lyrics | `lib/spotify.ts`, `lib/lyrics.ts`, `client/lib/spotify.ts`, `client/pages/music*.ts` | `edgeData` and `LYRICS_VERSION` in `index.tsx` 🔴 |
| Reply form | `views/pages/reply.tsx`, `client/pages/reply.ts`, `lib/reply.ts` 🟠 | `allowed()` is shared with dj + chat |
| Live chat | `client/lib/chat*.ts`, `lib/chat.ts`, `bridge/*`, `styles/chat.css` | protocol frozen (CONTRACTS.md §5); `SITE_FEATURES.md` |
| Homelab | `lib/homelab*.ts`, `views/pages/homelab.tsx`, `client/pages/homelab.ts`, `styles/pages/homelab.css` | `homelab-types.ts` 🟠 (shared with client), MONITORING_API.md |
| Muse | `views/pages/muse.tsx`, `lib/muse-release.ts`, `styles/pages/muse.css`, `public/muse/` | `FALLBACK` version |
| Admin UI | `client/admin/*`, `views/admin.tsx` | `client/admin/api.ts` mirror 🟠 |
| A CMS field | `migrations/000N_*.sql` 🔴 + `cms.ts` 🔴 + `client/admin/api.ts` 🟠 (+ the view that shows it) | additive only |
| Header / menu / nav | `layout.tsx` 🔴, `components/site.ts` 🔴, `client/lib/menu.ts`/`nav.ts` | every page |
| Design tokens | `styles/tokens.css` 🔴 | every page |
| New page | see ARCHITECTURE.md §7.3 | `index.tsx`, `main.ts`, `layout.tsx`, `index.css` 🔴 (additive lines) |
