import { describe, expect, it } from "vitest";
import type { Report } from "@/lib/reports";
import { reportToPdf } from "./pdf";
import { reportToXlsx } from "./xlsx";

const sample: Report = {
  title: "Profit & Loss",
  subtitle: "2026-01-01 to 2026-12-31",
  currency: "USD",
  sections: [
    { heading: "Income", columns: ["Category", "Amount"], rows: [["Sales", "1000.10"]], amountCols: [1], totalRow: ["Total income", "1000.10"] },
  ],
};

describe("exporters", () => {
  it("produces a real xlsx (zip) file", async () => {
    const buf = await reportToXlsx(sample);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
  it("produces a real PDF", async () => {
    const buf = await reportToPdf(sample, "Acme Ltd");
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  }, 30_000);
});
