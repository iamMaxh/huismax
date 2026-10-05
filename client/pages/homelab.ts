import { h } from '../admin/h';
import { $, type Scope } from '../lib/dom';
import { lineChart, sparkline, type ChartData } from '../lib/chart';
import { ago, bytes, date, ofTotal, pct, rate, share, uptime } from '../lib/units';
import type { Container, Health, History, Overview, Range, Server, ServiceStatus } from '../../src/lib/homelab-types';
import type { PageInit } from '../main';

/**
 * /homelab and /homelab/:id. Everything comes from the site's own /api/homelab (the worker asks the Monitoring API,
 * or serves demo data while none is set), polled every 15 s while the page is visible. A failed poll keeps the last
 * picture and says how old it is; refreshes redraw in place, no skeletons after the first load.
 */

const POLL = 15_000;
const HISTORY_POLL = 60_000;
/** the page's own data older than this (its polls failing): say so */
const LATE = 45_000;

type Feed = { data: Overview | null; failed: boolean; at: number };

const MARK: Record<Health, string> = { up: '●', degraded: '▲', down: '×' };
const healthTag = (health: Health) => h('span', { class: 'hl-health mono', 'data-health': health }, h('span', { 'aria-hidden': 'true' }, MARK[health]), ` ${health}`);
const meter = (value: number | null) => {
  const el = h('span', { class: 'hl-meter', 'aria-hidden': 'true' }, h('i'));
  (el.firstChild as HTMLElement).style.transform = `scaleX(${Math.min(1, (value ?? 0) / 100)})`;
  if ((value ?? 0) >= 90) el.classList.add('is-hot');
  return el;
};
const running = (cs: Container[]) => cs.filter((c) => c.state === 'running').length;
const storageTotal = (s: Server) => s.storage.reduce((a, d) => ({ used: a.used + d.used, total: a.total + d.total }), { used: 0, total: 0 });

