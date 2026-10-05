"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(2, "Company name is too short").max(120),
  currency: z.string().regex(/^[A-Z]{3}$/, "Pick a currency"),
  fy_start: z.coerce.number().int().min(1).max(12),
  starter: z.boolean(),
});

export async function createOrganization(_: { error?: string } | undefined, form: FormData) {
  const parsed = schema.safeParse({
    name: form.get("name"),
    currency: form.get("currency"),
    fy_start: form.get("fy_start"),
    starter: form.get("starter") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: orgId, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_currency: parsed.data.currency,
    p_fy_start: parsed.data.fy_start,
    p_starter: parsed.data.starter,
  });
  if (error) return { error: error.message };

  const { data: org } = await supabase.from("organizations").select("slug").eq("id", orgId).single();
  redirect(`/${org!.slug}/dashboard`);
}
