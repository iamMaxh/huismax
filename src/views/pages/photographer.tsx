import { photos, series } from '../../data/photos';
import { placeholderTone } from '../../lib/seed';
import { Data, PageHead } from '../components/head';

const Frame = ({ src, id, title }: { src?: string; id: string; title: string }) =>
  src ? (
    <img class="frame-img" src={src} alt={title} loading="lazy" decoding="async" />
  ) : (
    <span class="frame-img ph" role="img" aria-label={`${title} (placeholder)`} style={`background:${placeholderTone(Number(id))}`} />
  );

export const Photographer = () => {
  const lightbox = photos.map((p) => ({ ...p, tone: p.src ? null : placeholderTone(Number(p.id)) }));
  return (
    <div class="photo-page">
      <PageHead crumb="01 — photographer" title="Photographer" class="photo-head">
        <div class="toolbar mono" role="toolbar" aria-label="archive controls">
          <div class="seg" data-photo-filter>
            <button type="button" aria-pressed="true" data-series="all">
              all <sup>{photos.length}</sup>
            </button>
            {series.map((s) => (
              <button type="button" aria-pressed="false" data-series={s}>
                {s} <sup>{photos.filter((p) => p.series === s).length}</sup>
              </button>
            ))}
          </div>
          <div class="seg" data-photo-view>
            <button type="button" aria-pressed="true" data-view="grid">grid</button>
            <button type="button" aria-pressed="false" data-view="index">index</button>
          </div>
        </div>
      </PageHead>

      <section class="photo-grid" data-photo-grid aria-label="selected frames">
        {photos.map((p, i) => (
          <figure class="frame" data-series={p.series} data-slot={i % 6} style={`--ar:${p.ratio}`}>
            <button type="button" class="frame-btn" data-open={i} aria-label={`open ${p.title}`}>
              <Frame src={p.src} id={p.id} title={p.title} />
              <span class="frame-corners" aria-hidden="true" />
            </button>
            <figcaption class="mono">
              <span>{p.id}</span>
              <span>{p.title}</span>
              <span class="dim">{p.location}</span>
            </figcaption>
          </figure>
        ))}
      </section>

      <section class="photo-index" data-photo-index hidden aria-label="index of frames">
        <div class="photo-index-head mono dim" aria-hidden="true">
          <span>no.</span><span>title</span><span>series</span><span>location</span><span>date</span>
        </div>
        <ol>
          {photos.map((p, i) => (
            <li data-series={p.series}>
              <button type="button" class="index-row" data-open={i} data-preview={i}>
                <span class="mono">{p.id}</span>
                <span>{p.title}</span>
                <span class="mono dim">{p.series}</span>
                <span class="mono dim">{p.location}</span>
                <span class="mono dim">{p.date}</span>
              </button>
            </li>
          ))}
        </ol>
        <div class="index-peek" data-index-peek aria-hidden="true" />
      </section>

      <dialog class="lightbox" data-lightbox aria-label="frame viewer">
        <div class="lb-stage" data-lb-stage />
        <aside class="lb-meta mono">
          <p class="lb-count" data-lb-count />
          <h2 class="lb-title" data-lb-title />
          <dl data-lb-dl />
          <div class="lb-nav">
            <button type="button" data-lb-prev aria-label="previous">←</button>
            <button type="button" data-lb-next aria-label="next">→</button>
            <button type="button" data-lb-close aria-label="close">esc</button>
          </div>
        </aside>
      </dialog>
      <Data id="photo-data" value={lightbox} />
    </div>
  );
};
