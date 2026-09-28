import type { Env } from './env';
import * as cms from './cms';
import { destination, emailReady, listMessages, type Message } from './reply';

/** Everything /admin renders with, in one load. Includes private settings: never send this to a public page. */
export type AdminData = {
  settings: cms.Settings;
  collections: Record<cms.CollectionName, cms.Item[]>;
  /** field definitions, so the admin can build its forms from the same rules the server validates with */
  defs: Record<cms.CollectionName, { flag: 'visible' | 'published'; order: 'sort' | 'number'; fields: cms.Field[] }>;
  messages: Message[];
  /** R2 bound (photo uploads possible) */
  media: boolean;
  email: { resendKey: boolean; destination: string; ready: boolean };
};

export async function adminData(env: Env): Promise<AdminData> {
  const names = Object.keys(cms.COLLECTIONS) as cms.CollectionName[];
  const [settings, lists, messages] = await Promise.all([cms.getSettings(env), Promise.all(names.map((n) => cms.list(env, n))), listMessages(env)]);
  const collections = Object.fromEntries(names.map((n, i) => [n, lists[i]])) as AdminData['collections'];
  const defs = Object.fromEntries(
    names.map((n) => {
      const d: cms.CollectionDef = cms.COLLECTIONS[n];
      return [n, { flag: d.flag, order: d.order, fields: d.fields }];
    }),
  ) as AdminData['defs'];
  return {
    settings,
    collections,
    defs,
    messages,
    media: !!env.MEDIA,
    email: { resendKey: !!env.RESEND_API_KEY, destination: destination(env, settings), ready: emailReady(env, settings) },
  };
}
