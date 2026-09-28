export type Env = {
  ASSETS: Fetcher;
  /** KV: live status, personal status, Spotify tokens, guestbook. */
  STATE?: KVNamespace;
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
  /** Test overrides; leave unset in production. */
  SPOTIFY_ACCOUNTS_BASE?: string;
  SPOTIFY_API_BASE?: string;
};
