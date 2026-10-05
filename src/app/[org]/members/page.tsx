import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requireRole, type Role } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { changeRole, inviteMember, removeMember, revokeInvitation } from "./actions";

export const metadata: Metadata = { title: "Members" };

const ROLES: { value: Exclude<Role, "owner">; hint: string }[] = [
  { value: "viewer", hint: "Read-only access" },
  { value: "accountant", hint: "Record transactions, bills, payroll; request payments" },
  { value: "approver", hint: "Everything above, plus approve payments" },
  { value: "admin", hint: "Everything above, plus members, accounts and settings" },
];

// Evaluated per request on the server; kept out of the component body for render purity.
const isExpired = (iso: string) => new Date(iso).getTime() < Date.now();

export default async function MembersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org, userId } = await requireRole(slug, "admin");
  const supabase = await createClient();
  const { data: members } = await supabase.from("memberships").select("user_id, role, created_at").eq("org_id", org.id).order("created_at");
  const { data: invites } = await supabase
    .from("invitations")
    .select("id, email, role, expires_at")
    .eq("org_id", org.id)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
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

      {(invites ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-semibold">Pending invitations</h2>
          <Table>
            <thead><tr><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {(invites ?? []).map((i) => {
                const expired = isExpired(i.expires_at);
                return (
                  <tr key={i.id}>
                    <Td>{i.email}</Td>
                    <Td>{i.role}</Td>
                    <Td>{expired ? <Badge tone="bad">Expired</Badge> : <Badge tone="warn">Waiting · expires {i.expires_at.slice(0, 10)}</Badge>}</Td>
                    <Td className="text-right">
                      <form action={revokeInvitation.bind(null, slug, i.id)}>
                        <Button variant="ghost" className="text-xs text-expense">Revoke</Button>
                      </form>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </section>
      )}

      <Card className="mt-8 max-w-xl p-4">
        <h2 className="mb-1 font-semibold">Invite someone</h2>
        <p className="mb-3 text-sm text-muted">
          You get a single-use link to send them. It only works for the email address you enter, and expires in 7 days.
        </p>
        <ActionForm action={inviteMember.bind(null, slug)} submitLabel="Create invite link">
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
