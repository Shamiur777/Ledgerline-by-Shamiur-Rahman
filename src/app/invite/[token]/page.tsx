import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { acceptInvitation } from "./actions";

export const metadata: Metadata = { title: "Join a company", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getUser(); // the proxy already redirects signed-out visitors to /login?next=…
  const supabase = await createClient();
  const { data } = /^[0-9a-f]{64}$/.test(token) ? await supabase.rpc("invitation_preview", { p_token: token }) : { data: null };
  const invite = (data as { org_name: string; role: string; email: string }[] | null)?.[0];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-xl font-semibold tracking-tight text-brand">Ledgerline</Link>
      <Card className="p-6">
        {!invite ? (
          <>
            <h1 className="text-lg font-semibold">Invitation not valid</h1>
            <p className="mt-2 text-sm text-muted">This link is invalid, has already been used, or has expired. Ask the person who invited you to send a new one.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Join {invite.org_name}</h1>
            <p className="mt-2 text-sm text-muted">
              You&apos;ve been invited as <strong className="text-ink">{invite.role}</strong>. This invitation is for{" "}
              <strong className="text-ink">{invite.email}</strong>.
            </p>
            {user?.email?.toLowerCase() !== invite.email && (
              <p role="alert" className="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
                You&apos;re signed in as {user?.email}. Sign in with {invite.email} to accept.
              </p>
            )}
            <ActionForm action={acceptInvitation.bind(null, token)} submitLabel="Accept invitation" className="mt-4 space-y-3">
              <span />
            </ActionForm>
          </>
        )}
      </Card>
    </main>
  );
}
