// End-to-End Workflow Verification Test for CareBridge
import { WebSocket } from 'ws';

const BASE = 'http://localhost:5173/api';

async function req(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('========================================================');
  console.log('CAREBRIDGE HEALTHCARE COMMAND CENTER - E2E TEST SUITE');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;
  const assert = (condition, title) => {
    if (condition) {
      console.log(`[PASS] ${title}`);
      passed++;
    } else {
      console.error(`[FAIL] ${title}`);
      failed++;
    }
  };

  // 1. Health & DB
  const health = await req('/health');
  assert(health.ok && health.data.status === 'ONLINE' && health.data.database.includes('PostgreSQL 18'), 'System health check confirms PostgreSQL 18 backend');

  // 2. Persona Logins for All 4 Roles
  const roles = ['coordinator', 'hospital_staff', 'paramedic', 'auditor'];
  const tokens = {};
  for (const role of roles) {
    const res = await req('/auth/switch-persona', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
    assert(res.ok && res.data.user.role === role, `Authentication & persona session for '${role}' (${res.data.user.fullName})`);
    tokens[role] = res.data.token;
  }

  // 3. RBAC Enforcement: Hospital Staff Isolation
  const staffAttemptUnauthorized = await req('/hospitals/H-002/capacity', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokens.hospital_staff}` },
    body: JSON.stringify({ metric: 'beds', delta: -1 }),
  });
  assert(staffAttemptUnauthorized.status === 403, 'RBAC blocks hospital staff from altering other hospital (H-002)');

  const staffAttemptAuthorized = await req('/hospitals/H-001/capacity', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokens.hospital_staff}` },
    body: JSON.stringify({ metric: 'beds', delta: -1, reason: 'Staff emergency intake test' }),
  });
  assert(staffAttemptAuthorized.ok && staffAttemptAuthorized.data.success, 'RBAC permits hospital staff to update their assigned facility (H-001)');

  // 4. Paramedic Field Emergency Case Intake
  const paraIntake = await req('/requests', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.paramedic}` },
    body: JSON.stringify({
      patient_name: 'Col. Rajesh Verma (Age 57)',
      service_type: 'Cardiac evaluation',
      urgency: 'Critical',
      location: 'Noida Expressway Km 14',
      is_demo: false,
    }),
  });
  assert(paraIntake.ok && paraIntake.data.request.id, `Paramedic intake logged case ${paraIntake.data.request?.id} with status '${paraIntake.data.request?.status}'`);
  const createdRequestId = paraIntake.data.request.id;

  // 5. Intelligent Hospital Matching Algorithm
  const matches = await req(`/requests/${createdRequestId}/matches`, {
    headers: { Authorization: `Bearer ${tokens.coordinator}` },
  });
  assert(matches.ok && matches.data.rankings.length >= 5, `Matching algorithm evaluated ${matches.data?.rankings?.length} facilities`);
  const topMatch = matches.data.rankings[0];
  console.log(`       -> Top Recommendation: ${topMatch.hospitalName} (Score: ${topMatch.score}%)`);
  console.log(`       -> Rationale: ${topMatch.rationale}`);
  assert(topMatch.score >= 70, 'Top recommended hospital has high capability & resource score');

  // 6. Referral Workflow: Dispatch from Field/Coordinator to Top Matched Facility
  const refDispatch = await req('/referrals', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.coordinator}` },
    body: JSON.stringify({
      request_id: createdRequestId,
      to_hospital_id: topMatch.hospitalId,
      priority: 'Critical',
      notes: 'Arrhythmia with hypotension. Rapid cath lab required.',
      is_demo: false,
    }),
  });
  assert(refDispatch.ok && refDispatch.data.referral.id, `Referral ${refDispatch.data.referral?.id} dispatched to ${topMatch.hospitalName}`);
  const referralId = refDispatch.data.referral.id;

  // 7. Referral Stage 1: Target Hospital Accepts Referral
  // First login as coordinator or assigned staff to accept
  const refAccept = await req(`/referrals/${referralId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokens.coordinator}` },
    body: JSON.stringify({ status: 'Accepted', notes: 'Cath lab 2 prepped and awaiting arrival' }),
  });
  assert(refAccept.ok && refAccept.data.referral.status === 'Accepted', `Referral ${referralId} status advanced to 'Accepted' (Beds reserved)`);

  // 8. Referral Stage 2: In Transit
  const refTransit = await req(`/referrals/${referralId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokens.coordinator}` },
    body: JSON.stringify({ status: 'In Transit' }),
  });
  assert(refTransit.ok && refTransit.data.referral.status === 'In Transit', `Referral ${referralId} status advanced to 'In Transit'`);

  // 9. Referral Stage 3: Completed Admission
  const refComplete = await req(`/referrals/${referralId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tokens.coordinator}` },
    body: JSON.stringify({ status: 'Completed', notes: 'Patient received in emergency department' }),
  });
  assert(refComplete.ok && refComplete.data.referral.status === 'Completed', `Referral ${referralId} status advanced to 'Completed' (Admission finalized)`);

  // 10. Audit Trail Verification (Auditor Persona)
  const auditRes = await req('/audit-logs?limit=15', {
    headers: { Authorization: `Bearer ${tokens.auditor}` },
  });
  assert(auditRes.ok && auditRes.data.logs.length >= 5, `Clinical auditor retrieved ${auditRes.data.logs.length} immutable audit log entries`);
  const recentAction = auditRes.data.logs[0];
  console.log(`       -> Latest Audit Event: [${recentAction.action}] by ${recentAction.userName} (${recentAction.userRole})`);

  // 11. Data Isolation Check (Demo vs Live)
  const liveHospitals = await req('/hospitals?data_mode=live');
  const demoHospitals = await req('/hospitals?data_mode=demo');
  const allHospitals = await req('/hospitals?data_mode=all');
  assert(
    liveHospitals.data.hospitals.length > 0 &&
    demoHospitals.data.hospitals.length > 0 &&
    allHospitals.data.hospitals.length === liveHospitals.data.hospitals.length + demoHospitals.data.hospitals.length,
    `Data isolation verified: ${liveHospitals.data.hospitals.length} live records, ${demoHospitals.data.hospitals.length} demo records, ${allHospitals.data.hospitals.length} unified`
  );

  // 12. WebSocket Real-Time Event Pipeline
  let wsEventReceived = false;
  await new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:5173/ws');
    ws.on('open', async () => {
      // Trigger a live capacity update to test broadcast
      await req('/hospitals/H-001/capacity', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tokens.coordinator}` },
        body: JSON.stringify({ metric: 'beds', delta: 1, reason: 'Discharged patient' }),
      });
    });
    ws.on('message', (msg) => {
      const parsed = JSON.parse(msg.toString());
      if (parsed.type === 'HOSPITAL_UPDATED') {
        wsEventReceived = true;
        ws.close();
        resolve();
      }
    });
    setTimeout(() => {
      ws.close();
      resolve();
    }, 2500);
  });
  assert(wsEventReceived, 'WebSocket client received live HOSPITAL_UPDATED event broadcast');

  console.log('\n========================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) process.exit(1);
}

runTests();
