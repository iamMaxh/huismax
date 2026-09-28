import type { Item } from '../../lib/cms';
import { Data, PageHead } from '../components/head';

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/** Visible projects from /admin, in their order. The hover preview is typed out from the same fields. */
export const Coder = ({ projects, intro }: { projects: Item[]; intro: string }) => {
  const list = projects.map((p) => ({ name: s(p.name), url: s(p.url), status: s(p.status), note: s(p.note) }));
  const previews = list.map((p) => ({
    name: p.name,
    preview: [`> ${p.name.toLowerCase()}`, p.url && `  ${host(p.url)}`, p.status && `  status: ${p.status}`, p.note && `  ${p.note}`].filter(Boolean),
  }));
  return (
    <div class="coder-page">
      <PageHead crumb="vibe coder" title="Vibe coder" intro={intro} class="coder-head" />

      {list.length ? (
        <ol class="projects" data-projects>
          {list.map((p, i) => {
            const inner = (
              <>
                <span class="p-idx mono">{String(i + 1).padStart(2, '0')}</span>
                <span class="p-name">
                  {p.name}
                  {p.url && <span class="ext" aria-hidden="true"> ↗</span>}
                </span>
                {p.status && <span class={`p-status mono s-${p.status}`}>{p.status}</span>}
                {p.note && <span class="p-note">{p.note}</span>}
              </>
            );
            return (
              <li data-status={p.status}>
                {p.url ? (
                  <a class="project" href={p.url} data-project={i} target="_blank" rel="noopener noreferrer">
                    {inner}
                  </a>
                ) : (
                  <div class="project" tabindex={0} data-project={i}>{inner}</div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p class="coder-empty mono dim">nothing public right now.</p>
      )}

      <div class="project-preview mono" data-project-preview aria-hidden="true">
        <div class="pp-bar"><i /><i /><i /><span data-pp-name /></div>
        <pre data-pp-body />
      </div>
      <Data id="project-data" value={previews} />
    </div>
  );
};
