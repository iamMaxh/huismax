import { PageHead } from '../components/head';
import { isOpen, useSite } from '../components/site';

const ROUTES = ['/', '/photographer', '/hiking', '/dj', '/vibe-coder', '/music', '/now', '/reply'];

export const NotFound = ({ path }: { path: string }) => {
  const site = useSite();
  // only pages a visitor can actually open
  const routes = site ? ROUTES.filter((r) => isOpen(site.settings, r)) : ['/'];
  return (
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
};
