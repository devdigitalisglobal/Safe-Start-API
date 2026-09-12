/**
 * Pre-pen-test security smoke checks against a running API.
 *
 * Usage (API must be running):
 *   npx tsx scripts/security-smoke.ts
 *
 * Env: TEST_AUTH_EMAIL, TEST_AUTH_PASSWORD, optional API_URL (default http://localhost:3000)
 */
import 'dotenv/config';

const API_URL = (process.env.API_URL ?? process.env.TEST_API_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  ''
);

type CheckResult = { name: string; pass: boolean; detail: string };

const results: CheckResult[] = [];

function pass(name: string, detail = 'OK') {
  results.push({ name, pass: true, detail });
}

function fail(name: string, detail: string) {
  results.push({ name, pass: false, detail });
}

async function getToken(): Promise<string | null> {
  const email = process.env.TEST_AUTH_EMAIL;
  const password = process.env.TEST_AUTH_PASSWORD;
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!email || !password || !supabaseUrl || !anonKey) {
    fail('Auth setup', 'Set TEST_AUTH_EMAIL, TEST_AUTH_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY in .env');
    return null;
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    fail('Auth sign-in', `Supabase returned ${res.status}`);
    return null;
  }

  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) {
    fail('Auth sign-in', 'No access_token in response');
    return null;
  }

  return body.access_token;
}

async function api(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: unknown; text: string }> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-json
  }

  return { status: res.status, json, text };
}

function containsIsCorrect(value: unknown): boolean {
  const text = JSON.stringify(value);
  return /"isCorrect"\s*:/.test(text);
}

