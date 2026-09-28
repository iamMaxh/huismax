import type { PublicPhoto } from '../../lib/content';
import { Data, PageHead } from '../components/head';

type Props = { album: 'photography' | 'hiking'; title: string; crumb: string; intro: string; photos: PublicPhoto[] };

/** Empty frames until photos are uploaded: NOT 1 … NOT 7. Photos take the slots in order; past 7 there are no empty ones. */
const SLOTS = 7;
// the editorial rhythm the empty frames keep (width / height)
const EMPTY_RATIOS = [3 / 2, 4 / 5, 2 / 3, 1, 16 / 9, 3 / 2, 4 / 5];

const no = (i: number) => String(i + 1).padStart(2, '0');
const ratio = (p: PublicPhoto) => (p.width && p.height ? +(p.width / p.height).toFixed(4) : 3 / 2);
const alt = (p: PublicPhoto, title: string, i: number) => p.title || p.caption || `${title}, frame ${no(i)}`;
const place = (p: PublicPhoto) => [p.location, p.date].filter(Boolean).join(' · ');

export const Album = ({ album, title, crumb, intro, photos }: Props) => {
  const empty = Math.max(0, SLOTS - photos.length);
  const data = photos.map((p, i) => ({
    id: p.id,
    no: no(i),
    src: p.src,
    thumb: p.thumb,
    width: p.width,
    height: p.height,
    ratio: ratio(p),
    title: p.title,
    alt: alt(p, title, i),
    caption: p.caption,
    location: p.location,
    date: p.date,
  }));
  return (
    <div class="photo-page" data-album={album}>
      <PageHead crumb={crumb} title={title} intro={intro} class="photo-head">
        {photos.length > 0 && (
          <div class="toolbar mono" role="toolbar" aria-label="view">
            <span class="dim">
              {photos.length} {photos.length === 1 ? 'frame' : 'frames'}
            </span>
            <div class="seg" data-photo-view>
              <button type="button" aria-pressed="true" data-view="grid">grid</button>
              <button type="button" aria-pressed="false" data-view="index">index</button>
            </div>
          </div>
        )}
      </PageHead>

      <section class="photo-grid" data-photo-grid aria-label={`${title}, frames`}>
        {photos.map((p, i) => (
          <figure class="frame" data-slot={i % 6} style={`--ar:${ratio(p)}`}>
            <button type="button" class="frame-btn" data-open={i} aria-label={`open ${alt(p, title, i)}`}>
              <img class="frame-img" src={p.thumb} width={p.width || undefined} height={p.height || undefined} alt={alt(p, title, i)} loading="lazy" decoding="async" />
              <span class="frame-corners" aria-hidden="true" />
            </button>
            <figcaption class="mono">
              <span>{no(i)}</span>
              {p.title && <span>{p.title}</span>}
              {place(p) && <span class="dim">{place(p)}</span>}
              {p.caption && <span class="frame-caption">{p.caption}</span>}
            </figcaption>
          </figure>
        ))}
        {Array.from({ length: empty }, (_, k) => {
          const i = photos.length + k;
          return (
            <figure class="frame frame-empty" data-slot={i % 6} style={`--ar:${EMPTY_RATIOS[i % EMPTY_RATIOS.length]}`}>
              <div class="frame-btn frame-slot" role="img" aria-label={`NOT ${i + 1}, empty frame`}>
                <span class="frame-not mono" aria-hidden="true">NOT {i + 1}</span>
              </div>
            </figure>
          );
        })}
      </section>

      {photos.length > 0 && (
        <section class="photo-index" data-photo-index hidden aria-label={`${title}, index`}>
          <div class="photo-index-head mono dim" aria-hidden="true">
            <span>no.</span><span>title</span><span>location</span><span>date</span>
          </div>
          <ol>
            {photos.map((p, i) => (
              <li>
                <button type="button" class="index-row" data-open={i} data-preview={i}>
                  <span class="mono">{no(i)}</span>
                  <span>{p.title || <span class="dim">—</span>}</span>
                  <span class="mono dim">{p.location}</span>
                  <span class="mono dim">{p.date}</span>
                </button>
              </li>
            ))}
          </ol>
          <div class="index-peek" data-index-peek aria-hidden="true" />
        </section>
      )}

      {photos.length > 0 && (
        <dialog class="lightbox" data-lightbox aria-label={`${title}, viewer`}>
          <div class="lb-stage" data-lb-stage />
          <aside class="lb-meta mono">
            <p class="lb-count" data-lb-count />
            <h2 class="lb-title" data-lb-title />
            <p class="lb-caption" data-lb-caption />
            <dl data-lb-dl />
            <div class="lb-nav">
              <button type="button" data-lb-prev aria-label="previous">←</button>
              <button type="button" data-lb-next aria-label="next">→</button>
              <button type="button" data-lb-close aria-label="close">esc</button>
            </div>
          </aside>
        </dialog>
      )}
      <Data id="photo-data" value={data} />
    </div>
  );
};
