import { raw } from 'hono/html';
import { assets } from '../generated/assets';
import type { LiveStatus } from '../lib/live';
import { STATUS_PRESETS, type Presence } from '../lib/presence';

const themeBoot = `try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

const Shell = ({ title, children }: { title: string; children: any }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex, nofollow" />
      <title>{title} — huismax</title>
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap" />
      <link rel="stylesheet" href={assets.css} />
      <script>{raw(themeBoot)}</script>
      <script type="module" src={assets.admin} />
    </head>
    <body class="admin" data-page="admin">
      {children}
    </body>
  </html>
);

export const AdminLogin = ({ error }: { error?: string }) => (
  <Shell title="admin">
    <main class="admin-login">
      <form method="post" action="/admin/login" class="login-form" data-prox>
        <p class="mono dim">huismax / admin</p>
        <input type="password" name="password" placeholder="password" autocomplete="current-password" required autofocus aria-label="password" />
        <button type="submit" class="btn-primary">enter →</button>
        {error && <p class="mono login-error" role="alert">{error}</p>}
      </form>
    </main>
  </Shell>
);

export const Admin = ({ live, presence, kv }: { live: LiveStatus; presence: Presence; kv: boolean }) => (
  <Shell title="admin">
    <header class="admin-head">
      <a class="wordmark" href="/" target="_blank" rel="noopener">huismax<span class="dim"> / admin</span></a>
      <div class="admin-head-tools mono">
        <span data-save-state class="dim">synced</span>
        <form method="post" action="/admin/logout"><button type="submit" class="btn-line">sign out</button></form>
      </div>
    </header>

    <main class="admin-main" data-admin data-kv={kv ? 'on' : 'off'}>
      {!kv && <p class="admin-warn mono">KV not bound — changes can’t be saved. See README → Live status.</p>}

      {/* what visitors see right now */}
      <section class="panel preview" data-prox aria-label="homepage preview">
        <span class="panel-label mono">on the homepage now</span>
        <div class="preview-body" data-preview>
          <p class="preview-state" data-preview-state />
          <p class="preview-sub mono" data-preview-sub />
        </div>
      </section>

      <section class="panel" data-prox aria-label="status">
        <span class="panel-label mono">status</span>
        <div class="chips" role="radiogroup" aria-label="presets" data-presets>
          {STATUS_PRESETS.map((s) => (
            <button type="button" class="chip" role="radio" aria-checked={presence.status === s ? 'true' : 'false'} data-preset={s}>
              {s}
            </button>
          ))}
        </div>
        <div class="field-row">
          <input class="field" type="text" maxlength={48} placeholder="or write your own — probably coding" value={presence.status} data-status-input aria-label="custom status" />
          <button type="button" class="btn-line" data-status-clear>clear</button>
        </div>
      </section>

      <section class="panel" data-prox aria-label="listening">
        <span class="panel-label mono">♪ listening</span>
        <div class="field-row">
          <input class="field" type="text" maxlength={80} placeholder="track" value={presence.listening?.title ?? ''} data-listen-title aria-label="track" />
          <input class="field" type="text" maxlength={80} placeholder="artist" value={presence.listening?.artist ?? ''} data-listen-artist aria-label="artist" />
          <button type="button" class="btn-line" data-listen-clear>clear</button>
        </div>
      </section>

      <section class="panel live-panel" data-prox data-live={live.isLive ? 'on' : 'off'} aria-label="dj channel">
        <div class="live-row">
          <span class="panel-label mono">huismax dj channel</span>
          <button type="button" class="switch" role="switch" aria-checked={live.isLive ? 'true' : 'false'} data-live-switch>
            <span class="switch-knob" aria-hidden="true" />
            <span class="switch-label mono" data-live-switch-label>{live.isLive ? '● LIVE' : '○ OFF AIR'}</span>
          </button>
        </div>
        <div class="field-row">
          <input class="field" type="text" maxlength={120} placeholder="session title" value={live.sessionTitle ?? ''} data-live-title aria-label="session title" />
          <input class="field field-wide" type="url" maxlength={300} placeholder="stream url (https://…)" value={live.streamUrl ?? ''} data-live-url aria-label="stream url" />
        </div>
        <p class="mono dim">going live replaces your status on the site. it comes back when you end the session.</p>
      </section>

      <p class="admin-foot mono dim">
        <kbd>⌘</kbd> <kbd>↵</kbd> save · changes save on their own
      </p>
    </main>
    <script type="application/json" id="admin-initial" dangerouslySetInnerHTML={{ __html: JSON.stringify({ live, presence }).replace(/</g, '\\u003c') }} />
  </Shell>
);
