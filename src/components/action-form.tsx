"use client";

import { useActionState, type ReactNode } from "react";
import { Button, ErrorNote } from "@/components/ui";

export type ActionResult = { error?: string; ok?: string } | undefined;

/**
 * Wraps a server action with pending state and inline error/success display.
 * Server actions return { error } instead of throwing so users see a readable message.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  className,
  variant = "primary",
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "space-y-3"}>
      {children}
      <ErrorNote message={state?.error} />
      {state?.ok && !state.error && <p className="break-all text-sm text-income">{state.ok}</p>}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
