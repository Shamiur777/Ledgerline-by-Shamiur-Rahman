import type { Metadata } from "next";
import { Button, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { can, getOrgContext } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { restoreTransaction } from "../actions";

export const metadata: Metadata = { title: "Deleted transactions" };

export default async function DeletedPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org, role } = await getOrgContext(slug);
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("id, kind, amount, date, description, deleted_at, category:categories(name)")
    .eq("org_id", org.id)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as unknown as { id: string; kind: string; amount: string; date: string; description: string; deleted_at: string; category: { name: string } | null }[];

  return (
    <>
      <PageHeader title="Deleted transactions" subtitle="Deleted entries are excluded from balances and reports. Restore them any time." />
      {rows.length === 0 ? (
        <Empty title="Nothing deleted" />
      ) : (
        <Table>
          <thead><tr><Th>Date</Th><Th>Details</Th><Th>Category</Th><Th className="text-right">Amount</Th><Th>Deleted</Th><Th /></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <Td className="tabular">{t.date}</Td>
                <Td>{t.description || "—"}</Td>
                <Td>{t.category?.name ?? "Transfer"}</Td>
                <Td className="tabular text-right">{formatMoney(t.amount, org.currency)}</Td>
                <Td className="text-xs text-muted">{t.deleted_at.slice(0, 10)}</Td>
                <Td className="text-right">
                  {can(role, "accountant") && (
                    <form action={restoreTransaction.bind(null, slug, t.id)}>
                      <Button variant="secondary" className="text-xs">Restore</Button>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
