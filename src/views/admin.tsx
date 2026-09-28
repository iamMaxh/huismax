import { raw } from 'hono/html';
import type { Child } from 'hono/jsx';
import { assets } from '../generated/assets';
import type { LiveStatus } from '../lib/live';
import { STATUS_PRESETS, type Presence } from '../lib/presence';
import type { AdminData } from '../lib/admin-data';
import type { PageKeyCms, Settings } from '../lib/cms';

const themeBoot = `try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

// Shows the remembered section before the module script runs, so the page doesn't flash every section.
const sectionBoot = `(function(){var k=location.hash.slice(1);if(/[?&]spotify=/.test(location.search))k='status';try{k=k||localStorage.getItem('admin:section')||''}catch(e){}var s=document.querySelector('[data-section="'+k.replace(/[^a-z-]/g,'')+'"]')||document.querySelector('[data-section]');if(!s)return;s.classList.add('is-active');var a=document.querySelector('[data-nav="'+s.dataset.section+'"]');if(a)a.setAttribute('aria-current','true')})()`;

const Shell = ({ title, children }: { title: string; children: Child }) => (
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
        <button type="submit" class="a-btn a-btn-solid a-btn-lg">enter →</button>
        {error && <p class="mono login-error" role="alert">{error}</p>}
      </form>
      {/* keep a deep link (/admin#dj): the fragment rides through the 303 back to /admin */}
      <script>{raw("document.querySelector('.login-form').action+=location.hash")}</script>
    </main>
  </Shell>
);

type SpotifyInfo = {
  configured: boolean;
  setup: { missing: string[]; similar: string[] };
  user: string | null;
  notice: string | null;
  redirectUri: string;
};

const spotifyNotice: Record<string, string> = {
  connected: 'connected.',
  unconfigured: 'add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET as secrets first.',
  failed: 'could not connect. check the redirect URI below is added in the Spotify dashboard.',
  access_denied: 'cancelled on Spotify.',
  cancelled: 'cancelled.',
};

const SECTIONS = ['status', 'home', 'music', 'photography', 'hiking', 'now', 'dj', 'reply', 'site'] as const;
type SectionKey = (typeof SECTIONS)[number];

/** Public page each section edits, and the settings key that can hide it. */
const PAGE_OF: Partial<Record<SectionKey, { href: string; key?: PageKeyCms }>> = {
  home: { href: '/' },
  music: { href: '/music', key: 'music' },
  photography: { href: '/photographer', key: 'photographer' },
  hiking: { href: '/hiking', key: 'hiking' },
  now: { href: '/now', key: 'now' },
  dj: { href: '/dj', key: 'dj' },
  reply: { href: '/reply', key: 'reply' },
};

const PAGE_LABELS: Record<PageKeyCms, string> = {
  photographer: 'photographer',
  dj: 'dj',
  hiking: 'hiking',
  'vibe-coder': 'vibe coder',
  music: 'music',
  now: 'now',
  reply: 'reply',
};

const ext = { target: '_blank', rel: 'noopener noreferrer' };

const Section = ({ id, settings, note, children }: { id: SectionKey; settings?: Settings; note?: Child; children: Child }) => {
  const page = PAGE_OF[id];
  const hidden = page?.key && settings ? !settings.pages[page.key] : false;
  return (
    <section class="admin-section" data-section={id} aria-labelledby={`h-${id}`}>
      <div class="sec-head">
        <h2 class="sec-title" id={`h-${id}`} tabindex={-1}>
          {id}
        </h2>
        {page?.key && (
          <span class="sec-flag mono" data-page-flag={page.key} hidden={!hidden}>
            hidden from visitors
          </span>
        )}
        {page && (
          <a class="sec-link mono" href={page.href} {...ext}>
            view page ↗
          </a>
        )}
      </div>
      {note && <p class="sec-note mono dim">{note}</p>}
      {children}
    </section>
  );
};

/* ——— settings form pieces (the client binds them by name) ——— */

const Text = (p: { name: string; label: string; value: string; max?: number; hint?: string; type?: string; required?: boolean; placeholder?: string; wide?: boolean }) => {
  const id = `s-${p.name.replace(/\W/g, '-')}`;
  return (
    <div class={`f${p.wide ? ' f-wide' : ''}`}>
      <label class="f-label mono" for={id}>
        {p.label}
        {p.required ? ' *' : ''}
      </label>
      <input
        class="a-field"
        id={id}
        name={p.name}
        type={p.type ?? 'text'}
        maxlength={p.max}
        value={p.value}
        required={p.required}
        placeholder={p.placeholder}
        autocomplete="off"
        spellcheck={p.type === 'url' || p.type === 'email' ? false : undefined}
      />
      {p.hint && <span class="f-hint mono dim">{p.hint}</span>}
    </div>
  );
};

const Toggle = ({ name, label, checked }: { name: string; label: string; checked: boolean }) => (
  <label class="tog">
    <input type="checkbox" name={name} checked={checked} />
    <span class="tog-track" aria-hidden="true" />
    <span class="tog-text">{label}</span>
  </label>
);

const SettingsForm = ({ label, note, save = true, children }: { label: string; note?: string; save?: boolean; children: Child }) => (
  <form class="panel s-form" data-settings aria-label={label}>
    <span class="panel-label mono">{label}</span>
    {note && <p class="mono dim">{note}</p>}
    <div class="fields">{children}</div>
    <div class="f-actions">
      {save && (
        <button type="submit" class="a-btn a-btn-solid" disabled>
          save
        </button>
      )}
      <span class="f-state mono" data-state aria-live="polite" />
    </div>
  </form>
);

/** Mount point for a collection editor (built by client/admin/collection.ts). */
const Coll = ({ name, label, note }: { name: string; label: string; note?: string }) => (
  <div class="panel coll" data-coll={name} aria-label={label}>
    <div class="coll-head">
      <span class="panel-label mono">{label}</span>
      <span class="coll-count mono dim" data-count />
      <span class="coll-state mono" data-coll-state aria-live="polite" />
      <button type="button" class="a-btn" data-add>
        + add
      </button>
    </div>
    {note && <p class="mono dim coll-note">{note}</p>}
  </div>
);

const NoDb = ({ error }: { error: string | null }) => (
  <p class="admin-warn mono">database not available{error ? `: ${error.replace(/\.$/, '')}` : ''}. status still works; the rest needs D1.</p>
);

/** JSON for a <script type="application/json">: `<` escaped so content can never close the tag. */
const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

export const Admin = ({ live, presence, kv, spotify, data, dbError }: { live: LiveStatus; presence: Presence; kv: boolean; spotify: SpotifyInfo; data: AdminData | null; dbError: string | null }) => {
  const s = data?.settings;
  const unread = data ? data.messages.filter((m) => !m.read).length : 0;
  return (
    <Shell title="admin">
      <div class="admin-top">
        <header class="admin-head">
          <a class="admin-mark" href="/" {...ext}>
            huismax<span class="dim"> / admin</span>
          </a>
          <div class="admin-head-tools mono">
            <span data-save-state class="dim" aria-live="polite">
              all saved
            </span>
            <form method="post" action="/admin/logout">
              <button type="submit" class="a-btn">
                sign out
              </button>
            </form>
          </div>
        </header>
        <nav class="admin-nav mono" aria-label="sections">
          {SECTIONS.map((k) => (
            <a href={`#${k}`} data-nav={k}>
              {k}
              {k === 'reply' && (
                <sup class="nav-badge" data-unread hidden={!unread}>
                  {unread}
                </sup>
              )}
            </a>
          ))}
        </nav>
      </div>

      <main class="admin-main" data-admin data-kv={kv ? 'on' : 'off'}>
        {/* ——— status ——— */}
        <Section id="status">
          {!kv && <p class="admin-warn mono">KV not bound — status changes can’t be saved. See README → Live status.</p>}

          <section class="panel preview" data-prox aria-label="homepage preview">
            <span class="panel-label mono">on the homepage now</span>
            <div class="preview-body" data-preview>
              <p class="preview-state">
                <span class="doing-dot" aria-hidden="true" data-preview-dot hidden={live.isLive || !presence.status} />
                <span data-preview-state />
              </p>
              <p class="preview-sub mono" data-preview-sub />
            </div>
          </section>

          <section class="panel" data-prox aria-label="personal status">
            <span class="panel-label mono">status</span>
            <div class="chips" role="radiogroup" aria-label="presets" data-presets>
              {STATUS_PRESETS.map((p) => (
                <button type="button" class="chip" role="radio" aria-checked={presence.status === p ? 'true' : 'false'} data-preset={p}>
                  {p}
                </button>
              ))}
            </div>
            <div class="a-field-row">
              <input class="a-field" type="text" maxlength={48} placeholder="or write your own — probably coding" value={presence.status} data-status-input aria-label="custom status" />
              <button type="button" class="a-btn a-btn-lg" data-status-clear>
                clear
              </button>
            </div>
          </section>

          <section class="panel" data-prox aria-label="manual now playing">
            <span class="panel-label mono">♪ manual now playing</span>
            <div class="a-field-row">
              <input class="a-field" type="text" maxlength={80} placeholder="track" value={presence.listening?.title ?? ''} data-listen-title aria-label="track" />
              <input class="a-field" type="text" maxlength={80} placeholder="artist" value={presence.listening?.artist ?? ''} data-listen-artist aria-label="artist" />
              <button type="button" class="a-btn a-btn-lg" data-listen-clear>
                clear
              </button>
            </div>
            <p class="mono dim">optional. a line you set by hand, next to your status. empty = hidden.</p>
          </section>

          <section class="panel" data-prox aria-label="spotify" data-spotify-panel>
            <div class="live-row">
              <span class="panel-label mono">♪ spotify</span>
              <span class="mono" data-spotify-state>
                {spotify.user ? `● ${spotify.user}` : spotify.configured ? '○ not connected' : '○ not configured'}
              </span>
            </div>
            <div class="spotify-now" data-spotify-now hidden>
              <img class="spotify-art" alt="" data-spotify-art />
              <div>
                <p data-spotify-track />
                <p class="mono dim" data-spotify-meta />
              </div>
            </div>
            {spotify.notice && <p class={`mono ${spotify.notice === 'connected' ? '' : 'save-err'}`}>{Object.hasOwn(spotifyNotice, spotify.notice) ? spotifyNotice[spotify.notice] : 'could not connect.'}</p>}
            {!spotify.configured && (
              <p class="mono save-err">
                this worker can't see: {spotify.setup.missing.join(', ')}.
                {spotify.setup.similar.length > 0 && <> found instead: {spotify.setup.similar.join(', ')} (names must match exactly).</>}
                {' '}add them under Settings → Variables and Secrets as type Secret, not under Build.
              </p>
            )}
            <div class="a-field-row">
              {spotify.user ? (
                <>
                  <a class="a-btn a-btn-lg" href="/api/spotify/login">
                    reconnect
                  </a>
                  <button type="button" class="a-btn a-btn-lg" data-spotify-disconnect>
                    disconnect
                  </button>
                </>
              ) : (
                <a class={`a-btn a-btn-lg${spotify.configured ? '' : ' is-disabled'}`} href="/api/spotify/login" aria-disabled={spotify.configured ? undefined : 'true'}>
                  connect spotify →
                </a>
              )}
            </div>
            <p class="mono dim">
              redirect URI: <span class="select-all">{spotify.redirectUri}</span>
            </p>
          </section>

          <section class="panel live-panel" data-prox data-live={live.isLive ? 'on' : 'off'} aria-label="dj channel">
            <div class="live-row">
              <span class="panel-label mono">huismax dj channel</span>
              <button type="button" class="switch" role="switch" aria-checked={live.isLive ? 'true' : 'false'} data-live-switch>
                <span class="switch-knob" aria-hidden="true" />
                <span class="switch-label mono" data-live-switch-label>
                  {live.isLive ? '● LIVE' : '○ not live'}
                </span>
              </button>
            </div>
            <div class="a-field-row">
              <input class="a-field" type="text" maxlength={120} placeholder="session title" value={live.sessionTitle ?? ''} data-live-title aria-label="session title" />
              <input class="a-field a-field-wide" type="url" maxlength={300} placeholder="stream url (https://…)" value={live.streamUrl ?? ''} data-live-url aria-label="stream url" />
            </div>
            <p class="mono dim">going live replaces your status at the top of the homepage. it comes back when you end the session.</p>
          </section>
          <p class="admin-foot mono dim">
            <kbd>⌘</kbd> <kbd>↵</kbd> save · status saves on its own
          </p>
        </Section>

        {/* ——— CMS sections ——— */}
        <Section id="home" settings={s}>
          {!s ? (
            <NoDb error={dbError} />
          ) : (
            <>
              <SettingsForm label="top of the page">
                <Text name="headline" label="headline" value={s.headline} max={40} required />
                <Text name="tagline" label="supporting text" value={s.tagline} max={160} hint="optional, under the headline" />
                <Text name="spotifyProfile" label="spotify profile link" type="url" value={s.spotifyProfile} max={300} placeholder="https://open.spotify.com/user/…" wide />
              </SettingsForm>
              <Coll name="identities" label="identities" note="the big list on the homepage. drag or use ↑ ↓ to order." />
              <Coll name="projects" label="vibe coder projects" note="shown on /vibe-coder and the homepage." />
            </>
          )}
        </Section>

        <Section id="music" settings={s} note="now playing and recently played come from spotify on their own. these lists are yours.">
          {!s ? <NoDb error={dbError} /> : <Coll name="music" label="music" />}
        </Section>

        <Section id="photography" settings={s}>
          {!s ? <NoDb error={dbError} /> : <div data-photos="photography" />}
        </Section>

        <Section id="hiking" settings={s}>
          {!s ? <NoDb error={dbError} /> : <div data-photos="hiking" />}
        </Section>

        <Section id="now" settings={s} note="what you're up to. any label you like, in any order.">
          {!s ? <NoDb error={dbError} /> : <Coll name="now" label="now" />}
        </Section>

        <Section id="dj" settings={s} note="published sessions appear on /dj, highest number first. none published → the page keeps its empty state.">
          {!s ? <NoDb error={dbError} /> : <Coll name="dj" label="sessions" note="new sessions start as drafts. save one first, then add a cover." />}
        </Section>

        <Section id="reply" settings={s}>
          {!s || !data ? (
            <NoDb error={dbError} />
          ) : (
            <>
              <section class="panel" aria-label="inbox" data-inbox>
                <div class="coll-head">
                  <span class="panel-label mono">inbox</span>
                  <span class="coll-count mono dim" data-inbox-count />
                  <span class="coll-state mono" data-inbox-state aria-live="polite" />
                  <button type="button" class="a-btn" data-inbox-refresh>
                    refresh
                  </button>
                </div>
              </section>
              <section class="panel" aria-label="email" data-email>
                <div class="live-row">
                  <span class="panel-label mono">email</span>
                  <span class="mono" data-email-ready />
                </div>
                <dl class="kv mono">
                  <dt class="dim">RESEND_API_KEY</dt>
                  <dd>{data.email.resendKey ? 'set' : 'not set'}</dd>
                  <dt class="dim">sends to</dt>
                  <dd data-email-dest />
                </dl>
                <p class="mono dim">
                  add RESEND_API_KEY as a Secret in Cloudflare (Workers → huismax → Settings → Variables and Secrets). with the default sender onboarding@resend.dev, Resend only
                  delivers to your Resend account's own email until you verify a domain. messages are always kept here, even when email is off.
                </p>
              </section>
              <SettingsForm label="where messages go">
                <Text name="replyTo" label="send messages to" type="email" value={s.replyTo} max={200} placeholder="you@example.com" />
                <Text name="replyFrom" label="sender" value={s.replyFrom} max={120} hint="empty = EMAIL_FROM from Cloudflare. name <address> on a domain verified in Resend" />
              </SettingsForm>
            </>
          )}
        </Section>

        <Section id="site" settings={s}>
          {!s ? (
            <NoDb error={dbError} />
          ) : (
            <>
              <SettingsForm label="site">
                <Text name="description" label="short description" value={s.description} max={200} hint="search engines and link previews" wide />
                <Text name="footer" label="footer" value={s.footer} max={80} />
              </SettingsForm>
              <SettingsForm label="menu" note="which pages appear in the header menu. saves on its own." save={false}>
                <div class="toggles f-wide">
                  {(['music', 'dj', 'now', 'reply'] as const).map((k) => (
                    <Toggle name={`nav.${k}`} label={k} checked={s.nav[k]} />
                  ))}
                </div>
              </SettingsForm>
              <SettingsForm label="pages" note="a hidden page is a 404 for visitors. you still see it while signed in. saves on its own." save={false}>
                <div class="toggles f-wide">
                  {(Object.keys(PAGE_LABELS) as PageKeyCms[]).map((k) => (
                    <Toggle name={`pages.${k}`} label={PAGE_LABELS[k]} checked={s.pages[k]} />
                  ))}
                </div>
              </SettingsForm>
              <SettingsForm label="page intros" note="one short line under each page title. also that page's description for search.">
                {(Object.keys(PAGE_LABELS) as PageKeyCms[]).map((k) => (
                  <Text name={`intros.${k}`} label={PAGE_LABELS[k]} value={s.intros[k]} max={240} />
                ))}
              </SettingsForm>
              <Coll name="links" label="links" note="social and external links." />
            </>
          )}
        </Section>
      </main>
      <script>{raw(sectionBoot)}</script>
      <script type="application/json" id="admin-initial" dangerouslySetInnerHTML={{ __html: json({ live, presence, data }) }} />
    </Shell>
  );
};
