/**
 * Regenerates the README screenshots from the seeded demo company.
 *   npm run dev            (in one terminal, with local Supabase running and `npm run seed:demo` done)
 *   npm run screenshots
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const channel = process.env.E2E_CHANNEL === undefined ? "msedge" : process.env.E2E_CHANNEL || undefined;

async function main() {
  mkdirSync("docs/screenshots", { recursive: true });
  const browser = await chromium.launch({ channel });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill("owner@ledgerline.dev");
  await page.getByLabel("Password").fill("ledgerline-demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/northwind-studio\/dashboard/);

  const shots: [string, string][] = [
    ["dashboard", "/northwind-studio/dashboard"],
    ["transactions", "/northwind-studio/transactions"],
    ["payables", "/northwind-studio/payables"],
    ["payroll", "/northwind-studio/payroll"],
    ["approvals", "/northwind-studio/approvals"],
    ["reports", "/northwind-studio/reports?type=pnl"],
    ["audit", "/northwind-studio/audit"],
  ];
  for (const [name, path] of shots) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/screenshots/${name}.png` });
    console.log("captured", name);
  }

  // Phone-width dashboard
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/northwind-studio/dashboard`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/screenshots/dashboard-mobile.png" });
  console.log("captured dashboard-mobile");

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
