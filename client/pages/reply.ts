import { $ } from '../lib/dom';
import type { PageInit } from '../main';

/** /reply: posts the form as JSON. The text stays put on any error and is cleared only once it has been sent. */
export const initReply: PageInit = (main, scope) => {
  const form = $<HTMLFormElement>('[data-reply-form]', main);
  if (!form) return; // replies offline
  const message = $<HTMLTextAreaElement>('[data-reply-message]', form)!;
  const count = $('[data-reply-count]', form)!;
  const status = $('[data-reply-status]', form)!;
  const label = $('[data-reply-label]', form)!;
  const max = Number(count.dataset.max) || 2000;
  let sending = false;

  const counter = () => {
    const n = message.value.length;
    count.textContent = `${n} / ${max}`;
    count.classList.toggle('near', n > max * 0.9);
  };
  const say = (text: string, tone: 'ok' | 'error' | '' = '') => {
    status.textContent = text;
    status.dataset.tone = tone;
  };
  const busy = (on: boolean) => {
    sending = on;
    form.setAttribute('aria-busy', String(on));
    for (const el of Array.from(form.elements) as (HTMLInputElement | HTMLButtonElement)[]) el.disabled = on;
    label.textContent = on ? 'sending' : 'send';
  };

  scope.on(message, 'input', () => {
    counter();
    if (status.dataset.tone === 'error') say('');
  });
  counter();

  scope.on(form, 'submit', async (e: SubmitEvent) => {
    e.preventDefault();
    if (sending) return;
    const data = new FormData(form);
    const body = {
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
      message: String(data.get('message') ?? ''),
      website: String(data.get('website') ?? ''),
    };
    if (!body.message.trim()) {
      say('write something first', 'error');
      message.focus();
      return;
    }
    // disabling drops focus; give it back afterwards so keyboard users stay in place
    const focused = document.activeElement instanceof HTMLElement && form.contains(document.activeElement) ? document.activeElement : null;
    const done = () => (busy(false), focused?.focus());
    busy(true);
    say('sending…');
    try {
      const res = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      done();
      if (res.ok && out.ok) {
        form.reset();
        counter();
        say('sent. thank you.', 'ok');
      } else {
        say(out.error || 'could not send. try again in a bit.', 'error');
      }
    } catch {
      done();
      say('could not send. check your connection.', 'error');
    }
  });
};
