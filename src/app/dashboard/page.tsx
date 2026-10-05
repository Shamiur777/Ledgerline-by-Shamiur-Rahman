import { redirect } from "next/navigation";
import { getUser, listMemberships } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Entry point after login: send the user to their first organization, or onboarding if none.
export default async function DashboardRedirect() {
  const user = await getUser();
  if (!user) redirect("/login");
  const memberships = await listMemberships();
  if (memberships.length === 0) {
    // A demo visitor whose membership vanished (the demo data was reset) is re-joined automatically.
    if (user.is_anonymous) {
      const supabase = await createClient();
      const { data: slug } = await supabase.rpc("join_demo");
      if (slug) redirect(`/${slug}/dashboard`);
      redirect("/login");
    }
    redirect("/onboarding");
  }
  redirect(`/${memberships[0].org.slug}/dashboard`);
}
