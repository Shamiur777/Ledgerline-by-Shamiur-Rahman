"use client";

import { useActionState } from "react";
import { Button, ErrorNote } from "@/components/ui";
import type { AuthState } from "@/app/(auth)/actions";

/** One-click read-only demo: no account needed. */
export function DemoButton({ action }: { action: (s: AuthState) => Promise<AuthState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="mt-4 border-t border-line pt-4">
      <Button type="submit" variant="secondary" disabled={pending} className="w-full">
        {pending ? "Opening the demo…" : "Try the demo (no account needed)"}
      </Button>
      <p className="mt-2 text-center text-xs text-muted">Read-only, with fictional sample data.</p>
      <div className="mt-2"><ErrorNote message={state?.error} /></div>
    </form>
  );
}
