# Releasing HushGlance: everything, start to finish

This is the master checklist for launch day and the weeks around it. Do it top to bottom. The step-by-step
details for hosted AI and payments are in [`HOSTED_AI_SETUP.md`](HOSTED_AI_SETUP.md) (parts A–C), and
the hosting basics are in [`DEPLOY.md`](DEPLOY.md); this page tells you when to do each, plus
everything else a launch needs: domain, email, sign-in providers, legal pages, checks and running it.

**Start Dodo's business verification on day one.** It can take several days, and it's the only step
you can't speed up.

---

## Where things stand

- **Code:** everything since M13 is on your machine, not on GitHub's `main`:
  - M14 (sharing) and M15 (UX refresh) are committed.
  - M16 (hosted AI, Free / Starter / Pro) and the HushGlance rename are committed on `m16-plans`.
  - M17 (the encrypted workspace: projects and files on every device) is **uncommitted** on
    `m17-cloud-workspace`.
- **Tests:** all passing: unit, database (pgTAP), browser (e2e) on the production build.
- **Release fixes, already made:**
  - The social preview image (`public/og.png`) and README demo (`docs/demo.png`) are re-recorded
    with the new name.
  - Link previews get absolute URLs from `VITE_SITE_URL`.
  - The app is kept out of search engines: `robots.txt`, plus an `X-Robots-Tag` header for
    `/app/`. That keeps view-only dashboard links private.
  - `AI_DAILY_BUDGET_USD=0` now pauses hosted AI at once (a kill switch).
- **Still to do by you:** everything below. Nothing has been set up on your Supabase, Vercel,
  OpenRouter or Dodo accounts.

---

## 1. Register and decide (day 1)

- [ ] **Domain:** register `hushglance.com`. It was free on 2026-10-15; any registrar works,
      and Cloudflare Registrar sells at cost. Optionally also `.app` or `.ai`, redirected to the `.com`.
- [ ] **Support inbox:** `support@hushglance.com` forwarding to your own inbox. Cloudflare Email
      Routing and ImprovMX are free. This address goes on the legal pages, Dodo, Google's
      sign-in screen and the emails.
- [ ] **Sending email:** an account with [Resend](https://resend.com) (free tier: 3,000 emails a
      month) or Postmark. It sends the sign-up, sign-in-link and password-reset emails from
      `noreply@hushglance.com`.
- [ ] **Business details for Dodo** (they're the merchant of record, but they need to know who
      they pay):
  - your legal name, or your company's;
  - an address;
  - an ID for verification;
  - a tax ID if you have one;
  - a bank account for payouts.
