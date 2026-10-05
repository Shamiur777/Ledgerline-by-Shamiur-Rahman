import ExcelJS from "exceljs";
import { minorDigits } from "@/lib/money";
import type { Report } from "@/lib/reports";
import { safeCell } from "./csv";

export async function reportToXlsx(report: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ledgerline";
  const ws = wb.addWorksheet(report.title.slice(0, 31));
  const digits = minorDigits(report.currency);
  const numFmt = digits > 0 ? `#,##0.${"0".repeat(digits)};[Red]-#,##0.${"0".repeat(digits)}` : "#,##0;[Red]-#,##0";

  ws.addRow([report.title]).font = { bold: true, size: 14 };
  ws.addRow([report.subtitle]).font = { color: { argb: "FF5D6B65" } };
  ws.addRow([]);

  for (const s of report.sections) {
    ws.addRow([s.heading]).font = { bold: true, size: 12 };
    const head = ws.addRow(s.columns);
    head.font = { bold: true };
    head.eachCell((c) => (c.border = { bottom: { style: "thin" } }));
    const write = (row: string[], bold = false) => {
      // Amounts are written as real numbers so Excel can sum them; text is formula-guarded.
      const r = ws.addRow(row.map((c, i) => (s.amountCols.includes(i) && c !== "" ? Number(c) : safeCell(c, false))));
      s.amountCols.forEach((i) => (r.getCell(i + 1).numFmt = numFmt));
      if (bold) r.font = { bold: true };
    };
    s.rows.forEach((r) => write(r));
    if (s.totalRow) write(s.totalRow, true);
    ws.addRow([]);
  }

  ws.columns.forEach((col, i) => (col.width = i === 0 ? 34 : 18));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
