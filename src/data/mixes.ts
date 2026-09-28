// Placeholder sessions. Set `audioUrl` (R2 public bucket, SoundCloud stream, etc.) to make one playable.
export type Mix = {
  id: string;
  title: string;
  date: string;
  duration: string;
  bpm: string;
  tags: string[];
  audioUrl?: string;
  tracklist?: { time: string; artist: string; title: string }[];
};

export const currentSession = {
  title: 'late set — r&b / edits',
  tracklist: [
    { time: '00:00', artist: 'Daniel Caesar', title: 'Get You (edit)' },
    { time: '04:12', artist: 'Usher', title: 'Nice & Slow' },
    { time: '08:40', artist: 'The Kid LAROI', title: 'Without You (slowed)' },
    { time: '12:05', artist: 'Chris Brown', title: 'Under the Influence' },
    { time: '15:30', artist: 'Kanye West', title: 'Street Lights' },
  ],
};

export const mixes: Mix[] = [
  { id: 's014', title: 'session 014 — after hours', date: '2026-09-14', duration: '58:21', bpm: '88–102', tags: ['r&b', 'slow'] },
  { id: 's013', title: 'session 013 — rooftop', date: '2026-08-23', duration: '1:04:10', bpm: '100–118', tags: ['hip-hop', 'edits'] },
  { id: 's012', title: 'session 012 — warm up', date: '2026-07-30', duration: '46:02', bpm: '92–110', tags: ['r&b', 'garage'] },
  { id: 's011', title: 'session 011 — no sleep', date: '2026-06-11', duration: '1:12:44', bpm: '120–126', tags: ['house'] },
  { id: 's010', title: 'session 010 — sunday', date: '2026-05-03', duration: '39:50', bpm: '80–94', tags: ['soul', 'r&b'] },
  { id: 's009', title: 'session 009 — first light', date: '2026-03-28', duration: '51:18', bpm: '96–108', tags: ['hip-hop'] },
];
