/** Types mirrored from src/lib (cms.ts, admin-data.ts, reply.ts) and the two ways the admin talks to the worker. */

export type FieldType = 'text' | 'long' | 'url' | 'link' | 'date' | 'int' | 'real' | 'enum';
export type Field = { name: string; type: FieldType; label: string; max?: number; required?: boolean; options?: readonly string[]; min?: number; hint?: string };
export type Def = { flag: 'visible' | 'published'; order: 'sort' | 'number'; fields: Field[] };
export type Item = { id: string; [k: string]: string | number };
export type CollectionName = 'identities' | 'projects' | 'music' | 'now' | 'photos' | 'dj' | 'links';

export type PageKey = 'photographer' | 'dj' | 'hiking' | 'vibe-coder' | 'music' | 'now' | 'reply';
export type Settings = {
  headline: string;
  tagline: string;
  description: string;
  footer: string;
  spotifyProfile: string;
  nav: Record<'music' | 'dj' | 'now' | 'reply', boolean>;
  pages: Record<PageKey, boolean>;
  intros: Record<PageKey, string>;
  replyTo: string;
  replyFrom: string;
};

export type Message = { id: string; name: string; email: string; body: string; emailed: number; read: number; created_at: string };

export type AdminData = {
  settings: Settings;
  collections: Record<CollectionName, Item[]>;
  defs: Record<CollectionName, Def>;
  messages: Message[];
  media: boolean;
  email: { resendKey: boolean; destination: string; ready: boolean };
};

const errorOf = (status: number, data: unknown) =>
  status === 401 ? 'signed out. reload the page to sign in again.' : ((data as { error?: string } | null)?.error ?? `error ${status}`);

/** JSON request to an admin API. Throws an Error carrying the server's message. */
export async function api<T = Item>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new Error('could not reach the server. offline?');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorOf(res.status, data));
  return data as T;
}

/** Multipart upload through XHR, the one browser API that reports upload progress (0…1). */
export function upload<T = Item>(method: 'POST' | 'PUT', url: string, form: FormData, onProgress?: (f: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.response as T) : reject(new Error(errorOf(xhr.status, xhr.response))));
    xhr.onerror = () => reject(new Error('upload failed. offline?'));
    xhr.onabort = () => reject(new Error('upload cancelled'));
    xhr.send(form);
  });
}
