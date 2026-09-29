import { $ } from '../lib/dom';
import type { PageInit } from '../main';

/**
 * /dj requests: posts the form as JSON (POST /api/dj/requests). The text stays put on any error and is cleared only
 * once it has been sent. What gets sent is hidden until Max publishes it in /admin, so the list doesn't change here.
 */
export function initRequests(main: HTMLElement, scope: Parameters<PageInit>[1]) {
  const form = $<HTMLFormElement>('[data-request-form]', main);
  if (!form) return; // requests offline
  const input = $<HTMLInputElement>('[data-request-input]', form)!;
  const status = $('[data-request-status]', form)!;
  const label = $('[data-request-label]', form)!;
  let sending = false;

  const say = (text: string, tone: 'ok' | 'error' | '' = '') => {
    status.textContent = text;
    status.dataset.tone = tone;
  };
  const busy = (on: boolean) => {
    sending = on;
    form.setAttribute('aria-busy', String(on));
    for (const el of Array.from(form.elements) as (HTMLInputElement | HTMLButtonElement)[]) el.disabled = on;
    label.textContent = on ? 'sending' : 'request';
  };

  scope.on(input, 'input', () => status.dataset.tone === 'error' && say(''));

  scope.on(form, 'submit', async (e: SubmitEvent) => {
    e.preventDefault();
    if (sending) return;
    const data = new FormData(form);
    const body = {
      request: String(data.get('request') ?? ''),
      name: String(data.get('name') ?? ''),
      website: String(data.get('website') ?? ''),
    };
    if (!body.request.trim()) {
      say('tell me what to play first', 'error');
      input.focus();
      return;
    }
    // disabling drops focus; give it back afterwards so keyboard users stay in place
    const focused = document.activeElement instanceof HTMLElement && form.contains(document.activeElement) ? document.activeElement : null;
    const done = () => (busy(false), focused?.focus());
    busy(true);
    say('sending…');
    try {
      const res = await fetch('/api/dj/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      done();
      if (res.ok && out.ok) {
        input.value = '';
        say('got it. the ones i pick show up on the list.', 'ok');
      } else {
        say(out.error || 'could not send. try again in a bit.', 'error');
      }
    } catch {
      done();
      say('could not send. check your connection.', 'error');
    }
  });
}
