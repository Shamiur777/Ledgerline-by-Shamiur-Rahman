# Ledgerline — Multi-tenant Accounting App (Design)

Generalized from an internal single-company Flask app (Hulkenstein Ltd Accounting) into a multi-tenant SaaS any company can use. Built as an FDE portfolio showcase.

## Decisions
- **Tenancy:** multi-tenant SaaS; users sign up, create an organization, data isolated per org.
- **Stack:** Next.js (App Router, TypeScript), Tailwind + shadcn/ui, Supabase (Postgres, Auth, RLS), Recharts, `@react-pdf/renderer`, `exceljs`, Vercel.
- **Scope v1:** core + approvals (see Modules).
- **Dev environment:** local Supabase via Docker (`supabase start`).
- **Repo:** new, separate (`ledgerline`). The Hulkenstein app and its production data are not touched or copied.

## Multi-tenancy
- Every business table has `org_id`.
- `memberships(user_id, org_id, role)`; roles `owner | admin | accountant | approver | viewer`.
- RLS on every table, using a `SECURITY DEFINER` helper `is_member(org_id, min_role)`.
- Tenant isolation is proven by automated tests (org A cannot read/write org B).

## Generalization from the original
| Original | General |
|---|---|
| BDT hardcoded | per-org currency via `Intl.NumberFormat` |
| "Platforms" | configurable business units / projects |
| Directors vs employees, departments | departments + people, owner-pay flag |
| Hardcoded bank auto-assign | optional per-org rules (category → default account) |
| admin/viewer | five per-org roles |
| Soft delete, audit log, pending approvals | kept as first-class features |

## Modules (v1)
1. Onboarding: signup, create org, currency, fiscal-year start, starter categories.
2. Bank accounts: opening balances, transfers.
3. Transactions: income/expense/transfer, filters, soft delete + restore, CSV import.
4. Payables: vendors, bills, partial payments, due-date notifications.
5. Payroll: monthly salary runs, partial payments.
6. Approvals: pending payment -> approver approves -> posted transaction (atomic RPC).
7. Dashboard: monthly trend, balances, upcoming bills.
8. Reports: P&L, balance sheet, cash flow; Excel, PDF, CSV export.
9. Audit log, member management.

## Data integrity
- Money is `numeric(15,2)`; formatting only at the edge.
- Approving/posting payments runs as Postgres functions (atomic).
- Overpayment blocked in DB (trigger/check) and in UI.

## Demo
`npm run seed:demo` creates fictional "Northwind Studio" with 12 months of data and a read-only demo login.

## Testing
- Vitest: money and report logic.
- SQL tests: RLS isolation and posting functions.
- Playwright smoke: signup -> transaction -> report.

## Build order
Schema + RLS -> auth/onboarding -> core CRUD -> payables/payroll/approvals -> dashboard/reports -> seed -> polish + README (architecture diagram).

## Out of scope (v1)
Dropbox/automated backups, multi-currency per org, bank feeds, invoicing, tax filing.
