"use client";

import { useActionState } from "react";
import { Button, ErrorNote, Field, Input, Select } from "@/components/ui";
import { CURRENCIES, MONTHS } from "@/lib/currencies";
import { createOrganization } from "./actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createOrganization, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="Company name">
        <Input name="name" required minLength={2} placeholder="Acme Studio Ltd" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Currency" hint="Locked once you record transactions.">
          <Select name="currency" defaultValue="USD">
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
          </Select>
        </Field>
        <Field label="Fiscal year starts">
          <Select name="fy_start" defaultValue="1">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="starter" defaultChecked className="mt-0.5" />
        <span>Start with a common chart of income and expense categories</span>
      </label>
      <ErrorNote message={state?.error} />
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Creating…" : "Create company"}</Button>
    </form>
  );
}
