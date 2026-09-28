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
  data/           all content (placeholder) — edit these to change the site
  views/          layout, components, pages
client/           browser code, bundled by scripts/build.mjs into public/assets
  lib/router.ts   same-origin navigation that swaps <main> only (keeps audio playing)
  lib/player.ts   the single global <audio>; spectrum via Web Audio when the source allows CORS
  lib/palette.ts  ⌘K menu
  pages/          per-page behaviour
  styles/         tokens → base → layout → components → pages
public/           static files served as-is
```

## Content

- Photos: `src/data/photos.ts`. Put images in `public/photos/` and set `src: '/photos/xxx.jpg'`. Without `src` a generated placeholder is shown.
- Mixes: `src/data/mixes.ts`. Set `audioUrl` to make a mix playable in the global player.
- Runs, projects, music, now: the other files in `src/data/`.

## Live status

`GET /api/live-status` → `{ isLive, label, streamUrl, sessionTitle, startedAt, updatedAt }`. The homepage, DJ page, lab radio, header and bottom bar poll it every 30s.

Simplest: set `LIVE`, `LIVE_STREAM_URL`, `LIVE_SESSION_TITLE` in `wrangler.jsonc` (or in the dashboard under Settings → Variables).

Without redeploying (optional, free):

```
npx wrangler kv namespace create STATE        # paste the id into wrangler.jsonc, uncomment kv_namespaces
npx wrangler secret put LIVE_ADMIN_TOKEN
curl -X POST https://<site>/api/live-status -H "Authorization: Bearer <token>" \
  -d '{"isLive":true,"sessionTitle":"late set","streamUrl":"https://…/stream.mp3"}'
curl -X POST https://<site>/api/live-status -H "Authorization: Bearer <token>" -d '{"isLive":false}'
```

The same KV namespace turns on the lab guestbook. For a real stream later, replace `readSource` in `src/lib/live.ts`.

## Deploy from GitHub (Cloudflare dashboard)

Workers & Pages → Create → Import a repository → pick this repo.
Build command: leave empty. Deploy command: `npx wrangler deploy`. Every push to `main` deploys.
