// Only real, current work. Add a project here when it exists.
export type Project = {
  id: string;
  name: string;
  status: 'building' | 'live' | 'soon' | 'paused';
  kind?: string;
  year?: string;
  note?: string;
  href?: string;
  /** monospace lines shown in the hover preview */
  preview: string[];
};

export const projects: Project[] = [
  { id: 'tapical', name: 'Tapical', status: 'building', preview: ['> tapical', '  status: building'] },
];
