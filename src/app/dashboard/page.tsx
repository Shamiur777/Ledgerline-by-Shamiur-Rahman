import { redirect } from "next/navigation";
import { getUser, listMemberships } from "@/lib/auth";

// Entry point after login: send the user to their first organization, or onboarding if none.
export default async function DashboardRedirect() {
  if (!(await getUser())) redirect("/login");
  const memberships = await listMemberships();
  if (memberships.length === 0) redirect("/onboarding");
  redirect(`/${memberships[0].org.slug}/dashboard`);
}
