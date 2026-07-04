// smoke-billing-filters.js
// Prove which /billing/invoices filter params the backend actually honours
// vs which the frontend sends but the backend silently drops.
const { PrismaClient } = require('@prisma/client');
const BASE = 'http://localhost:3001';

async function login(email, password) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status} ${await r.text()}`);
  return (await r.json()).accessToken;
}

async function get(token, qs) {
  const r = await fetch(`${BASE}/billing/invoices?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 200) }; }
  return { status: r.status, body: json };
}

(async () => {
  const p = new PrismaClient();
  const adminToken = await login('smoke-admin@d.com', 'SmokeTest123!');

  // Pick a known invoice in the DB to confirm filters return / exclude it.
  const sample = await p.$queryRawUnsafe(
    "SELECT id, \"invoiceNumber\", status, \"paymentStatus\", \"patientId\", \"visitId\", \"createdAt\" FROM invoices ORDER BY \"createdAt\" DESC LIMIT 1",
  );
  console.log('sample invoice:', JSON.stringify(sample[0] || null, null, 2));
  const total = await p.$queryRawUnsafe('SELECT count(*)::int AS n FROM invoices');
  console.log('total invoices in DB:', total[0].n);

  console.log('\n=== Baseline (no filters, limit=9999 — what the frontend asks for) ===');
  const baseline = await get(adminToken, 'limit=9999');
  console.log('  HTTP', baseline.status, 'returned', baseline.body.data?.length, 'rows (total per meta =', baseline.body.meta?.total, ')');

  console.log('\n=== Filter param matrix (does the backend actually use each?) ===');
  const cases = [
    { qs: `status=${sample[0]?.status || 'DRAFT'}`,                label: 'status (frontend sends, controller forwards)' },
    { qs: `status=__NONEXISTENT__`,                                 label: 'status=NONEXISTENT (sanity: should return 0)' },
    { qs: 'paymentStatus=PAID',                                     label: 'paymentStatus=PAID (frontend sends, controller IGNORES)' },
    { qs: `search=${encodeURIComponent(sample[0]?.invoiceNumber || 'INV')}`, label: 'search=invoice# (frontend sends, controller IGNORES)' },
    { qs: 'dateFrom=2020-01-01&dateTo=2099-12-31',                  label: 'dateFrom + dateTo (frontend sends, controller IGNORES)' },
    { qs: 'dentistId=anything',                                      label: 'dentistId=X (frontend sends, controller IGNORES)' },
    { qs: `visitId=${sample[0]?.visitId || 'x'}`,                  label: 'visitId (frontend sends, controller forwards)' },
    { qs: 'currency=USD',                                            label: 'currency=USD (frontend sends, controller forwards)' },
  ];

  for (const c of cases) {
    const res = await get(adminToken, c.qs);
    const n = res.body.data?.length;
    const total = res.body.meta?.total;
    console.log(`  [${res.status}] ${c.label.padEnd(75)} qs="${c.qs.slice(0, 50)}…" returned rows=${n} total=${total}`);
  }

  console.log('\n=== Cross-check: pick 2 invoices with different statuses, then ask for status=X ===');
  const diverse = await p.$queryRawUnsafe(
    "SELECT \"invoiceNumber\", status FROM invoices GROUP BY status, \"invoiceNumber\" ORDER BY status LIMIT 5",
  );
  console.log('  sample rows:', JSON.stringify(diverse));
  if (diverse.length >= 2) {
    const targetStatus = diverse[0].status;
    const res = await get(adminToken, `status=${targetStatus}&limit=9999`);
    const seen = new Set((res.body.data || []).map((i) => i.status));
    console.log(`  filter status=${targetStatus}: returned`, res.body.data?.length, 'rows, distinct statuses seen =', [...seen]);
  }

  await p.$disconnect();
})();
