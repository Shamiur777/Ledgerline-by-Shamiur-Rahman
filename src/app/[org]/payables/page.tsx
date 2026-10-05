import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Empty, Field, Input, PageHeader, Select, Stat, Table, Td, Textarea, Th } from "@/components/ui";
import { can, getOrgContext } from "@/lib/auth";
import { formatMoney, sumMinor } from "@/lib/money";
import { loadFormOptions, todayISO } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { addBill, payBill } from "./actions";

export const metadata: Metadata = { title: "Payables" };

type Bill = {
  bill_id: string; vendor_name: string; description: string; amount_due: string; paid: string;
  outstanding: string; bill_date: string; due_date: string | null;
};

function dueBadge(due: string | null, outstanding: string) {
  if (Number(outstanding) <= 0) return <Badge tone="good">Paid</Badge>;
  if (!due) return <Badge>No due date</Badge>;
  const days = Math.ceil((new Date(due).getTime() - new Date(todayISO()).getTime()) / 86_400_000);
  if (days < 0) return <Badge tone="bad">Overdue {-days}d</Badge>;
  if (days <= 10) return <Badge tone="warn">Due in {days}d</Badge>;
  return <Badge>{due}</Badge>;
}

export default async function PayablesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org, role } = await getOrgContext(slug);
  const supabase = await createClient();
  const opts = await loadFormOptions(org.id);
  const { data: vendors } = await supabase.from("vendors").select("id, name").eq("org_id", org.id).order("name");
  const { data } = await supabase.rpc("bills_outstanding", { p_org: org.id });
  const bills = (data ?? []) as Bill[];
  const open = bills.filter((b) => Number(b.outstanding) > 0);
  const settled = bills.filter((b) => Number(b.outstanding) <= 0);
  const totalOutstanding = sumMinor(open.map((b) => b.outstanding), org.currency);
  const canWrite = can(role, "accountant");
  const expenseCats = opts.categories.filter((c) => c.kind === "expense");
  const vendorCategory = expenseCats.find((c) => /vendor/i.test(c.name)) ?? expenseCats[0];

  return (
    <>
      <PageHeader title="Payables" subtitle="Vendor bills and what you still owe." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Total outstanding" value={formatMoney(totalOutstanding, org.currency)} tone="expense" />
        <Stat label="Open bills" value={String(open.length)} />
        <Stat label="Overdue" value={String(open.filter((b) => b.due_date && b.due_date < todayISO()).length)} />
      </div>

      {open.length === 0 ? (
        <Empty title="No open bills" hint="Bills you add will appear here until they are paid." />
      ) : (
        <div className="space-y-3">
          {open.map((b) => (
            <Card key={b.bill_id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{b.vendor_name}</div>
                  <div className="text-sm text-muted">{b.description || "—"} · billed {b.bill_date}</div>
                </div>
                <div className="text-right">
                  <div className="tabular text-lg font-semibold">{formatMoney(b.outstanding, org.currency)}</div>
                  <div className="text-xs text-muted">of {formatMoney(b.amount_due, org.currency)}</div>
                  <div className="mt-1">{dueBadge(b.due_date, b.outstanding)}</div>
                </div>
              </div>
              {canWrite && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-brand">
                    {org.require_approval ? "Request payment" : "Record payment"}
                  </summary>
                  <ActionForm action={payBill.bind(null, slug, b.bill_id)} submitLabel={org.require_approval ? "Submit for approval" : "Pay"} className="mt-3 grid gap-3 sm:grid-cols-5 sm:items-end">
                    <Field label="Amount"><Input name="amount" inputMode="decimal" defaultValue={b.outstanding} required /></Field>
                    <Field label="Date"><Input name="date" type="date" defaultValue={todayISO()} required /></Field>
                    <Field label="From account">
                      <Select name="bank_account_id" required>{opts.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
                    </Field>
                    <Field label="Category">
                      <Select name="category_id" defaultValue={vendorCategory?.id} required>{expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                    </Field>
                    <Field label="Reference"><Input name="reference" maxLength={100} /></Field>
                  </ActionForm>
                </details>
              )}
            </Card>
          ))}
        </div>
      )}

      {canWrite && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Add a bill</h2>
          <Card className="max-w-2xl p-4">
            <ActionForm action={addBill.bind(null, slug)} submitLabel="Add bill" className="grid gap-3 sm:grid-cols-2">
              <Field label="Vendor">
                <Select name="vendor_id" defaultValue="">
                  <option value="">— new vendor below —</option>
                  {(vendors ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
              </Field>
              <Field label="New vendor name"><Input name="new_vendor" maxLength={150} /></Field>
              <Field label={`Amount (${org.currency})`}><Input name="amount_due" inputMode="decimal" required /></Field>
              <Field label="Bill date"><Input name="bill_date" type="date" defaultValue={todayISO()} required /></Field>
              <Field label="Due date" hint="Optional"><Input name="due_date" type="date" /></Field>
              <div className="sm:col-span-2"><Field label="Description"><Textarea name="description" rows={2} maxLength={500} /></Field></div>
            </ActionForm>
          </Card>
        </section>
      )}

      {settled.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Settled</h2>
          <Table>
            <thead><tr><Th>Vendor</Th><Th>Description</Th><Th>Billed</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>
              {settled.slice(0, 25).map((b) => (
                <tr key={b.bill_id}>
                  <Td>{b.vendor_name}</Td><Td>{b.description || "—"}</Td><Td className="tabular">{b.bill_date}</Td>
                  <Td className="tabular text-right">{formatMoney(b.amount_due, org.currency)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}
    </>
  );
}
