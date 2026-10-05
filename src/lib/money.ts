/**
 * Exact money arithmetic. Amounts travel as strings from Postgres `numeric` and are
 * converted to integer minor units (bigint) for any arithmetic, never floats.
 */

export function minorDigits(currency: string): number {
  const d = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits;
  return d ?? 2;
}

const NUMBER_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/** Parse a decimal string/number into minor units, rounding half away from zero. */
export function toMinor(input: string | number, currency: string): bigint {
  const digits = minorDigits(currency);
  let s = typeof input === "number" ? input.toString() : input.trim().replace(/,/g, "");
  // Expand exponent notation produced by e.g. (1e-7).toString().
  if (/e/i.test(s)) s = Number(s).toFixed(Math.max(digits + 2, 12));
  if (!NUMBER_RE.test(s)) throw new Error(`Invalid amount: "${input}"`);

  const negative = s.startsWith("-");
  s = s.replace(/^[+-]/, "");
  const [whole = "0", frac = ""] = s.split(".");
  const padded = (frac + "0".repeat(digits + 1)).slice(0, digits + 1);
  let minor = BigInt((whole || "0") + padded.slice(0, digits));
  if (Number(padded[digits]) >= 5) minor += 1n; // half away from zero (on magnitude)
  return negative ? -minor : minor;
}

/** Render minor units as a plain decimal string ("12.34"). */
export function fromMinor(minor: bigint, currency: string): string {
  const digits = minorDigits(currency);
  const negative = minor < 0n;
  const abs = (negative ? -minor : minor).toString().padStart(digits + 1, "0");
  const whole = abs.slice(0, abs.length - digits);
  const frac = digits ? "." + abs.slice(abs.length - digits) : "";
  return (negative ? "-" : "") + whole + frac;
}

export function sumMinor(values: (string | number)[], currency: string): bigint {
  return values.reduce<bigint>((acc, v) => acc + toMinor(v, currency), 0n);
}

/** Locale-aware display formatting. Done at the edge only, after all arithmetic. */
export function formatMoney(value: string | number | bigint, currency: string, locale = "en-US"): string {
  const decimal = typeof value === "bigint" ? fromMinor(value, currency) : fromMinor(toMinor(value, currency), currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(decimal as unknown as number);
}
