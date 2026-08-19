/**
 * Dashboard contract + latency smoke checks against a running API.
 *
 * Verifies GET /dashboard/overview sections match the four section endpoints
 * and reports overview latency (p95 over repeated samples).
 *
 * Usage (API must be running):
 *   npx tsx scripts/dashboard-contract-smoke.ts
 *
 * Env:
 *   API_URL (default http://localhost:3000)
 *   TEST_DASHBOARD_EMAIL / TEST_DASHBOARD_PASSWORD — staff dashboard user
 *   Falls back to staff@safestart.dev + DASHBOARD_DEV_PASSWORD
 *   DASHBOARD_P95_MS — fail threshold (default 3000)
 *   DASHBOARD_SAMPLES — timing samples (default 5)
 */
import 'dotenv/config';

const API_URL = (process.env.API_URL ?? process.env.TEST_API_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  ''
);

const P95_THRESHOLD_MS = Number(process.env.DASHBOARD_P95_MS ?? 3000);
const SAMPLE_COUNT = Number(process.env.DASHBOARD_SAMPLES ?? 5);

type CheckResult = { name: string; pass: boolean; detail: string };

const results: CheckResult[] = [];

function pass(name: string, detail = 'OK') {
  results.push({ name, pass: true, detail });
}

function fail(name: string, detail: string) {
  results.push({ name, pass: false, detail });
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (v as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    return v;
  });
}

function deepEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

async function getToken(): Promise<string | null> {
  const email = process.env.TEST_DASHBOARD_EMAIL ?? 'staff@safestart.dev';
  const password = process.env.TEST_DASHBOARD_PASSWORD ?? process.env.DASHBOARD_DEV_PASSWORD;
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!password || !supabaseUrl || !anonKey) {
    fail(
      'Auth setup',
      'Set TEST_DASHBOARD_PASSWORD or DASHBOARD_DEV_PASSWORD plus SUPABASE_URL and SUPABASE_ANON_KEY'
    );
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
    fail('Auth sign-in', `Supabase returned ${res.status} for ${email}`);
    return null;
  }

  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) {
    fail('Auth sign-in', 'No access_token in response');
    return null;
  }

  return body.access_token;
}

async function apiGet(token: string, path: string): Promise<{ status: number; json: unknown; ms: number }> {
  const started = performance.now();
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  const ms = Math.round(performance.now() - started);

  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 200) };
  }

  return { status: res.status, json, ms };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)]!;
}

async function runContractCheck(token: string) {
  const query = '';
  const [overview, reach, engagement, learning, improvement] = await Promise.all([
    apiGet(token, `/dashboard/overview${query}`),
    apiGet(token, `/dashboard/reach${query}`),
    apiGet(token, `/dashboard/engagement${query}`),
    apiGet(token, `/dashboard/learning${query}`),
    apiGet(token, `/dashboard/improvement${query}`),
  ]);

  const endpoints = [
    { name: 'overview', res: overview },
    { name: 'reach', res: reach },
    { name: 'engagement', res: engagement },
    { name: 'learning', res: learning },
    { name: 'improvement', res: improvement },
  ];

  for (const { name, res } of endpoints) {
    if (res.status !== 200) {
      fail(`GET /dashboard/${name}`, `HTTP ${res.status}`);
      return;
    }
  }

  const overviewBody = overview.json as {
    reach?: unknown;
    engagement?: unknown;
    learning?: unknown;
    improvement?: unknown;
  };

  const pairs: [string, unknown, unknown][] = [
    ['reach', overviewBody.reach, reach.json],
    ['engagement', overviewBody.engagement, engagement.json],
    ['learning', overviewBody.learning, learning.json],
    ['improvement', overviewBody.improvement, improvement.json],
  ];

  let mismatches = 0;
  for (const [section, fromOverview, fromEndpoint] of pairs) {
    if (deepEqual(fromOverview, fromEndpoint)) {
      pass(`Contract /overview.${section}`, 'Matches GET /dashboard/' + section);
    } else {
      mismatches += 1;
      fail(
        `Contract /overview.${section}`,
        'Payload differs from GET /dashboard/' + section
      );
    }
  }

  if (mismatches === 0) {
    pass('Contract overview', 'All four sections match individual endpoints');
  }
}

async function runLatencyCheck(token: string) {
  const samples: number[] = [];

  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const { status, ms } = await apiGet(token, '/dashboard/overview');
    if (status !== 200) {
      fail('Overview latency', `Sample ${i + 1} returned HTTP ${status}`);
      return;
    }
    samples.push(ms);
  }

  const p95 = percentile(samples, 95);
  const detail = `${SAMPLE_COUNT} samples — min ${Math.min(...samples)}ms, p95 ${p95}ms, max ${Math.max(...samples)}ms (threshold ${P95_THRESHOLD_MS}ms)`;

  if (p95 <= P95_THRESHOLD_MS) {
    pass('Overview latency p95', detail);
  } else {
    fail('Overview latency p95', detail);
  }
}

async function runHealthDashboardCheck(token: string) {
  const res = await fetch(`${API_URL}/health/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { status?: string; durationMs?: number; thresholdMs?: number };

  if (res.status === 200 && body.status === 'ok') {
    pass('GET /health/dashboard', `${body.durationMs}ms (threshold ${body.thresholdMs}ms)`);
    return;
  }

  if (res.status === 503 && body.status === 'slow') {
    fail('GET /health/dashboard', `Slow — ${body.durationMs}ms (threshold ${body.thresholdMs}ms)`);
    return;
  }

  fail('GET /health/dashboard', `Unexpected HTTP ${res.status}: ${JSON.stringify(body).slice(0, 120)}`);
}

async function main() {
  console.log(`Dashboard contract smoke — ${API_URL}\n`);

  const token = await getToken();
  if (!token) {
    printResults();
    process.exit(1);
  }

  pass('Auth sign-in', 'Dashboard JWT obtained');

  await runContractCheck(token);
  await runLatencyCheck(token);
  await runHealthDashboardCheck(token);

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
