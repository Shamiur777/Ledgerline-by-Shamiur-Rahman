import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requireRole, type Role } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addMember, changeRole, removeMember } from "./actions";

export const metadata: Metadata = { title: "Members" };

const ROLES: { value: Exclude<Role, "owner">; hint: string }[] = [
  { value: "viewer", hint: "Read-only access" },
  { value: "accountant", hint: "Record transactions, bills, payroll; request payments" },
  { value: "approver", hint: "Everything above, plus approve payments" },
  { value: "admin", hint: "Everything above, plus members, accounts and settings" },
];

export default async function MembersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org, userId } = await requireRole(slug, "admin");
  const supabase = await createClient();
  const { data: members } = await supabase.from("memberships").select("user_id, role, created_at").eq("org_id", org.id).order("created_at");
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  const name = new Map((profs ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));

  return (
    <>
      <PageHeader title="Members" subtitle="Who can see and change this company's books." />
      <Table>
        <thead><tr><Th>Name</Th><Th>Role</Th><Th /></tr></thead>
        <tbody>
          {(members ?? []).map((m) => {
            const isOwner = m.role === "owner";
            return (
              <tr key={m.user_id}>
                <Td>{name.get(m.user_id) || "—"} {m.user_id === userId && <Badge tone="brand">You</Badge>}</Td>
                <Td>
                  {isOwner ? <Badge tone="good">owner</Badge> : (
                    <ActionForm action={changeRole.bind(null, slug, m.user_id)} submitLabel="Save" variant="secondary" className="flex items-center gap-2">
                      <Select name="role" defaultValue={m.role} aria-label="Role" className="w-36">
                        {ROLES.map((r) => <option key={r.value} value={r.value}>{r.value}</option>)}
                      </Select>
                    </ActionForm>
                  )}
                </Td>
                <Td className="text-right">
                  {!isOwner && (
                    <form action={removeMember.bind(null, slug, m.user_id)}>
                      <Button variant="ghost" className="text-xs text-expense">Remove</Button>
                    </form>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <Card className="mt-8 max-w-xl p-4">
        <h2 className="mb-1 font-semibold">Add a member</h2>
        <p className="mb-3 text-sm text-muted">They need to have signed up for Ledgerline already.</p>
        <ActionForm action={addMember.bind(null, slug)} submitLabel="Add member">
          <Field label="Email"><Input name="email" type="email" required /></Field>
          <Field label="Role">
            <Select name="role" defaultValue="accountant">
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.value} — {r.hint}</option>)}
            </Select>
          </Field>
        </ActionForm>
      </Card>
    </>
  );
}