/** Polls /api/homelab; tells `fn` every time, with the last good data kept through failures. */
function watch(scope: Scope, fn: (f: Feed) => void) {
  let feed: Feed = { data: null, failed: false, at: 0 };
  let timer = 0;
  let alive = true;
  const tick = async () => {
    clearTimeout(timer);
    try {
      const res = await fetch('/api/homelab', { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
      const body = (await res.json().catch(() => null)) as Overview | null;
      feed = res.ok && body && Array.isArray(body.servers) ? { data: body, failed: false, at: Date.now() } : { ...feed, failed: true };
    } catch {
      feed = { ...feed, failed: true };
    }
    if (!alive) return;
    fn(feed);
    if (document.visibilityState === 'visible') timer = window.setTimeout(tick, POLL);
  };
  scope.on(document, 'visibilitychange', () => (document.visibilityState === 'visible' ? tick() : clearTimeout(timer)));
  scope.add(() => ((alive = false), clearTimeout(timer)));
  tick();
  return () => feed;
}

/** The line above everything when the picture isn't live: demo data, the API not answering, or our polls failing. */
function banner(el: HTMLElement, f: Feed) {
  const o = f.data;
  const lines: string[] = [];
  if (o?.source === 'demo') lines.push('demo data · the monitoring API isn’t connected yet, so these servers are made up');
  if (o?.stale) lines.push(`stale · monitoring isn’t answering, this is what it said ${ago(o.fetchedAt)}`);
  if (f.failed && o && Date.now() - f.at > LATE) lines.push(`offline · can’t reach the site right now, last update ${ago(new Date(f.at).toISOString())}`);
  el.hidden = !lines.length;
  el.dataset.tone = o?.stale || f.failed ? 'warn' : 'info';
  el.replaceChildren(...lines.map((l) => h('span', null, l)));
}

const stat = (label: string, value: string, sub = '', fill?: number | null) =>
  h('div', { class: 'hl-stat' }, h('dt', { class: 'mono' }, label), h('dd', null, h('span', { class: 'hl-stat-value' }, value), fill === undefined ? null : meter(fill), sub ? h('span', { class: 'hl-stat-sub mono' }, sub) : null));

function containerTable(rows: (Container & { server?: string })[], withServer: boolean) {
  if (!rows.length) return h('p', { class: 'hl-empty mono' }, 'no containers.');
  const rank = (c: Container) => (c.health === 'unhealthy' || c.state === 'restarting' || c.state === 'dead' ? 0 : c.state === 'running' ? 1 : 2);
  const sorted = [...rows].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const state = (c: Container) => {
    const bad = c.health === 'unhealthy' || c.state === 'restarting' || c.state === 'dead';
    const word = c.health === 'unhealthy' ? 'unhealthy' : c.state;
    return h('span', { class: 'hl-cstate mono', 'data-state': bad ? 'bad' : c.state === 'running' ? 'ok' : 'off' }, h('span', { 'aria-hidden': 'true' }, bad ? '×' : c.state === 'running' ? '●' : '○'), ` ${word}`);
  };
  return h(
    'table',
    { class: 'hl-table' },
    h('thead', null, h('tr', null, h('th', null, 'name'), withServer ? h('th', null, 'server') : null, h('th', { class: 'hl-col-image' }, 'image'), h('th', null, 'state'), h('th', { class: 'hl-num' }, 'cpu'), h('th', { class: 'hl-num' }, 'memory'), h('th', { class: 'hl-col-status' }, 'status'))),
    h(
      'tbody',
      null,
      sorted.map((c) =>
        h(
          'tr',
          null,
          h('td', { class: 'hl-cname' }, c.name),
          withServer ? h('td', { class: 'mono' }, c.server ? h('a', { href: `/homelab/${c.server}` }, c.server) : '') : null,
          h('td', { class: 'hl-col-image mono dim' }, c.image),
          h('td', null, state(c)),
          h('td', { class: 'hl-num mono' }, c.state === 'running' && c.cpu !== null ? `${c.cpu.toFixed(1)}%` : '—'),
          h('td', { class: 'hl-num mono' }, c.memory ? bytes(c.memory) : '—'),
          h('td', { class: 'hl-col-status mono dim' }, c.status || '—'),
        ),
      ),
    ),
  );
}

/* ——— the overview ——— */

function card(s: Server) {
  const st = storageTotal(s);
  const disk = st.total ? (st.used / st.total) * 100 : null;
  // label · value · a sparkline or meter · the detail; without a graphic the value takes its room
  const row = (label: string, value: string, extra: Node | null = null, sub = '') =>
    h('span', { class: `hl-row${extra ? '' : ' is-wide'}` }, h('span', { class: 'hl-row-label mono' }, label), h('span', { class: 'hl-row-value' }, value), extra, h('span', { class: 'hl-row-sub mono' }, sub));
  return h(
    'a',
    { class: 'hl-card', href: `/homelab/${s.id}`, 'data-health': s.health, 'aria-label': `${s.name}, ${s.health}` },
    h('span', { class: 'hl-card-head' }, h('span', { class: 'hl-card-name' }, s.name), healthTag(s.health)),
    h('span', { class: 'hl-card-role mono' }, [s.role, s.system.os].filter(Boolean).join(' · ') || ' '),
    row('cpu', pct(s.cpu.usage), sparkline(s.trend.cpu)),
    row('memory', pct(share(s.memory)), sparkline(s.trend.memory), s.memory ? ofTotal(s.memory.used, s.memory.total) : ''),
    row('storage', pct(disk), meter(disk), st.total ? ofTotal(st.used, st.total) : ''),
    row('network', s.network ? `↓ ${rate(s.network.rx)}` : '—', null, s.network ? `↑ ${rate(s.network.tx)}` : ''),
    h('span', { class: 'hl-card-foot mono' }, `up ${uptime(s.uptime)}`, s.containers.length ? ` · ${running(s.containers)}/${s.containers.length} containers` : ''),
    s.issues.length ? h('span', { class: 'hl-card-issue mono' }, s.issues.join(' · ')) : null,
  );
}

function overviewPage(root: HTMLElement, scope: Scope) {
  const bannerEl = $('[data-hl-banner]', root)!;
  const overall = $('[data-hl-overall]', root)!;
  const verdict = $('[data-hl-verdict]', root)!;
  const meta = $('[data-hl-meta]', root)!;
  const issues = $('[data-hl-issues]', root)!;
  const stats = $('[data-hl-stats]', root)!;
  const grid = $('[data-hl-servers]', root)!;
  const count = $('[data-hl-count]', root)!;
  const table = $('[data-hl-containers]', root)!;
  const ccount = $('[data-hl-ccount]', root)!;

  const paintMeta = (o: Overview) => {
    const cs = o.servers.flatMap((s) => s.containers);
    meta.textContent = [`${o.servers.length} server${o.servers.length === 1 ? '' : 's'}`, cs.length ? `${running(cs)}/${cs.length} containers running` : '', `updated ${ago(o.fetchedAt)}`].filter(Boolean).join(' · ');
  };

  const paint = (f: Feed) => {
    banner(bannerEl, f);
    const o = f.data;
    if (!o) {
      if (!f.failed) return;
      overall.dataset.health = 'down';
      verdict.textContent = 'monitoring is unreachable right now';
      meta.textContent = 'trying again every 15 s';
      grid.replaceChildren(h('p', { class: 'hl-empty mono' }, 'no data yet.'));
      return;
    }
    const s = o.servers;
    overall.dataset.health = o.health;
    const notUp = s.filter((x) => x.health !== 'up').length;
    verdict.textContent = !s.length ? 'no servers reporting' : o.health === 'up' ? 'all systems normal' : o.health === 'down' ? 'no server is reporting' : `${notUp} of ${s.length} servers need a look`;
    paintMeta(o);
    issues.replaceChildren(...s.flatMap((x) => x.issues.map((i) => h('li', null, h('a', { href: `/homelab/${x.id}` }, x.name), ` · ${i}`))));

    // the fleet in six numbers
    const up = s.filter((x) => x.health !== 'down');
    const cpus = up.map((x) => x.cpu.usage).filter((x): x is number => x !== null);
    const mem = up.reduce((a, x) => (x.memory ? { used: a.used + x.memory.used, total: a.total + x.memory.total } : a), { used: 0, total: 0 });
    const disk = s.reduce((a, x) => {
      const t = storageTotal(x);
      return { used: a.used + t.used, total: a.total + t.total };
    }, { used: 0, total: 0 });
    const net = up.reduce((a, x) => ({ rx: a.rx + (x.network?.rx ?? 0), tx: a.tx + (x.network?.tx ?? 0) }), { rx: 0, tx: 0 });
    const cs = s.flatMap((x) => x.containers);
    const fresh = up.filter((x) => x.uptime !== null).sort((a, b) => a.uptime! - b.uptime!)[0];
    const cpuAvg = cpus.length ? cpus.reduce((a, b) => a + b, 0) / cpus.length : null;
    stats.replaceChildren(
      stat('cpu', pct(cpuAvg), cpus.length ? `average of ${cpus.length}` : '', cpuAvg),
      stat('memory', pct(share(mem.total ? mem : null)), mem.total ? ofTotal(mem.used, mem.total) : '', share(mem.total ? mem : null)),
      stat('storage', pct(share(disk.total ? disk : null)), disk.total ? ofTotal(disk.used, disk.total) : '', share(disk.total ? disk : null)),
      stat('network', `↓ ${rate(net.rx)}`, `↑ ${rate(net.tx)}`),
      stat('containers', cs.length ? `${running(cs)}/${cs.length}` : '—', cs.length ? 'running' : ''),
      stat('uptime', fresh ? uptime(fresh.uptime) : '—', fresh ? `shortest · ${fresh.name}` : ''),
    );

    count.textContent = String(s.length);
    grid.replaceChildren(...(s.length ? s.map(card) : [h('p', { class: 'hl-empty mono' }, 'the monitoring API lists no servers.')]));
    ccount.textContent = cs.length ? `${running(cs)}/${cs.length}` : '';
    table.replaceChildren(containerTable(s.flatMap((x) => x.containers.map((c) => ({ ...c, server: x.id }))), true));
  };

  const feed = watch(scope, paint);
  // "updated 8 s ago" keeps counting between polls
  const t = window.setInterval(() => feed().data && paintMeta(feed().data!), 5000);
  scope.add(() => clearInterval(t));
  sites(root, scope);
}

/** The self-hosted sites: up or down, checked by the worker about once a minute. */
function sites(root: HTMLElement, scope: Scope) {
  const els = [...root.querySelectorAll<HTMLElement>('[data-hl-site]')];
  if (!els.length) return;
  const run = async () => {
    try {
      const res = await fetch('/api/homelab/services', { cache: 'no-store' });
      const body = (await res.json()) as { services: ServiceStatus[] };
      for (const st of body.services) {
        const el = els.find((e) => e.dataset.hlSite === st.id);
        const state = el?.querySelector<HTMLElement>('[data-hl-site-state]');
        if (!el || !state) continue;
        el.dataset.up = String(st.up);
        state.textContent = st.up ? `● up${st.ms !== null ? ` · ${st.ms} ms` : ''}` : '× down';
      }
    } catch {
      /* the cards still link out; the state just stays "checking" */
    }
  };
  run();
  const t = window.setInterval(run, 60_000);
  scope.add(() => clearInterval(t));
}

/* ——— one server ——— */

function detailPage(root: HTMLElement, id: string, scope: Scope) {
  const bannerEl = $('[data-hl-banner]', root)!;
  const overall = $('[data-hl-overall]', root)!;
  const verdict = $('[data-hl-verdict]', root)!;
  const meta = $('[data-hl-meta]', root)!;
  const issues = $('[data-hl-issues]', root)!;
  const stats = $('[data-hl-stats]', root)!;
  const nameEl = $('[data-hl-name]', root)!;
  const roleEl = $('[data-hl-role]', root)!;
  const body = $('[data-hl-body]', root)!;
  const storage = $('[data-hl-storage]', root)!;
  const ifaces = $('[data-hl-ifaces]', root)!;
  const table = $('[data-hl-containers]', root)!;
  const ccount = $('[data-hl-ccount]', root)!;
  const sys = $('[data-hl-system]', root)!;

  const paint = (f: Feed) => {
    banner(bannerEl, f);
    const o = f.data;
    if (!o) {
      if (!f.failed) return;
      overall.dataset.health = 'down';
      verdict.textContent = 'monitoring is unreachable right now';
      meta.textContent = 'trying again every 15 s';
      return;
    }
    const s = o.servers.find((x) => x.id === id);
    if (!s) {
      overall.dataset.health = 'down';
      verdict.textContent = `no server called “${id}”`;
      meta.replaceChildren(h('a', { href: '/homelab' }, '← all servers'));
      body.hidden = true;
      return;
    }
    body.hidden = false;
    nameEl.textContent = s.name;
    roleEl.textContent = [s.role, s.system.os].filter(Boolean).join(' · ');
    overall.dataset.health = s.health;
    verdict.textContent = s.health === 'up' ? 'up · all normal' : s.health;
    meta.textContent = `last report ${ago(s.lastSeen)} · up ${uptime(s.uptime)}`;
    issues.replaceChildren(...s.issues.map((i) => h('li', null, i)));

    const load = s.cpu.load ? `load ${s.cpu.load.map((l) => l.toFixed(2)).join(' · ')}` : '';
    stats.replaceChildren(
      stat('cpu', pct(s.cpu.usage), [load, s.cpu.temperature !== null ? `${Math.round(s.cpu.temperature)}°C` : ''].filter(Boolean).join(' · '), s.cpu.usage),
      stat('memory', pct(share(s.memory)), s.memory ? ofTotal(s.memory.used, s.memory.total) : '', share(s.memory)),
      stat('swap', pct(share(s.swap)), s.swap ? ofTotal(s.swap.used, s.swap.total) : 'none', share(s.swap)),
      stat('network', s.network ? `↓ ${rate(s.network.rx)}` : '—', s.network ? `↑ ${rate(s.network.tx)}` : ''),
      stat('containers', s.containers.length ? `${running(s.containers)}/${s.containers.length}` : '—', s.containers.length ? 'running' : 'none'),
      stat('uptime', uptime(s.uptime), s.system.bootTime ? `since ${date(s.system.bootTime)}` : ''),
    );

    storage.replaceChildren(
      ...(s.storage.length
        ? s.storage.map((d) =>
            h(
              'li',
              { class: 'hl-disk' },
              h('span', { class: 'hl-disk-name' }, d.label || d.mount),
              h('span', { class: 'hl-disk-mount mono dim' }, [d.mount, d.fs].filter(Boolean).join(' · ')),
              meter((d.used / d.total) * 100),
              h('span', { class: 'hl-disk-size mono' }, `${ofTotal(d.used, d.total)} · ${pct((d.used / d.total) * 100)}`),
            ),
          )
        : [h('li', { class: 'hl-empty mono' }, 'no disks reported.')]),
    );

    ifaces.replaceChildren(
      s.interfaces.length
        ? h(
            'table',
            { class: 'hl-table' },
            h('thead', null, h('tr', null, h('th', null, 'interface'), h('th', { class: 'hl-num' }, 'in'), h('th', { class: 'hl-num' }, 'out'), h('th', { class: 'hl-num' }, 'speed'), h('th', null, 'link'))),
            h(
              'tbody',
              null,
              s.interfaces.map((n) =>
                h(
                  'tr',
                  null,
                  h('td', { class: 'mono' }, n.name),
                  h('td', { class: 'hl-num mono' }, rate(n.rx)),
                  h('td', { class: 'hl-num mono' }, rate(n.tx)),
                  h('td', { class: 'hl-num mono' }, n.speedMbps ? (n.speedMbps >= 1000 ? `${n.speedMbps / 1000} Gb/s` : `${n.speedMbps} Mb/s`) : '—'),
                  h('td', { class: 'mono' }, n.up === null ? '—' : n.up ? '● up' : '○ down'),
                ),
              ),
            ),
          )
        : h('p', { class: 'hl-empty mono' }, 'no interfaces reported.'),
    );

    ccount.textContent = s.containers.length ? `${running(s.containers)}/${s.containers.length}` : '';
    table.replaceChildren(containerTable(s.containers, false));

    const i = s.system;
    const facts: [string, string][] = [
      ['hostname', i.hostname],
      ['os', i.os],
      ['kernel', i.kernel],
      ['architecture', i.arch],
      ['cpu', i.cpuModel],
      ['cores / threads', i.cores ? `${i.cores}${i.threads ? ` / ${i.threads}` : ''}` : ''],
      ['memory', s.memory ? bytes(s.memory.total) : ''],
      ['virtualization', i.virtualization],
      ['docker', i.docker],
      ['booted', i.bootTime ? date(i.bootTime) : ''],
      ['last report', s.lastSeen ? `${date(s.lastSeen)} (${ago(s.lastSeen)})` : ''],
    ];
    sys.replaceChildren(...facts.filter(([, v]) => v).flatMap(([k, v]) => [h('dt', { class: 'mono' }, k), h('dd', null, v)]));
  };

  const feed = watch(scope, paint);
  const t = window.setInterval(() => {
    const s = feed().data?.servers.find((x) => x.id === id);
    if (s) meta.textContent = `last report ${ago(s.lastSeen)} · up ${uptime(s.uptime)}`;
  }, 5000);
  scope.add(() => clearInterval(t));
  charts(root, id, scope);
}

/** CPU, memory and network over 1h / 24h / 7d. Switching range keeps the charts in place, dimmed until the new data is in. */
function charts(root: HTMLElement, id: string, scope: Scope) {
  const wrap = $('[data-hl-charts]', root)!;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-range]')];
  const note = $('[data-hl-history-note]', root)!;
  const now: Record<string, HTMLElement> = Object.fromEntries([...wrap.querySelectorAll<HTMLElement>('[data-now]')].map((el) => [el.dataset.now!, el]));
  let range: Range = storedRange() ?? '1h';
  let made: { cpu: ReturnType<typeof lineChart>; memory: ReturnType<typeof lineChart>; network: ReturnType<typeof lineChart> } | null = null;
  let timer = 0;
  let asked = 0;

  const label: Record<Range, string> = { '1h': 'last hour', '24h': 'last 24 hours', '7d': 'last 7 days' };
  const pctFmt = (v: number) => `${v.toFixed(1)}%`;
  const pctAxis = (v: number) => `${Math.round(v)}%`;
  const rateAxis = (v: number) => rate(v).replace('/s', '');

  const draw = (hist: History) => {
    const times = hist.points.map((p) => p.t);
    const d = (key: 'cpu' | 'memory'): ChartData => ({ times, series: [{ label: key, values: hist.points.map((p) => p[key]) }], max: 100, format: pctFmt, axis: pctAxis, name: `${key}, ${label[range]}` });
    const net: ChartData = {
      times,
      series: [
        { label: 'in', values: hist.points.map((p) => p.rx) },
        { label: 'out', values: hist.points.map((p) => p.tx), dashed: true },
      ],
      format: rate,
      axis: rateAxis,
      name: `network, ${label[range]}`,
    };
    const lastOf = (k: 'cpu' | 'memory' | 'rx' | 'tx') => [...hist.points].reverse().find((p) => p[k] !== null)?.[k] ?? null;
    now.cpu.textContent = pct(lastOf('cpu'));
    now.memory.textContent = pct(lastOf('memory'));
    const rx = lastOf('rx'), tx = lastOf('tx');
    now.network.textContent = rx === null ? '—' : `↓ ${rate(rx)}  ↑ ${rate(tx ?? 0)}`;
    if (!made) {
      made = {
        cpu: lineChart($('[data-plot="cpu"]', wrap)!, scope, d('cpu')),
        memory: lineChart($('[data-plot="memory"]', wrap)!, scope, d('memory')),
        network: lineChart($('[data-plot="network"]', wrap)!, scope, net),
      };
    } else {
      made.cpu.update(d('cpu'));
      made.memory.update(d('memory'));
      made.network.update(net);
    }
    note.textContent = hist.stale ? `stale · from ${ago(hist.fetchedAt)}` : hist.points.length ? '' : 'no history for this range yet.';
  };

  const load = async () => {
    clearTimeout(timer);
    const mine = ++asked;
    wrap.classList.add('is-loading');
    try {
      const res = await fetch(`/api/homelab/${encodeURIComponent(id)}/history?range=${range}`, { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
      if (mine !== asked) return; // a newer range was asked for meanwhile
      if (res.ok) draw((await res.json()) as History);
      else note.textContent = res.status === 404 ? '' : 'history is unavailable right now.';
    } catch {
      if (mine === asked) note.textContent = 'history is unavailable right now.';
    }
    if (mine !== asked) return;
    wrap.classList.remove('is-loading');
    if (document.visibilityState === 'visible') timer = window.setTimeout(load, HISTORY_POLL);
  };

  const select = (r: Range) => {
    range = r;
    try {
      sessionStorage.setItem('homelab-range', r);
    } catch {
      /* not remembered */
    }
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.range === r));
    load();
  };
  for (const b of buttons) scope.on(b, 'click', () => select(b.dataset.range as Range));
  scope.on(document, 'visibilitychange', () => (document.visibilityState === 'visible' ? load() : clearTimeout(timer)));
  scope.add(() => ((asked = -1), clearTimeout(timer)));
  select(range);
}

/** The range picked last in this tab (it follows you from server to server). */
function storedRange(): Range | null {
  try {
    const r = sessionStorage.getItem('homelab-range');
    return r === '1h' || r === '24h' || r === '7d' ? r : null;
  } catch {
    return null;
  }
}

export const initHomelab: PageInit = (main, scope) => {
  const root = $('[data-homelab]', main);
  if (!root) return;
  if (root.dataset.hlServer) detailPage(root, root.dataset.hlServer, scope);
  else overviewPage(root, scope);
};
