import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { signup } from "../actions";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Create your account</h1>
      <AuthForm mode="signup" action={signup} next={next} />
    </>
  );
}
