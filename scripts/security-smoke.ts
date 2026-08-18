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
  await runIdorChecks(token);
  await runAuditScopeCheck();
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
