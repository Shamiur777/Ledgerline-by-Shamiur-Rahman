/**
 * Seeds a fictional company ("Northwind Studio") with 12 months of realistic, deterministic data.
 *
 *   npm run seed:demo                       # create if missing (local)
 *   npm run seed:demo -- --reset            # delete and recreate
 *   npm run seed:demo -- --public           # hosted/public: random, unprinted passwords, no known logins
 *   npm run seed:demo -- --prune-anonymous  # also delete throwaway visitor identities older than 24h
 *   npm run demo:reset                      # = --public --reset --prune-anonymous
 *
 * Against a non-local Supabase URL, --reset additionally needs --confirm-remote (it deletes data).
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
 * (from .env.local, or the file named in ENV_FILE). Uses the service role only for fixtures; the org itself is created
 * through the same create_organization() function real users call.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

// Minimal env-file loader (avoids a dependency). ENV_FILE=.env.hosted points the script at another project.
try {
  for (const line of readFileSync(process.env.ENV_FILE ?? ".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on real environment */ }

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SERVICE) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local");

const args = new Set(process.argv.slice(2));
const PUBLIC = args.has("--public");
const IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)([:/]|$)/.test(URL);
if (!IS_LOCAL && args.has("--reset") && !args.has("--confirm-remote")) {
  throw new Error(`Refusing to --reset a non-local database (${new globalThis.URL(URL).host}). Re-run with --confirm-remote if that is intended.`);
}

const SLUG = "northwind-studio";
// Local fixture password for fictional accounts. In --public mode every password is random, used once
// in-process to create the company, and never printed or stored, so no known credential exists.
const FIXTURE_PASSWORD = "ledgerline-demo";
const USERS_ALL = [
  { key: "owner", email: "owner@ledgerline.dev", name: "Olivia Owner", role: "owner" },
  { key: "approver", email: "approver@ledgerline.dev", name: "Amir Approver", role: "approver" },
  { key: "accountant", email: "accountant@ledgerline.dev", name: "Casey Accountant", role: "accountant" },
  { key: "demo", email: "demo@ledgerline.dev", name: "Demo Viewer (read-only)", role: "viewer" },
] as const;
const USERS = PUBLIC ? USERS_ALL.filter((u) => u.key !== "demo") : USERS_ALL; // visitors use anonymous sign-in
const PASSWORDS: Record<string, string> = Object.fromEntries(USERS.map((u) => [u.key, PUBLIC ? randomBytes(24).toString("base64url") : FIXTURE_PASSWORD]));

// Deterministic PRNG so the dataset is identical on every run.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261005);
const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const money = (cents: number) => (cents / 100).toFixed(2);

const today = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (y: number, m: number, d: number) => iso(new Date(Date.UTC(y, m, d)));
const addDays = (n: number) => iso(new Date(today.getTime() + n * 86_400_000));

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as NonNullable<T>;
}

async function ensureUser(u: (typeof USERS)[number]): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email, password: PASSWORDS[u.key], email_confirm: true, user_metadata: { full_name: u.name },
  });
  if (!error) return data.user.id;
  // Already exists: find it and set this run's password (so re-seeding always leaves known/unknown state consistent).
  for (let page = 1; page < 50; page++) {
    const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const hit = list?.users.find((x) => x.email === u.email);
    if (hit) {
      await admin.auth.admin.updateUserById(hit.id, { password: PASSWORDS[u.key] });
      return hit.id;
    }
    if (!list?.users.length) break;
  }
  throw new Error(`Could not create or find ${u.email}: ${error.message}`);
}

/** Visitors sign in anonymously; remove identities older than 24h so the user table stays small. */
async function pruneAnonymous(): Promise<number> {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  let removed = 0;
  for (let page = 1; page < 200; page++) {
    const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (!list?.users.length) break;
    for (const u of list.users) {
      if (u.is_anonymous && new Date(u.created_at).getTime() < cutoff) {
        await admin.auth.admin.deleteUser(u.id);
        removed++;
      }
    }
  }
  return removed;
}

