import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your company" };

export default async function OnboardingPage() {
  if (!(await getUser())) redirect("/login");
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your company</h1>
      <p className="mb-6 mt-1 text-sm text-muted">This takes under a minute. You can change names and categories later.</p>
      <div className="rounded-xl border border-line bg-surface p-6">
        <OnboardingForm />
      </div>
    </main>
  );
}
