# Deploying HushGlance

Launching for real (domain, email, sign-in providers, payments, checks): [`RELEASE.md`](RELEASE.md).

HushGlance is a static site: `npm run build` writes everything to `dist/`, and there's no server code and
no secrets. `vercel.json` sets the build and the response headers. Never add an API key as an
environment variable: users bring their own key in the app. Accounts (sign-in, and from M14 saved and
shared dashboards) are optional: they need a Supabase project, set up below. Without one, the app
works as before and shows no sign-in.

## Vercel

1. In Vercel, **Add New → Project → Import** the GitHub repository.
2. Keep the settings `vercel.json` provides: framework Vite, install `npm ci`, build `npm run build`,
   output `dist`. Node comes from `engines` in `package.json` (24.x). The only environment variables
   are the account service's public URL and key (see Accounts); never an LLM key.
3. **Deploy.** Every push to `main` deploys to production; every pull request gets a preview URL.
4. Put the production URL in the README (replace the "Live demo" comment at the top) and in the
   repository's About → Website.

## Check the deployment

Replace `$APP` with the production URL and `$WASM` with the name of `duckdb-eh-*.wasm` in `dist/assets`.

```sh
curl -sI "$APP/assets/$WASM" | grep -iE 'content-type|cache-control|content-encoding'
#   content-type: application/wasm
#   cache-control: public, max-age=31536000, immutable
#   content-encoding: br   (or gzip)
curl -sI "$APP/" | grep -iE 'content-security-policy|x-content-type-options|x-frame-options'
#   content-security-policy: frame-ancestors 'none'
#   x-content-type-options: nosniff
#   x-frame-options: DENY
```

Then in the browser:

- [ ] `/` shows the landing page; its hero film plays, and "Try it on 1M rows" opens `/app/` with an
      answer to "Which region grew fastest?".
- [ ] `/app` redirects to `/app/`, the app's Home.
- [ ] **Try sample data** opens a project and loads the 1M-row sample; the engine badge says
      "Engine ready".
- [ ] Reloading a project's page (`/app/p/<id>/dashboard`) keeps it open: Vercel rewrites every
      path under `/app/` to the app (`vercel.json`).
- [ ] A suggested question answers with a chart; the SQL tab opens the editor.
- [ ] DevTools → Console shows no Content-Security-Policy errors.
- [ ] DevTools → Network shows only the app's own origin (plus `extensions.duckdb.org` after loading a
      Parquet or JSON file, and `cdn.jsdelivr.net` after running Python).
- [ ] With accounts on: **Sign in** → Google, GitHub and email each come back signed in; a guest
      session (DevTools → Network) makes no request to the Supabase host.
- [ ] Sharing: share a dashboard, copy a view-only link and open it in a private window (no sign-in);
      revoke it and reload: "This dashboard is no longer shared".
- [ ] `/app/bench` runs; copy the results with "Copy as Markdown" if you want numbers from real
      hardware.
- [ ] Set `og:image` in `index.html` to the full URL (`https://<your-domain>/og.png`): some link
      previews need an absolute URL.

## Accounts (Supabase, optional)

1. Create a project at [supabase.com](https://supabase.com) (the free tier is enough; free projects
   pause after 7 days without requests, and wake on the next one).
2. Apply the migrations in `supabase/migrations/`: with the Supabase CLI, `supabase link` then
   `supabase db push`; or paste each file into the dashboard's SQL editor, oldest first. They create
   `profiles` (a display name per user) and `delete_my_account()`, then the sharing tables
   (`dashboards`, `dashboard_members`, `dashboard_invites`, `share_links`) and their functions, then
   the plans tables (M16, below), all with row-level security.
3. **Authentication → URL Configuration:** Site URL `https://<your-domain>/app/`; Redirect URLs
   `https://<your-domain>/app/auth/callback` and `https://<your-domain>/app/reset` (add
   `http://localhost:5173/app/**` for local development).
4. **Authentication → Providers:** Email is on by default ("Confirm email" on is recommended; the app
   says so after sign-up). For Google and GitHub, create an OAuth app with each and use the callback
   URL Supabase shows (`https://<project>.supabase.co/auth/v1/callback`).
5. In Vercel (Settings → Environment Variables), add the project's **public** values, from Project
   Settings → API: `VITE_SUPABASE_URL` (`https://<project>.supabase.co`) and
   `VITE_SUPABASE_PUBLISHABLE_KEY` (the publishable key, `sb_publishable_…`). Never the secret or
   service-role key. Redeploy: the build adds exactly that host, https and wss, to the CSP.
6. For local development, put the same two lines in `.env.local` (see `.env.example`), or run
   Supabase on your computer instead (below).

### Accounts on your computer

