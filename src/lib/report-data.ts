import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildBalanceSheet,
  buildCashflow,
  buildPnl,
  fiscalYearRange,
  type Report,
  type ReportKind,
} from "@/lib/reports";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export type ReportParams = { from?: string; to?: string; asOf?: string };

/** Loads and shapes a report. Runs as the caller, so RLS and the SQL functions' membership checks apply. */
export async function loadReport(
  supabase: SupabaseClient,
  org: { id: string; currency: string; fiscal_year_start_month: number },
  kind: ReportKind,
  p: ReportParams,
  today = new Date().toISOString().slice(0, 10),
): Promise<Report> {
  const fy = fiscalYearRange(org.fiscal_year_start_month, today);
  const from = p.from && ISO.test(p.from) ? p.from : fy.from;
  const to = p.to && ISO.test(p.to) ? p.to : fy.to;
  const asOf = p.asOf && ISO.test(p.asOf) ? p.asOf : today;

  if (kind === "pnl") {
    const { data, error } = await supabase.rpc("pnl_by_category", { p_org: org.id, p_from: from, p_to: to });
    if (error) throw new Error(error.message);
    return buildPnl(data ?? [], org.currency, from, to);
  }
  if (kind === "cashflow") {
    const { data, error } = await supabase.rpc("monthly_totals", { p_org: org.id, p_from: from, p_to: to });
    if (error) throw new Error(error.message);
    return buildCashflow(data ?? [], org.currency, from, to);
  }
  const [bal, sheet] = await Promise.all([
    supabase.rpc("account_balances", { p_org: org.id, p_as_of: asOf }),
    supabase.rpc("balance_sheet", { p_org: org.id, p_as_of: asOf }),
  ]);
  if (bal.error) throw new Error(bal.error.message);
  if (sheet.error) throw new Error(sheet.error.message);
  return buildBalanceSheet(bal.data ?? [], sheet.data[0], org.currency, asOf);
}
