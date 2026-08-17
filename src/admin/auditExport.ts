function cell(value: string | number | null | undefined) {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function row(values: (string | number | null | undefined)[]) {
  return values.map(cell).join(',');
}

export type AuditExportEvent = {
  id: string;
  type: string;
  payload: unknown;
  occurredAt: string;
  actor: { email: string; fullName: string } | null;
};

export function buildAuditCsv(events: AuditExportEvent[]) {
  const lines = [
    '# Safe Start — Admin Audit Log Export',
    `# Generated,${new Date().toISOString()}`,
    `# Event count,${events.length}`,
    '',
    row(['occurred_at', 'action', 'staff_name', 'staff_email', 'details']),
    ...events.map((event) =>
      row([
        event.occurredAt,
        event.type,
        event.actor?.fullName ?? '',
        event.actor?.email ?? '',
        event.payload != null ? JSON.stringify(event.payload) : '',
      ])
    ),
  ];

  return lines.join('\n');
}
