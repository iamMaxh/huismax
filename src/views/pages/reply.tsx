import { PageHead } from '../components/head';

const MAX = 2000;

/**
 * A message to Max (POST /api/reply, client/pages/reply.ts). Stored in D1 and emailed through Resend.
 * `website` is a honeypot: invisible to people, filled in by bots, silently dropped by the server.
 */
export const Reply = ({ intro, ready }: { intro: string; ready: boolean }) => (
  <div class="reply-page">
    <PageHead crumb="reply" title="Reply" intro={intro} class="reply-head" />
    {ready ? (
      <form class="reply-form" data-reply-form method="post" action="/api/reply" novalidate>
        <div class="field">
          <label class="label mono" for="reply-message">message</label>
          <textarea id="reply-message" name="message" rows={7} maxlength={MAX} required aria-describedby="reply-count" data-reply-message />
          <p class="reply-count mono dim" id="reply-count" data-reply-count data-max={MAX}>
            0 / {MAX}
          </p>
        </div>
        <div class="reply-row">
          <div class="field">
            <label class="label mono" for="reply-name">
              name <span class="dim">· optional</span>
            </label>
            <input id="reply-name" name="name" type="text" maxlength={60} autocomplete="name" />
          </div>
          <div class="field">
            <label class="label mono" for="reply-email">
              email <span class="dim">· if you want an answer</span>
            </label>
            <input id="reply-email" name="email" type="email" maxlength={200} autocomplete="email" inputmode="email" />
          </div>
        </div>
        <div class="reply-trap" aria-hidden="true">
          <label for="reply-website">website</label>
          <input id="reply-website" name="website" type="text" tabindex={-1} autocomplete="off" aria-hidden="true" />
        </div>
        <div class="reply-actions">
          <button type="submit" class="btn-primary" data-reply-send>
            <span data-reply-label>send</span> <span aria-hidden="true">→</span>
          </button>
          <p class="reply-status mono" role="status" aria-live="polite" data-reply-status />
        </div>
      </form>
    ) : (
      <p class="reply-offline mono dim">replies are offline right now.</p>
    )}
  </div>
);
