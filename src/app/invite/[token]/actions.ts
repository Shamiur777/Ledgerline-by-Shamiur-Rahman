"use server";

import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/action-form";
import { createClient } from "@/lib/supabase/server";
import { dbMessage } from "@/lib/validation";

export async function acceptInvitation(token: string): Promise<ActionResult> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { error: "This invitation is invalid or has expired." };
  const supabase = await createClient();
  const { data: orgId, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { error: dbMessage(error) };
  const { data: org } = await supabase.from("organizations").select("slug").eq("id", orgId).single();
  redirect(`/${org!.slug}/dashboard`);
}
