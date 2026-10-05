import { describe, expect, it } from "vitest";
import { reportToCsv, safeCell } from "./csv";

describe("safeCell", () => {
  it("defuses formula-looking text", () => {
    expect(safeCell("=HYPERLINK(\"http://evil\")", false)).toBe("'=HYPERLINK(\"http://evil\")");
    expect(safeCell("+1", false)).toBe("'+1");
    expect(safeCell("@SUM(A1)", false)).toBe("'@SUM(A1)");
  });
  it("leaves amounts and normal text alone, including negative amounts", () => {
    expect(safeCell("-5.00", true)).toBe("-5.00");
    expect(safeCell("Rent", false)).toBe("Rent");
  });
});

describe("reportToCsv", () => {
  it("quotes commas and quotes, and guards category names", () => {
    const csv = reportToCsv({
      title: "P&L",
      subtitle: "2026",
      currency: "USD",
      sections: [{ heading: "Expenses", columns: ["Category", "Amount"], rows: [['=cmd|"x"', "1.00"], ["Fees, misc", "2.00"]], amountCols: [1] }],
    });
    expect(csv).toContain(`"'=cmd|""x""",1.00`);
    expect(csv).toContain(`"Fees, misc",2.00`);
  });
});
