import type { Metadata } from "next";
import { Badge, Empty, PageHeader, Select, Table, Td, Th, Button } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit log" };

type Entry = {
  id: number; created_at: string; user_id: string | null; action: string; entity: string; entity_id: string | null;
  diff: { old?: Record<string, unknown>; new?: Record<string, unknown> } | null;
};

const NOISE = new Set(["updated_at", "created_at"]);

/** Human summary of what changed on an update, e.g. "amount: 100.00 → 120.00". */
function summarize(e: Entry): string {
  const { old, new: next } = e.diff ?? {};
  if (e.action === "update" && old && next) {
    const changes = Object.keys(next)
      .filter((k) => !NOISE.has(k) && JSON.stringify(old[k]) !== JSON.stringify(next[k]))
      .map((k) => `${k}: ${String(old[k] ?? "∅")} → ${String(next[k] ?? "∅")}`);
    return changes.join("; ") || "no visible change";
  }
  const row = next ?? old ?? {};
  const label = row.name ?? row.description ?? row.amount ?? row.role;
  return label != null ? String(label) : "";
}

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ entity?: string }>;
}) {
  const { org: slug } = await params;
  const { entity } = await searchParams;
  const { org } = await requireRole(slug, "admin");
  const supabase = await createClient();

  let q = supabase.from("audit_log").select("id, created_at, user_id, action, entity, entity_id, diff").eq("org_id", org.id).order("id", { ascending: false }).limit(200);
  if (entity) q = q.eq("entity", entity);
  const { data } = await q;
  const entries = (data ?? []) as Entry[];

  const ids = [...new Set(entries.map((e) => e.user_id).filter(Boolean) as string[])];
  const { data: profs } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const name = new Map((profs ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name || "Unknown"]));
  const entities = ["transactions", "pending_payments", "bills", "payroll_items", "payroll_runs", "employees", "bank_accounts", "categories", "vendors", "memberships", "organizations"];

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every change to the books, written by the database. Read-only." />
      <form className="mb-4 flex gap-2">
        <Select name="entity" defaultValue={entity ?? ""} aria-label="Entity" className="w-56">
          <option value="">All activity</option>
          {entities.map((e) => <option key={e} value={e}>{e.replace("_", " ")}</option>)}
        </Select>
        <Button variant="secondary" type="submit">Filter</Button>
      </form>
      {entries.length === 0 ? (
        <Empty title="No activity yet" />
      ) : (
        <Table>
          <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>What</Th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <Td className="tabular whitespace-nowrap text-xs">{e.created_at.replace("T", " ").slice(0, 19)}</Td>
                <Td>{e.user_id ? name.get(e.user_id) ?? "Unknown" : "System"}</Td>
                <Td><Badge tone={e.action === "delete" ? "bad" : e.action === "insert" ? "good" : "neutral"}>{e.action}</Badge> <span className="text-xs text-muted">{e.entity.replace("_", " ")}</span></Td>
                <Td className="max-w-md truncate text-xs text-muted" title={summarize(e)}>{summarize(e)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
