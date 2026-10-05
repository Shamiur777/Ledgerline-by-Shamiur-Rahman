"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbMessage, firstError, uuid } from "@/lib/validation";

const role = z.enum(["viewer", "accountant", "approver", "admin"]);

/** Creates a single-use invite link. Shown once; only a hash is stored server-side. */
export async function inviteMember(slug: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireRole(slug, "admin");
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")), role })
    .safeParse({ email: form.get("email"), role: form.get("role") });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_invitation", {
    p_org: ctx.org.id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error) return { error: dbMessage(error) };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  revalidatePath(`/${slug}/members`);
  return { ok: `Invite for ${parsed.data.email} (valid 7 days, single use). Copy this link now, it won't be shown again: ${proto}://${host}/invite/${token}` };
}

export async function revokeInvitation(slug: string, id: string): Promise<void> {
  const ctx = await requireRole(slug, "admin");
  uuid.parse(id);
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", id).eq("org_id", ctx.org.id);
  revalidatePath(`/${slug}/members`);
}

export async function changeRole(slug: string, userId: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireRole(slug, "admin");
  uuid.parse(userId);
  const parsed = role.safeParse(form.get("role"));
  if (!parsed.success) return { error: "Invalid role" };
  const supabase = await createClient();
  const { error } = await supabase.from("memberships").update({ role: parsed.data }).eq("org_id", ctx.org.id).eq("user_id", userId);
  if (error) return { error: dbMessage(error) };
  revalidatePath(`/${slug}/members`);
  return { ok: "Role updated." };
}

export async function removeMember(slug: string, userId: string): Promise<void> {
  const ctx = await requireRole(slug, "admin");
  uuid.parse(userId);
  const supabase = await createClient();
  await supabase.from("memberships").delete().eq("org_id", ctx.org.id).eq("user_id", userId);
  revalidatePath(`/${slug}/members`);
}
