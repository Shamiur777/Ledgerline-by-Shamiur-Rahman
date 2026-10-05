# Deploying the public demo

Goal: a link anyone can open and, in one click, explore a fictional company, read-only. Free tiers of
**Supabase** (database + auth) and **Vercel** (hosting). Takes roughly 20 minutes.

**Rules of this setup**

- Secrets only ever live in two places: your local, gitignored `.env.hosted` file, and Vercel's environment-variable settings. Never in chat, never in git.
- The Supabase **service-role key** is used only by the seed script on your own machine. It is **never** set on Vercel and never reaches the browser.
- The demo contains only the fictional "Northwind Studio" data.
- Before every push, run `npm run scan:secrets` (CI runs it too).

## How the public demo is protected

| Risk | Control |
|---|---|
| Vandalism of the demo company | Visitors are **viewers** (Row-Level Security). They cannot write to anything. Tested in `04_public_demo.test.sql` and the e2e demo spec. |
| One visitor locking out others | There is **no shared login**. "Try the demo" creates a throwaway *anonymous* identity per visitor; a database function joins it to the demo company as a viewer. |
| Using the public API to spam the database | Anonymous visitors cannot create companies; any single account is capped at 5. Supabase rate-limits anonymous sign-ins (default 30/hour/IP). |
| Strangers creating accounts | Sign-ups are **closed**: `SIGNUPS_ENABLED=false` hides the form, and the Supabase project has sign-ups disabled (that setting is the real control, because the Supabase API is public). |
| Emails / paid features triggered by visitors | None exist. No email is sent (sign-ups closed, no password reset, invites are links), and nothing in the app calls a paid API. |
| Stale or messy demo data | `npm run demo:reset` rebuilds the company and deletes old anonymous identities. |

## Part A: Supabase (about 10 minutes)

1. Go to <https://supabase.com/dashboard> and sign in. Click **New project**.
   - Name: `ledgerline-demo`
   - **Database password:** click *Generate a password* and store it in your password manager. You need it in step 5.
   - Region: the one closest to you (pick the same region for Vercel in Part B).
   - Plan: **Free**. Click **Create new project** and wait for it to finish (about 2 minutes).
2. Open **Project Settings → General** and copy the **Reference ID** (a short string like `abcdefghijklmnop`). It is not secret.
3. Open **Project Settings → API** (or **API Keys**). You will need three values, used in steps 6 and Part B:
   - **Project URL**
   - the **anon / publishable** key (public by design)
   - the **service_role / secret** key (**secret**, only ever goes into `.env.hosted`)
4. Open **Authentication → Sign In / Providers** (label names can shift slightly):
   - Turn **ON** *Allow anonymous sign-ins* (powers the Try the demo button).
   - Turn **OFF** *Allow new users to sign up* (closes public registration).
   - Leave CAPTCHA **off**. The app does not send a CAPTCHA token, so enabling it would break the demo button.
   - Click **Save**.
5. In a terminal at the repo root, link the project and apply the migrations:
   ```bash
   npx supabase login                          # opens your browser once
   npx supabase link --project-ref YOUR_REFERENCE_ID   # asks for the database password from step 1
   npx supabase db push                        # applies supabase/migrations/*.sql
   ```
6. Create a file named `.env.hosted` in the repo root (it is gitignored) containing exactly these three lines, with your values from step 3:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
   Check it is ignored: `git check-ignore .env.hosted` should print the file name.
7. Seed the hosted database with the demo company (PowerShell):
   ```powershell
   $env:ENV_FILE = ".env.hosted"
   npm run demo:reset -- --confirm-remote
   Remove-Item Env:ENV_FILE
   ```
   (Git Bash / macOS / Linux: `ENV_FILE=.env.hosted npm run demo:reset -- --confirm-remote`.)
   The script refuses to touch a non-local database without `--confirm-remote`, uses random passwords that are never printed, and flags the company as the demo.
   Check **Table Editor → organizations**: one row, `is_demo = true`.

## Part B: Vercel (about 5 minutes)

1. Go to <https://vercel.com>, sign up with GitHub, then **Add New… → Project** and import `Ledgerline-by-Shamiur-Rahman`. Framework preset: **Next.js** (auto-detected).
2. Before deploying, open **Environment Variables** and add these (names only here, paste the values yourself):

   | Name | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from A3 | public |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/publishable key from A3 | public by design |
   | `SIGNUPS_ENABLED` | `false` | closes the sign-up form |

   **Do not add `SUPABASE_SERVICE_ROLE_KEY` on Vercel.** The app does not need it.
   Optional: `DEMO_ENABLED=false` hides the demo button.
3. Click **Deploy**. Note the URL, e.g. `https://ledgerline-xxxx.vercel.app`.
4. (Recommended) **Project Settings → Functions → Region**: choose the region closest to your Supabase project.

`NEXT_PUBLIC_*` values are baked in at build time, so after changing them, **redeploy**.

## Part C: tell Supabase the site URL

Back in Supabase, **Authentication → URL Configuration**:
- **Site URL:** your Vercel URL
- **Redirect URLs:** add `https://YOUR-VERCEL-URL/**`

## Part D: check it

Open the URL, click **Try the demo**, and look around. Then run the same flows automatically:

```bash
E2E_BASE_URL=https://YOUR-VERCEL-URL npx playwright test demo
```

## Keeping it healthy

- **Reset / refresh the demo** (also removes visitor identities older than 24 hours). Seed dates are relative to the day you run it, so re-run about monthly or bills will look stale:
  ```powershell
  $env:ENV_FILE = ".env.hosted"; npm run demo:reset -- --confirm-remote; Remove-Item Env:ENV_FILE
  ```
- **Free-tier pausing:** Supabase pauses free projects after about a week with no activity. `vercel.json` schedules a daily call to `/api/health` (a tiny database query) to keep it awake. If the project is ever paused, click **Restore** in the Supabase dashboard; the demo button fails until then.
- **Costs:** both free tiers are enough for this. Vercel's free "Hobby" plan is for personal, non-commercial use, which a portfolio demo is.
- **Limits to know:** Supabase free tier is 500 MB of database and a capped monthly auth quota; anonymous sign-ins are rate-limited per IP. A burst of traffic can make *Try the demo* return "please try again in a minute".

## Troubleshooting

- **"Couldn't start the demo right now"**: anonymous sign-ins are off, or Supabase's rate limit was hit. Recheck A4.
- **"The demo company isn't set up yet"**: the seed didn't run against this project. Redo A7.
- **Sign-in works locally but redirects oddly in production**: the Site URL / Redirect URLs in Part C don't match your Vercel URL.
