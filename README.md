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
  lib/requests.ts /dj requests for the next live set (D1, published in /admin)
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

Everything on the site is edited in `/admin`: homepage text and identities, projects, music sections, photos (photographer and hiking), now, DJ sessions and requests, reply inbox, links, page and menu visibility. Nothing content-related lives in the source.

- Structured content is in D1 (`DB`), photos and DJ covers in R2 (`MEDIA`). Both are created automatically on the first deploy, like the KV namespace. R2 has to be enabled once on the Cloudflare account (R2 → Get started) or the deploy fails.
- The worker applies `migrations/*.sql` itself (tracked in `d1_migrations`, the same table `wrangler d1 migrations apply` uses), then writes the first content once. Migrations only ever add; never edit an applied one, add the next `000N_….sql` and list it in `src/lib/db.ts`.
- Photos are resized and re-encoded in the browser before upload (which also drops EXIF/GPS). The worker checks the real file type and size and names the files itself. Unpublished photos are only visible to the admin.
- /photographer and /hiking show seven empty frames (NOT 1 … NOT 7) that published photos fill in order.

## Admin, status and live

`/admin` (not linked anywhere, noindex). Password = the `ADMIN_TOKEN` secret.

- **status**: presets (locked in, afk, touching grass…) or any custom text; shown under the identities on the homepage.
- **♪ spotify**: connect once; the site then shows what's playing (or last played) with the album artwork.
- **huismax dj channel**: live replaces the status with `● LIVE / huismax dj channel` everywhere; when it ends the status comes back. The radio makes it live on its own (below); this switch is for any other stream, and its session title also names radio sessions.

Status and live are stored in the `STATE` KV namespace (created automatically on first deploy). Public pages poll `GET /api/presence` every 15s, so changes show up within about a minute (KV is eventually consistent across regions).

Scripts / shortcuts can write with `Authorization: Bearer <ADMIN_TOKEN>`:

```
curl -X POST https://<site>/api/live-status -H "Authorization: Bearer $TOKEN" \
  -d '{"isLive":true,"sessionTitle":"late set","streamUrl":"https://…/stream.mp3"}'
curl -X POST https://<site>/api/admin/presence -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"probably coding","listening":{"title":"Japanese Denim","artist":"Daniel Caesar"}}'
```

`GET /api/live-status` stays available on its own.

## Radio

The DJ channel's own radio is Icecast at radio.huismax.com, fed by BUTT. The site is live while Icecast has the `/live.mp3` mount, so starting BUTT goes live and stopping it ends the session. The site notices within about 15–30 s.

- Browsers play `RADIO_STREAM_URL` (in `wrangler.jsonc` vars) straight from Icecast. The worker never carries audio.
- The worker reads `status-json.xsl` next to the stream (or `RADIO_STATUS_URL`) in `src/lib/radio.ts`. It shares the answer at the edge for 10 s and waits at most 2.5 s. Anything unclear counts as off air.
- `GET /api/dj-status` → `{ live, listeners }`. The DJ page polls it every 15 s for the listener count, and `/api/presence` carries the same live state to every page.
- The stream should send `Access-Control-Allow-Origin: https://huismax.com` (it does). That lets the visualizer read the real audio and lets volume work on iOS. Without it the stream still plays.

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

## DJ requests

`/dj` asks "What should I play next live?". Visitors send a track, artist or vibe (200 characters) and an optional name (40). `POST /api/dj/requests` keeps each one in D1 as a draft. `/admin` → dj → requests lists them newest first. Publish the ones you pick and they show on /dj under "on the list" (the newest 20). Delete the rest.

The same guards as /reply apply:
- only this site's pages can send;
- a honeypot field drops bots;
- one request a minute and five a day per visitor (a hash of the IP, counted apart from /reply);
- 30 an hour site-wide.

Hiding the DJ page in /admin also closes the form.

## Live chat

Max's AI Assistant is an OpenClaw agent (`openclaw/website`) on Max's own server. The browser only ever talks to this site:

```
browser ─POST /api/chat─▶ worker (src/lib/chat.ts) ─https + CHAT_BRIDGE_SECRET─▶ Cloudflare Tunnel
        ─▶ bridge (bridge/, 127.0.0.1:8790, POST /chat only) ─OPENCLAW_GATEWAY_TOKEN─▶ OpenClaw (127.0.0.1:18789)
```

- The worker checks the origin and the question, sends the bridge a hashed visitor id (never the IP) and streams the answer back. It has no OpenClaw token and refuses a bridge URL that isn't https.
- The bridge checks the secret, always asks `openclaw/website`, and adds the gateway token itself. It rate limits per visitor (6 a minute, 100 a day, one answer at a time) and site-wide (4 at once), and it times out slow answers. Visitors get generic errors; the details go to its journal.

Pushing to `main` deploys the new chat, so set up the server side first:

1. **Bridge** (Ubuntu, Node 22+): `openssl rand -hex 32` for the secret, then follow the header of `bridge/chat-bridge.service` (env file: `bridge/chat-bridge.env.example`).
2. **Tunnel**: add one public hostname, e.g. `chat-bridge.huismax.com`, to `http://127.0.0.1:8790` with path `^/chat$`. In a `config.yml` that is:
   ```yaml
   ingress:
     - hostname: chat-bridge.huismax.com
       path: ^/chat$
       service: http://127.0.0.1:8790
     # … existing rules …
     - service: http_status:404
   ```
   Never add a rule for port 18789 or the OpenClaw dashboard.
3. **Worker**: Cloudflare → the Worker → Settings → Variables and Secrets. Add `CHAT_BRIDGE_URL` = `https://chat-bridge.huismax.com/chat` (text) and `CHAT_BRIDGE_SECRET` (**Secret**).
4. **Check** from any machine:
   - `curl -N https://chat-bridge.huismax.com/chat -H "Authorization: Bearer $SECRET" -H 'Content-Type: application/json' -d '{"message":"hi"}'` streams an answer.
   - Without the header it returns 401.
   - On the server, `ss -ltnp | grep -E ':(18789|8790)\b'` lists only `127.0.0.1` / `[::1]`.
5. Merge. Then retire the old `api.huismax.com` chat backend and its tunnel route.

Until step 3 is done, the chat answers "temporarily unavailable" rather than calling anything else. Locally: `npm run bridge` with the env file's variables, and `CHAT_BRIDGE_URL` / `CHAT_BRIDGE_SECRET` in `.dev.vars`.

The `website` agent answers anyone on the internet, so give it no tools that touch the server (shell, files, browser) and no private data.

## Deploy from GitHub (Cloudflare dashboard)

Workers & Pages → Create → Import a repository → pick this repo.
Build command: leave empty. Deploy command: `npx wrangler deploy`. Every push to `main` deploys.

Then: the Worker → Settings → Variables and Secrets → add a **Secret** `ADMIN_TOKEN` (your admin password).
