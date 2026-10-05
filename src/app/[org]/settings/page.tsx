import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { MONTHS } from "@/lib/currencies";
import { requireRole } from "@/lib/auth";
import { saveSettings } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireRole(slug, "admin");
  return (
    <>
      <PageHeader title="Settings" />
      <Card className="max-w-xl p-5">
        <ActionForm action={saveSettings.bind(null, slug)} submitLabel="Save settings" className="space-y-4">
          <Field label="Company name"><Input name="name" defaultValue={org.name} required minLength={2} /></Field>
          <Field label="Currency" hint="Fixed at setup so historical amounts keep their meaning.">
            <Input value={org.currency} readOnly disabled />
          </Field>
          <Field label="Fiscal year starts">
            <Select name="fiscal_year_start_month" defaultValue={String(org.fiscal_year_start_month)}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="require_approval" defaultChecked={org.require_approval} className="mt-0.5" />
            <span>
              <span className="font-medium">Require approval for payments</span>
              <span className="block text-muted">Bill and salary payments are queued and only post once an approver signs off.</span>
            </span>
          </label>
        </ActionForm>
      </Card>
    </>
  );
}
