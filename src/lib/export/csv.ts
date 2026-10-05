import type { Report } from "@/lib/reports";

/**
 * Neutralise spreadsheet formula injection: a cell starting with = + - @ (or tab/CR) is treated as a
 * formula by Excel/Sheets. User-entered text (category names, descriptions) can reach exports, so
 * prefix such text with an apostrophe. Numeric amount cells are left untouched.
 */
export function safeCell(value: string, isAmount: boolean): string {
  if (!isAmount && /^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

function escape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function reportToCsv(report: Report): string {
  const lines: string[] = [escape(report.title), escape(report.subtitle), ""];
  for (const s of report.sections) {
    lines.push(escape(s.heading));
    lines.push(s.columns.map(escape).join(","));
    const emit = (row: string[]) =>
      lines.push(row.map((c, i) => escape(safeCell(c, s.amountCols.includes(i)))).join(","));
    s.rows.forEach(emit);
    if (s.totalRow) emit(s.totalRow);
    lines.push("");
  }
  return lines.join("\r\n");
}
