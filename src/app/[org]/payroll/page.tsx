import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, Empty, Field, Input, LinkButton, PageHeader, Select, Stat, Table, Td, Th } from "@/components/ui";
import { MONTHS } from "@/lib/currencies";
import { can, getOrgContext } from "@/lib/auth";
import { formatMoney, sumMinor } from "@/lib/money";
import { loadFormOptions, monthRange, todayISO } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { createRun, paySalary, removeItem } from "./actions";

export const metadata: Metadata = { title: "Payroll" };

type Item = {
  payroll_item_id: string; run_year: number; run_month: number; employee_name: string; is_owner_pay: boolean;
  amount_due: string; paid: string; remaining: string;
};

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function PayrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ ym?: string }>;
}) {
  const { org: slug } = await params;
  const { ym: ymParam } = await searchParams;
  const { org, role } = await getOrgContext(slug);
  const { ym } = monthRange(ymParam);
  const [y, m] = ym.split("-").map(Number);

  const supabase = await createClient();
  const opts = await loadFormOptions(org.id);
  const { data } = await supabase.rpc("payroll_outstanding", { p_org: org.id });
  const all = (data ?? []) as Item[];
  const items = all.filter((i) => i.run_year === y && i.run_month === m);
  const { data: run } = await supabase.from("payroll_runs").select("id").eq("org_id", org.id).eq("year", y).eq("month", m).maybeSingle();

  const canWrite = can(role, "accountant");
  const cur = org.currency;
  const sum = (rows: Item[], k: "amount_due" | "paid" | "remaining") => sumMinor(rows.map((r) => r[k]), cur);
  const staff = items.filter((i) => !i.is_owner_pay);
  const owners = items.filter((i) => i.is_owner_pay);
  const expenseCats = opts.categories.filter((c) => c.kind === "expense");
  const salaryCat = expenseCats.find((c) => /salar|payroll|wage/i.test(c.name)) ?? expenseCats[0];

  // Everything still owed across all months.
  const owedAllTime = sumMinor(all.map((i) => i.remaining), cur);

  return (
    <>
      <PageHeader
        title="Payroll"
        subtitle={`${MONTHS[m - 1]} ${y}`}
        actions={
          <>
            <LinkButton href={`?ym=${shiftMonth(ym, -1)}`} variant="secondary">← Prev</LinkButton>
            <LinkButton href={`?ym=${shiftMonth(ym, 1)}`} variant="secondary">Next →</LinkButton>
            {can(role, "admin") && <LinkButton href={`/${slug}/payroll/people`} variant="secondary">People</LinkButton>}
          </>
        }
      />

      {!run ? (
        <Card className="p-8 text-center">
          <p className="mb-4 text-muted">No payroll run for {MONTHS[m - 1]} {y} yet.</p>
          {canWrite ? (
            <form action={createRun.bind(null, slug, ym)}>
              <Button>Create run from active people</Button>
            </form>
          ) : <p className="text-sm text-muted">Ask an accountant to create it.</p>}
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-4">
            <Stat label="Due this month" value={formatMoney(sum(items, "amount_due"), cur)} />
            <Stat label="Paid" value={formatMoney(sum(items, "paid"), cur)} tone="income" />
            <Stat label="Remaining" value={formatMoney(sum(items, "remaining"), cur)} tone="expense" />
            <Stat label="Owed, all months" value={formatMoney(owedAllTime, cur)} sub={owners.length ? `Owner pay: ${formatMoney(sum(owners, "remaining"), cur)} this month` : undefined} />
          </div>

          {items.length === 0 ? (
            <Empty title="No people in this run" hint="Add people from the People page, then recreate the run." />
          ) : (
            <div className="space-y-3">
              {[...staff, ...owners].map((i) => {
                const done = Number(i.remaining) <= 0;
                return (
                  <Card key={i.payroll_item_id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="font-medium">{i.employee_name}</span>{" "}
                        {i.is_owner_pay && <Badge tone="brand">Owner pay</Badge>}
                      </div>
                      <div className="tabular text-sm">
                        <span className="text-muted">due </span>{formatMoney(i.amount_due, cur)}
                        <span className="mx-2 text-muted">paid</span>{formatMoney(i.paid, cur)}
                        <span className="mx-2 text-muted">left</span>
                        <span className={done ? "text-income" : "font-semibold text-expense"}>{done ? "Settled" : formatMoney(i.remaining, cur)}</span>
                      </div>
                    </div>
                    {canWrite && !done && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-medium text-brand">{org.require_approval ? "Request payment" : "Pay"}</summary>
                        <ActionForm action={paySalary.bind(null, slug, i.payroll_item_id)} submitLabel={org.require_approval ? "Submit for approval" : "Record payment"} className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
                          <Field label="Amount"><Input name="amount" inputMode="decimal" defaultValue={i.remaining} required /></Field>
                          <Field label="Date"><Input name="date" type="date" defaultValue={todayISO()} required /></Field>
                          <Field label="From account"><Select name="bank_account_id" required>{opts.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
                          <Field label="Category"><Select name="category_id" defaultValue={salaryCat?.id} required>{expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
                        </ActionForm>
                      </details>
                    )}
                    {canWrite && Number(i.paid) === 0 && (
                      <form action={removeItem.bind(null, slug, i.payroll_item_id)} className="mt-2">
                        <button className="text-xs text-muted underline hover:text-expense">Remove from this run</button>
                      </form>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {items.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Summary</h2>
          <Table>
            <thead><tr><Th>Group</Th><Th className="text-right">Due</Th><Th className="text-right">Paid</Th><Th className="text-right">Remaining</Th></tr></thead>
            <tbody>
              {([["Staff", staff], ["Owners / directors", owners]] as const).map(([label, rows]) => (
                <tr key={label}>
                  <Td>{label}</Td>
                  <Td className="tabular text-right">{formatMoney(sum([...rows], "amount_due"), cur)}</Td>
                  <Td className="tabular text-right">{formatMoney(sum([...rows], "paid"), cur)}</Td>
                  <Td className="tabular text-right">{formatMoney(sum([...rows], "remaining"), cur)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}
    </>
  );
}
