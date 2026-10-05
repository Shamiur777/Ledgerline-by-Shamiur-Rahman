"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbMessage, firstError, uuid } from "@/lib/validation";

export async function approve(slug: string, id: string, _: ActionResult): Promise<ActionResult> {
  await requireRole(slug, "approver");
  uuid.parse(id);
  const supabase = await createClient();
  // Atomic: the database function re-checks role, status and the four-eyes rule, then posts the transaction.
  const { error } = await supabase.rpc("approve_pending_payment", { p_id: id });
  if (error) return { error: dbMessage(error) };
  revalidatePath(`/${slug}`, "layout");
  return { ok: "Approved and posted." };
}

export async function reject(slug: string, id: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole(slug, "approver");
  uuid.parse(id);
  const parsed = z.object({ note: z.string().trim().max(300).default("") }).safeParse({ note: form.get("note") ?? "" });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_pending_payment", { p_id: id, p_note: parsed.data.note });
  if (error) return { error: dbMessage(error) };
  revalidatePath(`/${slug}`, "layout");
  return { ok: "Rejected." };
}

export async function cancelRequest(slug: string, id: string): Promise<void> {
  await requireRole(slug, "accountant");
  uuid.parse(id);
  const supabase = await createClient();
  await supabase.from("pending_payments").delete().eq("id", id).eq("status", "pending");
  revalidatePath(`/${slug}`, "layout");
}
