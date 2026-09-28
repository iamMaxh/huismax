import { projects } from '../../data/projects';
import { Data, PageHead } from '../components/head';

export const Coder = () => (
  <div class="coder-page">
    <PageHead crumb="vibe coder" title="Vibe coder" class="coder-head" />

    <ol class="projects" data-projects>
      {projects.map((p, i) => {
        const inner = (
          <>
            <span class="p-idx mono">{String(i + 1).padStart(2, '0')}</span>
            <span class="p-name">{p.name}</span>
            <span class="p-kind mono dim">{p.kind ?? ''}</span>
            <span class="p-year mono dim">{p.year ?? ''}</span>
            <span class={`p-status mono s-${p.status}`}>{p.status}</span>
            {p.note && <span class="p-note">{p.note}</span>}
          </>
        );
        return (
          <li data-status={p.status}>
            {p.href ? (
              <a class="project" href={p.href} data-project={i}>{inner}</a>
            ) : (
              <div class="project" tabindex={0} data-project={i}>{inner}</div>
            )}
          </li>
        );
      })}
    </ol>

    <div class="project-preview mono" data-project-preview aria-hidden="true">
      <div class="pp-bar"><i /><i /><i /><span data-pp-name /></div>
      <pre data-pp-body />
    </div>

    <p class="coder-foot mono dim">
      small things live in the <a href="/lab">lab →</a>
    </p>
    <Data id="project-data" value={projects} />
  </div>
);
