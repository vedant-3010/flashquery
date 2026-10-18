# Setting up HushGlance AI, Starter and Pro: test locally, then deploy

This guide sets up M16 from nothing: hosted AI through OpenRouter (3 free questions, then Starter or Pro) and
payments through Dodo Payments.
- **Part A** runs everything on your computer. AI answers can come from a free stand-in or real
  models, and payments use Dodo's test mode.
- **Part B** deploys it to Supabase and Vercel, still in test mode.
- **Part C** switches to real money.

Background: PRD D119–D121. The shorter reference is `docs/DEPLOY.md`; the whole launch (domain,
email, sign-in providers, go-live) is in `docs/RELEASE.md`.

---

## The keys, and where each one goes

| Name | Looks like | Get it from | Goes in | Secret? |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | `https://abcd.supabase.co` (local: `http://127.0.0.1:54321`) | Supabase → Project Settings → API (local: `npx supabase status`) | `.env.local` (local), Vercel env (production) | No: public |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | Same place | Same place | No: public |
| Supabase secret key | `sb_secret_…` | Supabase → Settings → API Keys | **Nowhere.** Edge Functions get it automatically (`SUPABASE_SECRET_KEYS`) | Yes |
| `OPENROUTER_API_KEY` | `sk-or-v1-…` | openrouter.ai → Settings → Keys | Function secrets | Yes |
| `DODO_API_KEY` | (shown once) | Dodo → Developer → API Keys | Function secrets | Yes |
| `DODO_WEBHOOK_SECRET` | `whsec_…` | Dodo → Developer → Webhooks → your endpoint | Function secrets | Yes |
| `DODO_PRODUCT_STARTER_MONTHLY` / `_YEARLY` | `pdt_…` | Dodo → Products | Function secrets | No, but keep with them |
| `DODO_PRODUCT_PRO_MONTHLY` / `_YEARLY` | `pdt_…` | Dodo → Products | Function secrets | No, but keep with them |
| `DODO_API_BASE` | `https://test.dodopayments.com` or `https://live.dodopayments.com` | — | Function secrets | No |
| `APP_ORIGINS` | `https://hushglance.app,https://www.hushglance.app` | Your site's address(es) | Function secrets | No |
| `AI_DAILY_BUDGET_USD` | `20` | You choose | Function secrets | No |
| `OPENROUTER_UPSTREAM` | `http://host.docker.internal:8787/v1/chat/completions` | — | **Local only**, for the free stand-in. Never set it in production | No |

**Function secrets** means:
- **Locally:** the file `supabase/functions/.env`.
- **In production:** `npx supabase secrets set`.

**Rules:**
- Only the two `VITE_…` values ever go in `.env.local` or Vercel; anything there ships to every
  browser.
- OpenRouter and Dodo keys go only into function secrets.
- `supabase/functions/.env` and `.env.local` are git-ignored; never commit them.
- The root `.env` holds `NEXT_PUBLIC_SUPABASE_…` names. This Vite app doesn't read those; it reads
  only `VITE_…`.

---

## Part A: on your computer

### A1. Before you start

- Docker Desktop is running. `docker ps` works.
- Node 22 or newer, and `npm ci` has run.
- You're on the `m16-plans` branch.
- **Restart your dev server** if one is running (`Ctrl+C`, then `npm run dev`). A second dev
  server from a test run can leave the first one serving stale dependencies. The sign-in page then
  fails with "Failed to fetch dynamically imported module".

### A2. Start Supabase locally and apply the migrations

```sh
npx supabase start          # first run downloads images (a few minutes)
npx supabase migration up   # if it was already running: applies 20261012000000_plans.sql
npx supabase test db        # 87 checks, all "ok": plans (44) and sharing (43)
```

`npx supabase status` prints the API URL, the publishable key and the local addresses:
- Studio, a database browser: http://127.0.0.1:54323
- Mailpit, which catches sign-up emails: http://127.0.0.1:54324

### A3. Point the app at local Supabase

`.env.local` in the project root holds the two public values from `npx supabase status`:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

Restart `npm run dev` after changing it.

### A4. The functions' secrets (local)

```sh
cp supabase/functions/.env.example supabase/functions/.env
```

Pick how hosted questions get answered.

