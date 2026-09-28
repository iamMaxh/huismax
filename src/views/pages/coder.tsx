import { projects } from '../../data/projects';
import { Data, PageHead } from '../components/head';

const statuses = ['building', 'live', 'soon', 'experiment'] as const;

export const Coder = () => (
  <div class="coder-page">
    <PageHead crumb="04 — vibe coder" title="Vibe coder" class="coder-head">
      <div class="toolbar mono" role="toolbar" aria-label="filter projects">
        <div class="seg" data-project-filter>
          <button type="button" aria-pressed="true" data-status="all">all <sup>{projects.length}</sup></button>
          {statuses.map((s) => (
            <button type="button" aria-pressed="false" data-status={s}>
              {s} <sup>{projects.filter((p) => p.status === s).length}</sup>
            </button>
          ))}
        </div>
        <span class="dim" aria-hidden="true">
          <kbd>↑</kbd> <kbd>↓</kbd> to browse
        </span>
      </div>
    </PageHead>

    <ol class="projects" data-projects>
      {projects.map((p, i) => {
        const inner = (
          <>
            <span class="p-idx mono">{String(i + 1).padStart(2, '0')}</span>
            <span class="p-name">{p.name}</span>
            <span class="p-kind mono dim">{p.kind}</span>
            <span class="p-year mono dim">{p.year}</span>
            <span class={`p-status mono s-${p.status}`}>{p.status}</span>
            <span class="p-note">
              {p.note} <span class="mono dim">{p.stack.join(' · ')}</span>
            </span>
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
