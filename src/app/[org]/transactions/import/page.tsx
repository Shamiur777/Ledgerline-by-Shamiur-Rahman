import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import transactions" };

export default async function ImportPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  await requireRole(slug, "accountant");
  return (
    <>
      <PageHeader title="Import transactions" subtitle="Upload a CSV of income and expenses. Nothing is saved until every row is valid." />
      <Card className="mb-6 max-w-2xl p-4 text-sm">
        <p className="mb-2 font-medium">Expected columns</p>
        <code className="block overflow-x-auto rounded bg-bg p-2 text-xs">date,type,amount,account,category,description,reference</code>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
          <li>Dates as <code>YYYY-MM-DD</code>; type is <code>income</code> or <code>expense</code>.</li>
          <li>Account and category names must already exist (case-insensitive).</li>
          <li>Up to 1,000 rows and 1 MB per file. Description and reference are optional.</li>
        </ul>
      </Card>
      <Card className="max-w-2xl p-4">
        <ImportForm slug={slug} />
      </Card>
    </>
  );
}
