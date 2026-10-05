"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import type { AuthState } from "@/app/(auth)/actions";

type Props = {
  mode: "login" | "signup";
  action: (s: AuthState, f: FormData) => Promise<AuthState>;
  next?: string;
  /** Hide the "Create an account" link when sign-ups are closed. */
  showSignupLink?: boolean;
};

const withNext = (path: string, next?: string) => (next ? `${path}?next=${encodeURIComponent(next)}` : path);

export function AuthForm({ mode, action, next, showSignupLink = true }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const isLogin = mode === "login";
  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      {!isLogin && (
        <Field label="Full name">
          <Input name="full_name" autoComplete="name" required />
        </Field>
      )}
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" hint={isLogin ? undefined : "At least 8 characters"}>
        <Input name="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} minLength={8} required />
      </Field>
      <ErrorNote message={state?.error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted">
        {isLogin && !showSignupLink ? null : isLogin ? (
          <>New here? <Link href={withNext("/signup", next)} className="font-medium text-brand underline">Create an account</Link></>
        ) : (
          <>Already have an account? <Link href={withNext("/login", next)} className="font-medium text-brand underline">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
