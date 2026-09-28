/**
 * Filled client-side from /api/spotify/now. Stays hidden until there is a real track.
 * `feature` is the same component at homepage size: name and artist on their own lines, plus progress.
 * `pending` reserves its space (Spotify is connected, the first poll is on its way) so nothing jumps.
 */
export const Listening = ({ class: cls = '', feature = false, pending = false }: { class?: string; feature?: boolean; pending?: boolean }) => (
  <a
    class={`listening${feature ? ' listening-feature' : ''} ${cls}`}
    data-listening
    data-state={pending ? 'loading' : undefined}
    target="_blank"
    rel="noopener"
    hidden={!pending}
  >
    <span class="listening-art" aria-hidden="true">
      <img alt="" data-listening-art={feature ? 'large' : ''} hidden />
    </span>
    {feature ? (
      <span class="listening-text">
        <span class="listening-state mono dim" data-listening-state />
        <span class="listening-name" data-listening-name />
        <span class="listening-artist" data-listening-artist />
        <span class="listening-progress np-progress mono" data-listening-progress hidden>
          <span data-listening-cur>0:00</span>
          <span class="bar">
            <span class="bar-fill" data-listening-fill />
          </span>
          <span data-listening-dur>0:00</span>
        </span>
      </span>
    ) : (
      <span class="listening-text">
        <span class="listening-track" data-listening-track />
        <span class="listening-state mono dim" data-listening-state />
      </span>
    )}
  </a>
);
