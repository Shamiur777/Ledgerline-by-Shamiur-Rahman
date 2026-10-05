import { createClient } from "@/lib/supabase/server";

/** Reference data used by every transaction-like form. */
export async function loadFormOptions(orgId: string) {
  const supabase = await createClient();
  const [accounts, categories, units] = await Promise.all([
    supabase.from("bank_accounts").select("id, name").eq("org_id", orgId).eq("archived", false).order("sort_order").order("name"),
    supabase.from("categories").select("id, name, kind").eq("org_id", orgId).eq("archived", false).order("name"),
    supabase.from("business_units").select("id, name").eq("org_id", orgId).eq("archived", false).order("name"),
  ]);
  return {
    accounts: (accounts.data ?? []) as { id: string; name: string }[],
    categories: (categories.data ?? []) as { id: string; name: string; kind: "income" | "expense" }[],
    units: (units.data ?? []) as { id: string; name: string }[],
  };
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function monthRange(ym: string | undefined) {
  const base = ym && /^\d{4}-\d{2}$/.test(ym) ? ym : todayISO().slice(0, 7);
  const [y, m] = base.split("-").map(Number);
  const first = `${base}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { ym: base, first, last };
}
