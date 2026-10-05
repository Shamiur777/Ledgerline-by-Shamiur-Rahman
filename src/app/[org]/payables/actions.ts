"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { amountField, dbMessage, firstError, isoDate, optionalUuid, uuid } from "@/lib/validation";

export async function addBill(slug: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireRole(slug, "accountant");
  const parsed = z
    .object({
      vendor_id: optionalUuid,
      new_vendor: z.string().trim().max(150).default(""),
      amount_due: amountField(ctx.org.currency),
      bill_date: isoDate,
      due_date: z.string().optional().transform((v) => (v ? v : null)),
      description: z.string().trim().max(500).default(""),
    })
    .refine((v) => v.vendor_id || v.new_vendor, { message: "Choose a vendor or enter a new one" })
    .safeParse({
      vendor_id: form.get("vendor_id") ?? undefined,
      new_vendor: form.get("new_vendor") ?? "",
      amount_due: form.get("amount_due") ?? "",
      bill_date: form.get("bill_date"),
      due_date: form.get("due_date") ?? undefined,
      description: form.get("description") ?? "",
    });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;
  if (v.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(v.due_date)) return { error: "Invalid due date" };

  const supabase = await createClient();
  let vendorId = v.vendor_id;
  if (!vendorId) {
    // Reuse an existing vendor with the same name rather than failing on the unique constraint.
    const { data: existing } = await supabase.from("vendors").select("id").eq("org_id", ctx.org.id).ilike("name", v.new_vendor).maybeSingle();
    if (existing) vendorId = existing.id;
    else {
      const { data, error } = await supabase.from("vendors").insert({ org_id: ctx.org.id, name: v.new_vendor }).select("id").single();
      if (error) return { error: dbMessage(error) };
      vendorId = data.id;
    }
  }

  const { error } = await supabase.from("bills").insert({
    org_id: ctx.org.id,
    vendor_id: vendorId,
    amount_due: v.amount_due,
    bill_date: v.bill_date,
    due_date: v.due_date,
    description: v.description,
  });
  if (error) return { error: dbMessage(error) };
  revalidatePath(`/${slug}`, "layout");
  return { ok: "Bill added." };
}

/**
 * Pay a bill. If the org requires approval, the payment is queued as a pending payment;
 * otherwise it posts straight to the ledger. Either path is guarded by the DB overpayment trigger.
 */
export async function payBill(slug: string, billId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireRole(slug, "accountant");
  uuid.parse(billId);
  const parsed = z
    .object({
      amount: amountField(ctx.org.currency),
      date: isoDate,
      bank_account_id: uuid,
      category_id: uuid,
      reference: z.string().trim().max(100).default(""),
    })
    .safeParse({
      amount: form.get("amount") ?? "",
      date: form.get("date"),
      bank_account_id: form.get("bank_account_id"),
      category_id: form.get("category_id"),
      reference: form.get("reference") ?? "",
    });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { data: bill } = await supabase.from("bills").select("description, vendors(name)").eq("id", billId).eq("org_id", ctx.org.id).single();
  if (!bill) return { error: "Bill not found" };
  const vendor = (bill.vendors as unknown as { name: string } | null)?.name ?? "vendor";
  const description = `Payment to ${vendor}${bill.description ? ` — ${bill.description}` : ""}`.slice(0, 500);

  const common = { org_id: ctx.org.id, bill_id: billId, description, ...parsed.data };
  const { error } = ctx.org.require_approval
    ? await supabase.from("pending_payments").insert({ ...common, requested_by: ctx.userId })
    : await supabase.from("transactions").insert({ ...common, kind: "expense", created_by: ctx.userId });
  if (error) return { error: dbMessage(error) };

  revalidatePath(`/${slug}`, "layout");
  return { ok: ctx.org.require_approval ? "Payment submitted for approval." : "Payment recorded." };
}
