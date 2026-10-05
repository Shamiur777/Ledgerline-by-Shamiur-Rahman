# Ledgerline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A multi-tenant accounting SaaS (orgs, bank accounts, transactions, payables, payroll, approvals, dashboard, reports) that proves tenant isolation in the database.

**Architecture:** Next.js App Router talks to Supabase (Postgres + Auth). All tenant data carries `org_id`; RLS enforces isolation via `is_member(org_id, min_role)`. Money-moving operations (approve payment, create org) are Postgres functions so they are atomic. Reports are SQL functions returning aggregates; TypeScript only formats and exports.

**Tech Stack:** Next.js 15 (TS), Tailwind + shadcn/ui, Supabase local (Docker), `@supabase/ssr`, Recharts, `@react-pdf/renderer`, `exceljs`, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-ledgerline-design.md`

## Global Constraints

- Money is `numeric(15,2)` in the DB; in TS it is handled as integer minor units via `src/lib/money.ts`. Never use floats for arithmetic.
- Every tenant table has `org_id uuid not null references organizations(id)` and RLS enabled with no permissive default.
- Roles ordered: `viewer < accountant < approver < admin < owner`. `is_member(org, min_role)` encodes this.
- Currency is per organization (ISO 4217); formatting via `Intl.NumberFormat`.
- Soft delete via `deleted_at`; deleted rows are excluded from all balances and reports.
- No Hulkenstein data or names appear anywhere in this repo.

## File Structure

```
supabase/
  config.toml
  migrations/
    0001_core_schema.sql        tables, enums, indexes
    0002_rls.sql                is_member(), policies for every table
    0003_functions.sql          create_organization, approve/reject_pending_payment, overpayment trigger, audit triggers
    0004_reports.sql            account_balances, monthly_totals, pnl_by_category, balance_sheet, upcoming_bills
  tests/
    rls_isolation.test.sql      pgTAP
    functions.test.sql          pgTAP
  seed.sql                      empty (demo seeded via script)
src/
  lib/money.ts                  toMinor, fromMinor, format, sum
  lib/supabase/{server,client,middleware}.ts
  lib/auth.ts                   getUser, getActiveOrg, requireRole
  lib/csv.ts                    parse/validate transaction CSV
  lib/export/{xlsx,pdf,csv}.ts
  app/(auth)/{login,signup}/page.tsx
  app/onboarding/page.tsx
  app/[org]/layout.tsx          shell, nav, org switcher
  app/[org]/{dashboard,accounts,transactions,payables,payroll,approvals,reports,settings,audit}/...
  app/api/export/[report]/route.ts
  components/...                ui + feature components
