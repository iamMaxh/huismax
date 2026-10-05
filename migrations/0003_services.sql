-- The self-hosted sites shown on /homelab (edited in /admin → homelab). Additive only, like the others.

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO services (id, name, url, description, sort_order, visible, created_at, updated_at) VALUES
  ('svc-cloud', 'cloud', 'https://cloud.huismax.com', 'Nextcloud. Files, calendars and contacts.', 1, 1, '2026-10-05T00:00:00.000Z', '2026-10-05T00:00:00.000Z'),
  ('svc-meet', 'meet', 'https://meet.huismax.com', 'MiroTalk. Video calls in the browser.', 2, 1, '2026-10-05T00:00:00.000Z', '2026-10-05T00:00:00.000Z'),
  ('svc-erp', 'erp', 'https://erp.huismax.com', 'ERP on Frappe.', 3, 1, '2026-10-05T00:00:00.000Z', '2026-10-05T00:00:00.000Z'),
  ('svc-odoo', 'odoo', 'https://odoo.huismax.com', 'Odoo. Website and business apps.', 4, 1, '2026-10-05T00:00:00.000Z', '2026-10-05T00:00:00.000Z'),
  ('svc-status', 'status', 'https://status.huismax.com', 'Grafana. Dashboards for the servers.', 5, 1, '2026-10-05T00:00:00.000Z', '2026-10-05T00:00:00.000Z');
