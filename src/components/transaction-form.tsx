"use client";

import { useState } from "react";
import { ActionForm, type ActionResult } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";

type Option = { id: string; name: string };
type CategoryOption = Option & { kind: "income" | "expense" };

export type TransactionDefaults = {
  kind?: "income" | "expense" | "transfer";
  amount?: string;
  date?: string;
  bank_account_id?: string;
  to_bank_account_id?: string | null;
  category_id?: string | null;
  business_unit_id?: string | null;
  description?: string;
  reference?: string;
};

export function TransactionForm({
  action,
  accounts,
  categories,
  units,
  currency,
  defaults = {},
  submitLabel,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  accounts: Option[];
  categories: CategoryOption[];
  units: Option[];
  currency: string;
  defaults?: TransactionDefaults;
  submitLabel: string;
}) {
  const [kind, setKind] = useState<"income" | "expense" | "transfer">(defaults.kind ?? "expense");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <ActionForm action={action} submitLabel={submitLabel} className="max-w-xl space-y-4">
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Type</legend>
        <div className="inline-flex overflow-hidden rounded-lg border border-line">
          {(["expense", "income", "transfer"] as const).map((k) => (
            <label key={k} className={`cursor-pointer px-4 py-2 text-sm capitalize ${kind === k ? "bg-brand text-brand-ink" : "bg-surface hover:bg-brand-soft"}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Amount (${currency})`}>
          <Input name="amount" inputMode="decimal" required defaultValue={defaults.amount} placeholder="0.00" />
        </Field>
        <Field label="Date">
          <Input name="date" type="date" required defaultValue={defaults.date ?? today} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={kind === "transfer" ? "From account" : "Account"}>
          <Select name="bank_account_id" required defaultValue={defaults.bank_account_id ?? accounts[0]?.id}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        {kind === "transfer" ? (
          <Field label="To account">
            <Select name="to_bank_account_id" required defaultValue={defaults.to_bank_account_id ?? accounts[1]?.id ?? ""}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Category">
            {/* key resets the uncontrolled select when the type changes */}
            <Select key={kind} name="category_id" required defaultValue={defaults.category_id ?? ""}>
              <option value="" disabled>Choose…</option>
              {categories.filter((c) => c.kind === kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
      </div>

      {kind !== "transfer" && units.length > 0 && (
        <Field label="Business unit" hint="Optional">
          <Select name="business_unit_id" defaultValue={defaults.business_unit_id ?? ""}>
            <option value="">None</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
      )}

      <Field label="Description">
        <Textarea name="description" rows={2} maxLength={500} defaultValue={defaults.description} />
      </Field>
      <Field label="Reference" hint="Invoice, cheque or receipt number">
        <Input name="reference" maxLength={100} defaultValue={defaults.reference} />
      </Field>
    </ActionForm>
  );
}
