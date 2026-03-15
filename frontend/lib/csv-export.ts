/**
 * CSV Export Utility
 * Handles proper CSV escaping and download trigger.
 */

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build CSV content from columns and row data.
 */
export function buildCsvContent(columns: string[], rows: Record<string, unknown>[]): string {
  const header = columns.map(escapeCsvValue).join(',');
  const body = rows.map(row =>
    columns.map(col => escapeCsvValue(row[col])).join(',')
  );
  return [header, ...body].join('\n');
}

/**
 * Download data as a CSV file.
 * @param filename - Name of the downloaded file (e.g. "leads_2026-03-15.csv")
 * @param columns - Ordered column keys (used as headers and to extract row values)
 * @param rows - Array of row objects keyed by column names
 */
export function downloadCsv(
  filename: string,
  columns: string[],
  rows: Record<string, unknown>[],
): void {
  const csv = buildCsvContent(columns, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Helper to generate a timestamped filename.
 */
export function csvFilename(prefix: string): string {
  return `${prefix}_${new Date().toISOString().split('T')[0]}.csv`;
}
