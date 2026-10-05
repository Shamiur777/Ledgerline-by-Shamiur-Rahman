import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, Input, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { getOrgContext } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { loadReport } from "@/lib/report-data";
import { REPORT_KINDS, type ReportKind } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

const LABELS: Record<ReportKind, string> = { pnl: "Profit & Loss", cashflow: "Cash flow", balance: "Balance sheet" };

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ type?: string; from?: string; to?: string; asOf?: string }>;
}) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const { org } = await getOrgContext(slug);
  const kind = (REPORT_KINDS as string[]).includes(sp.type ?? "") ? (sp.type as ReportKind) : "pnl";

  const supabase = await createClient();
  const report = await loadReport(supabase, org, kind, sp);

  // Preserve the active filter in export links.
  const q = new URLSearchParams({ org: slug });
  (["from", "to", "asOf"] as const).forEach((k) => sp[k] && q.set(k, sp[k]!));
  const exportHref = (format: string) => `/api/export/${kind}?${q}&format=${format}`;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={report.subtitle}
        actions={
          <>
            <LinkButton href={exportHref("xlsx")} variant="secondary" prefetch={false}>Excel</LinkButton>
            <LinkButton href={exportHref("pdf")} variant="secondary" prefetch={false}>PDF</LinkButton>
            <LinkButton href={exportHref("csv")} variant="secondary" prefetch={false}>CSV</LinkButton>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div role="tablist" aria-label="Report type" className="inline-flex overflow-hidden rounded-lg border border-line">
          {REPORT_KINDS.map((k) => (
            <Link
              key={k}
              role="tab"
              aria-selected={k === kind}
              href={`?type=${k}`}
              className={`px-4 py-2 text-sm ${k === kind ? "bg-brand text-brand-ink" : "bg-surface hover:bg-brand-soft"}`}
            >
              {LABELS[k]}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="type" value={kind} />
          {kind === "balance" ? (
            <label className="text-xs text-muted">As of<Input name="asOf" type="date" defaultValue={sp.asOf} className="mt-1" /></label>
          ) : (
            <>
              <label className="text-xs text-muted">From<Input name="from" type="date" defaultValue={sp.from} className="mt-1" /></label>
              <label className="text-xs text-muted">To<Input name="to" type="date" defaultValue={sp.to} className="mt-1" /></label>
            </>
          )}
          <Button variant="secondary" type="submit">Apply</Button>
        </form>
      </div>

      <div className="space-y-6">
        {report.sections.map((sec) => (
          <section key={sec.heading}>
            <h2 className="mb-2 font-semibold">{sec.heading}</h2>
            {sec.rows.length === 0 && !sec.totalRow ? (
              <Card className="p-4 text-sm text-muted">No data for this period.</Card>
            ) : (
              <Table>
                <thead>
                  <tr>{sec.columns.map((c, i) => <Th key={i} className={sec.amountCols.includes(i) ? "text-right" : ""}>{c}</Th>)}</tr>
                </thead>
                <tbody>
                  {sec.rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((c, i) => (
                        <Td key={i} className={sec.amountCols.includes(i) ? "tabular text-right" : ""}>
                          {sec.amountCols.includes(i) && c !== "" ? formatMoney(c, report.currency) : c}
                        </Td>
                      ))}
                    </tr>
                  ))}
                  {sec.totalRow && (
                    <tr className="bg-brand-soft/50 font-semibold">
                      {sec.totalRow.map((c, i) => (
                        <Td key={i} className={sec.amountCols.includes(i) ? "tabular text-right" : ""}>
                          {sec.amountCols.includes(i) && c !== "" ? formatMoney(c, report.currency) : c}
                        </Td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </Table>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
