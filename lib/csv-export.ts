import { formatPhone } from './utils/phone';

function escapeCsv(val: unknown): string {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(escapeCsv).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(','));
  }
  return lines.join('\n');
}

function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportQueueCsv(leads: any[]): void {
  const headers = ['Name', 'Phone', 'State', 'County', 'Rapport', 'Priority', 'Attempts', 'Last Called', 'Outcome'];
  const rows = leads.map(l => [
    [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Unknown',
    formatPhone(l.phone_normalized),
    l.state || '',
    l.county || '',
    l.rapport_level || '',
    String(l.priority_score ?? 0),
    String(l.total_call_attempts ?? 0),
    l.last_called_at || '',
    l.final_outcome || '',
  ]);
  downloadCsv(toCsv(headers, rows), `call-queue-${new Date().toISOString().slice(0, 10)}.csv`);
}

export function exportCallHistoryCsv(calls: any[]): void {
  const headers = ['Date', 'Direction', 'Name', 'Phone', 'From Number', 'Status', 'Duration (s)', 'Sentiment', 'Summary'];
  const rows = calls.map(c => {
    const name = (c.lead_first_name || c.lead_last_name)
      ? `${c.lead_first_name || ''} ${c.lead_last_name || ''}`
      : c.leads_cache
        ? [c.leads_cache.first_name, c.leads_cache.last_name].filter(Boolean).join(' ')
        : '';
    return [
      c.call_started_at || '',
      c.call_direction || 'outbound',
      name.trim(),
      formatPhone(c.seller_phone_normalized || c.phone_normalized),
      formatPhone(c.our_phone || ''),
      c.call_status || '',
      String(c.duration_seconds ?? 0),
      c.sentiment || '',
      c.summary || '',
    ];
  });
  downloadCsv(toCsv(headers, rows), `call-history-${new Date().toISOString().slice(0, 10)}.csv`);
}

export function exportDNCCsv(entries: any[]): void {
  const headers = ['Phone', 'Source', 'Type', 'Reason', 'Added'];
  const rows = entries.map(e => [
    formatPhone(e.phone_normalized),
    e.source || '',
    e.dnc_type || 'permanent',
    e.reason || '',
    e.created_at || '',
  ]);
  downloadCsv(toCsv(headers, rows), `dnc-list-${new Date().toISOString().slice(0, 10)}.csv`);
}

export function exportCampaignResultCsv(result: any): void {
  const date = new Date().toISOString().slice(0, 10);

  // Summary sheet
  const summaryHeaders = ['Metric', 'Value'];
  const summaryRows = [
    ['Total Leads', String(result.totalLeads ?? 0)],
    ['Dialed', String(result.dialed ?? result.dialedCount ?? 0)],
    ['Connected', String(result.connected ?? 0)],
    ['Failed', String(result.failed ?? result.errors ?? 0)],
    ['DNC Skipped', String(result.skippedDnc ?? 0)],
    ['Guard Blocked', String(result.skippedGuard ?? 0)],
    ['Duration (s)', String(result.durationSeconds ?? 0)],
    ['Connect Rate', `${result.dialed > 0 ? Math.round((result.connected / result.dialed) * 100) : 0}%`],
  ];

  // Per-number stats
  if (result.numberStats && Object.keys(result.numberStats).length > 0) {
    summaryRows.push(['', '']); // separator
    summaryRows.push(['--- Per Number ---', '']);
    for (const [phone, stats] of Object.entries(result.numberStats) as [string, any][]) {
      const rate = stats.dialed > 0 ? Math.round((stats.connected / stats.dialed) * 100) : 0;
      summaryRows.push([formatPhone(phone), `${stats.dialed} dialed, ${stats.connected} connected (${rate}%)`]);
    }
  }

  // Details
  if (result.details && result.details.length > 0) {
    summaryRows.push(['', '']); // separator
    summaryRows.push(['--- Lead Details ---', '']);
    summaryRows.push(['Phone', 'Status / Guard Reason']);
    for (const d of result.details) {
      const info = d.status === 'guard_blocked'
        ? `blocked: ${d.guardReason || 'unknown'}${d.guardDetails ? ` (${d.guardDetails})` : ''}`
        : d.status === 'error'
          ? `error: ${d.error || 'unknown'}`
          : d.status;
      summaryRows.push([formatPhone(d.phone), info]);
    }
  }

  downloadCsv(toCsv(summaryHeaders, summaryRows), `campaign-results-${date}.csv`);
}
