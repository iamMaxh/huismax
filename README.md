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
  lib/mixes.ts    DJ archive, stored in KV and edited from /admin
  data/           static content — edit these to change the site
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

## Content

- Photos: `src/data/photos.ts`. Put images in `public/photos/` and set `src: '/photos/xxx.jpg'`. Without `src` a generated placeholder is shown.
- Mixes: added in `/admin` → dj archive (title + a direct `https://` audio link, e.g. an R2 or any public .mp3 URL). Numbered 001, 002… automatically. With none, /dj says "NO ARCHIVE YET".
- Runs, projects, music (artists), now: the other files in `src/data/`.

## Admin, status and live

`/admin` (not linked anywhere, noindex). Password = the `ADMIN_TOKEN` secret.

- **status**: presets (locked in, afk, touching grass…) or any custom text; shown under the identities on the homepage.
- **♪ spotify**: connect once; the site then shows what's playing (or last played) with the album artwork.
- **huismax dj channel**: going live replaces the status with `● LIVE / huismax dj channel` everywhere; ending the session brings the status back.

Everything is stored in the `STATE` KV namespace (created automatically on first deploy). Public pages poll `GET /api/presence` every 15s, so changes show up within about a minute (KV is eventually consistent across regions).

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

## Deploy from GitHub (Cloudflare dashboard)

Workers & Pages → Create → Import a repository → pick this repo.
Build command: leave empty. Deploy command: `npx wrangler deploy`. Every push to `main` deploys.

Then: the Worker → Settings → Variables and Secrets → add a **Secret** `ADMIN_TOKEN` (your admin password).
