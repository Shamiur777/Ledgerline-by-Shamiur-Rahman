import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { TransactionForm } from "@/components/transaction-form";
import { requireRole } from "@/lib/auth";
import { loadFormOptions } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";
import { saveTransaction } from "../actions";

export const metadata: Metadata = { title: "Edit transaction" };

export default async function EditTransactionPage({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: slug, id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const { org } = await requireRole(slug, "accountant");
  const supabase = await createClient();
  const { data: t } = await supabase.from("transactions").select("*").eq("id", id).eq("org_id", org.id).is("deleted_at", null).maybeSingle();
  if (!t) notFound();
  // Bill and payroll payments are edited from their own screens so balances stay consistent.
  if (t.bill_id || t.payroll_item_id) redirect(`/${slug}/transactions`);
  const opts = await loadFormOptions(org.id);

  return (
    <>
      <PageHeader title="Edit transaction" />
      <TransactionForm
        {...opts}
        currency={org.currency}
        action={saveTransaction.bind(null, slug, id)}
        submitLabel="Save changes"
        defaults={{ ...t, amount: String(t.amount) }}
      />
    </>
  );
}
