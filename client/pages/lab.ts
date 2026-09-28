import { $, $$, cssVar, fitCanvas, reducedMotion, type Scope } from '../lib/dom';
import { live } from '../lib/live';
import { player } from '../lib/player';
import { readSpectrum } from '../lib/viz';
import { toggleTheme } from '../lib/theme';
import type { PageInit } from '../main';

const ROUTES = ['/', '/photographer', '/dj', '/trail-runner', '/vibe-coder', '/music', '/now', '/lab'];
const UNLOCK_KEY = 'huismax:unlocked';

export const initLab: PageInit = (main, scope, nav) => {
  const started = new Set<string>();
  const starters: Record<string, (panel: HTMLElement) => void> = {
    radio: (p) => radio(p, scope),
    visualizer: (p) => visualizer(p, scope),
    random: (p) => random(p, scope, nav),
    terminal: (p) => terminal(p, scope, nav, unlock),
    guestbook: (p) => guestbook(p, scope),
  };

  const toggle = (item: HTMLElement, open?: boolean) => {
    const btn = $<HTMLButtonElement>('[data-lab-toggle]', item)!;
    const panel = $('.lab-panel', item)!;
    const next = open ?? btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(next));
    panel.hidden = !next;
    item.classList.toggle('open', next);
    const name = item.dataset.exp!;
    if (next && !started.has(name)) {
      started.add(name);
      starters[name]?.(panel);
    }
    if (next && name === 'terminal') $<HTMLInputElement>('[data-term-in]', panel)?.focus();
  };

  scope.on(main, 'click', (e: MouseEvent) => {
    const btn = (e.target as Element).closest('[data-lab-toggle]');
    if (btn) toggle(btn.closest<HTMLElement>('.lab-item')!);
  });

  /* ——— ??? : unlocked by the konami code or `unlock` in the terminal ——— */
  const secret = $('[data-secret]', main)!;
  function unlock() {
    try { localStorage.setItem(UNLOCK_KEY, '1'); } catch {}
    secret.innerHTML = '<p class="secret-big">you found it.</p><p class="mono dim">max was here. so were you.</p>';
    const item = secret.closest<HTMLElement>('.lab-item')!;
    $('.lab-name', item)!.textContent = 'found';
    toggle(item, true);
  }
  try { if (localStorage.getItem(UNLOCK_KEY)) unlock(); } catch {}
  const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let k = 0;
  scope.on(document, 'keydown', (e: KeyboardEvent) => {
    k = e.key === code[k] ? k + 1 : e.key === code[0] ? 1 : 0;
    if (k === code.length) (unlock(), (k = 0));
  });
  $('[data-secret-hint]', main)?.setAttribute('title', '↑↑↓↓←→←→ b a');

  // /lab#terminal opens an experiment directly
  const hashItem = location.hash && $$<HTMLElement>('.lab-item', main).find((i) => `#${i.dataset.exp}` === location.hash);
  if (hashItem) toggle(hashItem, true);
};

/* ——— radio: static that clears as you tune toward the channel ——— */
function radio(panel: HTMLElement, scope: Scope) {
  const dial = $<HTMLInputElement>('[data-dial]', panel)!;
  const freq = $('[data-freq]', panel)!;
  const btn = $<HTMLButtonElement>('[data-static]', panel)!;
  const STATION = 104.3;
  let ctx: AudioContext | null = null, gain: GainNode | null = null, filter: BiquadFilterNode | null = null, src: AudioBufferSourceNode | null = null;

  const update = () => {
    const f = Number(dial.value);
    const near = Math.max(0, 1 - Math.abs(f - STATION) / 1.5);
    freq.textContent = `${f.toFixed(1)} MHz${near > 0.9 ? ' · huismax' : ''}`;
    panel.dataset.tuned = String(near > 0.9);
    if (gain && filter && ctx) {
      gain.gain.setTargetAtTime(0.12 * (1 - near), ctx.currentTime, 0.05);
      filter.frequency.setTargetAtTime(400 + (f - 87.5) * 180, ctx.currentTime, 0.05);
    }
  };
  const stop = () => {
    src?.stop();
    src = null;
    btn.textContent = 'tune static';
  };
  scope.on(btn, 'click', () => {
    if (src) return stop();
    ctx ??= new AudioContext();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    src = Object.assign(ctx.createBufferSource(), { buffer: buf, loop: true });
    filter = Object.assign(ctx.createBiquadFilter(), { type: 'bandpass' as BiquadFilterType });
    filter.Q.value = 0.7;
    gain = ctx.createGain();
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    btn.textContent = 'stop static';
    update();
  });
  scope.on(dial, 'input', update);
  scope.add(() => {
    stop();
    ctx?.close();
  });
  update();
}