**Option 1: free, no account needed.** A stand-in for OpenRouter answers every question with a
real, runnable query (the table's row count). In `supabase/functions/.env`:

```sh
OPENROUTER_API_KEY=local-stand-in          # anything: the stand-in ignores it
OPENROUTER_UPSTREAM=http://host.docker.internal:8787/v1/chat/completions
APP_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
AI_DAILY_BUDGET_USD=20
```

Then, in a terminal of its own:

```sh
node scripts/hosted-stub.mjs   # "OpenRouter stand-in on http://localhost:8787"
```

For each request, it prints the privacy settings the proxy forced on it, never the messages.

**Option 2: real models.** This costs about 1–2 cents a question.
- Create an OpenRouter key as in B2, with a $5 credit limit.
- Put it in `OPENROUTER_API_KEY`.
- Delete the `OPENROUTER_UPSTREAM` line.

Leave the `DODO_…` lines as they are until A7. The billing function starts with placeholders;
only checkout needs real values.

### A5. Run the functions

```sh
npx supabase functions serve --env-file supabase/functions/.env
```

It lists `…/functions/v1/ai` and `…/functions/v1/billing`. Keep it running, and restart it after
any change to `supabase/functions/.env`.

### A6. Try hosted AI

1. `npm run dev`, then open http://localhost:5173/app/register and create an account. Locally,
   email confirmation is off (`supabase/config.toml`), so the account counts as confirmed and you're
   signed in at once.
2. New project → **Try sample data** → **Global Sales · 10k rows**.
3. **Check what you see:**
   - The ask bar's model chip says **Sonnet 5**.
   - Under the box: "HushGlance AI. **3 free questions left.**"
   - A note explains what goes through the server.
4. Ask anything. You get an answer (with the stand-in: "Rows in global_sales: 10,000"), and the
   meter drops to 2.
5. Ask until the meter reads "No free questions left". The next question opens **"You've used your
   free questions"**.
6. Other places to look:
   - Settings: "HushGlance AI / Your own key" and the model picker.
   - The account menu → **Plan and billing**: "3 of 3 used".
   - Studio → `ai_usage`: token counts and cost only. There is no column for a prompt.
   - The `functions serve` terminal: lines like `ai 200 anthropic/claude-sonnet-5 4ms`, nothing more.

**Handy SQL** (Studio → SQL editor):

```sql
-- Start over with 3 free questions:
delete from public.ai_questions
where user_id = (select id from auth.users where email = 'you@example.com');

-- Make yourself Pro without paying (local testing only):
insert into public.subscriptions (user_id, plan_id, status, period_start, period_end, event_at)
select id, 'pro', 'active', now(), now() + interval '30 days', now()
from auth.users where email = 'you@example.com'
on conflict (user_id) do update
  set plan_id = 'pro', status = 'active', period_end = now() + interval '30 days', event_at = now();
```

On Pro, Claude Opus 5.5 and GPT-6 Astra become selectable in the model menu; each ask with them
uses 5 questions.

### A7. Try payments locally (Dodo test mode)

No real money moves in test mode.

1. **Account:** sign up at [dodopayments.com](https://dodopayments.com). New accounts start in
   test mode: the **Live Mode** switch in the sidebar is off.
2. **Products** → **Create product** → **Subscription**, four of them:
   - "HushGlance Starter (monthly)": $5, billed every month.
   - "HushGlance Starter (yearly)": $50, billed every year.
   - "HushGlance Pro (monthly)": $12, billed every month.
   - "HushGlance Pro (yearly)": $120, billed every year.

   Copy all four product ids (`pdt_…`).
3. **Developer → API Keys** → **Add API Key** (test, full access). Copy it; it's shown once.
4. **Webhooks to your computer** with Dodo's CLI:

   ```sh
   npm install -g dodopayments-cli
   dodo login "<your test API key>" test
   dodo wh listen http://127.0.0.1:54321/functions/v1/billing/webhook
   ```

   The CLI creates a webhook endpoint in **Developer → Webhooks**. Open it and copy its **signing
   secret** (`whsec_…`).
5. **Fill in `supabase/functions/.env`:**

   ```sh
   DODO_API_BASE=https://test.dodopayments.com
   DODO_API_KEY=<test API key>
   DODO_WEBHOOK_SECRET=whsec_…
   DODO_PRODUCT_STARTER_MONTHLY=pdt_…
   DODO_PRODUCT_STARTER_YEARLY=pdt_…
   DODO_PRODUCT_PRO_MONTHLY=pdt_…
   DODO_PRODUCT_PRO_YEARLY=pdt_…
   ```

   Then restart `functions serve`.
6. In the app, run out of free questions, or use the account menu → **Plan and billing** →
   **See plans**. The dialog offers Starter and Pro, monthly or yearly. Pick **Choose Starter**.
7. On Dodo's test checkout, pay with card **4242 4242 4242 4242**, expiry **06/32**, CVV **123**.
8. You land on Plan and billing: "Payment received. Setting up your plan…", then **"You're on
   Starter."**
   - The `dodo wh listen` terminal shows `subscription.active`.
   - The functions log shows `billing webhook subscription.active: applied`.
9. **Move up to Pro:** Plan and billing → **Upgrade to Pro** → **Switch to Pro**. There's no second
   checkout: Dodo changes the plan and charges the prorated difference. "You're on Pro." appears in
   a few seconds, and the log shows `subscription.plan_changed: applied`.
10. **Manage subscription** opens Dodo's portal. Cancelling keeps the plan until the period ends.

Card **4000 0000 0000 0341** tests a failed renewal (the account goes "on hold", back to free).
`dodo wh trigger` sends unsigned events, which the function rejects by design. Use real test
checkouts instead.

### A8. The automated checks

```sh
npm run check          # types, lint, unit tests (incl. the proxy and webhook), build, bundle budgets
npx supabase test db   # quotas, plans and access rules in Postgres
npm run e2e            # the browser journeys, incl. e2e/hosted.spec.ts (mocked services)
```

---

## Part B: deploy (still in test mode)

Do these in order. B2 and B3 can happen while B1 runs.

### B1. Supabase project

1. Create the project at [supabase.com](https://supabase.com), or use the one you have.
   - **Plan:** for a paid product, use Supabase Pro ($25/month). Free projects pause after 7 days
     idle, and Pro raises the Edge Function time limit.
2. **Link it and push the migrations** from the repo:

   ```sh
   npx supabase login                            # opens the browser once
   npx supabase link --project-ref <project-ref> # the "abcd" of abcd.supabase.co; asks for the DB password
   npx supabase db push                          # applies profiles, sharing and plans
   ```

   In Table Editor you should see the tables `ai_models`, `plans`, `subscriptions`,
   `ai_questions`, `ai_usage` and `billing_events`, each marked "RLS enabled".
3. **Authentication → URL Configuration:**
   - **Site URL:** `https://<your-domain>/app/`
   - **Redirect URLs:** `https://<your-domain>/app/auth/callback` and `https://<your-domain>/app/reset`
4. **Authentication → Providers → Email:** keep **Confirm email** on. Hosted AI refuses
   unconfirmed accounts, which stops people farming free questions.
5. **Authentication → Emails → SMTP:** add your own email provider (Resend, Postmark, SES…).
   Supabase's built-in sender is rate-limited and meant for testing.

### B2. OpenRouter

1. Sign up at [openrouter.ai](https://openrouter.ai).
2. **Credits:** buy some ($10 is plenty to start; OpenRouter adds 5.5%). Leave auto top-up off, or
   cap it.
3. **Settings → Privacy:**
   - turn on **Zero Data Retention** for all model groups;
   - leave **prompt logging** and the "use my data for a 1% discount" option **off**.

   The proxy also forces zero data retention on every request; this is the second lock.
4. **Settings → Keys → Create key:** name it "hushglance-production" and set a **credit limit**,
   for example $20. That's your hard ceiling on spend. Copy the key (`sk-or-v1-…`); it's shown once.

### B3. Dodo Payments (test mode)

1. **Products and API key:** the same as A7, in test mode. Reuse the products and key if you made
   them there.
2. **Developer → Webhooks → Add endpoint:**
   - **URL:** `https://<project-ref>.supabase.co/functions/v1/billing/webhook`
   - **Events:** all `subscription.*` events.

   Copy this endpoint's **signing secret**. It's different from the CLI's one in A7.
3. **Customer portal** (in Dodo's settings): make sure it's on and allows cancelling. That's where
   "Manage subscription" sends people.
4. **Settings → Business / Branding:** the name and logo people see on the checkout.

### B4. Set the function secrets

Write them to a git-ignored file, for example `supabase/.env.production` (any `.env.*` file is
ignored):

```sh
OPENROUTER_API_KEY=sk-or-v1-…
APP_ORIGINS=https://<your-domain>
AI_DAILY_BUDGET_USD=20
DODO_API_BASE=https://test.dodopayments.com
DODO_API_KEY=<Dodo test API key>
DODO_WEBHOOK_SECRET=whsec_<from B3>
DODO_PRODUCT_STARTER_MONTHLY=pdt_…
DODO_PRODUCT_STARTER_YEARLY=pdt_…
DODO_PRODUCT_PRO_MONTHLY=pdt_…
DODO_PRODUCT_PRO_YEARLY=pdt_…
```

```sh
npx supabase secrets set --env-file supabase/.env.production
npx supabase secrets list    # names and digests, never values
```

**`APP_ORIGINS` must match the address in the browser exactly:**
- `https://`, the host, no path, no trailing slash.
- Separate several with commas: for example your domain and `https://<project>.vercel.app`.
- Vercel preview URLs aren't included, so hosted AI answers with a CORS error there. Own keys and
  the demo still work.

Secrets apply at once; no redeploy is needed after changing one.

### B5. Deploy the functions

```sh
npx supabase functions deploy ai
npx supabase functions deploy billing
```

`supabase/config.toml` sets the JWT check:
- `ai` keeps it on (signed-in users only).
- `billing` turns it off: Dodo's webhook has no user session, so the function checks Dodo's
  signature, and the user for checkout and the portal.

Check in Dashboard → Edge Functions that `billing` shows "Verify JWT: off".

### B6. Vercel

1. **Project → Settings → Environment Variables** (Production, and Preview if you use it):
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_…`
   - `VITE_SITE_URL` = `https://<your-domain>` (absolute link previews)
2. **Redeploy.** The build adds exactly that Supabase host to the page's security policy.
3. **Plan:** Vercel's Hobby plan is for non-commercial use. Once you sell Pro, move to Vercel Pro.

### B7. Smoke test in production (test mode)

**Hosted AI:**
- [ ] Sign up on your domain, confirm the email, and open a project with a sample.
- [ ] The meter shows "3 free questions left"; ask one and get a real answer.
- [ ] Supabase → Edge Functions → `ai` → Logs shows `ai 200 anthropic/claude-sonnet-5 …ms` and
      nothing else.
- [ ] OpenRouter → Activity shows the request: model, tokens, and a provider marked
      zero-retention.
- [ ] Ask until the upgrade dialog appears.

**Payments:**
- [ ] **Choose Starter**, then pay with test card 4242 4242 4242 4242 (06/32, 123). Back on Plan
      and billing you're on Starter; the `billing` logs show `billing webhook subscription.active:
      applied`.
- [ ] **Upgrade to Pro → Switch to Pro**: no checkout; you're on Pro within seconds
      (`subscription.plan_changed: applied`), and Claude Opus 5.5 is selectable.
- [ ] Manage subscription → cancel → Plan and billing reads "Pro until …".

**Other paths:**
- [ ] Settings → **Your own key** still works, as do a guest at `/app/try` and the demo.

### B8. Keep an eye on spend

**Daily cost of hosted AI**, from the token counts the proxy records (SQL editor):

```sql
select date_trunc('day', at) as day, count(*) as calls, round(sum(cost_usd), 2) as usd
from public.ai_usage
group by 1 order by 1 desc limit 14;

-- Active subscriptions per plan
select plan_id, count(*) from public.subscriptions where status = 'active' group by 1;
```

**Three limits stop a runaway bill:**
1. `AI_DAILY_BUDGET_USD` pauses hosted AI for everyone once the last 24 hours cost that much.
   Set it to `0` to pause hosted AI at once (the kill switch).
   People see "paused for today" and can still use their own keys.
2. The OpenRouter key's credit limit is a hard stop.
3. OpenRouter's auto top-up is off or capped.

**Adding or removing a model** is a table row, not a release:
- Run the eval through OpenRouter (it costs credits):
  `OPENROUTER_API_KEY=… EVAL_PROVIDER=openrouter EVAL_MODEL=google/gemini-3.8-flash npm run evals`
- At ≥ 90%:
  `update public.ai_models set enabled = true, eval_accuracy = 0.94 where id = 'google/gemini-3.8-flash';`
- Prices and question limits: the `plans` table.

---

## Part C: real money

1. **Legal pages:** fill every `[bracketed]` placeholder in `public/terms.html`, `privacy.html`
   and `refunds.html` (contact email, governing law), and have them reviewed.
2. **Dodo:**
   - Complete the business verification Dodo asks for.
   - Turn **Live Mode** on, then, in live mode:
     - create the four products again (new `pdt_…` ids);
     - create a live API key;
     - add the webhook endpoint again (same URL, new `whsec_…`).
3. **Update the seven secrets** (no redeploy needed):

   ```sh
   npx supabase secrets set DODO_API_BASE=https://live.dodopayments.com DODO_API_KEY=<live key> \
     DODO_WEBHOOK_SECRET=whsec_<live> \
     DODO_PRODUCT_STARTER_MONTHLY=pdt_<live> DODO_PRODUCT_STARTER_YEARLY=pdt_<live> \
     DODO_PRODUCT_PRO_MONTHLY=pdt_<live> DODO_PRODUCT_PRO_YEARLY=pdt_<live>
   ```

4. **Test with real money:** buy Starter with a real card, check it arrives, then refund yourself from
   Dodo's dashboard.
5. Raise the OpenRouter key's credit limit and `AI_DAILY_BUDGET_USD` to what you're willing to
   spend.

---

## If a key leaks, or to rotate one

- **OpenRouter:** delete the key on openrouter.ai, create a new one, then
  `npx supabase secrets set OPENROUTER_API_KEY=…`.
- **Dodo:** revoke the API key or roll the webhook secret in the dashboard, then set the new value
  the same way.
- **Supabase secret key:** create a new one in Settings → API Keys and delete the old one. Functions
  pick up `SUPABASE_SECRET_KEYS` themselves.
- **The publishable key** is public by design. Row-level security protects the data, not the key.

---

## When something's wrong

| What you see | Why | Fix |
|---|---|---|
| Signed in, but the model chip says **Demo** and Settings has no "HushGlance AI" | The app couldn't load the model list (browser console: "hosted AI is unavailable") | Apply the plans migration (`db push` / `migration up`); check `ai_models` has enabled rows |
| Sign-in page: "Failed to fetch dynamically imported module" (local) | The dev server serves stale dependencies | Restart `npm run dev` |
| Browser console: CORS error on `/functions/v1/ai/…` | The page's address isn't in `APP_ORIGINS` (exact match) | Add it, then restart `functions serve` locally, or `secrets set` in production |
| "HushGlance AI is having trouble" | OpenRouter rejected HushGlance's key, credits ran out, or the key's limit was hit (`ai` logs: `ai 401`/`ai 402`) | Check the key and credits on openrouter.ai |
| "That model has no zero-retention provider available right now" | No zero-retention endpoint serves that model at the moment | Pick another model; set `enabled = false` on it if it persists |
| "Confirm your email address to use HushGlance AI" | The account's email isn't confirmed | Confirm it (Mailpit locally) |
| "HushGlance AI is paused for today" | `AI_DAILY_BUDGET_USD` was reached | Raise it, or wait |
| Locally, every hosted question fails and the stand-in shows nothing | The functions can't reach the stand-in | Run `node scripts/hosted-stub.mjs`; keep `host.docker.internal` in `OPENROUTER_UPSTREAM` |
| Upgrade → "Couldn't start the checkout" | Wrong Dodo key for the mode, or wrong product ids (`billing` logs: `billing checkout failed: 401/404`) | Test key with `test.` base, live key with `live.`; recheck the `pdt_` ids |
| Paid, but the plan never arrives | The webhook isn't arriving or isn't verified | Dodo → Webhooks → delivery logs; `billing` logs `bad signature` means the wrong `DODO_WEBHOOK_SECRET` for that endpoint |
| `billing` logs `…: stale` | An older event arrived after a newer one | Nothing to fix: the newer state is kept on purpose |

---

## What it costs to run

| Service | Cost |
|---|---|
| Supabase Pro | $25/month |
| Vercel Pro (for commercial use) | $20/month |
| OpenRouter | Model prices with no markup, plus 5.5% when buying credits. About $0.013–0.016 per standard question with its summary |
| Dodo Payments | About 4% + $0.40 per payment, plus 1.5% for international cards and 0.5% for subscriptions |
| Free users | At most 3 questions each, about $0.05 per sign-up |
| Starter user | At most 100 standard questions a month, about $1.50 at full use, on $5 |
| Pro user | At most 300 questions a month, about $4.50 at full use on standard models, on $12 |
