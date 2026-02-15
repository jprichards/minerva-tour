/**
 * Data Export Utilities — CSV and PDF generation
 */

/**
 * Generate CSV content from array of objects
 */
export function generateCSV(data: Record<string, unknown>[], columns?: string[]): string {
  if (data.length === 0) return '';

  const cols = columns || Object.keys(data[0]);
  const header = cols.map(escapeCSV).join(',');

  const rows = data.map((row) =>
    cols.map((col) => escapeCSV(formatCSVValue(row[col]))).join(',')
  );

  return [header, ...rows].join('\n');
}

/**
 * Download CSV content as a file
 */
export function downloadCSV(data: Record<string, unknown>[], filename: string, columns?: string[]): void {
  const csv = generateCSV(data, columns);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Download a simple text/HTML-based "PDF" snapshot of a leaderboard
 * Uses a printable HTML page opened in a new window for native print dialog.
 */
export function downloadPDF(title: string, tableHTML: string): void {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHTML(title)}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1a1a1a; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        .subtitle { font-size: 14px; color: #666; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f9fafb; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600; }
        td { font-size: 14px; }
        .rank { font-weight: 700; }
        .score { font-weight: 600; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>${escapeHTML(title)}</h1>
      <div class="subtitle">Exported on ${new Date().toLocaleDateString()}</div>
      ${tableHTML}
      <div class="no-print" style="margin-top: 24px;">
        <button onclick="window.print()" style="padding: 8px 16px; background: #059669; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">
          Print / Save as PDF
        </button>
      </div>
      <script>window.onload = () => window.print();</script>
    </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

/**
 * Generate leaderboard HTML table for PDF export
 */
export function generateLeaderboardHTML(
  entries: { rank: number; name: string; score: string; points: string; course?: string }[]
): string {
  const rows = entries
    .map(
      (e) => `<tr>
        <td class="rank">${e.rank}</td>
        <td>${escapeHTML(e.name)}</td>
        <td class="score">${escapeHTML(e.score)}</td>
        <td>${escapeHTML(e.points)}</td>
        ${e.course ? `<td>${escapeHTML(e.course)}</td>` : ''}
      </tr>`
    )
    .join('\n');

  return `<table>
    <thead>
      <tr>
        <th>#</th>
        <th>Player</th>
        <th>Score</th>
        <th>Points</th>
        ${entries[0]?.course !== undefined ? '<th>Course</th>' : ''}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// Helpers

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatCSVValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
