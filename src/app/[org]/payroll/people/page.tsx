import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { addDepartment, addEmployee, setEmployeeActive } from "../actions";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireRole(slug, "admin");
  const supabase = await createClient();
  const [{ data: people }, { data: depts }] = await Promise.all([
    supabase.from("employees").select("id, name, position_title, default_amount, is_owner_pay, active, departments(name)").eq("org_id", org.id).order("name"),
    supabase.from("departments").select("id, name").eq("org_id", org.id).order("name"),
  ]);

  return (
    <>
      <PageHeader title="People" subtitle="Employees and owners included in monthly payroll runs." />
      <Table>
        <thead><tr><Th>Name</Th><Th>Department</Th><Th>Title</Th><Th className="text-right">Default / month</Th><Th /></tr></thead>
        <tbody>
          {(people ?? []).map((p) => (
            <tr key={p.id}>
              <Td>{p.name} {p.is_owner_pay && <Badge tone="brand">Owner</Badge>} {!p.active && <Badge>Inactive</Badge>}</Td>
              <Td>{(p.departments as unknown as { name: string } | null)?.name ?? "—"}</Td>
              <Td>{p.position_title || "—"}</Td>
              <Td className="tabular text-right">{formatMoney(p.default_amount, org.currency)}</Td>
              <Td className="text-right">
                <form action={setEmployeeActive.bind(null, slug, p.id, !p.active)}>
                  <Button variant="ghost" className="text-xs">{p.active ? "Deactivate" : "Activate"}</Button>
                </form>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Add a person</h2>
          <ActionForm action={addEmployee.bind(null, slug)} submitLabel="Add person">
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Title"><Input name="position_title" /></Field>
            <Field label="Department">
              <Select name="department_id" defaultValue=""><option value="">None</option>{(depts ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
            </Field>
            <Field label={`Default monthly amount (${org.currency})`}><Input name="default_amount" inputMode="decimal" defaultValue="0" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_owner_pay" /> Owner / director pay (reported separately)</label>
          </ActionForm>
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Departments</h2>
          <ul className="mb-4 flex flex-wrap gap-2 text-sm">
            {(depts ?? []).map((d) => <li key={d.id} className="rounded-full border border-line px-3 py-1">{d.name}</li>)}
            {(depts ?? []).length === 0 && <li className="text-muted">None yet</li>}
          </ul>
          <ActionForm action={addDepartment.bind(null, slug)} submitLabel="Add department">
            <Field label="Name"><Input name="name" required /></Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