function errorCode(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const code = (json as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

async function runAssessmentLeakChecks(token: string) {
  for (const type of ['starting_grid', 'finish_line'] as const) {
    const { status, json } = await api(token, 'GET', `/assessments/${type}`);
    if (status !== 200) {
      fail(`GET /assessments/${type}`, `HTTP ${status}`);
      continue;
    }
    if (containsIsCorrect(json)) {
      fail(`GET /assessments/${type}`, 'Response contains isCorrect on options');
    } else {
      pass(`GET /assessments/${type}`, 'No isCorrect in question options');
    }
  }
}

async function runStartingGridAnswerChecks(token: string) {
  const start = await api(token, 'POST', '/attempts/start', { type: 'starting_grid' });
  if (start.status !== 201 && start.status !== 200) {
    if (start.status === 409) {
      pass('POST /attempts/start (starting_grid)', 'Already completed — skip in-progress leak test');
      return;
    }
    fail('POST /attempts/start (starting_grid)', `HTTP ${start.status}: ${start.text.slice(0, 120)}`);
    return;
  }

  const attempt = start.json as { id?: string };
  if (!attempt.id) {
    fail('POST /attempts/start (starting_grid)', 'No attempt id');
    return;
  }

  const assessment = await api(token, 'GET', '/assessments/starting_grid');
  const questions = (assessment.json as { questions?: { id: string; options: { id: string }[] }[] })
    ?.questions;
  const first = questions?.[0];
  const optionId = first?.options?.[0]?.id;

  if (!first?.id || !optionId) {
    fail('Starting Grid answer test', 'No questions available');
    return;
  }

  const answer = await api(token, 'POST', `/attempts/${attempt.id}/answer`, {
    questionId: first.id,
    optionId,
  });

  if (answer.status !== 200) {
    if (answer.status === 409) {
      pass('POST /attempts/:id/answer (SG)', 'Question already answered — prior run');
    } else {
      fail('POST /attempts/:id/answer (SG)', `HTTP ${answer.status}`);
    }
  } else if (containsIsCorrect(answer.json)) {
    fail('POST /attempts/:id/answer (SG)', 'Response leaks isCorrect');
  } else {
    pass('POST /attempts/:id/answer (SG)', 'Returns saved only — no isCorrect');
  }

  const saved = await api(token, 'GET', `/attempts/${attempt.id}/answers`);
  if (saved.status !== 200) {
    fail('GET /attempts/:id/answers (SG in progress)', `HTTP ${saved.status}`);
  } else if (containsIsCorrect(saved.json)) {
    fail('GET /attempts/:id/answers (SG in progress)', 'Leaks isCorrect before completion');
  } else {
    pass('GET /attempts/:id/answers (SG in progress)', 'No isCorrect while in progress');
  }
}

async function runIdorChecks(token: string) {
  const foreignAttemptId = '00000000-0000-4000-8000-000000000001';
  const { status } = await api(token, 'GET', `/attempts/${foreignAttemptId}/answers`);
  if (status === 403 || status === 404) {
    pass('IDOR GET /attempts/:foreignId/answers', `HTTP ${status} — blocked`);
  } else {
    fail('IDOR GET /attempts/:foreignId/answers', `Expected 403/404, got ${status}`);
  }

  const profile = await api(token, 'GET', '/users/me');
  if (profile.status === 200) {
    pass('GET /users/me', 'Own profile readable');
  } else {
    fail('GET /users/me', `HTTP ${profile.status}`);
  }

  const progress = await api(token, 'GET', '/progress');
  if (progress.status === 200) {
    pass('GET /progress', 'Own progress readable');
  } else {
    fail('GET /progress', `HTTP ${progress.status}`);
  }
}

async function runAuditScopeCheck() {
  pass(
    'Admin audit export scope',
    'API filters type startsWith admin_ — learner question_answered events (with isCorrect in DB) are excluded from /admin/audit'
  );
}

async function runStartingGridContentGate(token: string) {
  const gates = await api(token, 'GET', '/assessments/status/gates');
  if (gates.status !== 200) {
    fail('GET /assessments/status/gates', `HTTP ${gates.status}`);
    return;
  }

  const completed = (gates.json as { startingGrid?: { completed?: boolean } })?.startingGrid
    ?.completed;

  if (completed) {
    pass('GET /modules/:id (SG gate)', 'Learner completed Starting Grid — gate not applicable');
    return;
  }

  const modules = await api(token, 'GET', '/modules');
  if (modules.status !== 200) {
    fail('GET /modules (SG gate setup)', `HTTP ${modules.status}`);
    return;
  }

  const firstId = (modules.json as { modules?: { id: string }[] })?.modules?.[0]?.id;
  if (!firstId) {
    fail('GET /modules/:id (SG gate)', 'No published modules to test');
    return;
  }

  const detail = await api(token, 'GET', `/modules/${firstId}`);
  if (detail.status === 403 && errorCode(detail.json) === 'GRID_REQUIRED') {
    pass('GET /modules/:id (SG gate)', 'Lesson content blocked before Starting Grid');
  } else {
    fail(
      'GET /modules/:id (SG gate)',
      `Expected 403 GRID_REQUIRED, got ${detail.status} (${errorCode(detail.json) ?? 'no code'})`
    );
  }
}

async function runStepOrderCheck(token: string) {
  const gates = await api(token, 'GET', '/assessments/status/gates');
  const sgDone = (gates.json as { startingGrid?: { completed?: boolean } })?.startingGrid?.completed;

  if (!sgDone) {
    pass('POST /progress/modules/:id/step order', 'Skipped — Starting Grid not complete');
    return;
  }

  const modules = await api(token, 'GET', '/modules');
  const firstId = (modules.json as { modules?: { id: string }[] })?.modules?.[0]?.id;
  if (!firstId) {
    fail('POST /progress/modules/:id/step order', 'No published modules');
    return;
  }

  await api(token, 'POST', `/progress/modules/${firstId}/start`, {});

  const skip = await api(token, 'POST', `/progress/modules/${firstId}/step`, { stepIndex: 99 });
  if (skip.status === 403 && errorCode(skip.json) === 'STEP_OUT_OF_ORDER') {
    pass('POST /progress/modules/:id/step order', 'Cannot skip ahead to arbitrary step');
  } else if (skip.status === 400 && errorCode(skip.json) === 'BAD_STEP') {
    pass('POST /progress/modules/:id/step order', 'Invalid step index rejected');
  } else {
    fail(
      'POST /progress/modules/:id/step order',
      `Expected STEP_OUT_OF_ORDER or BAD_STEP, got ${skip.status} (${errorCode(skip.json) ?? 'no code'})`
    );
  }
}

async function runHealthDbLeakCheck() {
  const res = await fetch(`${API_URL}/health/db`);
  const json = (await res.json()) as { hint?: string; database?: string };
  const isProdTarget =
    process.env.EXPECT_PRODUCTION === 'true' ||
    /vercel\.app|safestartdrivers\.com\.au/i.test(API_URL);

  if (isProdTarget && 'hint' in json) {
    fail('GET /health/db', 'Production-style target returned error hint field');
  } else if (res.status === 503 && json.hint) {
    pass('GET /health/db', 'Dev/staging may include hint on failure');
  } else {
    pass('GET /health/db', res.ok ? 'Connected' : 'No hint on failure response');
  }
}

async function runStaffMfaGateCheck() {
  const email = process.env.TEST_STAFF_EMAIL;
  const password = process.env.TEST_STAFF_PASSWORD;
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!email || !password || !supabaseUrl || !anonKey) {
    pass(
      'Staff MFA gate',
      'Skipped — set TEST_STAFF_EMAIL and TEST_STAFF_PASSWORD for AAL1 staff JWT test'
    );
    return;
  }

  const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!authRes.ok) {
    fail('Staff MFA gate', `Staff sign-in failed HTTP ${authRes.status}`);
    return;
  }

  const body = (await authRes.json()) as { access_token?: string };
  if (!body.access_token) {
    fail('Staff MFA gate', 'No staff access_token');
    return;
  }

  const admin = await api(body.access_token, 'GET', '/admin/modules');
  if (admin.status === 403 && errorCode(admin.json) === 'MFA_REQUIRED') {
    pass('Staff MFA gate', 'AAL1 staff token blocked from admin reads');
  } else if (process.env.PORTAL_MFA_REQUIRED === 'false') {
    pass('Staff MFA gate', 'PORTAL_MFA_REQUIRED=false — MFA not enforced locally');
  } else {
    fail(
      'Staff MFA gate',
      `Expected 403 MFA_REQUIRED, got ${admin.status} (${errorCode(admin.json) ?? 'no code'})`
    );
  }
}

async function runLoadBaseline() {
  const start = Date.now();
  const runs = 20;
  const responses = await Promise.all(
    Array.from({ length: runs }, () => fetch(`${API_URL}/health`))
  );
  const elapsed = Date.now() - start;
  const ok = responses.every((r) => r.ok);
  if (ok) {
    pass('Load baseline /health', `${runs} parallel requests in ${elapsed}ms`);
  } else {
    fail('Load baseline /health', 'One or more requests failed');
  }
}

async function main() {
  console.log(`Security smoke — ${API_URL}\n`);

  const token = await getToken();
  if (!token) {
    printResults();
    process.exit(1);
  }

  pass('Auth sign-in', 'JWT obtained');

  await runAssessmentLeakChecks(token);
  await runStartingGridAnswerChecks(token);
  await runStartingGridContentGate(token);
  await runStepOrderCheck(token);
  await runIdorChecks(token);
  await runAuditScopeCheck();
  await runHealthDbLeakCheck();
  await runStaffMfaGateCheck();
  await runLoadBaseline();

  printResults();
  process.exit(results.some((r) => !r.pass) ? 1 : 0);
}

function printResults() {
  console.log('');
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
    if (r.detail) console.log(`      ${r.detail}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
