import type { Child } from 'hono/jsx';

export const PageHead = ({ crumb, title, class: cls = '', children }: { crumb: string; title: Child; class?: string; children?: Child }) => (
  <header class={`page-head ${cls}`}>
    <p class="crumb mono">
      <a href="/">index</a> <span aria-hidden="true">/</span> {crumb}
    </p>
    <h1 class="page-title" data-reveal>
      {title}
    </h1>
    {children}
  </header>
);

/** Inline JSON handed to the client module for a page. */
export const Data = ({ id, value }: { id: string; value: unknown }) => (
  <script type="application/json" id={id} dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, '\\u003c') }} />
);
