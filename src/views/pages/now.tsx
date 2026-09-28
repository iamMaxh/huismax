import { now, nowUpdated } from '../../data/now';
import { PageHead } from '../components/head';

export const Now = () => (
  <div class="now-page">
    <PageHead crumb="now" title="Now" class="now-head">
      <p class="mono dim">updated {nowUpdated}</p>
    </PageHead>
    <dl class="now-list">
      {now.map((n) => (
        <div class="now-item">
          <dt class="mono">{n.key}</dt>
          <dd>{n.value}</dd>
        </div>
      ))}
    </dl>
  </div>
);
