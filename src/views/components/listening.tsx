/** Filled client-side from /api/spotify/now. Stays hidden until there is a real track. */
export const Listening = ({ class: cls = '' }: { class?: string }) => (
  <a class={`listening ${cls}`} data-listening target="_blank" rel="noopener" hidden>
    <span class="listening-art" aria-hidden="true"><img alt="" data-listening-art hidden /></span>
    <span class="listening-text">
      <span class="listening-track" data-listening-track />
      <span class="listening-state mono dim" data-listening-state />
    </span>
  </a>
);
