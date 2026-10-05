-- erp.huismax.com is ERPNext. Only if the description is still the first guess (an edit in /admin wins).

UPDATE services SET description = 'ERPNext on Frappe. Accounting, stock and projects.', updated_at = '2026-10-05T08:00:00.000Z' WHERE id = 'svc-erp' AND description = 'ERP on Frappe.';
