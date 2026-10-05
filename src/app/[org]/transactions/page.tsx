import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, Empty, Input, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { can, getOrgContext } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { loadFormOptions } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { deleteTransaction } from "./actions";

export const metadata: Metadata = { title: "Transactions" };
const PAGE_SIZE = 50;

type Row = {
  id: string; kind: "income" | "expense" | "transfer"; amount: string; date: string; description: string; reference: string;
  bill_id: string | null; payroll_item_id: string | null;
  account: { name: string } | null; to_account: { name: string } | null; category: { name: string } | null; unit: { name: string } | null;
};

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const { org, role } = await getOrgContext(slug);
  const supabase = await createClient();
  const opts = await loadFormOptions(org.id);
  const page = Math.max(1, Number(sp.page) || 1);

  let q = supabase
    .from("transactions")
    .select(
      "id, kind, amount, date, description, reference, bill_id, payroll_item_id, account:bank_accounts!bank_account_id(name), to_account:bank_accounts!to_bank_account_id(name), category:categories(name), unit:business_units(name)",
      { count: "exact" },
    )
    .eq("org_id", org.id)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (sp.from) q = q.gte("date", sp.from);
  if (sp.to) q = q.lte("date", sp.to);
  if (sp.kind && ["income", "expense", "transfer"].includes(sp.kind)) q = q.eq("kind", sp.kind);
  if (sp.account) q = q.or(`bank_account_id.eq.${sp.account},to_bank_account_id.eq.${sp.account}`);
  if (sp.category) q = q.eq("category_id", sp.category);
  if (sp.q) {
    // Strip characters that have meaning inside a PostgREST filter expression.
    const term = sp.q.replace(/[,()%*\\]/g, " ").trim();
    if (term) q = q.or(`description.ilike.%${term}%,reference.ilike.%${term}%`);
  }

  const { data, count, error } = await q;
  const rows = (data ?? []) as unknown as Row[];
  const canWrite = can(role, "accountant");
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    u.set("page", String(p));
    return `?${u}`;
  };

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={`${count ?? 0} matching`}
        actions={
          <>
            <LinkButton href={`/${slug}/transactions/deleted`} variant="secondary">Deleted</LinkButton>
            {canWrite && <LinkButton href={`/${slug}/transactions/import`} variant="secondary">Import CSV</LinkButton>}
            {canWrite && <LinkButton href={`/${slug}/transactions/new`}>New transaction</LinkButton>}
          </>
        }
      />

      <Card className="mb-4 p-3">
        <form className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
          <Input name="from" type="date" defaultValue={sp.from} aria-label="From date" />
          <Input name="to" type="date" defaultValue={sp.to} aria-label="To date" />
          <Select name="kind" defaultValue={sp.kind ?? ""} aria-label="Type">
            <option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option>
          </Select>
          <Select name="account" defaultValue={sp.account ?? ""} aria-label="Account">
            <option value="">All accounts</option>
            {opts.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category">
            <option value="">All categories</option>
            {opts.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input name="q" placeholder="Search…" defaultValue={sp.q} aria-label="Search" />
          <Button variant="secondary" type="submit">Filter</Button>
        </form>
      </Card>

      {error && <p className="mb-3 text-sm text-expense">{error.message}</p>}

      {rows.length === 0 ? (
        <Empty title="No transactions found" hint={canWrite ? "Record your first transaction to get started." : undefined} />
      ) : (
        <Table>
          <thead>
            <tr><Th>Date</Th><Th>Details</Th><Th>Account</Th><Th>Category</Th><Th className="text-right">Amount</Th><Th /></tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <Td className="tabular whitespace-nowrap">{t.date}</Td>
                <Td>
                  <div>{t.description || <span className="text-muted">—</span>}</div>
                  <div className="text-xs text-muted">
                    {t.reference}
                    {t.bill_id && <> <Badge tone="brand">Bill</Badge></>}
                    {t.payroll_item_id && <> <Badge tone="brand">Payroll</Badge></>}
                    {t.unit && <> · {t.unit.name}</>}
                  </div>
                </Td>
                <Td>{t.kind === "transfer" ? `${t.account?.name} → ${t.to_account?.name}` : t.account?.name}</Td>
                <Td>{t.kind === "transfer" ? <Badge>Transfer</Badge> : t.category?.name}</Td>
                <Td className={`tabular text-right font-medium ${t.kind === "income" ? "text-income" : t.kind === "expense" ? "text-expense" : ""}`}>
                  {t.kind === "expense" ? "−" : t.kind === "income" ? "+" : ""}{formatMoney(t.amount, org.currency)}
                </Td>
                <Td className="whitespace-nowrap text-right">
                  {canWrite && !t.bill_id && !t.payroll_item_id && (
                    <Link href={`/${slug}/transactions/${t.id}`} className="mr-2 text-xs text-brand underline">Edit</Link>
                  )}
                  {canWrite && (
                    <form action={deleteTransaction.bind(null, slug, t.id)} className="inline">
                      <button className="text-xs text-expense underline">Delete</button>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">Page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <LinkButton href={qs(page - 1)} variant="secondary">Previous</LinkButton>}
            {page < pages && <LinkButton href={qs(page + 1)} variant="secondary">Next</LinkButton>}
          </div>
        </div>
      )}
    </>
  );
}
