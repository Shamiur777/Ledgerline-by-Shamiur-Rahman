import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "viewer" | "accountant" | "approver" | "admin" | "owner";
export const ROLE_RANK: Record<Role, number> = { viewer: 1, accountant: 2, approver: 3, admin: 4, owner: 5 };
export const can = (role: Role, min: Role) => ROLE_RANK[role] >= ROLE_RANK[min];

export type OrgContext = {
  org: { id: string; name: string; slug: string; currency: string; fiscal_year_start_month: number; require_approval: boolean; is_demo: boolean };
  role: Role;
  userId: string;
};

export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

export const listMemberships = cache(async () => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  // RLS lets members see their whole org's roster, so the user filter is required here.
  const { data } = await supabase
    .from("memberships")
    .select("role, organizations(id, name, slug, currency)")
    .eq("user_id", user.id)
    .order("created_at");
  return (data ?? []).map((m) => ({ role: m.role as Role, org: m.organizations as unknown as OrgContext["org"] }));
});

/** Resolve the org from the URL slug for the signed-in user, 404 if they are not a member. */
export const getOrgContext = cache(async (slug: string): Promise<OrgContext> => {
  const user = await getUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("role, organizations!inner(id, name, slug, currency, fiscal_year_start_month, require_approval, is_demo)")
    .eq("organizations.slug", slug)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) notFound();
  return { org: data.organizations as unknown as OrgContext["org"], role: data.role as Role, userId: user.id };
});

/** For pages/actions that need a minimum role. UI hiding is a convenience; RLS is the real gate. */
export async function requireRole(slug: string, min: Role): Promise<OrgContext> {
  const ctx = await getOrgContext(slug);
  if (!can(ctx.role, min)) redirect(`/${slug}/dashboard`);
  return ctx;
}