With Docker running, `npx supabase start` starts a local Supabase from `supabase/config.toml` (auth,
database, REST, a mail catcher and Studio) and applies `supabase/migrations/`. It prints the API URL
(`http://127.0.0.1:54321`) and a publishable key: put them in `.env.local` as `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`, and the dev server picks them up. Sign-in links and reset emails
arrive in Mailpit at http://127.0.0.1:54324; Studio at http://127.0.0.1:54323 shows the users and
profiles. Google and GitHub need OAuth apps in `config.toml`, so test those on the hosted project.
`npx supabase stop` stops it (the data is kept for the next start).

A migration added after you started it: `npx supabase migration up` applies it. The row-level
security tests (`supabase/tests/`, pgTAP) run against the local database with `npx supabase test db`
(everything they create is rolled back). Run them after changing a policy; CI doesn't, since it has
no database.

## HushGlance AI and Pro (M16, optional)

Step by step, with every key, a free local test and the move to live payments:
[`HOSTED_AI_SETUP.md`](HOSTED_AI_SETUP.md). The summary:

Hosted models for signed-in users without a key (D119), and Pro through Dodo Payments (D120). Needs
the accounts setup above, the `20261012000000_plans.sql` migration, and two Edge Functions. Without
them the app works as before: own keys and the demo.

**Supabase plan.** Free projects pause after 7 days without requests; a paid product needs Supabase
Pro (also raises the Edge Function wall clock from 150 s to 400 s).

**OpenRouter**
1. Create an account at [openrouter.ai](https://openrouter.ai), buy credits (5.5% fee), and turn off
   auto top-up, or cap it.
2. **Settings → Privacy:** turn on zero data retention for every model group and turn off prompt
   logging. The proxy forces both per request too; this is a second lock.
3. Create a dedicated API key for HushGlance with a **credit limit**: the hard ceiling on spend.

**Dodo Payments** (test mode first)
1. Create an account at [dodopayments.com](https://dodopayments.com); stay in test mode.
2. **Products:** four subscription products: Starter monthly ($5) and yearly ($50), Pro monthly
   ($12) and yearly ($120). Copy their product ids (`pdt_…`).
3. **Developer → API keys:** a key for the function. **Developer → Webhooks:** endpoint
   `https://<project>.supabase.co/functions/v1/billing/webhook`, all `subscription.*` events; copy
   the signing secret (`whsec_…`).
4. **Customer portal:** on, with cancelling allowed.
5. Before going live: fill in every `[bracketed]` placeholder in `public/terms.html`,
   `privacy.html` and `refunds.html`, have them reviewed, complete Dodo's business verification,
   then switch `DODO_API_BASE` and the keys to live.

**Secrets and deploy** (Supabase CLI, linked to the project):

```sh
npx supabase secrets set \
  OPENROUTER_API_KEY=sk-or-… \
  APP_ORIGINS=https://<your-domain> \
  AI_DAILY_BUDGET_USD=20 \
  DODO_API_BASE=https://test.dodopayments.com \
  DODO_API_KEY=… \
  DODO_WEBHOOK_SECRET=whsec_… \
  DODO_PRODUCT_STARTER_MONTHLY=pdt_… \
  DODO_PRODUCT_STARTER_YEARLY=pdt_… \
  DODO_PRODUCT_PRO_MONTHLY=pdt_… \
  DODO_PRODUCT_PRO_YEARLY=pdt_…
npx supabase db push            # the plans migration
npx supabase functions deploy ai billing
```

`ai` keeps the platform's JWT check (`verify_jwt = true` in `config.toml`); `billing` turns it off
for Dodo's webhook and checks the user itself for checkout and the portal. `AI_DAILY_BUDGET_USD`
pauses hosted AI for everyone once the last 24 hours cost that much.

**Check it:**
- Sign in on the deployment without a key: the ask bar shows "3 free questions left".
- Ask once; Supabase → Edge Functions → `ai` → Logs shows `ai 200 anthropic/claude-sonnet-5 …ms`
  and nothing else (never a prompt).
- Upgrade with a Dodo test card; back on Plan and billing, Pro arrives within seconds (the
  `billing` logs show `billing webhook subscription.active: applied`).

**Locally:** `npx supabase start`, then copy `supabase/functions/.env.example` to
`supabase/functions/.env` and run `npx supabase functions serve --env-file supabase/functions/.env`.
Point `OPENROUTER_UPSTREAM` at a stub to ask without spending credits.

**Adding a hosted model** (D121): run the eval through OpenRouter
(`OPENROUTER_API_KEY=… EVAL_PROVIDER=openrouter EVAL_MODEL=maker/model npm run evals`; it costs
credits), and if it scores ≥ 90%, `update public.ai_models set enabled = true, eval_accuracy = …
where id = '…'` (or insert a new row). Prices, weights and plan limits are rows too.

## Other hosts

Any static host works if it serves `.wasm` as `application/wasm` and allows files of about 40 MB: the
two DuckDB wasm builds are 34 and 39 MiB. Cloudflare Pages caps files at 25 MiB, so it would need
DuckDB loaded from a CDN instead. Copy the headers from `vercel.json`: the page's own
Content-Security-Policy is a `<meta>` tag in `index.html`, which can't set `frame-ancestors`, so that
one has to be a response header.