/* ——— visualizer: mic, player, or synthetic ——— */
function visualizer(panel: HTMLElement, scope: Scope) {
  const canvas = $<HTMLCanvasElement>('[data-viz-canvas]', panel)!;
  const micBtn = $<HTMLButtonElement>('[data-viz-mic]', panel)!;
  const modeSeg = $('[data-viz-mode]', panel)!;
  const { ctx, size } = fitCanvas(canvas, scope);
  let mode = 'bars';
  let fg = cssVar('--fg');
  scope.on(window, 'themechange', () => (fg = cssVar('--fg')));
  const freq = new Uint8Array(128);
  const wave = new Uint8Array(512);
  let mic: { analyser: AnalyserNode; stream: MediaStream; ac: AudioContext } | null = null;

  scope.on(modeSeg, 'click', (e: MouseEvent) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-mode]');
    if (!b) return;
    mode = b.dataset.mode!;
    $$('button', modeSeg).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });

  scope.on(micBtn, 'click', async () => {
    if (mic) {
      mic.stream.getTracks().forEach((t) => t.stop());
      mic.ac.close();
      mic = null;
      micBtn.textContent = 'use microphone';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ac = new AudioContext();
      const analyser = Object.assign(ac.createAnalyser(), { fftSize: 1024, smoothingTimeConstant: 0.75 });
      ac.createMediaStreamSource(stream).connect(analyser);
      mic = { analyser, stream, ac };
      micBtn.textContent = 'stop microphone';
    } catch {
      micBtn.textContent = 'microphone blocked';
    }
  });
  scope.add(() => {
    mic?.stream.getTracks().forEach((t) => t.stop());
    mic?.ac.close();
  });

  const draw = (t: number) => {
    const { w, h } = size;
    if (mic) {
      mic.analyser.getByteFrequencyData(freq);
      mic.analyser.getByteTimeDomainData(wave);
    } else {
      readSpectrum(freq, t, player.state().status === 'playing' ? 1 : 0.6);
      for (let i = 0; i < wave.length; i++) wave[i] = 128 + Math.sin(i * 0.05 + t * 0.004) * 40 * (freq[(i >> 3) % 64] / 255);
    }
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = ctx.strokeStyle = fg;
    if (mode === 'bars') {
      const n = 64, bw = w / n;
      for (let i = 0; i < n; i++) {
        const v = freq[i] / 255;
        ctx.globalAlpha = 0.3 + v * 0.7;
        ctx.fillRect(i * bw, h - v * h, bw - 2, v * h);
      }
    } else if (mode === 'ring') {
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.22;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      for (let i = 0; i <= 128; i++) {
        const th = (i / 128) * Math.PI * 2;
        const r = R + (freq[i % 64] / 255) * R * 0.9;
        const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    } else {
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      for (let i = 0; i < wave.length; i++) {
        const x = (i / (wave.length - 1)) * w, y = (wave[i] / 255) * h;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
  if (reducedMotion()) draw(0);
  else scope.loop(draw);
}

/* ——— random ——— */
function random(panel: HTMLElement, scope: Scope, nav: (h: string) => void) {
  scope.on($('[data-random-go]', panel)!, 'click', () => {
    const others = ROUTES.filter((r) => r !== location.pathname);
    nav(others[Math.floor(Math.random() * others.length)]);
  });
}

/* ——— terminal ——— */
function terminal(panel: HTMLElement, scope: Scope, nav: (h: string) => void, unlock: () => void) {
  const out = $('[data-term-out]', panel)!;
  const input = $<HTMLInputElement>('[data-term-in]', panel)!;
  const history: string[] = [];
  let hi = 0;
  const pages = ROUTES.map((r) => r.slice(1) || 'home');

  const print = (text: string, cls = '') => {
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = text;
    out.append(line);
    out.scrollTop = out.scrollHeight;
  };

  const cmds: Record<string, (args: string[]) => void> = {
    help: () => print('ls · cd <page> · whoami · live · play · stop · now · theme · date · echo · clear · unlock'),
    ls: () => print(pages.join('   ')),
    cd: ([p]) => {
      const page = (p ?? '').replace(/^\//, '');
      if (!page || page === '~' || page === 'home') return nav('/');
      if (pages.includes(page)) nav('/' + page);
      else print(`cd: no such page: ${p}`, 'err');
    },
    whoami: () => print('photographer · dj · trail runner · vibe coder'),
    live: () => {
      const s = live.get();
      print(s.isLive ? `● LIVE — ${s.sessionTitle ?? 'huismax dj channel'}` : 'not live right now. archive → cd dj');
    },
    play: () => {
      const s = live.get();
      if (!s.isLive) return print('not live right now. archive → cd dj', 'err');
      player.play({ kind: 'live', id: 'live', title: s.sessionTitle ?? 'huismax dj channel', url: s.streamUrl });
      print('tuning in…');
    },
    stop: () => (player.stop(), print('stopped.')),
    now: async () => {
      const html = await fetch('/now').then((r) => r.text());
      const doc = new DOMParser().parseFromString(html, 'text/html');
      $$('.now-item', doc).forEach((el) => print(`${$('dt', el)?.textContent?.padEnd(10)} ${$('dd', el)?.textContent}`));
    },
    theme: () => print(`theme → ${toggleTheme()}`),
    date: () => print(new Date().toString()),
    echo: (a) => print(a.join(' ')),
    clear: () => (out.innerHTML = ''),
    unlock: () => (print('…'), unlock()),
    sudo: () => print('nice try.', 'err'),
    exit: () => nav('/'),
  };

  const run = (raw: string) => {
    print(`max@huismax ~ % ${raw}`, 'cmd');
    const [name, ...args] = raw.trim().split(/\s+/);
    if (!name) return;
    const fn = cmds[name.toLowerCase()];
    fn ? fn(args) : print(`command not found: ${name}. try help`, 'err');
  };

  scope.on(input, 'keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      const v = input.value;
      if (v.trim()) history.push(v);
      hi = history.length;
      input.value = '';
      run(v);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      hi = Math.max(0, Math.min(history.length, hi + (e.key === 'ArrowUp' ? -1 : 1)));
      input.value = history[hi] ?? '';
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const [c, arg] = input.value.split(/\s+/);
      if (arg !== undefined) {
        const m = pages.filter((p) => p.startsWith(arg));
        if (m.length === 1) input.value = `${c} ${m[0]}`;
        else if (m.length) print(m.join('   '));
      } else {
        const m = Object.keys(cmds).filter((k) => k.startsWith(c));
        if (m.length === 1) input.value = m[0] + ' ';
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      out.innerHTML = '';
    }
  });
  scope.on(panel, 'click', () => input.focus());
  print('huismax shell — type help');
}

/* ——— guestbook ——— */
type Entry = { name: string; message: string; at: string };
function guestbook(panel: HTMLElement, scope: Scope) {
  const form = $<HTMLFormElement>('[data-guest-form]', panel)!;
  const list = $('[data-guest-list]', panel)!;
  const status = $('[data-guest-status]', panel)!;

  const render = (entries: Entry[]) => {
    list.innerHTML = '';
    for (const e of entries) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="dim"></span><span></span><span></span>';
      li.children[0].textContent = e.at.slice(0, 10);
      li.children[1].textContent = e.name;
      li.children[2].textContent = e.message;
      list.append(li);
    }
    if (!entries.length) status.textContent = 'empty. be first.';
  };

  fetch('/api/guestbook')
    .then((r) => r.json())
    .then((d: { enabled: boolean; entries: Entry[] }) => {
      if (!d.enabled) {
        status.textContent = 'offline for now.';
        form.querySelectorAll('input, button').forEach((el) => ((el as HTMLInputElement).disabled = true));
      } else render(d.entries);
    })
    .catch(() => (status.textContent = 'offline for now.'));

  scope.on(form, 'submit', async (e: SubmitEvent) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    status.textContent = 'signing…';
    const res = await fetch('/api/guestbook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) {
      form.reset();
      status.textContent = 'signed.';
      render(d.entries);
    } else status.textContent = d.error ?? 'could not sign.';
  });
}
