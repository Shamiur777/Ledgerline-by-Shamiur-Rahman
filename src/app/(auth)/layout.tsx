import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-xl font-semibold tracking-tight text-brand">Ledgerline</Link>
      <div className="rounded-xl border border-line bg-surface p-6">{children}</div>
    </main>
  );
}
