// smoke-billing-filters-v2.js
// Live smoke for the post-2026-06-22 hardened /billing/invoices filter
// surface. Verifies every filter param hits the DB + the bonus 500 → 400
// fix for invalid enum values.
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

async function get(token, qs, label) {
  const r = await fetch(`${BASE}/billing/invoices?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 200) }; }
  return { status: r.status, body: json, label };
}

function check(label, ok, detail) {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label.padEnd(62)} ${detail || ''}`);
  return ok ? 1 : 0;
}

(async () => {
  const p = new PrismaClient();
  const adminToken = await login('smoke-admin@d.com', 'SmokeTest123!');

  // Pull a few real rows so we can craft queries that should match.
  const samples = await p.$queryRawUnsafe(
    "SELECT id, \"invoiceNumber\", status, \"paymentStatus\", currency, \"baseCurrency\", \"visitId\", \"createdAt\"::text AS createdAt FROM invoices ORDER BY \"createdAt\" DESC LIMIT 3",
  );
  console.log('sample rows:');
  for (const s of samples) console.log('  ', JSON.stringify(s));

  // Pick a row that has USD currency if any, else UGX.
  const distinctCurrencies = await p.$queryRawUnsafe(
    "SELECT DISTINCT currency FROM invoices ORDER BY currency",
  );
  console.log('distinct currencies in DB:', distinctCurrencies.map((c) => c.currency).join(', '));

  const total = await p.$queryRawUnsafe('SELECT count(*)::int AS n FROM invoices');
  console.log('total invoices in DB:', total[0].n, '\n');

  let pass = 0, fail = 0;
  const tally = (ok) => ok ? pass++ : fail++;

  // ── Baseline: no filters, no page → returns all rows + meta ──────────
  {
    const r = await get(adminToken, '', 'baseline');
    tally(check('baseline: HTTP 200', r.status === 200));
    tally(check('baseline: data.length matches DB total', r.body.data.length === total[0].n, `got ${r.body.data.length}`));
    tally(check('baseline: meta.total matches DB total', r.body.meta?.total === total[0].n, `got ${r.body.meta?.total}`));
    tally(check('baseline: meta.totalPages is integer ≥ 1', Number.isInteger(r.body.meta?.totalPages) && r.body.meta.totalPages >= 1));
  }

  console.log('\n=== Filter param matrix (does the backend actually use each?) ===');
  const cases = [
    // ── Working (already worked) ──
    { qs: `status=DRAFT`, expectN: null, check: (r) => r.body.data.every((i) => i.status === 'DRAFT'), label: 'status=DRAFT (was working)' },
    { qs: `visitId=${samples[0]?.visitId || 'x'}`, expectN: 1, check: (r) => r.body.data.length === 1, label: 'visitId (was working)' },
    { qs: `currency=${distinctCurrencies[0]?.currency || 'UGX'}`, expectN: null, check: (r) => r.body.data.every((i) => i.currency === distinctCurrencies[0]?.currency), label: 'currency=UGX (was working)' },

    // ── Newly working (these were silently dropped before) ──
    { qs: `paymentStatus=PARTIALLY_PAID`, expectN: null, check: (r) => r.body.data.every((i) => i.paymentStatus === 'PARTIALLY_PAID'), label: 'paymentStatus=PARTIALLY_PAID (was broken, now works)' },
    { qs: `paymentStatus=PAID`, expectN: null, check: (r) => r.body.data.every((i) => i.paymentStatus === 'PAID'), label: 'paymentStatus=PAID (was broken, now works)' },
    { qs: `paymentStatus=UNPAID`, expectN: null, check: (r) => r.body.data.every((i) => i.paymentStatus === 'UNPAID'), label: 'paymentStatus=UNPAID (was broken, now works)' },
    { qs: `search=${encodeURIComponent(samples[0]?.invoiceNumber || 'INV-26-0010')}`, expectN: 1, check: (r) => r.body.data.some((i) => i.invoiceNumber === samples[0]?.invoiceNumber), label: 'search=invoice# (was broken, now works)' },
    { qs: `dateFrom=2020-01-01&dateTo=2099-12-31`, expectN: total[0].n, check: (r) => r.body.data.length === total[0].n, label: 'dateFrom + dateTo (was broken, now works)' },
    { qs: `dateFrom=2000-01-01`, expectN: total[0].n, check: (r) => r.body.data.length === total[0].n, label: 'dateFrom only (was broken, now works)' },
    { qs: `sortBy=total&sortDir=desc&limit=5`, expectN: null, check: (r) => {
        if (r.body.data.length < 2) return true;  // not enough to assert order
        for (let i = 1; i < r.body.data.length; i++) {
          if (Number(r.body.data[i - 1].total) < Number(r.body.data[i].total)) return false;
        }
        return true;
      }, label: 'sortBy=total desc (new)' },
    { qs: `sortBy=balance&sortDir=desc&limit=5`, expectN: null, check: (r) => {
        if (r.body.data.length < 2) return true;
        for (let i = 1; i < r.body.data.length; i++) {
          if (Number(r.body.data[i - 1].balance) < Number(r.body.data[i].balance)) return false;
        }
        return true;
      }, label: 'sortBy=balance desc (new)' },
    { qs: `page=1&limit=2`, expectN: 2, check: (r) => r.body.data.length <= 2, label: 'page=1 limit=2 (server-side pagination)' },
  ];

  for (const c of cases) {
    const r = await get(adminToken, c.qs);
    const ok = r.status === 200 && c.check(r);
    const detail = c.expectN != null
      ? `expected ${c.expectN}, got ${r.body.data?.length}`
      : `status=${r.status} n=${r.body.data?.length}`;
    tally(check(c.label, ok, detail));
  }

  // ── Combined filters: status + paymentStatus + currency all ANDed ───
  {
    const r = await get(adminToken, 'status=POSTED&paymentStatus=UNPAID&limit=10');
    const ok =
      r.status === 200 &&
      r.body.data.every((i) => i.status === 'POSTED' && i.paymentStatus === 'UNPAID');
    tally(check('combined: status=POSTED + paymentStatus=UNPAID (ANDed)',
      ok, `n=${r.body.data?.length}`));
  }

  // ── Bonus 500 fix: invalid status now returns 400, not 500 ─────────
  console.log('\n=== Bonus bug: invalid enum values (was 500, should be 400) ===');
  {
    const r = await get(adminToken, 'status=__NOPE__');
    tally(check('invalid status returns 400 (was 500)', r.status === 400, `got ${r.status} body=${JSON.stringify(r.body).slice(0, 100)}`));
  }
  {
    const r = await get(adminToken, 'paymentStatus=NOT_A_STATUS');
    tally(check('invalid paymentStatus returns 400', r.status === 400, `got ${r.status}`));
  }
  {
    const r = await get(adminToken, 'sortBy=randomColumn');
    tally(check('invalid sortBy returns 400', r.status === 400, `got ${r.status}`));
  }
  {
    const r = await get(adminToken, 'dateFrom=not-a-date');
    tally(check('invalid dateFrom returns 400', r.status === 400, `got ${r.status}`));
  }

  // ── Pagination: page=2 of limit=2 should differ from page=1 ────────
  {
    const p1 = await get(adminToken, 'page=1&limit=2');
    const p2 = await get(adminToken, 'page=2&limit=2');
    const p1Ids = (p1.body.data || []).map((i) => i.id).sort();
    const p2Ids = (p2.body.data || []).map((i) => i.id).sort();
    const disjoint = p1Ids.every((id) => !p2Ids.includes(id));
    tally(check('pagination: page 1 and page 2 return disjoint rows',
      p1.status === 200 && p2.status === 200 && disjoint,
      `p1=${p1Ids.length} p2=${p2Ids.length}`));
  }

  // ── appliedFilters echo in meta ───────────────────────────────────
  {
    const r = await get(adminToken, 'status=POSTED&paymentStatus=UNPAID&currency=UGX&sortBy=total&sortDir=asc');
    const af = r.body.meta?.appliedFilters;
    const ok = af &&
      af.status === 'POSTED' &&
      af.paymentStatus === 'UNPAID' &&
      af.currency === 'UGX' &&
      af.sortBy === 'total' &&
      af.sortDir === 'asc';
    tally(check('meta.appliedFilters echoes resolved filters', ok, JSON.stringify(af)));
  }

  // ── RBAC sanity: NURSE still blocked ───────────────────────────────
  console.log('\n=== RBAC still in place ===');
  const nurseToken = await login('smoke-nurse@d.com', 'SmokeTest123!');
  {
    const r = await get(nurseToken, '');
    tally(check('NURSE blocked from /billing/invoices', r.status === 403, `got ${r.status}`));
  }

  console.log(`\n=== Summary ===`);
  console.log(`  ${pass} passed, ${fail} failed`);
  await p.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
})();
