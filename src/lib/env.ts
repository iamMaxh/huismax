export type Env = {
  ASSETS: Fetcher;
  /** Optional KV namespace: live status overrides + guestbook. */
  STATE?: KVNamespace;
  LIVE?: string;
  LIVE_STREAM_URL?: string;
  LIVE_SESSION_TITLE?: string;
  LIVE_ADMIN_TOKEN?: string;
  ALLOW_MOCK?: string;
};
