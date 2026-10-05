import { expect, test } from "@playwright/test";

const stamp = Date.now();

test("a new company can sign up, record a transaction, see it reported, and cannot reach another tenant", async ({ page }) => {
  const email = `e2e-${stamp}@example.test`;
  const password = `pw-${stamp}-Zk9!`;

  // Sign up and onboard
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Eve E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Set up your company" })).toBeVisible();
  await page.getByLabel("Company name").fill(`E2E Company ${stamp}`);
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(page).toHaveURL(new RegExp(`/e2e-company-${stamp}/dashboard`));

  // Record an income transaction
  await page.getByRole("link", { name: "Transactions" }).click();
  await page.getByRole("link", { name: "New transaction" }).click();
  await page.getByText("income", { exact: true }).click();
  await page.getByLabel("Amount (USD)").fill("1234.56");
  await page.getByLabel("Category").selectOption({ label: "Sales" });
  await page.getByLabel("Description").fill("E2E invoice");
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByText("+$1,234.56")).toBeVisible();

  // It flows into the dashboard
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByText("$1,234.56").first()).toBeVisible();

  // ...and into an export
  const res = await page.request.get(`/api/export/pnl?org=e2e-company-${stamp}&format=csv`);
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("Sales,1234.56");

  // Tenant isolation through the real UI: another company's pages and exports are simply not found.
  const other = await page.goto("/northwind-studio/dashboard");
  expect(other?.status()).toBe(404);
  const otherExport = await page.request.get("/api/export/pnl?org=northwind-studio&format=csv");
  expect(otherExport.status()).toBe(404);
});

test("the read-only demo viewer can look but not touch", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@ledgerline.dev");
  await page.getByLabel("Password").fill("ledgerline-demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/northwind-studio\/dashboard/);

  await page.getByRole("link", { name: "Transactions" }).click();
  await expect(page.getByRole("link", { name: "New transaction" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Members" })).toHaveCount(0);

  // Hitting admin and write routes directly bounces back to the dashboard.
  await page.goto("/northwind-studio/members");
  await expect(page).toHaveURL(/\/northwind-studio\/dashboard/);
  await page.goto("/northwind-studio/transactions/new");
  await expect(page).toHaveURL(/\/northwind-studio\/dashboard/);
});

test("an admin can invite a brand-new person by link; the link works once and grants only the invited role", async ({ page, browser }) => {
  // Owner creates the invitation
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@ledgerline.dev");
  await page.getByLabel("Password").fill("ledgerline-demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/northwind-studio\/dashboard/); // wait for the session before navigating on
  await page.goto("/northwind-studio/members");

  const inviteeEmail = `invitee-${stamp}@example.test`;
  const invitePassword = `pw-${stamp}-Qx7!`;
  // Scope to the invite form: existing members' role dropdowns share the "Role" label.
  const inviteForm = page.locator("form", { has: page.getByRole("button", { name: "Create invite link" }) });
  await inviteForm.getByLabel("Email").fill(inviteeEmail);
  await inviteForm.getByLabel("Role").selectOption("viewer");
  await inviteForm.getByRole("button", { name: "Create invite link" }).click();
  const note = await page.getByText(/\/invite\//).first().textContent();
  const link = note!.match(/https?:\/\/\S+\/invite\/[0-9a-f]{64}/)![0];

  // A stranger with no account follows the link: login -> signup -> back to the invite -> accept
  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(link);
  await expect(guest).toHaveURL(/\/login\?next=/);
  await guest.getByRole("link", { name: "Create an account" }).click();
  await guest.getByLabel("Full name").fill("Ivy Invitee");
  await guest.getByLabel("Email").fill(inviteeEmail);
  await guest.getByLabel("Password").fill(invitePassword);
  await guest.getByRole("button", { name: "Create account" }).click();
  await expect(guest.getByRole("heading", { name: "Join Northwind Studio" })).toBeVisible();
  await guest.getByRole("button", { name: "Accept invitation" }).click();
  await expect(guest).toHaveURL(/\/northwind-studio\/dashboard/);

  // They got exactly the invited role: read-only
  await guest.getByRole("link", { name: "Transactions" }).click();
  await expect(guest.getByRole("link", { name: "New transaction" })).toHaveCount(0);
  await expect(guest.getByRole("link", { name: "Members" })).toHaveCount(0);

  // The link is single-use
  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: "Invitation not valid" })).toBeVisible();
  await ctx.close();
});