async function main() {
  const reset = args.has("--reset");
  if (args.has("--prune-anonymous")) console.log(`Pruned ${await pruneAnonymous()} old anonymous visitor identities.`);
  const ids: Record<string, string> = {};
  for (const u of USERS) ids[u.key] = await ensureUser(u);

  const { data: existing } = await admin.from("organizations").select("id").eq("slug", SLUG).maybeSingle();
  if (existing && !reset) {
    console.log(`Demo company already exists. Re-run with --reset to rebuild it.`);
    return printLogins();
  }
  if (existing) {
    await must(admin.from("organizations").delete().eq("id", existing.id), "delete org");
    console.log("Removed existing demo company.");
  }

  // Create the org exactly as a real user would: signed in, through the RPC.
  const owner: SupabaseClient = createClient(URL, ANON, { auth: { persistSession: false } });
  await must(owner.auth.signInWithPassword({ email: USERS[0].email, password: PASSWORDS.owner }).then((r) => ({ data: r.data, error: r.error })), "owner sign-in");
  const orgId = (await must(owner.rpc("create_organization", { p_name: "Northwind Studio", p_currency: "USD", p_fy_start: 1, p_starter: true }), "create_organization")) as string;
  // create_organization generates the slug from the name, which yields exactly SLUG.
  await must(admin.from("organizations").update({ slug: SLUG, require_approval: true, is_demo: true }).eq("id", orgId), "org settings");

  for (const u of USERS.slice(1)) await must(admin.from("memberships").insert({ org_id: orgId, user_id: ids[u.key], role: u.role }), `member ${u.key}`);

  // Reference data
  const acct = async (name: string, opening: number, order: number) =>
    (await must(admin.from("bank_accounts").insert({ org_id: orgId, name, opening_balance: money(opening), sort_order: order }).select("id").single(), name)).id as string;
  const { data: main } = await admin.from("bank_accounts").select("id").eq("org_id", orgId).eq("name", "Main Account").single();
  await admin.from("bank_accounts").update({ name: "Operating Account", opening_balance: money(4_500_000) }).eq("id", main!.id);
  const operating = main!.id as string;
  const savings = await acct("Savings Reserve", 2_000_000, 1);

  const cats = await must(admin.from("categories").select("id, name, kind").eq("org_id", orgId), "categories");
  const cat = (n: string) => cats.find((c: { name: string }) => c.name === n)!.id as string;
  const unitRows = await must(admin.from("business_units").insert([{ org_id: orgId, name: "Branding" }, { org_id: orgId, name: "Web" }, { org_id: orgId, name: "Retainers" }]).select("id"), "units");
  const units = unitRows.map((u: { id: string }) => u.id);

  // 12 months of transactions
  type Txn = Record<string, unknown>;
  const txns: Txn[] = [];
  const t = (kind: "income" | "expense", cents: number, date: string, account: string, category: string, description: string, ref = "") =>
    txns.push({ org_id: orgId, kind, amount: money(cents), date, bank_account_id: account, category_id: cat(category), business_unit_id: kind === "income" ? pick(units) : null, description, reference: ref, created_by: ids.accountant });

  const clients = ["Harbor Coffee", "Lumen Health", "Pinecrest Realty", "Orbit Fitness", "Quill & Co", "Atlas Logistics"];
  for (let back = 11; back >= 0; back--) {
    const ref = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
    const y = ref.getUTCFullYear(), m = ref.getUTCMonth();
    const lastDay = back === 0 ? Math.max(1, today.getUTCDate()) : new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const d = (n: number) => day(y, m, Math.min(n, lastDay));
    const growth = 1 + (11 - back) * 0.03; // gentle upward trend

    const invoiceCount = between(4, 6);
    for (let i = 0; i < invoiceCount; i++)
      t("income", Math.round(between(450_000, 1_400_000) * growth), d(between(1, 28)), operating, pick(["Sales", "Services"]), `Project invoice — ${pick(clients)}`, `INV-${y}${String(m + 1).padStart(2, "0")}-${i + 1}`);
    t("income", between(40_000, 90_000), d(28), savings, "Interest", "Monthly interest");
    // Months before the three detailed payroll runs below get one lump-sum payroll expense.
    if (back >= 3) t("expense", 3_180_000, d(28), operating, "Salaries", "Monthly payroll");
    t("expense", 320_000, d(1), operating, "Rent", "Studio rent");
    t("expense", between(22_000, 41_000), d(10), operating, "Utilities", "Electricity & internet");
    t("expense", between(60_000, 95_000), d(5), operating, "Software & Subscriptions", "Design & dev tooling");
    t("expense", between(50_000, 280_000), d(between(8, 25)), operating, "Marketing", pick(["Paid social", "Conference booth", "Newsletter sponsorship"]));
    if (rand() > 0.5) t("expense", between(40_000, 190_000), d(between(8, 25)), operating, "Travel", "Client travel");
    if (rand() > 0.7) t("expense", between(80_000, 220_000), d(between(8, 25)), operating, "Professional Fees", "Accounting & legal");
  }
  // Chunked inserts keep each statement small.
  for (let i = 0; i < txns.length; i += 100) await must(admin.from("transactions").insert(txns.slice(i, i + 100)), "transactions");
  // Monthly transfers to savings
  const transfers = [0, 1, 2, 3, 4, 5].map((back) => ({
    org_id: orgId, kind: "transfer", amount: money(300_000), date: day(today.getUTCFullYear(), today.getUTCMonth() - back, 2),
    bank_account_id: operating, to_bank_account_id: savings, description: "Reserve top-up", created_by: ids.accountant,
  }));
  await must(admin.from("transactions").insert(transfers), "transfers");

  // Payroll: 5 staff + 1 owner, last three months
  const depts = await must(admin.from("departments").insert([{ org_id: orgId, name: "Design" }, { org_id: orgId, name: "Engineering" }, { org_id: orgId, name: "Operations" }]).select("id, name"), "departments");
  const dept = (n: string) => depts.find((x: { name: string }) => x.name === n)!.id as string;
  const people = await must(
    admin.from("employees").insert([
      { org_id: orgId, name: "Priya Nair", position_title: "Design Lead", department_id: dept("Design"), default_amount: "5200.00", is_owner_pay: false },
      { org_id: orgId, name: "Marcus Lee", position_title: "Senior Engineer", department_id: dept("Engineering"), default_amount: "6100.00", is_owner_pay: false },
      { org_id: orgId, name: "Sofia Alvarez", position_title: "Engineer", department_id: dept("Engineering"), default_amount: "4800.00", is_owner_pay: false },
      { org_id: orgId, name: "Tom Becker", position_title: "Project Manager", department_id: dept("Operations"), default_amount: "4300.00", is_owner_pay: false },
      { org_id: orgId, name: "Hana Ito", position_title: "Designer", department_id: dept("Design"), default_amount: "3900.00", is_owner_pay: false },
      { org_id: orgId, name: "Olivia Owner", position_title: "Founder", department_id: dept("Operations"), default_amount: "7500.00", is_owner_pay: true },
    ]).select("id, name, default_amount"),
    "employees",
  );
  const pending: { itemId: string; remaining: string }[] = [];
  for (let back = 2; back >= 0; back--) {
    const ref = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
    const run = await must(admin.from("payroll_runs").insert({ org_id: orgId, year: ref.getUTCFullYear(), month: ref.getUTCMonth() + 1 }).select("id").single(), "run");
    const items = await must(admin.from("payroll_items").insert(people.map((p: { id: string; default_amount: string }) => ({ org_id: orgId, payroll_run_id: run.id, employee_id: p.id, amount_due: p.default_amount }))).select("id, employee_id, amount_due"), "items");
    const pays: Txn[] = [];
    items.forEach((it: { id: string; amount_due: string }, idx: number) => {
      const due = Number(it.amount_due) * 100;
      // Past months fully paid; current month paid except last two people (one partial).
      const paid = back > 0 ? due : idx < 4 ? due : idx === 4 ? Math.round(due / 2) : 0;
      if (paid > 0) pays.push({ org_id: orgId, kind: "expense", amount: money(paid), date: day(ref.getUTCFullYear(), ref.getUTCMonth(), Math.min(28, back === 0 ? Math.max(1, today.getUTCDate()) : 28)), bank_account_id: operating, category_id: cat("Salaries"), payroll_item_id: it.id, description: "Monthly salary", created_by: ids.accountant });
      if (back === 0 && due - paid > 0) pending.push({ itemId: it.id, remaining: money(due - paid) });
    });
    if (pays.length) await must(admin.from("transactions").insert(pays), "salary payments");
  }

  // Vendors and bills (some paid, some partial, some overdue, some due soon)
  const vendorRows = await must(admin.from("vendors").insert(["Cloudline Hosting", "PrintWorks", "Metro Office Supplies", "Brightside Insurance", "Studio Landlord LLC", "FreelanceHub"].map((name) => ({ org_id: orgId, name }))).select("id, name"), "vendors");
  const v = (n: string) => vendorRows.find((x: { name: string }) => x.name === n)!.id as string;
  const billDefs = [
    { vendor: "Cloudline Hosting", amount: 184_000, billed: -40, due: -10, paid: 0, desc: "Annual hosting renewal" },
    { vendor: "PrintWorks", amount: 96_500, billed: -25, due: 4, paid: 40_000, desc: "Brand collateral print run" },
    { vendor: "Metro Office Supplies", amount: 31_200, billed: -50, due: -20, paid: 31_200, desc: "Office supplies" },
    { vendor: "Brightside Insurance", amount: 245_000, billed: -10, due: 8, paid: 0, desc: "Quarterly premium" },
    { vendor: "FreelanceHub", amount: 150_000, billed: -5, due: 25, paid: 0, desc: "Contract illustrator" },
    { vendor: "Studio Landlord LLC", amount: 24_000, billed: -15, due: 2, paid: 0, desc: "Deposit adjustment" },
  ];
  const billRows = await must(admin.from("bills").insert(billDefs.map((b) => ({ org_id: orgId, vendor_id: v(b.vendor), amount_due: money(b.amount), bill_date: addDays(b.billed), due_date: addDays(b.due), description: b.desc }))).select("id"), "bills");
  const billPays: Txn[] = [];
  billDefs.forEach((b, i) => { if (b.paid > 0) billPays.push({ org_id: orgId, kind: "expense", amount: money(b.paid), date: addDays(b.billed + 7), bank_account_id: operating, category_id: cat("Vendor Payments"), bill_id: billRows[i].id, description: `Payment to ${b.vendor}`, created_by: ids.accountant }); });
  if (billPays.length) await must(admin.from("transactions").insert(billPays), "bill payments");

  // Two payments waiting for approval (requested by the accountant)
  const waiting = [
    { bill_id: billRows[3].id, amount: money(245_000), description: "Payment to Brightside Insurance — Quarterly premium", urgency: "Due in 8 days" },
    ...(pending[0] ? [{ payroll_item_id: pending[0].itemId, amount: pending[0].remaining, description: "Salary — remaining balance", urgency: "" }] : []),
  ];
  await must(admin.from("pending_payments").insert(waiting.map((w) => ({ org_id: orgId, bank_account_id: operating, category_id: w.bill_id ? cat("Vendor Payments") : cat("Salaries"), requested_by: ids.accountant, date: iso(today), ...w }))), "pending payments");

  console.log(`Seeded ${txns.length + transfers.length} transactions, 3 payroll runs, ${billDefs.length} bills, ${waiting.length} pending approvals.`);
  printLogins();
}

function printLogins() {
  if (PUBLIC) {
    console.log(`
Public demo ready at /${SLUG}/dashboard. Visitors use the "Try the demo" button; no passwords exist to share.`);
    return;
  }
  console.log(`
Sign in at /login. Password for all local demo users: ${FIXTURE_PASSWORD}`);
  for (const u of USERS) console.log(`  ${u.role.padEnd(10)} ${u.email}`);
  console.log(`Company URL: /${SLUG}/dashboard`);
}

main().catch((e) => { console.error(e); process.exit(1); });
