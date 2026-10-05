import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Empty, Input, LinkButton, PageHeader, Stat, Button } from "@/components/ui";
import { TrendChart, type TrendPoint } from "@/components/trend-chart";
import { getOrgContext } from "@/lib/auth";
import { formatMoney, sumMinor, toMinor } from "@/lib/money";
import { monthRange } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

type Totals = { month: string; income: string; expense: string };

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ ym?: string }>;
}) {
  const { org: slug } = await params;
  const { ym: ymParam } = await searchParams;
  const { org } = await getOrgContext(slug);
  const { ym, first, last } = monthRange(ymParam);
  const cur = org.currency;

  // 12 months ending at the selected month.
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10);

  const supabase = await createClient();
  const [trend, balances, upcoming, recent, pending] = await Promise.all([
    supabase.rpc("monthly_totals", { p_org: org.id, p_from: start, p_to: last }),
    supabase.rpc("account_balances", { p_org: org.id, p_as_of: last }),
    supabase.rpc("upcoming_bills", { p_org: org.id, p_days: 14 }),
    supabase
      .from("transactions")
      .select("id, kind, amount, date, description, category:categories(name)")
      .eq("org_id", org.id)
      .is("deleted_at", null)
      .gte("date", first)
      .lte("date", last)
      .order("date", { ascending: false })
      .limit(8),
    supabase.from("pending_payments").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "pending"),
  ]);

  const rows = (trend.data ?? []) as Totals[];
  const chart: TrendPoint[] = rows.map((r) => ({
    month: new Date(r.month + "T00:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
    income: Number(r.income),
    expense: Number(r.expense),
  }));
  const thisMonth = rows.find((r) => r.month.slice(0, 7) === ym) ?? { income: "0", expense: "0" };
  const net = toMinor(thisMonth.income, cur) - toMinor(thisMonth.expense, cur);
  const bal = (balances.data ?? []) as { bank_account_id: string; name: string; balance: string }[];
  const cash = sumMinor(bal.map((b) => b.balance), cur);
  const bills = (upcoming.data ?? []) as { bill_id: string; vendor_name: string; outstanding: string; due_date: string; days_left: number }[];
  const recents = (recent.data ?? []) as unknown as { id: string; kind: string; amount: string; date: string; description: string; category: { name: string } | null }[];

  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={new Date(first + "T00:00:00Z").toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
        actions={
          <>
            <LinkButton href={`?ym=${prev}`} variant="secondary">←</LinkButton>
            <form className="flex gap-1">
              <Input name="ym" type="month" defaultValue={ym} aria-label="Month" className="w-40" />
              <Button variant="secondary" type="submit">Go</Button>
            </form>
            <LinkButton href={`?ym=${next}`} variant="secondary">→</LinkButton>
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Income" value={formatMoney(thisMonth.income, cur)} tone="income" />
        <Stat label="Expenses" value={formatMoney(thisMonth.expense, cur)} tone="expense" />
        <Stat label="Net" value={formatMoney(net, cur)} tone={net >= 0n ? "income" : "expense"} />
        <Stat label="Cash on hand" value={formatMoney(cash, cur)} sub={`as of ${last}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h2 className="mb-2 font-semibold">Last 12 months</h2>
          <TrendChart data={chart} currency={cur} />
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-2 font-semibold">Accounts</h2>
            {bal.length === 0 ? <p className="text-sm text-muted">No accounts yet.</p> : (
              <ul className="space-y-1.5 text-sm">
                {bal.map((b) => (
                  <li key={b.bank_account_id} className="flex justify-between">
                    <span>{b.name}</span><span className="tabular">{formatMoney(b.balance, cur)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Bills due soon</h2>
              <Link href={`/${slug}/payables`} className="text-xs text-brand underline">All</Link>
            </div>
            {bills.length === 0 ? <p className="text-sm text-muted">Nothing due in the next 14 days.</p> : (
              <ul className="space-y-1.5 text-sm">
                {bills.slice(0, 5).map((b) => (
                  <li key={b.bill_id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{b.vendor_name}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular">{formatMoney(b.outstanding, cur)}</span>
                      <Badge tone={b.days_left < 0 ? "bad" : "warn"}>{b.days_left < 0 ? `${-b.days_left}d late` : `${b.days_left}d`}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {!!pending.count && (
            <Link href={`/${slug}/approvals`} className="block rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm font-medium text-warn">
              {pending.count} payment{pending.count > 1 ? "s" : ""} waiting for approval →
            </Link>
          )}
        </div>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 font-semibold">Recent activity</h2>
        {recents.length === 0 ? (
          <Empty title="No transactions this month" />
        ) : (
          <Card>
            <ul className="divide-y divide-line text-sm">
              {recents.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate">{t.description || t.category?.name || "Transfer"}</div>
                    <div className="text-xs text-muted">{t.date} · {t.category?.name ?? "Transfer"}</div>
                  </div>
                  <span className={`tabular font-medium ${t.kind === "income" ? "text-income" : t.kind === "expense" ? "text-expense" : ""}`}>
                    {t.kind === "expense" ? "−" : t.kind === "income" ? "+" : ""}{formatMoney(t.amount, cur)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </>
  );
}
