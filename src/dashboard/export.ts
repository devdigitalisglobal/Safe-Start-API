const WITHHELD = 'WITHHELD';

function cell(value: string | number | null | undefined) {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function row(values: (string | number | null | undefined)[]) {
  return values.map(cell).join(',');
}

function section(title: string, lines: string[]) {
  return [`# ${title}`, ...lines, ''].join('\n');
}

function metric(label: string, value: string | number | null | undefined, suppressed?: boolean) {
  return row([label, suppressed ? WITHHELD : value]);
}

export function buildDashboardCsv(payload: {
  filters: Record<string, string | undefined>;
  improvement: unknown;
  reach: unknown;
  engagement: unknown;
  learning: unknown;
}) {
  const lines: string[] = [
    '# Safe Start — Reporting Dashboard Export',
    `# Generated,${new Date().toISOString()}`,
    `# Filter schoolId,${payload.filters.schoolId ?? ''}`,
    `# Filter from,${payload.filters.from ?? ''}`,
    `# Filter to,${payload.filters.to ?? ''}`,
    '',
  ];

  const improvement = payload.improvement as {
    suppressed?: boolean;
    reason?: string;
    studentCount?: number;
    overall?: {
      startingGrid: number | null;
      finishLine: number | null;
      improvement: number | null;
    } | null;
    knowledgeAreas?: {
      name: string;
      startingGrid: number | null;
      finishLine: number | null;
      improvement: number | null;
    }[] | null;
  } | null;

  const reach = payload.reach as {
    registeredUsers?: { count: number | null; suppressed?: boolean };
    schoolsParticipating?: { count: number };
    inviteToRegister?: {
      invited: number;
      registered: number;
      conversionPercent: number | null;
      suppressed?: boolean;
    };
    monthlyActiveUsers?: { count: number | null; suppressed?: boolean };
    demographics?: {
      suppressed?: boolean;
      reason?: string;
      educationType?: { items: { label: string; count: number }[]; unknown: number } | null;
      licenceStatus?: { items: { label: string; count: number }[]; unknown: number } | null;
    } | null;
  } | null;

  const engagement = payload.engagement as {
    suppressed?: boolean;
    summary?: {
      modulesStarted: number;
      modulesCompleted: number;
      programCompletionRate: number | null;
      averageModulesPerStudent: number | null;
      averageTimePerModuleSeconds: number | null;
    } | null;
    byModule?: { orderIndex: number; title: string; started: number; completed: number }[] | null;
  } | null;

  const learning = payload.learning as {
    suppressed?: boolean;
    scores?: {
      suppressed?: boolean;
      startingGrid: number | null;
      finishLine: number | null;
      improvement: number | null;
      pairedStudents: number;
    } | null;
    reAttempt?: {
      ratePercent: number | null;
      studentsWithReAttempt: number;
      studentsStarted: number;
    } | null;
    mostMissed?: {
      suppressed?: boolean;
      questions?: {
        text: string;
        assessmentType: string;
        knowledgeArea: string;
        missRatePercent: number;
        missCount: number;
        answerCount: number;
      }[] | null;
    } | null;
  } | null;

  if (improvement?.suppressed) {
    lines.push(
      ...section('Improvement', [
        row(['Status', WITHHELD]),
        row(['Reason', improvement.reason ?? 'Cohort too small']),
      ]).split('\n')
    );
  } else if (improvement?.overall) {
    const impLines = [
      row(['Metric', 'Value']),
      metric('Paired students', improvement.studentCount),
      metric('Starting Grid %', improvement.overall.startingGrid),
      metric('Finish Line %', improvement.overall.finishLine),
      metric('Improvement %', improvement.overall.improvement),
      '',
      row(['Knowledge area', 'Starting Grid', 'Finish Line', 'Change']),
      ...(improvement.knowledgeAreas ?? []).map((area) =>
        row([area.name, area.startingGrid, area.finishLine, area.improvement])
      ),
    ];
    lines.push(...section('Improvement', impLines).split('\n'));
  }

  if (reach) {
    const reachLines = [
      row(['Metric', 'Value']),
      metric('Registered users', reach.registeredUsers?.count, reach.registeredUsers?.suppressed),
      metric('Schools participating', reach.schoolsParticipating?.count),
      metric(
        'Invite conversion %',
        reach.inviteToRegister?.conversionPercent,
        reach.inviteToRegister?.suppressed
      ),
      metric('Monthly active users', reach.monthlyActiveUsers?.count, reach.monthlyActiveUsers?.suppressed),
    ];
    lines.push(...section('Reach', reachLines).split('\n'));

    const demographics = reach.demographics;
    if (demographics) {
      const demoLines: string[] = [];
      if (demographics.suppressed) {
        demoLines.push(row(['Status', WITHHELD]));
        demoLines.push(row(['Reason', demographics.reason ?? 'Cohort too small']));
      } else {
        demoLines.push(row(['Education type', 'Learners']));
        for (const item of demographics.educationType?.items ?? []) {
          demoLines.push(row([item.label, item.count]));
        }
        demoLines.push(row(['Not specified', demographics.educationType?.unknown ?? 0]));
        demoLines.push('');
        demoLines.push(row(['Licence status', 'Learners']));
        for (const item of demographics.licenceStatus?.items ?? []) {
          demoLines.push(row([item.label, item.count]));
        }
        demoLines.push(row(['Not specified', demographics.licenceStatus?.unknown ?? 0]));
      }
      lines.push(...section('Learner profile', demoLines).split('\n'));
    }
  }

  if (engagement?.suppressed) {
    lines.push(...section('Engagement', [row(['Status', WITHHELD])]).split('\n'));
  } else if (engagement?.summary) {
    const engLines = [
      row(['Metric', 'Value']),
      metric('Modules started', engagement.summary.modulesStarted),
      metric('Modules completed', engagement.summary.modulesCompleted),
      metric('Program completion %', engagement.summary.programCompletionRate),
      metric('Avg modules per student', engagement.summary.averageModulesPerStudent),
      metric('Avg time per module (seconds)', engagement.summary.averageTimePerModuleSeconds),
      '',
      row(['Module', 'Started', 'Completed']),
      ...(engagement.byModule ?? []).map((m) =>
        row([`${m.orderIndex}. ${m.title}`, m.started, m.completed])
      ),
    ];
    lines.push(...section('Engagement', engLines).split('\n'));
  }

  if (learning?.suppressed) {
    lines.push(...section('Learning', [row(['Status', WITHHELD])]).split('\n'));
  } else {
    const learnLines = [
      row(['Metric', 'Value']),
      metric('Starting Grid % (paired)', learning?.scores?.startingGrid, learning?.scores?.suppressed),
      metric('Finish Line % (paired)', learning?.scores?.finishLine, learning?.scores?.suppressed),
      metric('Improvement % (paired)', learning?.scores?.improvement, learning?.scores?.suppressed),
      metric('Re-attempt rate %', learning?.reAttempt?.ratePercent),
      '',
      row(['Question', 'Assessment', 'Knowledge area', 'Miss rate %', 'Misses', 'Answers']),
    ];

    if (learning?.mostMissed?.suppressed) {
      learnLines.push(row(['Most missed questions', WITHHELD]));
    } else {
      for (const q of learning?.mostMissed?.questions ?? []) {
        learnLines.push(
          row([
            q.text,
            q.assessmentType,
            q.knowledgeArea,
            q.missRatePercent,
            q.missCount,
            q.answerCount,
          ])
        );
      }
    }

    lines.push(...section('Learning', learnLines).split('\n'));
  }

  return `${lines.join('\n')}\n`;
}

export function buildDashboardPdfHtml(payload: {
  filters: Record<string, string | undefined>;
  improvement: unknown;
  reach: unknown;
  engagement: unknown;
}) {
  const improvement = payload.improvement as {
    suppressed?: boolean;
    reason?: string;
    overall?: {
      startingGrid: number | null;
      finishLine: number | null;
      improvement: number | null;
    } | null;
    knowledgeAreas?: {
      name: string;
      startingGrid: number | null;
      finishLine: number | null;
      improvement: number | null;
    }[] | null;
  } | null;

  const reach = payload.reach as {
    registeredUsers?: { count: number | null; suppressed?: boolean };
    schoolsParticipating?: { count: number };
    monthlyActiveUsers?: { count: number | null; suppressed?: boolean };
  } | null;

  const engagement = payload.engagement as {
    suppressed?: boolean;
    summary?: {
      programCompletionRate: number | null;
      modulesCompleted: number;
    } | null;
  } | null;

  const fmt = (value: number | null | undefined, suppressed?: boolean) => {
    if (suppressed) return WITHHELD;
    if (value == null) return '—';
    return `${value}%`;
  };

  const areaRows = improvement?.suppressed
    ? `<tr><td colspan="4">${improvement.reason ?? WITHHELD}</td></tr>`
    : (improvement?.knowledgeAreas ?? [])
        .map(
          (area) => `<tr>
        <td>${area.name}</td>
        <td>${area.startingGrid ?? '—'}%</td>
        <td>${area.finishLine ?? '—'}%</td>
        <td>${area.improvement != null ? `${area.improvement >= 0 ? '+' : ''}${area.improvement}%` : '—'}</td>
      </tr>`
        )
        .join('');

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="utf-8" />
  <title>Safe Start Dashboard Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 40px; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .meta { color: #555; font-size: 12px; margin-bottom: 24px; }
    .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 28px; }
    .tile { border: 1px solid #ddd; border-radius: 8px; padding: 12px; }
    .tile-label { font-size: 11px; text-transform: uppercase; color: #666; }
    .tile-value { font-size: 22px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
    th { font-size: 11px; text-transform: uppercase; color: #666; }
    .brand { color: #1e6fe8; }
  </style>
</head>
<body>
  <p class="brand"><strong>Safe Start for Young Drivers</strong></p>
  <h1>Reporting Dashboard</h1>
  <p class="meta">Generated ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })} (AEST) · Filters: ${
    payload.filters.schoolId ? `school ${payload.filters.schoolId}` : 'all schools'
  }${payload.filters.from ? ` · from ${payload.filters.from}` : ''}${
    payload.filters.to ? ` · to ${payload.filters.to}` : ''
  }</p>

  <div class="tiles">
    <div class="tile">
      <div class="tile-label">Knowledge improvement</div>
      <div class="tile-value">${fmt(improvement?.overall?.improvement, improvement?.suppressed)}</div>
    </div>
    <div class="tile">
      <div class="tile-label">Registered users</div>
      <div class="tile-value">${
        reach?.registeredUsers?.suppressed ? WITHHELD : (reach?.registeredUsers?.count ?? '—')
      }</div>
    </div>
    <div class="tile">
      <div class="tile-label">Program completion</div>
      <div class="tile-value">${fmt(
        engagement?.summary?.programCompletionRate,
        engagement?.suppressed
      )}</div>
    </div>
    <div class="tile">
      <div class="tile-label">Modules completed</div>
      <div class="tile-value">${
        engagement?.suppressed ? WITHHELD : (engagement?.summary?.modulesCompleted ?? '—')
      }</div>
    </div>
    <div class="tile">
      <div class="tile-label">Monthly active users</div>
      <div class="tile-value">${
        reach?.monthlyActiveUsers?.suppressed ? WITHHELD : (reach?.monthlyActiveUsers?.count ?? '—')
      }</div>
    </div>
    <div class="tile">
      <div class="tile-label">Schools participating</div>
      <div class="tile-value">${reach?.schoolsParticipating?.count ?? '—'}</div>
    </div>
  </div>

  <h2>Knowledge improvement by area</h2>
  <table>
    <thead>
      <tr><th>Knowledge area</th><th>Starting Grid</th><th>Finish Line</th><th>Change</th></tr>
    </thead>
    <tbody>${areaRows}</tbody>
  </table>
</body>
</html>`;
}
