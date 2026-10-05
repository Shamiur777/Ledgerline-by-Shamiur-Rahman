import Link from "next/link";
import { LinkButton } from "@/components/ui";

const features = [
  ["Real tenant isolation", "Every row is protected by Postgres row-level security. A bug in application code cannot leak another company's books."],
  ["Approvals that can't be bypassed", "Payments are requested, then approved by someone else. Approval posts the transaction atomically inside the database."],
  ["Payables and payroll", "Track vendor bills and monthly salary runs with partial payments. Overpayment is blocked by the database itself."],
  ["Audit-ready", "Every change to the ledger is written to an append-only audit trail by database triggers, not by hopeful app code."],
  ["Reports you can hand to an accountant", "P&L, balance sheet and cash flow with Excel, PDF and CSV export."],
  ["Any currency, any fiscal year", "Per-company currency and fiscal calendar. Money is handled as exact decimals, never floats."],
];

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4">
      <header className="flex items-center justify-between py-6">
        <span className="text-xl font-semibold tracking-tight text-brand">Ledgerline</span>
        <nav className="flex items-center gap-2">
          <LinkButton href="/login" variant="ghost">Sign in</LinkButton>
          <LinkButton href="/signup">Get started</LinkButton>
        </nav>
      </header>

      <section className="py-16 md:py-24">
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
          Books your whole team can trust, without the enterprise price tag.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Ledgerline is multi-tenant accounting for small and growing companies: bank accounts, transactions,
          payables, payroll, approvals and reports, with security enforced where it can&apos;t be forgotten, in the database.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton href="/signup">Create your company</LinkButton>
          <LinkButton href="/login" variant="secondary">Sign in</LinkButton>
        </div>
      </section>

      <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(([title, body]) => (
          <div key={title} className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-muted">{body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-line py-8 text-sm text-muted">
        A multi-tenant rebuild of an internal single-company accounting tool. Built by Shamiur Rahman.{" "}
        <Link className="underline" href="https://github.com/Shamiur777/Ledgerline-by-Shamiur-Rahman">Source on GitHub</Link>
      </footer>
    </div>
  );
}
