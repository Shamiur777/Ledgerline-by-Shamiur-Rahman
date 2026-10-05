"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { amountField, dbMessage, firstError, isoDate, optionalUuid, uuid } from "@/lib/validation";

function schemaFor(currency: string) {
  return z
    .object({
      kind: z.enum(["income", "expense", "transfer"]),
      amount: amountField(currency),
      date: isoDate,
      bank_account_id: uuid,
      to_bank_account_id: optionalUuid,
      category_id: optionalUuid,
      business_unit_id: optionalUuid,
      description: z.string().trim().max(500).default(""),
      reference: z.string().trim().max(100).default(""),
    })
    .superRefine((v, ctx) => {
      if (v.kind === "transfer") {
        if (!v.to_bank_account_id) ctx.addIssue({ code: "custom", message: "Choose the destination account" });
        else if (v.to_bank_account_id === v.bank_account_id)
          ctx.addIssue({ code: "custom", message: "Source and destination must differ" });
      } else if (!v.category_id) {
        ctx.addIssue({ code: "custom", message: "Choose a category" });
      }
    });
}

function readForm(form: FormData) {
  const get = (k: string) => (form.get(k) as string | null) ?? undefined;
  return {
    kind: get("kind"),
    amount: get("amount") ?? "",
    date: get("date"),
    bank_account_id: get("bank_account_id"),
    to_bank_account_id: get("to_bank_account_id"),
    category_id: get("category_id"),
    business_unit_id: get("business_unit_id"),
    description: get("description") ?? "",
    reference: get("reference") ?? "",
  };
}

function toRow(v: z.infer<ReturnType<typeof schemaFor>>) {
  const transfer = v.kind === "transfer";
  return {
    ...v,
    // Normalise so the DB constraint (transfer XOR category) always holds.
    category_id: transfer ? null : v.category_id,
    to_bank_account_id: transfer ? v.to_bank_account_id : null,
  };
}

export async function saveTransaction(slug: string, id: string | null, _: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireRole(slug, "accountant");
  const parsed = schemaFor(ctx.org.currency).safeParse(readForm(form));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const row = toRow(parsed.data);

  const supabase = await createClient();
  if (row.kind !== "transfer") {
    // Category type must match the transaction type.
    const { data: cat } = await supabase.from("categories").select("kind").eq("id", row.category_id!).eq("org_id", ctx.org.id).maybeSingle();
    if (!cat || cat.kind !== row.kind) return { error: `Pick an ${row.kind} category` };
  }

  const { error } = id
    ? await supabase.from("transactions").update(row).eq("id", id).eq("org_id", ctx.org.id)
    : await supabase.from("transactions").insert({ ...row, org_id: ctx.org.id, created_by: ctx.userId });
  if (error) return { error: dbMessage(error) };

  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/transactions`);
}

export async function deleteTransaction(slug: string, id: string) {
  const ctx = await requireRole(slug, "accountant");
  uuid.parse(id);
  const supabase = await createClient();
  await supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("org_id", ctx.org.id);
  revalidatePath(`/${slug}`, "layout");
}

export async function restoreTransaction(slug: string, id: string) {
  const ctx = await requireRole(slug, "accountant");
  uuid.parse(id);
  const supabase = await createClient();
  // Restoring re-runs the overpayment trigger, so a restore can legitimately fail.
  const { error } = await supabase.from("transactions").update({ deleted_at: null }).eq("id", id).eq("org_id", ctx.org.id);
  if (error) throw new Error(dbMessage(error));
  revalidatePath(`/${slug}`, "layout");
}
