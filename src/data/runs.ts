// Placeholder trail log. `seed` draws the route line and elevation profile until real GPX data replaces it.
export type Run = {
  id: string;
  name: string;
  location: string;
  date: string;
  distanceKm: number;
  gainM: number;
  time: string;
  note: string;
  seed: number;
};

export const runs: Run[] = [
  { id: 'r27', name: 'Tianmu ridge', location: 'Hangzhou', date: '2026-09-20', distanceKm: 24.6, gainM: 1480, time: '3:41:08', note: 'wind on the top. quiet after.', seed: 27 },
  { id: 'r26', name: 'Dragon\'s Back', location: 'Hong Kong', date: '2026-08-31', distanceKm: 13.2, gainM: 610, time: '1:32:44', note: 'heat. sea on the left the whole way.', seed: 26 },
  { id: 'r25', name: 'Moganshan loop', location: 'Huzhou', date: '2026-08-09', distanceKm: 31.0, gainM: 1920, time: '4:58:12', note: 'bamboo, then fog, then nothing.', seed: 25 },
  { id: 'r24', name: 'Lantau peak', location: 'Hong Kong', date: '2026-07-12', distanceKm: 18.4, gainM: 1260, time: '3:02:30', note: 'sunrise start. legs gone by km 14.', seed: 24 },
  { id: 'r23', name: 'Tour du Mont Blanc, stage 3', location: 'Courmayeur', date: '2026-06-18', distanceKm: 27.9, gainM: 1740, time: '5:10:55', note: 'snow patches in june.', seed: 23 },
  { id: 'r22', name: 'Sheshan easy', location: 'Shanghai', date: '2026-05-24', distanceKm: 9.8, gainM: 180, time: '0:58:20', note: 'recovery. no watch.', seed: 22 },
];
