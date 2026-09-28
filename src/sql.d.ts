// wrangler bundles *.sql as text (default module rules).
declare module '*.sql' {
  const sql: string;
  export default sql;
}
