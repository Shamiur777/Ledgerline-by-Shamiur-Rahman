import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { signup } from "../actions";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Create your account</h1>
      <AuthForm mode="signup" action={signup} />
    </>
  );
}
