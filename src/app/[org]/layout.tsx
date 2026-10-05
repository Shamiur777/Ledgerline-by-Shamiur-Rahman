import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { SideNav, type NavItem } from "@/components/side-nav";
import { can, getOrgContext, listMemberships } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const ctx = await getOrgContext(slug);
  const memberships = await listMemberships();
  const supabase = await createClient();

  const [{ data: due }, { count: pending }] = await Promise.all([
    supabase.rpc("upcoming_bills", { p_org: ctx.org.id, p_days: 10 }),
    can(ctx.role, "approver")
      ? supabase.from("pending_payments").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("status", "pending")
      : Promise.resolve({ count: 0 }),
  ]);

  const items: NavItem[] = [
    { href: "dashboard", label: "Dashboard" },
    { href: "transactions", label: "Transactions" },
    { href: "payables", label: "Payables", badge: due?.length || undefined },
    { href: "payroll", label: "Payroll" },
    { href: "approvals", label: "Approvals", badge: pending || undefined },
    { href: "reports", label: "Reports" },
    ...(can(ctx.role, "admin")
      ? [
          { href: "accounts", label: "Accounts & categories" },
          { href: "members", label: "Members" },
          { href: "audit", label: "Audit log" },
          { href: "settings", label: "Settings" },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-line bg-surface md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-brand">Ledgerline</Link>
          {memberships.length > 1 ? (
            <div className="mt-0 text-sm md:mt-3">
              <div className="mb-1 hidden text-xs uppercase tracking-wide text-muted md:block">Company</div>
              <div className="flex flex-wrap gap-1">
                {memberships.map((m) => (
                  <Link
                    key={m.org.id}
                    href={`/${m.org.slug}/dashboard`}
                    className={`rounded-md px-2 py-1 text-xs ${m.org.id === ctx.org.id ? "bg-brand text-brand-ink" : "bg-brand-soft text-brand"}`}
                  >
                    {m.org.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="hidden text-sm text-muted md:mt-1 md:block">{ctx.org.name}</div>
          )}
          {/* The sidebar footer is desktop-only; phones get sign-out in the header. */}
          <form action={signOut} className="md:hidden">
            <button className="text-xs text-muted underline">Sign out</button>
          </form>
        </div>
        <SideNav slug={slug} items={items} />
        <div className="hidden border-t border-line p-4 text-xs text-muted md:block">
          <div className="mb-2">
            Signed in as <span className="font-medium text-ink">{ctx.role}</span>
          </div>
          <form action={signOut}>
            <button className="underline hover:text-ink">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {ctx.org.is_demo && (
          <div role="note" className="mb-6 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn">
            <strong>Read-only demo.</strong> Everything here is fictional sample data for a made-up company. You can look
            around but not change anything.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
