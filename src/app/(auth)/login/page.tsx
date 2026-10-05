import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { login } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Sign in</h1>
      <AuthForm mode="login" action={login} next={next} />
    </>
  );
}
