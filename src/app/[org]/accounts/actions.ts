"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbMessage, firstError, nonNegativeAmountField, uuid } from "@/lib/validation";

export async function addBankAccount(slug: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireRole(slug, "admin");
  const parsed = z
    .object({ name: z.string().trim().min(1, "Name is required").max(120), opening_balance: nonNegativeAmountField(ctx.org.currency) })
    .safeParse({ name: form.get("name"), opening_balance: form.get("opening_balance") ?? "0" });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_accounts")
    .insert({ org_id: ctx.org.id, name: parsed.data.name, opening_balance: parsed.data.opening_balance });
  if (error) return { error: dbMessage(error) };
  revalidatePath(`/${slug}`, "layout");
  return { ok: "Account added." };
}

export async function addCategory(slug: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireRole(slug, "admin");
  const parsed = z
    .object({ name: z.string().trim().min(1, "Name is required").max(120), kind: z.enum(["income", "expense"]) })
    .safeParse({ name: form.get("name"), kind: form.get("kind") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({ org_id: ctx.org.id, ...parsed.data });
  if (error) return { error: dbMessage(error) };
  revalidatePath(`/${slug}`, "layout");
  return { ok: "Category added." };
}

export async function addBusinessUnit(slug: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireRole(slug, "admin");
  const parsed = z.object({ name: z.string().trim().min(1, "Name is required").max(120) }).safeParse({ name: form.get("name") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("business_units").insert({ org_id: ctx.org.id, name: parsed.data.name });
  if (error) return { error: dbMessage(error) };
  revalidatePath(`/${slug}`, "layout");
  return { ok: "Business unit added." };
}

/** Archive rather than delete: history keeps referencing the row. */
export async function setArchived(slug: string, table: "bank_accounts" | "categories" | "business_units", id: string, archived: boolean) {
  const ctx = await requireRole(slug, "admin");
  uuid.parse(id);
  const supabase = await createClient();
  await supabase.from(table).update({ archived }).eq("id", id).eq("org_id", ctx.org.id);
  revalidatePath(`/${slug}`, "layout");
}
