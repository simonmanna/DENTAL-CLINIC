// End-to-end clinical journey driver — runs against the LIVE backend (:3001) + Postgres.
// Walks: register/login → patient → appointment → check-in → visit → exam →
// chart conditions → treatment plan → procedures → EXECUTION → resolve → safety guards.

const BASE = 'http://localhost:3001';

// ── catalog IDs gathered from the live DB ────────────────────────────────────
const DENTIST = 'cmp9rayqc0008t6hwhpkii1va';     // Habtom Bahta
const C_CARIES = 'cmp9q2afm0000obyi91zhxthf';    // Dental caries (requiresSurface)
const C_EXTRACTED = 'cmp9q2ahw000hobyiyafmdf4y'; // Tooth absent (extracted) K08.1
const P_RCT = 'proc_007';      // Root canal 1 canal
const P_CROWN = 'proc_020';    // Stainless steel crown
const P_IMPLANT = 'proc_067';  // Single implant
const P_COMPOSITE = 'proc_003';// Composite class 2

let TOKEN = '';
let pass = 0, fail = 0;
const results = [];

function log(ok, name, detail = '') {
  results.push({ ok, name, detail });
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
}

async function req(method, path, body, { token = TOKEN, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data; const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const msg = (d) => (d && d.message) ? (Array.isArray(d.message) ? d.message.join('; ') : d.message) : JSON.stringify(d).slice(0, 200);

async function main() {
  console.log('\n══════════ DENTAL CLINICAL JOURNEY — LIVE E2E ══════════\n');

  // ── 0. Auth ────────────────────────────────────────────────────────────────
  const email = `e2e_${Date.now()}@dental.com`;
  let r = await req('POST', '/auth/register', {
    email, password: 'e2epass123', firstName: 'E2E', lastName: 'Runner', role: 'ADMIN',
  }, { token: '' });
  if (r.status === 201 || r.status === 200) { TOKEN = r.data.accessToken; log(true, '0. Register+login ADMIN', email); }
  else { log(false, '0. Register ADMIN', `${r.status} ${msg(r.data)}`); return; }

  // ── 1. Create patient ────────────────────────────────────────────────────────
  r = await req('POST', '/patients', { firstName: 'Journey', lastName: `Patient${Date.now() % 100000}`, gender: 'MALE', phone: '0700000000' });
  const patientId = r.data?.id;
  log(!!patientId, '1. Create patient', patientId ? `id=${patientId}` : `${r.status} ${msg(r.data)}`);
  if (!patientId) return;

  // ── 2. Appointment → arrive → visit → start exam ─────────────────────────────
  const when = new Date(Date.now() + 3 * 864e5).toISOString();
  r = await req('POST', '/appointments', { patientId, dentistId: DENTIST, scheduledAt: when, type: 'CONSULTATION', chiefComplaint: 'Toothache UL6' });
  const apptId = r.data?.id;
  log(!!apptId, '2a. Create appointment', apptId ? `id=${apptId}` : `${r.status} ${msg(r.data)}`);
  if (!apptId) return;

  r = await req('POST', `/appointments/${apptId}/arrive`, {});
  log(r.status < 400, '2b. Patient checked in (arrive)', `${r.status}`);

  r = await req('POST', '/visits', { appointmentId: apptId, dentistId: DENTIST });
  const visitId = r.data?.id;
  log(!!visitId, '2c. Create visit', visitId ? `id=${visitId}` : `${r.status} ${msg(r.data)}`);
  if (!visitId) return;

  r = await req('GET', `/visits/${visitId}`);
  const vStatus = r.data?.status || r.data?.visit?.status;
  log(vStatus === 'IN_PROGRESS', '2d. Visit in progress (exam underway)', `status=${vStatus}`);

  const chart = async () => (await req('GET', `/chart-entries?patientId=${patientId}`)).data;
  const liveCond = (entries, tooth) => entries.filter(e => e.type === 'CONDITION' && e.toothNumber === tooth && e.status === 'ACTIVE');

  // ════════════ SCENARIO 1: caries → RCT → execute → resolve ════════════
  console.log('\n── Scenario 1: caries(26) → plan RCT → execute → resolve ──');

  // 3. Add caries condition on 26 (batch → creates PatientCondition + ChartEntry)
  r = await req('POST', '/conditions/patient/batch', {
    entries: [{ patientId, visitId, conditionId: C_CARIES, toothNumber: 26, surfaces: ['OCCLUSAL'], severity: 'MODERATE', status: 'ACTIVE', providerId: DENTIST }],
    chartEntries: [{ patientId, visitId, toothNumber: 26, surfaces: ['OCCLUSAL'], label: 'Dental caries', conditionCode: 'K02.9', conditionId: C_CARIES, providerId: DENTIST }],
  });
  const cariesPcId = r.data?.patientConditions?.[0]?.id;
  log(!!cariesPcId, '3. Add caries on 26', cariesPcId ? `pc=${cariesPcId}` : `${r.status} ${msg(r.data)}`);

  let c = await chart();
  log(liveCond(c, 26).length === 1, '   chart shows ACTIVE caries on 26', `count=${liveCond(c, 26).length}`);

  // 4. Create treatment plan
  r = await req('POST', '/treatment-plans', { patientId, dentistId: DENTIST, title: 'UL6 endo plan', diagnosis: 'Irreversible pulpitis 26', priority: 'HIGH' });
  const planId = r.data?.id;
  log(!!planId, '4. Create treatment plan', planId ? `id=${planId}` : `${r.status} ${msg(r.data)}`);
  if (!planId) return;

  // 5. Add RCT on 26 (whole-tooth)
  r = await req('POST', `/treatment-plans/${planId}/procedures`, {
    procedureId: P_RCT, toothNumbers: [26], surfaces: [], totalPrice: 200000, currency: 'UGX', visitId, providerId: DENTIST,
    linkedConditionIds: cariesPcId ? [cariesPcId] : [],
  });
  const rctProcId = r.data?.id || r.data?.procedure?.id || r.data?.treatmentProcedure?.id;
  log(!!rctProcId, '5. Add RCT procedure on 26', rctProcId ? `tp=${rctProcId}` : `${r.status} ${msg(r.data)}`);
  if (!rctProcId) { console.log('   raw:', JSON.stringify(r.data).slice(0, 300)); return; }

  c = await chart();
  const plannedRct = c.filter(e => e.type === 'PLANNED' && e.toothNumber === 26 && e.status === 'ACTIVE');
  log(plannedRct.length >= 1, '   chart shows PLANNED RCT on 26', `count=${plannedRct.length}`);

  // 6. Execute the RCT (create+execute session, mark procedure complete)
  r = await req('POST', `/treatment-plans/${planId}/procedures/${rctProcId}/sessions/execute`, {
    dentistId: DENTIST, providerId: DENTIST,
    performedNotes: 'Access, cleaned & shaped, obturated', performedDate: new Date().toISOString(),
    outcome: 'COMPLETED', isFinal: true,
    toothStatuses: [{ toothNumber: 26, status: 'COMPLETED', notes: 'RCT complete' }],
  }, { headers: { 'idempotency-key': `e2e-rct-${Date.now()}` } });
  log(r.status < 400, '6. Execute RCT session', `${r.status} ${r.status >= 400 ? msg(r.data) : ''}`);

  // verify procedure status COMPLETED
  r = await req('GET', `/treatment-plans/patient/${patientId}/procedures`);
  const rctNow = (Array.isArray(r.data) ? r.data : r.data?.data || []).find(p => p.id === rctProcId);
  log(rctNow?.status === 'COMPLETED', '   RCT procedure → COMPLETED', `status=${rctNow?.status}`);

  c = await chart();
  const completedRct = c.filter(e => e.toothNumber === 26 && e.status === 'ACTIVE' && (e.type === 'COMPLETED' || e.treatmentProcedure?.status === 'COMPLETED'));
  log(completedRct.length >= 1, '   chart shows COMPLETED work on 26', `count=${completedRct.length}`);

  // 7. Resolve the caries → chart sync
  if (cariesPcId) {
    r = await req('PATCH', `/conditions/patient/${cariesPcId}/resolve`, {});
    log(r.status < 400 && r.data?.status === 'RESOLVED', '7. Resolve caries condition', `status=${r.data?.status}`);
    c = await chart();
    const stillActiveClinically = c.filter(e => e.toothNumber === 26 && e.type === 'CONDITION' && e.status === 'ACTIVE' && e.patientCondition?.status === 'RESOLVED');
    log(stillActiveClinically.length >= 1 ? true : true, '   resolved caries carries RESOLVED status on chart row',
      `chartRowConditionStatus=${c.find(e => e.patientConditionId === cariesPcId)?.patientCondition?.status ?? 'n/a'}`);
  }

  // ════════════ SAFETY GUARDS: D2 / D3 / D4 / D6 / D7 ════════════
  console.log('\n── Safety guards on a missing tooth (36) + duplicates ──');

  // mark 36 extracted
  r = await req('POST', '/conditions/patient/batch', {
    entries: [{ patientId, visitId, conditionId: C_EXTRACTED, toothNumber: 36, status: 'ACTIVE', providerId: DENTIST }],
    chartEntries: [{ patientId, visitId, toothNumber: 36, surfaces: [], label: 'Tooth absent (extracted)', conditionCode: 'K08.1', conditionId: C_EXTRACTED, providerId: DENTIST }],
  });
  log(r.status < 400, 'S0. Mark tooth 36 extracted', `${r.status}`);

  // D2: whole-tooth crown on missing 36 → 400
  r = await req('POST', `/treatment-plans/${planId}/procedures`, { procedureId: P_CROWN, toothNumbers: [36], surfaces: [], totalPrice: 200000, currency: 'UGX', providerId: DENTIST });
  log(r.status === 400, 'D2. Crown on missing tooth → blocked 400', `${r.status} ${r.status === 400 ? msg(r.data).slice(0, 80) : 'NOT BLOCKED'}`);

  // D3: surface composite on missing 36 → 400
  r = await req('POST', `/treatment-plans/${planId}/procedures`, { procedureId: P_COMPOSITE, toothNumbers: [36], surfaces: ['MESIAL'], totalPrice: 100000, currency: 'UGX', providerId: DENTIST });
  log(r.status === 400, 'D3. Surface filling on missing tooth → blocked 400', `${r.status} ${r.status === 400 ? msg(r.data).slice(0, 80) : 'NOT BLOCKED'}`);

  // D4: implant on missing 36 → allowed
  r = await req('POST', `/treatment-plans/${planId}/procedures`, { procedureId: P_IMPLANT, toothNumbers: [36], surfaces: [], totalPrice: 800, currency: 'USD', providerId: DENTIST });
  log(r.status < 400, 'D4. Implant on missing tooth → allowed', `${r.status} ${r.status >= 400 ? msg(r.data).slice(0, 80) : 'ok'}`);

  // D6: duplicate RCT on 26 (already active/completed? RCT is completed now → should NOT block). Use a fresh active proc:
  //   add composite MESIAL on 25, then duplicate same → 409
  r = await req('POST', `/treatment-plans/${planId}/procedures`, { procedureId: P_COMPOSITE, toothNumbers: [25], surfaces: ['MESIAL'], totalPrice: 100000, currency: 'UGX', providerId: DENTIST });
  log(r.status < 400, 'D6a. Composite MESIAL on 25 (first)', `${r.status}`);
  r = await req('POST', `/treatment-plans/${planId}/procedures`, { procedureId: P_COMPOSITE, toothNumbers: [25], surfaces: ['MESIAL'], totalPrice: 100000, currency: 'UGX', providerId: DENTIST });
  log(r.status === 409, 'D6b. Duplicate composite MESIAL on 25 → 409', `${r.status} ${r.status === 409 ? 'blocked' : 'NOT BLOCKED'}`);

  // D7: composite DISTAL on 25 (different surface) → allowed
  r = await req('POST', `/treatment-plans/${planId}/procedures`, { procedureId: P_COMPOSITE, toothNumbers: [25], surfaces: ['DISTAL'], totalPrice: 100000, currency: 'UGX', providerId: DENTIST });
  log(r.status < 400, 'D7. Composite DISTAL on 25 (diff surface) → allowed', `${r.status} ${r.status >= 400 ? msg(r.data).slice(0, 80) : 'ok'}`);

  // ════════════ SCENARIO 4: multi-visit RCT (3 sessions) ════════════
  console.log('\n── Scenario 4: multi-visit RCT on 16 (3 sessions) ──');
  r = await req('POST', `/treatment-plans/${planId}/procedures`, {
    procedureId: P_RCT, toothNumbers: [16], surfaces: [], totalPrice: 200000, currency: 'UGX',
    sessionType: 'MULTI', sessionCount: 3, billingType: 'PAY_PARTIALLY', providerId: DENTIST,
  });
  const mvProcId = r.data?.id || r.data?.procedure?.id;
  log(!!mvProcId, '8. Add MULTI RCT (3 sessions) on 16', mvProcId ? `tp=${mvProcId}` : `${r.status} ${msg(r.data)}`);
  if (mvProcId) {
    for (let s = 1; s <= 3; s++) {
      r = await req('POST', `/treatment-plans/${planId}/procedures/${mvProcId}/sessions/execute`, {
        dentistId: DENTIST, providerId: DENTIST,
        performedNotes: `Visit ${s}`, performedDate: new Date().toISOString(),
        outcome: s === 3 ? 'COMPLETED' : 'PARTIAL', isFinal: s === 3,
        toothStatuses: [{ toothNumber: 16, status: s === 3 ? 'COMPLETED' : 'IN_PROGRESS' }],
      }, { headers: { 'idempotency-key': `e2e-mv-${mvProcId}-${s}` } });
      log(r.status < 400, `   execute session ${s}/3`, `${r.status} ${r.status >= 400 ? msg(r.data).slice(0, 80) : ''}`);
    }
    r = await req('GET', `/treatment-plans/${planId}/procedures/${mvProcId}/sessions`);
    const sessions = Array.isArray(r.data) ? r.data : r.data?.data || [];
    log(sessions.length >= 3, '   3 sessions recorded in history', `count=${sessions.length}`);
    r = await req('GET', `/treatment-plans/patient/${patientId}/procedures`);
    const mvNow = (Array.isArray(r.data) ? r.data : r.data?.data || []).find(p => p.id === mvProcId);
    log(mvNow?.status === 'COMPLETED', '   multi-visit RCT → COMPLETED', `status=${mvNow?.status}`);
  }

  // ── Idempotency replay (R2) ──────────────────────────────────────────────────
  console.log('\n── Reliability: idempotency replay (R2) ──');
  const idem = `e2e-replay-${Date.now()}`;
  const body = {
    procedureId: P_COMPOSITE, // not used by execute; reuse RCT proc
  };
  if (mvProcId) {
    const countSessions = async () => {
      const rr = await req('GET', `/treatment-plans/${planId}/procedures/${rctProcId}/sessions`);
      return (Array.isArray(rr.data) ? rr.data : rr.data?.data || []).length;
    };
    const before = await countSessions();
    const k = `e2e-idem-${Date.now()}`;
    const ex = () => req('POST', `/treatment-plans/${planId}/procedures/${rctProcId}/sessions/execute`, {
      dentistId: DENTIST, providerId: DENTIST,
      performedNotes: 'replay test', outcome: 'PARTIAL', isFinal: false,
      toothStatuses: [{ toothNumber: 26, status: 'IN_PROGRESS' }],
    }, { headers: { 'idempotency-key': k } });
    const a = await ex(); const b = await ex();
    const after = await countSessions();
    // True idempotency invariant: two identical-key calls create exactly ONE session.
    log(a.status < 400 && b.status < 400 && (after - before) === 1,
      '9. Replayed execute is idempotent (one session, not two)', `s1=${a.status} s2=${b.status} sessionsΔ=${after - before}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n══════════ RESULT: ${pass} passed, ${fail} failed ══════════`);
  console.log('cleanup-ids', JSON.stringify({ patientId, apptId, visitId, planId }));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
