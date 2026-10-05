"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { demoEnabled, signupsEnabled } from "@/lib/flags";
import { safeRedirect } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string } | undefined;

const credentials = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const safeNext = (next: FormDataEntryValue | null) => safeRedirect(next, "/dashboard");

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Incorrect email or password." };
  redirect(safeNext(form.get("next")));
}

/**
 * One-click demo. Each visitor gets their own throwaway anonymous identity (so there is no shared
 * login to hijack) and is joined to the demo company as a read-only viewer by a database function.
 */
export async function demoLogin(): Promise<AuthState> {
  if (!demoEnabled()) return { error: "The demo is not available." };
  const supabase = await createClient();
  const { error: authError } = await supabase.auth.signInAnonymously();
  if (authError) return { error: "Couldn't start the demo right now. Please try again in a minute." };
  const { data: slug, error } = await supabase.rpc("join_demo");
  if (error || !slug) return { error: "The demo company isn't set up yet." };
  redirect(`/${slug}/dashboard`);
}

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  if (!signupsEnabled()) return { error: "Sign-ups are closed on this deployment. Try the demo instead." };
  const parsed = credentials
    .extend({ full_name: z.string().trim().min(2, "Enter your name").max(100) })
    .safeParse({ email: form.get("email"), password: form.get("password"), full_name: form.get("full_name") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.full_name } },
  });
  if (error) return { error: error.message };
  if (!data.session) return { error: "Check your inbox to confirm your email, then sign in." };
  // Invitees come back to their invite link; everyone else sets up a company.
  redirect(safeRedirect(form.get("next"), "/onboarding"));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
