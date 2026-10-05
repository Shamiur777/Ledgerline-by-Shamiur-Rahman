import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { addBankAccount, addBusinessUnit, addCategory, setArchived } from "./actions";

export const metadata: Metadata = { title: "Accounts & categories" };

export default async function AccountsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireRole(slug, "admin");
  const supabase = await createClient();

  const [{ data: balances }, { data: accounts }, { data: categories }, { data: units }] = await Promise.all([
    supabase.rpc("account_balances", { p_org: org.id }),
    supabase.from("bank_accounts").select("id, name, archived").eq("org_id", org.id).order("sort_order"),
    supabase.from("categories").select("id, name, kind, archived").eq("org_id", org.id).order("kind", { ascending: false }).order("name"),
    supabase.from("business_units").select("id, name, archived").eq("org_id", org.id).order("name"),
  ]);
  const balanceById = new Map<string, string>(
    (balances ?? []).map((b: { bank_account_id: string; balance: string }) => [b.bank_account_id, b.balance]),
  );

  const archive = (table: "bank_accounts" | "categories" | "business_units", id: string, archived: boolean) =>
    setArchived.bind(null, slug, table, id, archived);

  return (
    <>
      <PageHeader title="Accounts & categories" subtitle="Where money lives, and how you classify it." />

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Bank accounts</h2>
        <Table>
          <thead><tr><Th>Name</Th><Th className="text-right">Balance</Th><Th /></tr></thead>
          <tbody>
            {(accounts ?? []).map((a) => (
              <tr key={a.id}>
                <Td>{a.name} {a.archived && <Badge>Archived</Badge>}</Td>
                <Td className="tabular text-right">{a.archived ? "—" : formatMoney(balanceById.get(a.id) ?? 0, org.currency)}</Td>
                <Td className="text-right">
                  <form action={archive("bank_accounts", a.id, !a.archived)}>
                    <Button variant="ghost" className="text-xs">{a.archived ? "Restore" : "Archive"}</Button>
                  </form>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Card className="mt-3 p-4">
          <ActionForm action={addBankAccount.bind(null, slug)} submitLabel="Add account" className="flex flex-wrap items-end gap-3">
            <Field label="Account name"><Input name="name" required /></Field>
            <Field label={`Opening balance (${org.currency})`}><Input name="opening_balance" inputMode="decimal" defaultValue="0" /></Field>
          </ActionForm>
        </Card>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Categories</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(["income", "expense"] as const).map((kind) => (
            <Card key={kind} className="p-4">
              <h3 className="mb-2 text-sm font-medium capitalize text-muted">{kind}</h3>
              <ul className="space-y-1 text-sm">
                {(categories ?? []).filter((c) => c.kind === kind).map((c) => (
                  <li key={c.id} className="flex items-center justify-between">
                    <span className={c.archived ? "text-muted line-through" : ""}>{c.name}</span>
                    <form action={archive("categories", c.id, !c.archived)}>
                      <Button variant="ghost" className="px-2 py-1 text-xs">{c.archived ? "Restore" : "Archive"}</Button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <Card className="mt-3 p-4">
          <ActionForm action={addCategory.bind(null, slug)} submitLabel="Add category" className="flex flex-wrap items-end gap-3">
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Type">
              <Select name="kind" defaultValue="expense"><option value="income">Income</option><option value="expense">Expense</option></Select>
            </Field>
          </ActionForm>
        </Card>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Business units</h2>
        <p className="mb-3 text-sm text-muted">Optional tags for a department, project, brand or location, to slice reports by.</p>
        <Card className="p-4">
          <ul className="mb-4 flex flex-wrap gap-2 text-sm">
            {(units ?? []).map((u) => (
              <li key={u.id} className="flex items-center gap-1 rounded-full border border-line px-3 py-1">
                <span className={u.archived ? "text-muted line-through" : ""}>{u.name}</span>
                <form action={archive("business_units", u.id, !u.archived)}>
                  <button className="text-xs text-muted underline">{u.archived ? "restore" : "archive"}</button>
                </form>
              </li>
            ))}
          </ul>
          <ActionForm action={addBusinessUnit.bind(null, slug)} submitLabel="Add unit" className="flex flex-wrap items-end gap-3">
            <Field label="Name"><Input name="name" required /></Field>
          </ActionForm>
        </Card>
      </section>
    </>
  );
}
