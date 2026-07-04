// smoke-e2e.js — End-to-end production-readiness smoke test against the running backend.
const { PrismaClient } = require('@prisma/client');
const BASE = 'http://localhost:3001';

async function login(email, password) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.accessToken || j.token || j.access_token;
}

async function req(path, { method = 'GET', token, body, headers = {} } = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text.slice(0, 120); }
  return { status: r.status, body: json };
}

function row(label, got, expect) {
  const tag = got === expect ? 'PASS' : 'FAIL';
  console.log(`  [${tag}] ${label.padEnd(48)} expected=${expect} got=${got}`);
  return got === expect;
}

(async () => {
  const p = new PrismaClient();
  let allPass = true;

  console.log('=== 1. Login three roles ===');
  let adminToken, nurseToken, recToken;
  try {
    adminToken = await login('smoke-admin@d.com', 'SmokeTest123!');
    nurseToken = await login('smoke-nurse@d.com', 'SmokeTest123!');
    recToken = await login('smoke-rec@d.com', 'SmokeTest123!');
    console.log(`  admin token len=${adminToken.length}, nurse=${nurseToken.length}, rec=${recToken.length}`);
  } catch (e) { console.log('  FAIL login:', e.message); process.exit(1); }

  console.log('\n=== 2. RBAC matrix ===');
  allPass &= row('audit-log   ADMIN',     (await req('/audit-log', { token: adminToken })).status, 200);
  allPass &= row('audit-log   NURSE',     (await req('/audit-log', { token: nurseToken })).status, 403);
  allPass &= row('audit-log   REC',       (await req('/audit-log', { token: recToken })).status, 403);
  allPass &= row('billing POST currencies/rate  ADMIN',
                 (await req('/billing/currencies/rate', { method: 'POST', token: adminToken, body: { from: 'USD', to: 'UGX', rate: 3750 } })).status, 201);
  allPass &= row('billing POST currencies/rate  NURSE',
                 (await req('/billing/currencies/rate', { method: 'POST', token: nurseToken, body: { from: 'USD', to: 'UGX', rate: 3750 } })).status, 403);
  allPass &= row('billing POST services  NURSE',
                 (await req('/billing/services', { method: 'POST', token: nurseToken, body: { serviceCode: 'X' + Date.now(), name: 'x', type: 'CONSULTATION', category: 'TEST', price: 1, currency: 'UGX' } })).status, 403);
  allPass &= row('billing POST refunds   NURSE',
                 (await req('/billing/invoices/x/refunds', { method: 'POST', token: nurseToken, body: { amount: 1, reason: 't' } })).status, 403);
  allPass &= row('billing PATCH void     REC',
                 (await req('/billing/invoices/x/void', { method: 'PATCH', token: recToken, body: { reason: 't' } })).status, 403);
  // Admin can attempt void (will 404 on missing invoice, RBAC passes):
  allPass &= row('billing PATCH void     ADMIN (404 expected)',
                 (await req('/billing/invoices/x/void', { method: 'PATCH', token: adminToken, body: { reason: 't' } })).status, 404);
  // Receptionist can attempt addPayment (RBAC allows, will 404 on missing invoice):
  allPass &= row('billing POST payments  REC (404 expected)',
                 (await req('/billing/invoices/x/payments', { method: 'POST', token: recToken, body: { paymentCurrency: 'UGX', amount: 1, method: 'CASH' } })).status, 404);
  // GET endpoints remain open to all authenticated users:
  allPass &= row('billing GET  currencies/rate NURSE (open)',
                 (await req('/billing/currencies/rate?from=USD&to=UGX', { token: nurseToken })).status, 200);
  allPass &= row('billing GET  services       NURSE (open)',
                 (await req('/billing/services', { token: nurseToken })).status, 200);

  console.log('\n=== 3. Audit-trail write captures ipAddress/userAgent ===');
  const exp = await p.$queryRawUnsafe(
    "SELECT id, \"expenseCode\" FROM expenses WHERE \"paymentStatus\" IN ('UNPAID','PARTIALLY_PAID') AND status NOT IN ('VOID','CANCELLED','REJECTED') ORDER BY \"createdAt\" DESC LIMIT 1",
  );
  if (!exp.length) {
    console.log('  SKIP — no open expense to pay');
  } else {
    const expId = exp[0].id;
    const idemKey = `smoke-${Date.now()}`;
    const payRes = await req('/payments', {
      method: 'POST',
      token: adminToken,
      headers: {
        'X-Forwarded-For': '203.0.113.42',
        'User-Agent': 'SmokeTest/1.0 (production-readiness)',
        'Idempotency-Key': idemKey,
      },
      body: {
        type: 'EXPENSE',
        sourceId: expId,
        amount: 100,
        method: 'CASH',
        notes: 'production-readiness smoke',
      },
    });
    row('POST /payments (ADMIN)', payRes.status, 201);

    const row2 = await p.$queryRawUnsafe(
      `SELECT action, module, "entityType", "recordId", "userName", "ipAddress",
              substring("userAgent", 1, 40) AS userAgentSnippet, "reason"
       FROM audit_logs
       WHERE "ipAddress" = '203.0.113.42'
       ORDER BY "createdAt" DESC LIMIT 1`,
    );
    console.log('  audit row written:', JSON.stringify(row2[0], null, 2));
    const captured = !!row2[0] && row2[0].ipAddress === '203.0.113.42';
    row('audit captured ipAddress=203.0.113.42', captured, true);
    allPass &= captured;
  }

  console.log('\n=== Summary ===');
  console.log(allPass ? '  ALL SMOKE TESTS PASS ✅' : '  SMOKE TESTS FAILED ❌');
  await p.$disconnect();
  process.exit(allPass ? 0 : 1);
})();
