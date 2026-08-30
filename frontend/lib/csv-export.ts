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

// ---------------------------------------------------------------------------
// Excel export (no dependency).
//
// We do NOT bundle a heavy spreadsheet library (SheetJS/xlsx). Instead we emit
// an Excel-compatible HTML-table workbook with the application/vnd.ms-excel MIME
// type and a .xls extension, which Excel, Google Sheets and LibreOffice all open
// natively. Real formatting (bold header) is preserved; no npm dependency added.
// ---------------------------------------------------------------------------

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build an Excel-compatible HTML workbook string from columns and row data.
 */
export function buildExcelHtml(columns: string[], rows: Record<string, unknown>[], sheetName = 'Export'): string {
  const head = columns.map((c) => `<th style="background:#eef2ff;font-weight:bold;text-align:left">${escapeHtml(c)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${columns.map((col) => `<td>${escapeHtml(row[col])}</td>`).join('')}</tr>`)
    .join('');
  return (
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
    'xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8">' +
    '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>' +
    `<x:Name>${escapeHtml(sheetName)}</x:Name>` +
    '<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>' +
    '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->' +
    '</head><body><table border="1" cellspacing="0">' +
    `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`
  );
}

/**
 * Download data as an Excel-compatible (.xls) file, generated client-side.
 */
export function downloadExcel(
  filename: string,
  columns: string[],
  rows: Record<string, unknown>[],
): void {
  const html = buildExcelHtml(columns, rows);
  // Prepend a UTF-8 BOM so Excel reads unicode characters correctly.
  const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Helper to generate a timestamped Excel (.xls) filename.
 */
export function excelFilename(prefix: string): string {
  return `${prefix}_${new Date().toISOString().split('T')[0]}.xls`;
}
