"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { parseCsv, validateImport } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { dbMessage } from "@/lib/validation";

export type ImportState =
  | { error?: string; checked?: { valid: number; errors: { line: number; message: string }[] }; imported?: number }
  | undefined;

const MAX_BYTES = 1_000_000;

export async function importTransactions(slug: string, _: ImportState, form: FormData): Promise<ImportState> {
  const ctx = await requireRole(slug, "accountant");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file" };
  if (file.size > MAX_BYTES) return { error: "File is too large (max 1 MB)" };

  const supabase = await createClient();
  const [{ data: accounts }, { data: categories }] = await Promise.all([
    supabase.from("bank_accounts").select("id, name").eq("org_id", ctx.org.id).eq("archived", false),
    supabase.from("categories").select("id, name, kind").eq("org_id", ctx.org.id).eq("archived", false),
  ]);
  const lookup = {
    accounts: new Map((accounts ?? []).map((a) => [a.name.toLowerCase(), a.id])),
    categories: new Map((categories ?? []).map((c) => [`${c.kind}:${c.name.toLowerCase()}`, c.id])),
  };

  const result = validateImport(parseCsv(await file.text()), lookup, ctx.org.currency);
  const intent = form.get("intent");

  if (intent !== "import") return { checked: { valid: result.valid.length, errors: result.errors } };

  // All-or-nothing: refuse to import anything while any row is invalid, so a file is never half-applied.
  if (result.errors.length) return { checked: { valid: result.valid.length, errors: result.errors }, error: "Fix the errors below, then import again." };
  if (result.valid.length === 0) return { error: "No rows to import" };

  // A single INSERT statement is atomic in Postgres: either every row lands or none do.
  const { error } = await supabase
    .from("transactions")
    .insert(result.valid.map((r) => ({ ...r, org_id: ctx.org.id, created_by: ctx.userId })));
  if (error) return { error: dbMessage(error) };

  revalidatePath(`/${slug}`, "layout");
  return { imported: result.valid.length };
}
