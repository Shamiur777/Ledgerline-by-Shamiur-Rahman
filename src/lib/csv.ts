import { toMinor } from "@/lib/money";

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, embedded newlines, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export type ImportRow = {
  kind: "income" | "expense";
  amount: string;
  date: string;
  bank_account_id: string;
  category_id: string;
  description: string;
  reference: string;
};
export type ImportLookup = { accounts: Map<string, string>; categories: Map<string, string> };
export type ImportResult = { valid: ImportRow[]; errors: { line: number; message: string }[] };

export const MAX_IMPORT_ROWS = 1000;
const REQUIRED = ["date", "type", "amount", "account", "category"];

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Validate parsed CSV rows. Pure and deterministic; the server action runs this again on
 * the raw text so the client preview can never be used to smuggle bad data past validation.
 * Accounts and categories must already exist (matched case-insensitively): importing never creates reference data.
 */
export function validateImport(rows: string[][], lookup: ImportLookup, currency: string): ImportResult {
  const out: ImportResult = { valid: [], errors: [] };
  if (rows.length === 0) { out.errors.push({ line: 1, message: "File is empty" }); return out; }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) { out.errors.push({ line: 1, message: `Missing column(s): ${missing.join(", ")}` }); return out; }
  if (rows.length - 1 > MAX_IMPORT_ROWS) { out.errors.push({ line: 1, message: `At most ${MAX_IMPORT_ROWS} rows per import` }); return out; }

  const col = (r: string[], name: string) => (r[header.indexOf(name)] ?? "").trim();

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const fail = (message: string) => out.errors.push({ line, message });

    const date = col(r, "date");
    if (!validDate(date)) return fail(`Invalid date "${date}" (use YYYY-MM-DD)`);

    const kind = col(r, "type").toLowerCase();
    if (kind !== "income" && kind !== "expense") return fail(`Type must be income or expense, got "${kind}"`);

    const amountRaw = col(r, "amount").replace(/,/g, "");
    let amount: bigint;
    try { amount = toMinor(amountRaw, currency); } catch { return fail(`Invalid amount "${col(r, "amount")}"`); }
    if (amount <= 0n) return fail("Amount must be greater than zero");

    const accountId = lookup.accounts.get(col(r, "account").toLowerCase());
    if (!accountId) return fail(`Unknown account "${col(r, "account")}"`);

    const categoryId = lookup.categories.get(`${kind}:${col(r, "category").toLowerCase()}`);
    if (!categoryId) return fail(`Unknown ${kind} category "${col(r, "category")}"`);

    out.valid.push({
      kind, amount: amountRaw, date, bank_account_id: accountId, category_id: categoryId,
      description: col(r, "description").slice(0, 500), reference: col(r, "reference").slice(0, 100),
    });
  });
  return out;
}
