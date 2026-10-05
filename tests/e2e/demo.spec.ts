import { expect, test } from "@playwright/test";

/**
 * The public demo journey. Needs no credentials, so it runs against any deployment:
 *   E2E_BASE_URL=https://your-demo.vercel.app npx playwright test demo
 */
test("a visitor can open the demo in one click and can look but not touch", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto("/login");
  await page.getByRole("button", { name: /Try the demo/ }).click();
  await expect(page).toHaveURL(/\/northwind-studio\/dashboard/, { timeout: 30_000 });
  await expect(page.getByText("Read-only demo.")).toBeVisible();
  await expect(page.getByText("Northwind Studio").first()).toBeVisible();

  // The main screens render with data
  for (const [link, heading] of [
    ["Transactions", "Transactions"],
    ["Payables", "Payables"],
    ["Payroll", "Payroll"],
    ["Approvals", "Approvals"],
    ["Reports", "Reports"],
  ] as const) {
    await page.getByRole("link", { name: new RegExp(`^${link}`) }).click();
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByText("Read-only demo.")).toBeVisible();
  }

  // Look-but-don't-touch: no write controls, and admin/write routes bounce to the dashboard
  await page.getByRole("link", { name: "Transactions" }).click();
  await expect(page.getByRole("link", { name: "New transaction" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Members" })).toHaveCount(0);
  await page.goto("/northwind-studio/members");
  await expect(page).toHaveURL(/\/northwind-studio\/dashboard/);
  await page.goto("/northwind-studio/transactions/new");
  await expect(page).toHaveURL(/\/northwind-studio\/dashboard/);

  // Reports export works for a viewer
  const csv = await page.request.get("/api/export/pnl?org=northwind-studio&format=csv");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("Profit & Loss");

  // Another company is not reachable
  const other = await page.request.get("/api/export/pnl?org=some-other-company&format=csv");
  expect(other.status()).toBe(404);

  expect(consoleErrors, `console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
});

test("the demo is usable on a phone: no horizontal scroll on key screens", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: /Try the demo/ }).click();
  await expect(page).toHaveURL(/\/northwind-studio\/dashboard/, { timeout: 30_000 });

  for (const path of ["dashboard", "transactions", "payables", "reports"]) {
    await page.goto(`/northwind-studio/${path}`);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
  }
  await ctx.close();
});