- [ ] **Start Dodo verification now:** sign up at [dodopayments.com](https://dodopayments.com) and
      begin the business verification (HOSTED_AI_SETUP B3 / C2). They review your website too, so
      section 7 must be live before they finish.

**What it costs to run:**

| Item | Cost |
|---|---|
| Domain | About $10–15 a year (`.com`) |
| Vercel Pro (required for commercial use) | $20 a month |
| Supabase Pro (no pausing; daily backups) | $25 a month |
| OpenRouter | Pay as you go: about $0.013–0.016 a hosted question, plus 5.5% on credits |
| Dodo Payments | About 4% + $0.40 a payment (+1.5% international, +0.5% subscriptions) |
| Resend, email forwarding | Free at launch volume |

## 2. Finish the code (about an hour)

- [ ] **Legal pages:** in `public/terms.html`, `public/privacy.html` and `public/refunds.html`,
      replace `[contact email]` with `support@hushglance.com` and `[country / state]` with your
      governing law. Read them through; a lawyer's review is worth it once you have paying users.
- [ ] **Look over the copy:** the landing page (footer: "Made by Vedant Dandge"), pricing, and FAQ.
- [ ] **Local Supabase after the rename.** `supabase/config.toml` now says
      `project_id = "hushglance"`. Run `npx supabase stop --project-id Hushglanceuery`, then
      `npx supabase start`. The local database starts empty.
- [ ] **Run the database tests** (CI can't, since it has no database): `npx supabase test db`.
      Expect 93 checks to pass.
- [ ] **Commit M16 and the rename** on `m16-plans`:

  ```sh
  git add -A
  git commit -m "feat(plans): hosted AI with Free, Starter and Pro; rename to HushGlance (M16)"
  ```

- [ ] **Optional, cosmetic: rename the GitHub repo** from `askdata` to `hushglance` (Settings →
      General → Rename), then `git remote set-url origin git@github.com:<you>/hushglance.git`.
- [ ] **Push and merge:**

  ```sh
  git push -u origin m16-plans
  gh pr create --base main --title "M14–M16: sharing, UX refresh, plans; HushGlance" --fill
  ```

  Wait for CI to pass (typecheck, lint, unit, build, bundle budgets, e2e on the production
  build), then merge into `main`.

## 3. Supabase (production)

Do this while you wait on Dodo.

**1. Project and database**
- [ ] Create the project at supabase.com: name **HushGlance**, a region near your users, and a
      strong saved database password. Upgrade it to **Pro**.
- [ ] Push the database (from the repo):

  ```sh
  npx supabase login
  npx supabase link --project-ref <project-ref>   # the "abcd" of abcd.supabase.co
  npx supabase db push                            # profiles, sharing, plans, vault
  ```

- [ ] Check it: Table Editor shows every table with "RLS enabled". Advisors → Security shows no
      errors.
- [ ] **Storage:** a bucket named `vault`, **private**, with a 4.5 MB file limit (the vault
      migration creates it). Don't make it public; its policies are in the migration.
- [ ] **API Keys:** note the URL and the **publishable** key (`sb_publishable_…`) for Vercel.
      Never copy the secret key anywhere: the functions get it automatically.

**2. Authentication**
- [ ] **URL Configuration:**
  - **Site URL:** `https://hushglance.com/app/`
  - **Redirect URLs:** `https://hushglance.com/app/auth/callback` and
    `https://hushglance.com/app/reset`
- [ ] **Providers → Email:** turn on Confirm email, minimum password length 8, and Leaked password
      protection (a Pro feature).
- [ ] **Google sign-in:**
  1. In [Google Cloud Console](https://console.cloud.google.com): create a project, then **OAuth
     consent screen**:
     - External; app name **HushGlance**;
     - support email `support@hushglance.com`;
     - authorized domain `hushglance.com`;
     - privacy policy `https://hushglance.com/privacy.html`, terms `https://hushglance.com/terms.html`;
     - scopes: email, profile, openid only.
  2. **Credentials → Create OAuth client ID → Web application:**
     - Authorized JavaScript origins: `https://hushglance.com`
     - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
  3. Paste the client ID and secret into Supabase → Authentication → Providers → **Google**.
  4. Publish the consent screen ("In production").
- [ ] **GitHub sign-in:**
  1. On GitHub → Settings → Developer settings → **OAuth Apps → New**:
     - homepage `https://hushglance.com`;
     - callback `https://<project-ref>.supabase.co/auth/v1/callback`.
  2. Generate a client secret, and paste the ID and secret into Supabase → Providers → **GitHub**.
- [ ] **SMTP** (Authentication → Emails → SMTP Settings), with Resend:
  1. Add and verify `hushglance.com` in Resend (it shows DNS records; add them at your registrar).
  2. In Supabase:
     - host `smtp.resend.com`, port `465`;
     - user `resend`, password: a Resend API key;
     - sender `noreply@hushglance.com`, name **HushGlance**.
  3. Then raise **Rate Limits → emails per hour** from the built-in default.
- [ ] **Email templates:** Confirm signup, Magic link, Reset password, Change email. Say
      "HushGlance" and keep the `{{ .ConfirmationURL }}` link.

**3. Backups:** Pro keeps daily backups for 7 days. Point-in-time recovery is an optional add-on.

## 4. OpenRouter (hosted AI)

Details: HOSTED_AI_SETUP B2.
- [ ] **Credits:** create the account and buy credits ($10 to start). Keep auto top-up off, or
      capped.
- [ ] **Settings → Privacy:** turn on **Zero Data Retention** for all model groups. Leave prompt
      logging and the data-sharing discount off.
- [ ] **Settings → Keys:** create "hushglance-production" with a **credit limit** (for example $20).
      Save the `sk-or-v1-…` key somewhere safe; it's shown once.

## 5. Dodo Payments (test mode first)

Details: HOSTED_AI_SETUP A7 and B3.
- [ ] **Products** (subscriptions):
  - Starter monthly $5 and yearly $50;
  - Pro monthly $12 and yearly $120.

  Note the four `pdt_…` ids.
- [ ] **Developer → API Keys:** a test key.
- [ ] **Developer → Webhooks:** endpoint `https://<project-ref>.supabase.co/functions/v1/billing/webhook`,
      all `subscription.*` events. Note its `whsec_…` secret.
- [ ] **Customer portal:** on, with cancelling allowed. **Branding:** the HushGlance name and logo.
- [ ] **Payouts:** your bank account. **Verification:** in progress since day 1.

## 6. Server functions: secrets and deploy

- [ ] Put the secrets in a git-ignored `supabase/.env.production` (any `.env.*` is ignored):

  ```sh
  OPENROUTER_API_KEY=sk-or-v1-…
  APP_ORIGINS=https://hushglance.com,https://www.hushglance.com
  AI_DAILY_BUDGET_USD=10
  DODO_API_BASE=https://test.dodopayments.com
  DODO_API_KEY=<Dodo test key>
  DODO_WEBHOOK_SECRET=whsec_…
  DODO_PRODUCT_STARTER_MONTHLY=pdt_…
  DODO_PRODUCT_STARTER_YEARLY=pdt_…
  DODO_PRODUCT_PRO_MONTHLY=pdt_…
  DODO_PRODUCT_PRO_YEARLY=pdt_…
  ```

- [ ] Set them and deploy:

  ```sh
  npx supabase secrets set --env-file supabase/.env.production
  npx supabase functions deploy ai
  npx supabase functions deploy billing
  ```

- [ ] In Dashboard → Edge Functions, check that `billing` shows **Verify JWT: off** and `ai` shows
      **on**.

## 7. Vercel (the website)

- [ ] **Import the GitHub repo:**
  - framework Vite; build settings come from `vercel.json`;
  - production branch `main`;
  - upgrade the team to **Pro**.
- [ ] **Settings → Environment Variables** (Production):

  | Name | Value |
  |---|---|
  | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
  | `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
  | `VITE_SITE_URL` | `https://hushglance.com` (absolute link previews) |

- [ ] **Domains:**
  - Add `hushglance.com`, plus `www.hushglance.com` set to redirect to it.
  - Add the DNS records Vercel shows at your registrar. HTTPS follows automatically.
- [ ] **Redeploy**, then check:

  ```sh
  curl -sI https://hushglance.com/ | grep -i content-security-policy     # frame-ancestors 'none'
  curl -sI https://hushglance.com/app/ | grep -i x-robots-tag           # noindex, nofollow
  curl -s https://hushglance.com/robots.txt                             # Disallow: /app/
  ```

## 8. Full test on production (still Dodo test mode)

Use a fresh browser profile. Every item should pass before you take real money.

**Accounts**
- [ ] Sign up with email. The confirmation email arrives from `noreply@hushglance.com`, and its link
      lands you signed in.
- [ ] Sign out, then sign in with the password, with an email link, with Google and with GitHub.
- [ ] Forgot password → the reset email → a new password works.

**Data and answers**
- [ ] `/app/try` as a guest: the 1M-row sample answers with no account.
- [ ] Your own CSV or Excel file loads, and asking works.
- [ ] Settings → **Your own key** (an Anthropic key) answers.
- [ ] **Connect OpenRouter** answers on your account.

**HushGlance AI**
- [ ] Signed in without a key: "3 free questions left"; three answers, then the plans dialog.
- [ ] The AI inspector shows each request. Strict mode sends no values.
- [ ] Supabase → Edge Functions → `ai` → Logs shows only lines like
      `ai 200 anthropic/claude-sonnet-5 …ms`.

**Payments**
- [ ] **Choose Starter**, then pay with test card 4242 4242 4242 4242 (06/32, CVV 123). Plan and
      billing says "You're on Starter".
- [ ] **Upgrade to Pro → Switch to Pro**: Pro within seconds, with no second checkout. Claude Opus
      5.5 becomes selectable.
- [ ] **Manage subscription** → cancel → "Pro until …".

**Sharing**
- [ ] Share a dashboard: the consent dialog, an invite by email, a view-only link opened in a
      private window, then revoke it.

**Your workspace on two devices**
- [ ] Home offers "Save your workspace to your account": set a passphrase, save the recovery key.
- [ ] Load a file and ask a question. In a second browser, sign in, unlock with the passphrase:
      the project, its question and its file are there.
- [ ] Supabase → Table Editor → `sync_records`: only base64 ciphertext. Storage → `vault`: chunk
      files, no readable names.
- [ ] A third browser: unlock with the recovery key and a new passphrase.
- [ ] Settings → Saved to your account shows storage used of 500 MB (Free).
- [ ] A project set to "Keep on this device only" disappears from `sync_records`.

**Phone**
- [ ] The landing page and the app on a real phone.

**Link previews**
- [ ] Paste `https://hushglance.com` into the
      [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) or
      [opengraph.xyz](https://www.opengraph.xyz/). You should see the HushGlance image and title.

**Housekeeping**
- [ ] Delete the test accounts (Account → Delete account). Storage → `vault` is empty afterwards.
      Cancel the test subscriptions in Dodo.

## 9. Paid checks (small, worth doing once)

- [ ] **Confirm the cost per question:** ask about 20 hosted questions. That's about $0.50. Then
      run the usage query in section 12.
- [ ] **Optional: list more models.** Run the eval through OpenRouter for each candidate (about
      $0.50–1 per model; HOSTED_AI_SETUP B8). Then `update public.ai_models set enabled = true …`
      for those scoring at least 90%.

## 10. Go live (after Dodo approves you)

- [ ] **Recreate in Dodo's Live Mode:** the four products (new `pdt_…` ids), a live API key, and the
      webhook endpoint (new `whsec_…`).
- [ ] **Swap the seven secrets.** Secrets apply at once, with no redeploy:

  ```sh
  npx supabase secrets set DODO_API_BASE=https://live.dodopayments.com DODO_API_KEY=<live key> \
    DODO_WEBHOOK_SECRET=whsec_<live> \
    DODO_PRODUCT_STARTER_MONTHLY=pdt_<live> DODO_PRODUCT_STARTER_YEARLY=pdt_<live> \
    DODO_PRODUCT_PRO_MONTHLY=pdt_<live> DODO_PRODUCT_PRO_YEARLY=pdt_<live>
  ```

- [ ] **One real purchase:** buy Starter with your own card, check that it arrives, then refund it
      from Dodo.
- [ ] **Set real limits:** raise the OpenRouter key's credit limit and `AI_DAILY_BUDGET_USD` to what
      you'll spend in a bad day.

## 11. Launch

- [ ] **GitHub:** set the repo's description and website to `https://hushglance.com`. The README
      already has the new demo.
- [ ] **Announce** where your users are (LinkedIn, X, communities for founders and finance people).
      Lead with the privacy story: files never leave the device, and every request is visible.
- [ ] **Watch the first day closely** (section 12): the function logs, the spend, Dodo and the
      support inbox.

## 12. Running it

**Daily for the first two weeks, then weekly**
- **Errors:** Supabase → Edge Functions → `ai` and `billing` logs. Look for `ai 5xx`,
  `billing … not applied` and `bad signature`.
- **Spend and usage** (SQL editor):

  ```sql
  select date_trunc('day', at) as day, count(*) as calls, round(sum(cost_usd), 2) as usd
  from public.ai_usage group by 1 order by 1 desc limit 14;

  select plan_id, count(*) from public.subscriptions where status = 'active' group by 1;
  ```

- **Other dashboards:** OpenRouter → Activity; Dodo → Payments and Subscriptions (failed renewals);
  the support inbox.

**Kill switches** (all instant, no deploy)

| Situation | Do this |
|---|---|
| Spend runs away | `npx supabase secrets set AI_DAILY_BUDGET_USD=0` (hosted AI pauses; own keys keep working) |
| One model misbehaves | `update public.ai_models set enabled = false where id = '…';` |
| Sign-up abuse | Supabase → Authentication → Providers → Email → turn off new sign-ups |
| An OpenRouter or Dodo key leaks | Revoke it in their dashboard, make a new one, `npx supabase secrets set …` |

**If something breaks**
- **Payments missing:** Dodo retries a webhook 8 times over a day. Its dashboard shows each delivery
  and can resend it. A delivery is applied only once, so resending is safe.
- **Supabase down:** the landing page and the try demo keep working. Anything that needs an
  account waits: sign-in, projects, hosted AI and sharing. Check status.supabase.com.
- **Restore:** Supabase → Database → Backups (daily, 7 days on Pro).

**Shipping changes**
- **Flow:** branch → PR → CI → merge → Vercel deploys `main` by itself.
- **A new migration:** `npx supabase db push` before merging code that needs it.
- **A changed function:** `npx supabase functions deploy <name>`.
- **Prices or allowances:** update the `plans` table, create new Dodo products (Dodo prices are
  fixed per product), set their `pdt_…` secrets, and update `PRICING` in `src/landing/data.ts`. A
  test checks it against the migration.
- **New data processors** (a new email or AI provider): add them to `public/privacy.html` first.

---

## Every key and setting

| Name | Where you get it | Where it goes | Secret? |
|---|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → API Keys | Vercel env | No (public) |
| `VITE_SITE_URL` | Your domain | Vercel env | No |
| Supabase secret key | Supabase → API Keys | **Nowhere**: functions get it automatically | Yes |
| Database password | Set when creating the project | `supabase link` asks once; keep it in a password manager | Yes |
| Google OAuth client ID and secret | Google Cloud Console | Supabase → Auth → Providers | Yes |
| GitHub OAuth client ID and secret | GitHub → OAuth Apps | Supabase → Auth → Providers | Yes |
| Resend API key | Resend → API Keys | Supabase → Auth → SMTP password | Yes |
| `OPENROUTER_API_KEY` | OpenRouter → Keys | Function secrets | Yes |
| `APP_ORIGINS`, `AI_DAILY_BUDGET_USD` | You choose | Function secrets | No |
| `DODO_API_KEY`, `DODO_WEBHOOK_SECRET` | Dodo → Developer | Function secrets | Yes |
| `DODO_API_BASE`, `DODO_PRODUCT_…` (×4) | Dodo | Function secrets | No |
| DNS records | Vercel, Resend, email forwarding | Your registrar | No |

**Two rules:**
- Only the three `VITE_…` values go in Vercel. Everything else lives in Supabase (function secrets
  and auth settings) or with the provider.
- No secret goes in the repo. `supabase/.env.production` and `supabase/functions/.env` are
  git-ignored.
