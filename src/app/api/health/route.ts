import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Liveness + keep-alive. A daily Vercel cron (vercel.json) calls this; the tiny query counts as database
 * activity so a free-tier Supabase project doesn't pause after a week without visitors. Reveals nothing:
 * RLS returns no rows to an anonymous caller, and only an ok/not-ok flag is returned.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { error } = await supabase.from("organizations").select("id").limit(1);
  return NextResponse.json({ ok: !error }, {
    status: error ? 503 : 200,
    headers: { "Cache-Control": "public, s-maxage=300" },
  });
}
