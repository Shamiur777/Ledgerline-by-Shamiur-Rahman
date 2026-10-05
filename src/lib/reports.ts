import { fromMinor, sumMinor, toMinor } from "@/lib/money";

/**
 * Report model shared by the on-screen view and the Excel / PDF / CSV exporters.
 * Cells are plain strings; columns listed in `amountCols` hold canonical decimal amounts
 * (e.g. "1234.50") and are formatted per format at the edge.
 */
export type ReportSection = {
  heading: string;
  columns: string[];
  rows: string[][];
  amountCols: number[];
  totalRow?: string[];
};
export type Report = { title: string; subtitle: string; currency: string; sections: ReportSection[] };

export type ReportKind = "pnl" | "cashflow" | "balance";
export const REPORT_KINDS: ReportKind[] = ["pnl", "cashflow", "balance"];

const dec = (minor: bigint, cur: string) => fromMinor(minor, cur);
const norm = (v: string, cur: string) => dec(toMinor(v, cur), cur);

/** Inclusive fiscal-year window containing `today`, for an org whose year starts in `startMonth` (1–12). */
export function fiscalYearRange(startMonth: number, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const startYear = m >= startMonth ? y : y - 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${startYear}-${pad(startMonth)}-01`;
  // Day 0 of the month after the last fiscal month = last day of the fiscal year.
  const endMonthIndex = startMonth - 1 + 12; // month index (0-based) of the month after year end
  const last = new Date(Date.UTC(startYear, endMonthIndex, 0));
  return { from, to: last.toISOString().slice(0, 10) };
}

export function buildPnl(
  rows: { category_id: string; name: string; kind: "income" | "expense"; total: string }[],
  currency: string,
  from: string,
  to: string,
): Report {
  const income = rows.filter((r) => r.kind === "income");
  const expense = rows.filter((r) => r.kind === "expense");
  const incTotal = sumMinor(income.map((r) => r.total), currency);
  const expTotal = sumMinor(expense.map((r) => r.total), currency);
  const net = incTotal - expTotal;
  const section = (heading: string, list: typeof rows, total: bigint): ReportSection => ({
    heading,
    columns: ["Category", "Amount"],
    rows: list.map((r) => [r.name, norm(r.total, currency)]),
    amountCols: [1],
    totalRow: ["Total " + heading.toLowerCase(), dec(total, currency)],
  });
  return {
    title: "Profit & Loss",
    subtitle: `${from} to ${to}`,
    currency,
    sections: [
      section("Income", income, incTotal),
      section("Expenses", expense, expTotal),
      { heading: "Result", columns: ["", "Amount"], rows: [[net >= 0n ? "Net profit" : "Net loss", dec(net, currency)]], amountCols: [1] },
    ],
  };
}

export function buildCashflow(
  rows: { month: string; income: string; expense: string }[],
  currency: string,
  from: string,
  to: string,
): Report {
  let running = 0n;
  let inTotal = 0n;
  let outTotal = 0n;
  const body = rows.map((r) => {
    const inflow = toMinor(r.income, currency);
    const outflow = toMinor(r.expense, currency);
    running += inflow - outflow;
    inTotal += inflow;
    outTotal += outflow;
    return [r.month.slice(0, 7), dec(inflow, currency), dec(outflow, currency), dec(inflow - outflow, currency), dec(running, currency)];
  });
  return {
    title: "Cash Flow",
    subtitle: `${from} to ${to}`,
    currency,
    sections: [
      {
        heading: "Monthly cash flow",
        columns: ["Month", "Inflow", "Outflow", "Net", "Running net"],
        rows: body,
        amountCols: [1, 2, 3, 4],
        totalRow: ["Total", dec(inTotal, currency), dec(outTotal, currency), dec(inTotal - outTotal, currency), ""],
      },
    ],
  };
}

export function buildBalanceSheet(
  accounts: { bank_account_id: string; name: string; balance: string }[],
  sheet: { cash: string; payables: string; payroll_due: string; equity: string },
  currency: string,
  asOf: string,
): Report {
  const liabilities = toMinor(sheet.payables, currency) + toMinor(sheet.payroll_due, currency);
  return {
    title: "Balance Sheet",
    subtitle: `As of ${asOf}`,
    currency,
    sections: [
      {
        heading: "Assets",
        columns: ["Account", "Balance"],
        rows: accounts.map((a) => [a.name, norm(a.balance, currency)]),
        amountCols: [1],
        totalRow: ["Total cash", norm(sheet.cash, currency)],
      },
      {
        heading: "Liabilities",
        columns: ["Item", "Amount"],
        rows: [["Accounts payable", norm(sheet.payables, currency)], ["Salaries payable", norm(sheet.payroll_due, currency)]],
        amountCols: [1],
        totalRow: ["Total liabilities", dec(liabilities, currency)],
      },
      {
        heading: "Equity",
        columns: ["", "Amount"],
        rows: [["Net assets (assets − liabilities)", norm(sheet.equity, currency)]],
        amountCols: [1],
      },
    ],
  };
}
