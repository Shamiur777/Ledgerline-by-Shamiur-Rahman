"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { amountField, dbMessage, firstError, isoDate, nonNegativeAmountField, optionalUuid, uuid } from "@/lib/validation";

const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** Create a payroll run for a month and seed it with every active employee at their default amount. */
export async function createRun(slug: string, month: string): Promise<void> {
  const ctx = await requireRole(slug, "accountant");
  const [y, m] = ym.parse(month).split("-").map(Number);
  const supabase = await createClient();

  const { data: run, error } = await supabase
    .from("payroll_runs")
    .insert({ org_id: ctx.org.id, year: y, month: m })
    .select("id")
    .single();
  if (error) throw new Error(dbMessage(error));

  const { data: people } = await supabase.from("employees").select("id, default_amount").eq("org_id", ctx.org.id).eq("active", true);
  if (people?.length) {
    const { error: e2 } = await supabase.from("payroll_items").insert(
      people.map((p) => ({ org_id: ctx.org.id, payroll_run_id: run.id, employee_id: p.id, amount_due: p.default_amount })),
    );
    if (e2) throw new Error(dbMessage(e2));
  }
  revalidatePath(`/${slug}/payroll`);
}

export async function paySalary(slug: string, itemId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireRole(slug, "accountant");
  uuid.parse(itemId);
  const parsed = z
    .object({
      amount: amountField(ctx.org.currency),
      date: isoDate,
      bank_account_id: uuid,
      category_id: uuid,
    })
    .safeParse({
      amount: form.get("amount") ?? "",
      date: form.get("date"),
      bank_account_id: form.get("bank_account_id"),
      category_id: form.get("category_id"),
    });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("payroll_items")
    .select("employees(name), payroll_runs(month, year)")
    .eq("id", itemId)
    .eq("org_id", ctx.org.id)
    .single();
  if (!item) return { error: "Salary entry not found" };
  const who = (item.employees as unknown as { name: string }).name;
  const run = item.payroll_runs as unknown as { month: number; year: number };
  const description = `Salary — ${who} (${run.year}-${String(run.month).padStart(2, "0")})`;

  const common = { org_id: ctx.org.id, payroll_item_id: itemId, description, ...parsed.data };
  const { error } = ctx.org.require_approval
    ? await supabase.from("pending_payments").insert({ ...common, requested_by: ctx.userId })
    : await supabase.from("transactions").insert({ ...common, kind: "expense", created_by: ctx.userId });
  if (error) return { error: dbMessage(error) };

  revalidatePath(`/${slug}`, "layout");
  return { ok: ctx.org.require_approval ? "Submitted for approval." : "Salary payment recorded." };
}

export async function removeItem(slug: string, itemId: string): Promise<void> {
  const ctx = await requireRole(slug, "accountant");
  uuid.parse(itemId);
  const supabase = await createClient();
  // FK is ON DELETE RESTRICT from transactions, so a salary that already has payments cannot be removed.
  const { error } = await supabase.from("payroll_items").delete().eq("id", itemId).eq("org_id", ctx.org.id);
  if (error) throw new Error("This salary already has payments; delete those first.");
  revalidatePath(`/${slug}/payroll`);
}

export async function addDepartment(slug: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireRole(slug, "admin");
  const parsed = z.object({ name: z.string().trim().min(1, "Name is required").max(100) }).safeParse({ name: form.get("name") });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({ org_id: ctx.org.id, name: parsed.data.name });
  if (error) return { error: dbMessage(error) };
  revalidatePath(`/${slug}/payroll`, "layout");
  return { ok: "Department added." };
}

export async function addEmployee(slug: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireRole(slug, "admin");
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Name is required").max(150),
      position_title: z.string().trim().max(150).default(""),
      department_id: optionalUuid,
      default_amount: nonNegativeAmountField(ctx.org.currency),
      is_owner_pay: z.boolean(),
    })
    .safeParse({
      name: form.get("name"),
      position_title: form.get("position_title") ?? "",
      department_id: form.get("department_id") ?? undefined,
      default_amount: form.get("default_amount") ?? "0",
      is_owner_pay: form.get("is_owner_pay") === "on",
    });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("employees").insert({ org_id: ctx.org.id, ...parsed.data });
  if (error) return { error: dbMessage(error) };
  revalidatePath(`/${slug}/payroll`, "layout");
  return { ok: "Person added. They'll be included in the next payroll run you create." };
}

export async function setEmployeeActive(slug: string, id: string, active: boolean): Promise<void> {
  const ctx = await requireRole(slug, "admin");
  uuid.parse(id);
  const supabase = await createClient();
  await supabase.from("employees").update({ active }).eq("id", id).eq("org_id", ctx.org.id);
  revalidatePath(`/${slug}/payroll`, "layout");
}
