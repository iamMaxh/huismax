export type Project = {
  id: string;
  name: string;
  kind: string;
  year: string;
  status: 'building' | 'live' | 'soon' | 'paused' | 'experiment';
  note: string;
  stack: string[];
  href?: string;
  /** a few monospace lines shown in the hover preview */
  preview: string[];
};

export const projects: Project[] = [
  {
    id: 'tapical', name: 'Tapical', kind: 'app', year: '2026', status: 'building',
    note: 'small taps, big calendar.', stack: ['ts', 'swift'],
    preview: ['> tapical --today', '  09:30  ▮▮▮▯▯  focus', '  13:00  ▮▯▯▯▯  lunch', '  18:30  ▮▮▯▯▯  run'],
  },
  {
    id: 'mxx-studio', name: 'MXX Studio', kind: 'studio', year: '2025', status: 'live',
    note: 'the studio. photo, sound, web.', stack: ['hono', 'workers'],
    preview: ['> mxx studio', '  photo ........ ●', '  sound ........ ●', '  web .......... ●'],
  },
  {
    id: 'courtennis', name: 'Courtennis', kind: 'sport / web', year: '2026', status: 'soon',
    note: 'courts, people, a ball.', stack: ['ts', 'cloudflare'],
    preview: ['> courtennis', '  status: coming soon', '  courts ░░░░░░░░ 0%', '  ▯ notify me'],
  },
  {
    id: 'foxx-obd', name: 'Foxx OBD', kind: 'hardware + app', year: '2026', status: 'experiment',
    note: 'reading the car out loud.', stack: ['obd-ii', 'ble', 'ts'],
    preview: ['> foxx obd --live', '  RPM      2140', '  COOLANT  88°C', '  SPEED    62 km/h'],
  },
  {
    id: 'huismax', name: 'huismax', kind: 'site', year: '2026', status: 'live',
    note: 'this.', stack: ['hono', 'workers', 'vanilla ts'], href: '/',
    preview: ['> curl huismax/api/live-status', '  { "isLive": false,', '    "label": "OFF AIR" }'],
  },
];

export const experiments = [
  { name: 'terminal', status: 'lab', year: '2026' },
  { name: 'visualizer', status: 'lab', year: '2026' },
  { name: 'guestbook', status: 'lab', year: '2026' },
];
