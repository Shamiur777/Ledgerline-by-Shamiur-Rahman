import { describe, expect, it } from "vitest";
import { parseCsv, validateImport } from "./csv";

describe("parseCsv", () => {
  it("handles quotes, embedded commas/newlines, CRLF and a BOM", () => {
    const rows = parseCsv('﻿date,description\r\n2026-01-02,"Lunch, team"\r\n2026-01-03,"say ""hi""\nthere"\r\n');
    expect(rows).toEqual([
      ["date", "description"],
      ["2026-01-02", "Lunch, team"],
      ["2026-01-03", 'say "hi"\nthere'],
    ]);
  });
  it("ignores fully blank lines", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

const lookup = {
  accounts: new Map([["main account", "acc-1"]]),
  categories: new Map([["income:sales", "cat-i"], ["expense:rent", "cat-e"]]),
};

describe("validateImport", () => {
  const header = "date,type,amount,account,category,description,reference";
  it("accepts good rows and resolves ids case-insensitively", () => {
    const r = validateImport(parseCsv(`${header}\n2026-02-01,income,"1,200.50",Main Account,SALES,Order 1,INV-1`), lookup, "USD");
    expect(r.errors).toEqual([]);
    expect(r.valid[0]).toMatchObject({ kind: "income", amount: "1200.50", bank_account_id: "acc-1", category_id: "cat-i", date: "2026-02-01" });
  });
  it("reports line numbers and reasons for bad rows without dropping the good ones", () => {
    const r = validateImport(
      parseCsv(`${header}\n2026-02-01,income,10,Main Account,Sales,,\nnot-a-date,expense,5,Main Account,Rent,,\n2026-02-03,expense,-5,Main Account,Rent,,\n2026-02-04,expense,5,Nope,Rent,,\n2026-02-05,expense,5,Main Account,Sales,,`),
      lookup,
      "USD",
    );
    expect(r.valid).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
    expect(r.errors[0].message).toMatch(/date/i);
    expect(r.errors[1].message).toMatch(/amount/i);
    expect(r.errors[2].message).toMatch(/account/i);
    expect(r.errors[3].message).toMatch(/category/i);
  });
  it("rejects a file missing required columns", () => {
    const r = validateImport(parseCsv("date,amount\n2026-01-01,5"), lookup, "USD");
    expect(r.valid).toEqual([]);
    expect(r.errors[0].message).toMatch(/missing column/i);
  });
  it("rejects calendar-invalid dates", () => {
    const r = validateImport(parseCsv(`${header}\n2026-02-30,income,10,Main Account,Sales,,`), lookup, "USD");
    expect(r.errors[0].message).toMatch(/date/i);
  });
});
