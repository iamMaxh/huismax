export type Env = {
  ASSETS: Fetcher;
  /** KV: live status, personal status, Spotify tokens, guestbook. */
  STATE?: KVNamespace;
  /** D1: CMS content and settings (src/lib/cms.ts). */
  DB?: D1Database;
  /** R2: uploaded images (photos, DJ covers). */
  MEDIA?: R2Bucket;
  LIVE?: string;
  LIVE_STREAM_URL?: string;
  LIVE_SESSION_TITLE?: string;
  /** Admin password + API bearer token. Set as a secret. */
  ADMIN_TOKEN?: string;
  ALLOW_MOCK?: string;
  /** Dev only: origin used for OAuth redirects. */
  PUBLIC_ORIGIN?: string;
  /** Spotify app credentials (secrets). */
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  /** Resend API key (secret) for /reply emails, and a fallback destination address. */
  RESEND_API_KEY?: string;
  REPLY_TO?: string;
  /** Test overrides; leave unset in production. */
  SPOTIFY_ACCOUNTS_BASE?: string;
  SPOTIFY_API_BASE?: string;
};
