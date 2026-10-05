import { NextResponse, type NextRequest } from "next/server";
import { reportToCsv } from "@/lib/export/csv";
import { reportToPdf } from "@/lib/export/pdf";
import { reportToXlsx } from "@/lib/export/xlsx";
import { loadReport } from "@/lib/report-data";
import { REPORT_KINDS, type ReportKind } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const FORMATS = {
  csv: { type: "text/csv; charset=utf-8", ext: "csv" },
  xlsx: { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
  pdf: { type: "application/pdf", ext: "pdf" },
} as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  const sp = req.nextUrl.searchParams;
  const format = sp.get("format") ?? "pdf";
  const slug = sp.get("org") ?? "";

  if (!REPORT_KINDS.includes(report as ReportKind)) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  if (!(format in FORMATS)) return NextResponse.json({ error: "Unknown format" }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // RLS only returns this row if the caller is a member of the org.
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, currency, fiscal_year_start_month")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let data;
  try {
    data = await loadReport(supabase, org, report as ReportKind, {
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      asOf: sp.get("asOf") ?? undefined,
    });
  } catch {
    return NextResponse.json({ error: "Could not build report" }, { status: 500 });
  }

  const f = FORMATS[format as keyof typeof FORMATS];
  const body =
    format === "csv" ? reportToCsv(data) : format === "xlsx" ? await reportToXlsx(data) : await reportToPdf(data, org.name);
  const filename = `${org.slug}-${report}-${new Date().toISOString().slice(0, 10)}.${f.ext}`;

  return new NextResponse(body as BodyInit, {
    headers: {
      "Content-Type": f.type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
