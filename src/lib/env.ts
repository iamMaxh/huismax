export type Env = {
  ASSETS: Fetcher;
  /** Optional KV namespace: live status overrides + guestbook. */
  STATE?: KVNamespace;
  LIVE?: string;
  LIVE_STREAM_URL?: string;
  LIVE_SESSION_TITLE?: string;
  /** Admin password + API bearer token. Set as a secret. */
  ADMIN_TOKEN?: string;
  ALLOW_MOCK?: string;
};