scripts/seed-demo.ts
tests/e2e/smoke.spec.ts
README.md
```

---

### Task 1: Scaffold, tooling, Docker + Supabase CLI

**Files:** Create project root files (`package.json`, `tsconfig`, `tailwind`, `vitest.config.ts`, `.env.example`, `.gitignore`), `supabase/config.toml`.

- [ ] Verify Docker is running: `docker version` (server section must print).
- [ ] `npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint --use-npm --import-alias "@/*"`
- [ ] `npm i @supabase/supabase-js @supabase/ssr zod recharts exceljs @react-pdf/renderer date-fns` and `npm i -D vitest @vitest/coverage-v8 supabase tsx @playwright/test`
- [ ] `npx shadcn@latest init` then add `button input label card table dialog select badge tabs dropdown-menu sonner`
- [ ] `npx supabase init` then `npx supabase start`; copy printed API URL/anon/service keys into `.env.local`; write `.env.example` with placeholders.
- [ ] Add scripts: `test`, `test:db` (`supabase test db`), `seed:demo`, `e2e`.
- [ ] Commit.

### Task 2: Core schema (`0001_core_schema.sql`)

**Produces:** tables `organizations, profiles, memberships, bank_accounts, business_units, categories, transactions, vendors, bills, departments, employees, payroll_runs, payroll_items, pending_payments, audit_log`; enums `member_role`, `txn_kind`, `category_kind`, `approval_status`.

- [ ] Write migration; every tenant table has `org_id`, `created_at`, indexes on `(org_id, date)` for transactions and `(org_id, due_date)` for bills.
- [ ] Constraints: `amount > 0`; transfers require `to_bank_account_id <> bank_account_id`; income/expense require `category_id`; `payroll_items unique(payroll_run_id, employee_id)`; `payroll_runs unique(org_id, year, month)`.
- [ ] `npx supabase db reset` succeeds. Commit.

### Task 3: RLS (`0002_rls.sql`)

**Produces:** `is_member(p_org uuid, p_min member_role) returns boolean` (security definer, stable, `search_path = public`).

- [ ] Enable RLS on all tables. Policies: select requires viewer+; write on bank_accounts/categories/units/vendors/employees requires admin+; write on transactions/bills/payroll requires accountant+; pending_payments insert accountant+, update (decide) via function only; memberships managed by admin+, owner row protected; audit_log select admin+, no direct write.
- [ ] `profiles` readable by members of shared orgs, writable by self.
- [ ] Commit.

### Task 4: Functions and integrity (`0003_functions.sql`)

**Produces:**
- `create_organization(p_name text, p_currency char(3), p_fy_start int, p_starter bool) returns uuid` — creates org, owner membership, starter categories/business unit, one default bank account.
- `approve_pending_payment(p_id uuid) returns uuid` (transaction id) — requires approver+, status must be pending, rejects self-approval when org has >1 member with approver+, creates expense transaction, links bill/payroll item, marks approved.
- `reject_pending_payment(p_id uuid, p_note text)`.
- Trigger `prevent_overpayment` on transactions for bill_id / payroll_item_id (sum of non-deleted payments <= amount due).
- Trigger `write_audit` on core tables writing `audit_log(org_id, user_id, action, entity, entity_id, diff)`.

- [ ] Write functions + triggers. Commit.

### Task 5: Reports SQL (`0004_reports.sql`)

**Produces (all `security invoker` so RLS applies):**
- `account_balances(p_org uuid, p_as_of date)` -> `(bank_account_id, name, balance numeric)` incl. transfers.
- `monthly_totals(p_org uuid, p_from date, p_to date)` -> `(month date, income numeric, expense numeric)`.
- `pnl_by_category(p_org, p_from, p_to)` -> `(category_id, name, kind, total)`.
- `balance_sheet(p_org, p_as_of)` -> cash, payables outstanding, payroll outstanding, equity (derived).
- `upcoming_bills(p_org, p_days int)` -> bills with outstanding > 0 due within window.

- [ ] Commit.

### Task 6: Database tests (pgTAP)

**Files:** `supabase/tests/rls_isolation.test.sql`, `functions.test.sql`

- [ ] Write tests FIRST for: org B user cannot select/insert/update/delete org A rows in every tenant table; viewer cannot insert; accountant cannot approve; approve creates exactly one transaction and is idempotent-safe; overpayment rejected; soft-deleted rows excluded from `account_balances`; transfer moves balance between accounts.
- [ ] `npx supabase test db` passes. Commit.

### Task 7: Money lib (TDD)

**Files:** `src/lib/money.ts`, `src/lib/money.test.ts`

**Produces:** `toMinor(input: string|number, currency): bigint`, `fromMinor(minor: bigint, currency): string`, `formatMoney(value: number|string, currency, locale?): string`, `sumMinor(values: (string|number)[], currency): bigint`.

- [ ] Failing tests: `0.1+0.2` sums to `0.30`; zero-decimal currency (JPY); negative formatting; rounding half-up. Implement. `npm test` passes. Commit.

### Task 8: Auth, onboarding, app shell

**Files:** `src/lib/supabase/*`, `src/middleware.ts`, `(auth)` pages, `onboarding`, `[org]/layout.tsx`, `src/lib/auth.ts`.

**Produces:** `requireRole(orgSlug, minRole)` server helper; org switcher; role-aware nav.

- [ ] Email/password signup+login, middleware session refresh, onboarding form calls `create_organization`, redirect to `/[org]/dashboard`. Commit.

### Task 9: Accounts, categories, business units, settings

- [ ] CRUD pages with Zod-validated server actions; archive instead of delete; opening balances; org settings (name, currency locked after first transaction). Commit.

### Task 10: Transactions

**Files:** `[org]/transactions/*`, `src/lib/csv.ts` (+ test).

- [ ] List with filters (date range, account, category, unit, kind, text), pagination; create/edit income, expense, transfer; soft delete + restore view; CSV import with row-level validation preview. CSV parser unit-tested. Commit.

### Task 11: Payables

- [ ] Vendors, bills, outstanding calc, "Pay bill" creates transaction (accountant+ pays directly or submits for approval per org toggle), overpayment error surfaced, due-soon badges, notification bell using `upcoming_bills`. Commit.

### Task 12: Payroll

- [ ] People/departments; create monthly run copying default amounts; add/remove people; pay (full/partial) with remaining shown; owner-pay flag separate in summaries. Commit.

### Task 13: Approvals

- [ ] Request payment form (any accountant+), approvals inbox for approver+, approve/reject via RPC, status history, self-approval block message. Commit.

### Task 14: Dashboard

- [ ] KPI cards (income, expense, net, cash), 12-month trend chart (`monthly_totals`), account balances, upcoming bills, pending approvals count. Month picker. Commit.

### Task 15: Reports and exports

- [ ] P&L, Balance Sheet, Cash Flow pages; `/api/export/[report]?format=xlsx|pdf|csv` with role check; export helpers tested on sample data. Commit.

### Task 16: Members and audit log

- [ ] Invite by email (creates pending invite row + accept flow, or Supabase admin invite), change role, remove; audit log viewer with filters (admin+). Commit.

### Task 17: Demo seed

**Files:** `scripts/seed-demo.ts`

- [ ] Idempotent script: creates users (owner, accountant, approver, read-only `demo@ledgerline.dev`), org "Northwind Studio" (USD), 12 months of deterministic data (seeded PRNG), bills partially paid, a payroll run, pending approvals. Login for demo printed. Commit.

### Task 18: E2E, CI, docs

- [ ] Playwright smoke: signup -> onboarding -> add transaction -> see on dashboard -> export P&L.
- [ ] GitHub Actions: lint, typecheck, vitest, `supabase test db`, build.
- [ ] README: pitch, screenshots, architecture diagram (RLS flow), "what I generalized from a real internal app", run instructions, trade-offs, roadmap. Commit.

## Self-Review

- Spec coverage: onboarding (8), bank accounts/transfers (2,9,10), transactions + CSV (10), payables (11), payroll (12), approvals (4,13), dashboard (14), reports/exports (5,15), audit + members (4,16), demo (17), tests (6,7,18). All covered.
- Names consistent across tasks: `is_member`, `create_organization`, `approve_pending_payment`, `account_balances`, `monthly_totals`, `pnl_by_category`, `balance_sheet`, `upcoming_bills`.
