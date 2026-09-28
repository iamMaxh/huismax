# huismax

Personal site. Hono on Cloudflare Workers + static assets, vanilla TS on the client. Free tier only.

```
npm install
cp .dev.vars.example .dev.vars
npm run dev          # http://localhost:8787  (add ?live=1 to any page to fake a live session)
npm run typecheck
npm run deploy       # wrangler deploy (builds the client first)
```

## Layout

```
src/              worker (server-rendered pages + API)
  index.tsx       routes
  lib/live.ts     live status: mock → KV override → env vars
  lib/spotify.ts  Spotify OAuth + now playing / recent (tokens never leave the worker)
  lib/cms.ts      CMS collections, field rules, settings (D1)
  lib/db.ts       applies migrations/ and the first content from inside the worker
  lib/content.ts  what the public pages read (falls back to defaults if D1 is down)
  lib/media.ts    uploaded images in R2: type sniffing, safe keys, /media/<key>
  lib/reply.ts    /reply messages: stored in D1, emailed with Resend
  views/          layout, components, pages
client/           browser code, bundled by scripts/build.mjs into public/assets
  lib/router.ts   same-origin navigation that swaps <main> only (keeps audio playing)
  lib/player.ts   the single global <audio>; spectrum via Web Audio when the source allows CORS
  lib/menu.ts     the Menu overlay
  lib/palette.ts  hidden ⌘K / "/" command palette (easter egg)
  lib/spotify.ts  polls /api/spotify/now, extrapolates progress between polls
  pages/          per-page behaviour
  styles/         tokens → base → layout → components → pages
public/           static files served as-is
```

## Content (CMS)

Everything on the site is edited in `/admin`: homepage text and identities, projects, music sections, photos (photographer and hiking), now, DJ sessions, reply inbox, links, page and menu visibility. Nothing content-related lives in the source.

- Structured content is in D1 (`DB`), photos and DJ covers in R2 (`MEDIA`). Both are created automatically on the first deploy, like the KV namespace. R2 has to be enabled once on the Cloudflare account (R2 → Get started) or the deploy fails.
- The worker applies `migrations/*.sql` itself (tracked in `d1_migrations`, the same table `wrangler d1 migrations apply` uses), then writes the first content once. Migrations only ever add; never edit an applied one, add `0002_….sql` and list it in `src/lib/db.ts`.
- Photos are resized and re-encoded in the browser before upload (which also drops EXIF/GPS). The worker checks the real file type and size and names the files itself. Unpublished photos are only visible to the admin.
- /photographer and /hiking show seven empty frames (NOT 1 … NOT 7) that published photos fill in order.

## Admin, status and live

`/admin` (not linked anywhere, noindex). Password = the `ADMIN_TOKEN` secret.

- **status**: presets (locked in, afk, touching grass…) or any custom text; shown under the identities on the homepage.
- **♪ spotify**: connect once; the site then shows what's playing (or last played) with the album artwork.
- **huismax dj channel**: going live replaces the status with `● LIVE / huismax dj channel` everywhere; ending the session brings the status back.

Status and live are stored in the `STATE` KV namespace (created automatically on first deploy). Public pages poll `GET /api/presence` every 15s, so changes show up within about a minute (KV is eventually consistent across regions).

Scripts / shortcuts can write with `Authorization: Bearer <ADMIN_TOKEN>`:

```
curl -X POST https://<site>/api/live-status -H "Authorization: Bearer $TOKEN" \
  -d '{"isLive":true,"sessionTitle":"late set","streamUrl":"https://…/stream.mp3"}'
curl -X POST https://<site>/api/admin/presence -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"probably coding","listening":{"title":"Japanese Denim","artist":"Daniel Caesar"}}'
```

`GET /api/live-status` stays available on its own. For a real stream later, replace `readSource` in `src/lib/live.ts`.

## Spotify

1. Spotify Developer Dashboard → your app → Settings → Redirect URIs: add `https://huismax.com/api/spotify/callback` (and `http://127.0.0.1:8787/api/spotify/callback` for local dev).
2. `SPOTIFY_CLIENT_ID` is public and lives in `wrangler.jsonc` → `vars`. Cloudflare → the Worker → Settings → Variables and Secrets: add `SPOTIFY_CLIENT_SECRET` as type **Secret** (runtime, not the Build section). `/admin` names any variable the worker can't see.
3. Open `/admin` → ♪ spotify → connect. The refresh token is kept in KV; nothing token-related is ever sent to the browser.

Public endpoints (edge-cached, safe to poll):

- `GET /api/spotify/now` → `{ state: playing | paused | recent | idle | unconfigured | disconnected | error, track? }`, track = name, artists, album, artwork, url, durationMs, progressMs, isPlaying, playedAt.
- `GET /api/spotify/recent` → recently played (deduplicated) + on repeat (top tracks, last 4 weeks).

`/api/spotify/login`, `/api/spotify/disconnect` are admin-only; `/api/spotify/callback` only accepts a one-time state issued by login.

## Reply

`/reply` is a message form. Every message is kept in `/admin` → reply. To also get them by email:

1. resend.com → API Keys → create one. Cloudflare → the Worker → Settings → Variables and Secrets → add a **Secret** `RESEND_API_KEY`.
2. `/admin` → reply → set the address messages go to.

The sender is the `EMAIL_FROM` variable (e.g. `Max <noreply@huismax.com>`, on a domain verified in Resend), or the one set in `/admin`. Without either, Resend's test sender `onboarding@resend.dev` is used, which only delivers to the email of your Resend account. Visitors are rate limited (one a minute, ten a day, keyed by a hash of the IP) and a hidden honeypot field drops bots.

## Deploy from GitHub (Cloudflare dashboard)

Workers & Pages → Create → Import a repository → pick this repo.
Build command: leave empty. Deploy command: `npx wrangler deploy`. Every push to `main` deploys.

Then: the Worker → Settings → Variables and Secrets → add a **Secret** `ADMIN_TOKEN` (your admin password).
