import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, Empty, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { can, getOrgContext } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { approve, cancelRequest, reject } from "./actions";

export const metadata: Metadata = { title: "Approvals" };

type Pending = {
  id: string; amount: string; date: string; description: string; reference: string; status: "pending" | "approved" | "rejected";
  requested_by: string; decided_by: string | null; decided_at: string | null; decision_note: string; created_at: string;
  account: { name: string } | null; category: { name: string } | null;
};

export default async function ApprovalsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org, role, userId } = await getOrgContext(slug);
  const supabase = await createClient();

  const { data } = await supabase
    .from("pending_payments")
    .select("id, amount, date, description, reference, status, requested_by, decided_by, decided_at, decision_note, created_at, account:bank_accounts!bank_account_id(name), category:categories(name)")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as unknown as Pending[];

  // profiles has no direct FK from pending_payments, so resolve names separately.
  const ids = [...new Set(rows.flatMap((r) => [r.requested_by, r.decided_by].filter(Boolean) as string[]))];
  const { data: profs } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const name = new Map((profs ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name || "Unknown"]));

  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");
  const isApprover = can(role, "approver");

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle={org.require_approval ? "Payments wait here until an approver signs off." : "Approval is off for this company. Turn it on in Settings."}
      />

      {pending.length === 0 ? (
        <Empty title="Nothing waiting for approval" />
      ) : (
        <div className="space-y-3">
          {pending.map((p) => {
            const mine = p.requested_by === userId;
            return (
              <Card key={p.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{p.description || "Payment"}</div>
                    <div className="text-sm text-muted">
                      {p.account?.name} · {p.category?.name} · requested by {mine ? "you" : name.get(p.requested_by)} on {p.created_at.slice(0, 10)}
                    </div>
                  </div>
                  <div className="tabular text-xl font-semibold">{formatMoney(p.amount, org.currency)}</div>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  {isApprover && (
                    <ActionForm action={approve.bind(null, slug, p.id)} submitLabel="Approve" className="inline-block">
                      <span />
                    </ActionForm>
                  )}
                  {isApprover && (
                    <ActionForm action={reject.bind(null, slug, p.id)} submitLabel="Reject" variant="danger" className="flex items-end gap-2">
                      <Input name="note" placeholder="Reason (optional)" maxLength={300} aria-label="Rejection reason" />
                    </ActionForm>
                  )}
                  {(mine || can(role, "admin")) && (
                    <form action={cancelRequest.bind(null, slug, p.id)}>
                      <Button variant="ghost" className="text-xs">Cancel request</Button>
                    </form>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {decided.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">History</h2>
          <Table>
            <thead><tr><Th>Description</Th><Th>Requested by</Th><Th className="text-right">Amount</Th><Th>Decision</Th></tr></thead>
            <tbody>
              {decided.slice(0, 30).map((p) => (
                <tr key={p.id}>
                  <Td>{p.description || "Payment"}</Td>
                  <Td>{name.get(p.requested_by)}</Td>
                  <Td className="tabular text-right">{formatMoney(p.amount, org.currency)}</Td>
                  <Td>
                    <Badge tone={p.status === "approved" ? "good" : "bad"}>{p.status}</Badge>{" "}
                    <span className="text-xs text-muted">by {p.decided_by ? name.get(p.decided_by) : "—"}{p.decision_note && ` — ${p.decision_note}`}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}
    </>
  );
}
