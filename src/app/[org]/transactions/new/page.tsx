import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { TransactionForm } from "@/components/transaction-form";
import { requireRole } from "@/lib/auth";
import { loadFormOptions } from "@/lib/queries";
import { saveTransaction } from "../actions";

export const metadata: Metadata = { title: "New transaction" };

export default async function NewTransactionPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireRole(slug, "accountant");
  const opts = await loadFormOptions(org.id);
  return (
    <>
      <PageHeader title="New transaction" />
      <TransactionForm {...opts} currency={org.currency} action={saveTransaction.bind(null, slug, null)} submitLabel="Save transaction" />
    </>
  );
}
