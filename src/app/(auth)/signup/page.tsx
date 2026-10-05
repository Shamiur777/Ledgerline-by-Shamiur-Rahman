import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { signupsEnabled } from "@/lib/flags";
import { signup } from "../actions";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!signupsEnabled()) {
    return (
      <>
        <h1 className="mb-2 text-lg font-semibold">Sign-ups are closed</h1>
        <p className="text-sm text-muted">
          This is a public demo deployment, so new accounts are turned off. You can explore everything with the
          read-only demo, or run your own copy from the source.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-brand underline">Back to sign in</Link>
      </>
    );
  }
  const { next } = await searchParams;
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Create your account</h1>
      <AuthForm mode="signup" action={signup} next={next} />
    </>
  );
}
