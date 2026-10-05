import { describe, expect, it } from "vitest";
import { formatMoney, fromMinor, sumMinor, toMinor } from "./money";

describe("toMinor", () => {
  it("parses decimal strings exactly", () => {
    expect(toMinor("12.34", "USD")).toBe(1234n);
    expect(toMinor("0.1", "USD")).toBe(10n);
    expect(toMinor("1,234.50", "USD")).toBe(123450n);
  });
  it("rounds half away from zero at the currency's precision", () => {
    expect(toMinor("1.005", "USD")).toBe(101n);
    expect(toMinor("-1.005", "USD")).toBe(-101n);
  });
  it("respects zero-decimal currencies", () => {
    expect(toMinor("1500", "JPY")).toBe(1500n);
    expect(toMinor("1500.6", "JPY")).toBe(1501n);
  });
  it("respects three-decimal currencies", () => {
    expect(toMinor("1.2345", "KWD")).toBe(1235n);
  });
  it("rejects garbage", () => {
    expect(() => toMinor("abc", "USD")).toThrow();
    expect(() => toMinor("", "USD")).toThrow();
  });
});

describe("fromMinor", () => {
  it("renders a plain decimal string", () => {
    expect(fromMinor(1234n, "USD")).toBe("12.34");
    expect(fromMinor(5n, "USD")).toBe("0.05");
    expect(fromMinor(-5n, "USD")).toBe("-0.05");
    expect(fromMinor(1500n, "JPY")).toBe("1500");
  });
});

describe("sumMinor", () => {
  it("avoids float drift", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(fromMinor(sumMinor(["0.1", "0.2"], "USD"), "USD")).toBe("0.30");
  });
  it("sums numbers and strings", () => {
    expect(sumMinor([1.1, "2.20", 3], "USD")).toBe(630n);
  });
});

describe("formatMoney", () => {
  it("formats using the org currency", () => {
    expect(formatMoney("1234.5", "USD", "en-US")).toBe("$1,234.50");
    expect(formatMoney("1234.5", "EUR", "de-DE")).toBe("1.234,50\u00a0€");
  });
  it("formats negatives", () => {
    expect(formatMoney("-5", "USD", "en-US")).toBe("-$5.00");
  });
});
