"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/action-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbMessage, firstError } from "@/lib/validation";

export async function saveSettings(slug: string, _: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireRole(slug, "admin");
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Company name is too short").max(120),
      fy: z.coerce.number().int().min(1).max(12),
      require_approval: z.boolean(),
    })
    .safeParse({ name: form.get("name"), fy: form.get("fiscal_year_start_month"), require_approval: form.get("require_approval") === "on" });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name, fiscal_year_start_month: parsed.data.fy, require_approval: parsed.data.require_approval })
    .eq("id", ctx.org.id);
  if (error) return { error: dbMessage(error) };
  revalidatePath(`/${slug}`, "layout");
  return { ok: "Settings saved." };
}
