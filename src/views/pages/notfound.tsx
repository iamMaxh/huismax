import { PageHead } from '../components/head';

const routes = ['/', '/photographer', '/dj', '/trail-runner', '/vibe-coder', '/music', '/now', '/lab'];

export const NotFound = ({ path }: { path: string }) => (
  <div class="nf-page">
    <PageHead crumb="404" title={<span data-scramble>WHERE IS MAX?</span>} class="nf-head" />
    <p class="nf-line mono">
      <span class="dim">GET</span> {path} <span class="dim">→</span> 404 <span class="dim">no record in the archive</span>
    </p>
    <ul class="nf-routes mono">
      {routes.map((r) => (
        <li><a href={r}>{r}</a></li>
      ))}
    </ul>
  </div>
);
