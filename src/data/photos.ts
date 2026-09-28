// Placeholder archive. Set `src` (e.g. /photos/0412.jpg in public/) to swap a placeholder for a real image.
export type Photo = {
  id: string;
  title: string;
  series: string;
  location: string;
  date: string;
  camera: string;
  lens: string;
  exposure: string;
  /** width / height */
  ratio: number;
  src?: string;
};

export const series = ['night', 'high ground', 'people', 'still'] as const;

export const photos: Photo[] = [
  { id: '0412', title: 'crossing, after rain', series: 'night', location: 'Shanghai', date: '2026-04-12', camera: 'Leica Q3', lens: '28mm', exposure: 'f/1.7 · 1/60 · ISO 3200', ratio: 3 / 2 },
  { id: '0388', title: 'ridge line', series: 'high ground', location: 'Dolomites', date: '2026-03-08', camera: 'Fujifilm X100VI', lens: '23mm', exposure: 'f/8 · 1/500 · ISO 160', ratio: 4 / 5 },
  { id: '0371', title: 'the waiting room', series: 'people', location: 'Hong Kong', date: '2026-02-21', camera: 'Leica Q3', lens: '28mm', exposure: 'f/2.8 · 1/125 · ISO 800', ratio: 2 / 3 },
  { id: '0355', title: 'cup, window, noon', series: 'still', location: 'Kyoto', date: '2026-02-02', camera: 'Fujifilm X100VI', lens: '23mm', exposure: 'f/4 · 1/250 · ISO 200', ratio: 1 },
  { id: '0340', title: 'last train', series: 'night', location: 'Tokyo', date: '2026-01-17', camera: 'Leica Q3', lens: '28mm', exposure: 'f/1.7 · 1/30 · ISO 6400', ratio: 16 / 9 },
  { id: '0327', title: 'fog at 2,100m', series: 'high ground', location: 'Yunnan', date: '2025-12-30', camera: 'Fujifilm X100VI', lens: '23mm', exposure: 'f/5.6 · 1/320 · ISO 200', ratio: 3 / 2 },
  { id: '0311', title: 'booth light', series: 'people', location: 'Shanghai', date: '2025-12-06', camera: 'Leica Q3', lens: '28mm', exposure: 'f/1.7 · 1/80 · ISO 5000', ratio: 4 / 5 },
  { id: '0298', title: 'two chairs', series: 'still', location: 'Lisbon', date: '2025-11-14', camera: 'Fujifilm X100VI', lens: '23mm', exposure: 'f/5.6 · 1/200 · ISO 160', ratio: 2 / 3 },
  { id: '0284', title: 'neon, wet', series: 'night', location: 'Hong Kong', date: '2025-10-25', camera: 'Leica Q3', lens: '28mm', exposure: 'f/2 · 1/60 · ISO 2500', ratio: 3 / 2 },
  { id: '0270', title: 'switchback', series: 'high ground', location: 'Chamonix', date: '2025-09-13', camera: 'Fujifilm X100VI', lens: '23mm', exposure: 'f/8 · 1/640 · ISO 125', ratio: 16 / 9 },
  { id: '0259', title: 'hands', series: 'people', location: 'Taipei', date: '2025-08-30', camera: 'Leica Q3', lens: '28mm', exposure: 'f/2.8 · 1/160 · ISO 400', ratio: 1 },
  { id: '0241', title: 'shadow on plaster', series: 'still', location: 'Marrakesh', date: '2025-07-19', camera: 'Fujifilm X100VI', lens: '23mm', exposure: 'f/11 · 1/500 · ISO 100', ratio: 4 / 5 },
];
