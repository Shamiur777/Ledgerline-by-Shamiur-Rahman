import { describe, expect, it } from "vitest";
import { buildBalanceSheet, buildCashflow, buildPnl, fiscalYearRange } from "./reports";

describe("fiscalYearRange", () => {
  it("calendar-year orgs run Jan–Dec", () => {
    expect(fiscalYearRange(1, "2026-10-05")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
  it("July start, date after start month", () => {
    expect(fiscalYearRange(7, "2026-10-05")).toEqual({ from: "2026-07-01", to: "2027-06-30" });
  });
  it("July start, date before start month falls in the previous fiscal year", () => {
    expect(fiscalYearRange(7, "2026-03-15")).toEqual({ from: "2025-07-01", to: "2026-06-30" });
  });
  it("handles leap-year February end", () => {
    expect(fiscalYearRange(3, "2027-05-01")).toEqual({ from: "2027-03-01", to: "2028-02-29" });
  });
});

describe("buildPnl", () => {
  const rows = [
    { category_id: "1", name: "Sales", kind: "income" as const, total: "1000.10" },
    { category_id: "2", name: "Services", kind: "income" as const, total: "0.20" },
    { category_id: "3", name: "Rent", kind: "expense" as const, total: "400.05" },
  ];
  it("totals each section and computes net without float drift", () => {
    const r = buildPnl(rows, "USD", "2026-01-01", "2026-12-31");
    expect(r.sections[0].totalRow?.[1]).toBe("1000.30");
    expect(r.sections[1].totalRow?.[1]).toBe("400.05");
    expect(r.sections[2].rows[0]).toEqual(["Net profit", "600.25"]);
  });
  it("labels a loss as a loss", () => {
    const r = buildPnl([{ category_id: "3", name: "Rent", kind: "expense", total: "5.00" }], "USD", "a", "b");
    expect(r.sections[2].rows[0]).toEqual(["Net loss", "-5.00"]);
  });
});

describe("buildCashflow", () => {
  it("computes net per month and a running total", () => {
    const r = buildCashflow(
      [
        { month: "2026-01-01", income: "100.00", expense: "40.00" },
        { month: "2026-02-01", income: "0", expense: "10.50" },
      ],
      "USD",
      "2026-01-01",
      "2026-02-28",
    );
    expect(r.sections[0].rows).toEqual([
      ["2026-01", "100.00", "40.00", "60.00", "60.00"],
      ["2026-02", "0.00", "10.50", "-10.50", "49.50"],
    ]);
    expect(r.sections[0].totalRow).toEqual(["Total", "100.00", "50.50", "49.50", ""]);
  });
});

describe("buildBalanceSheet", () => {
  it("assets minus liabilities equals equity", () => {
    const r = buildBalanceSheet(
      [{ bank_account_id: "a", name: "Main", balance: "1000.00" }, { bank_account_id: "b", name: "Savings", balance: "250.50" }],
      { cash: "1250.50", payables: "300.00", payroll_due: "100.25", equity: "850.25" },
      "USD",
      "2026-10-05",
    );
    const eq = r.sections.find((s) => s.heading === "Equity")!;
    expect(eq.rows[0][1]).toBe("850.25");
    const liabilities = r.sections.find((s) => s.heading === "Liabilities")!;
    expect(liabilities.totalRow?.[1]).toBe("400.25");
  });
});
