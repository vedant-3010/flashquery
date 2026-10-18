Here's everything needed to run accounts and sharing on a real Supabase project. Supabase never sees users' files or AI keys; it only stores accounts and shared dashboards.

## Before you start
- **Merge into `main`:** M14 (sharing) and M15 are still on their branches (`m14-sharing`, `m15-ux-refresh`), and the sharing migration only exists on those branches. Merge both before you deploy.
- **Know your production address:** your custom domain, or the Vercel URL if you don't have one, e.g. `https://hushglance.vercel.app`. Below, `<domain>` means that address.

## Steps

**1. Create the project** at supabase.com → New project.
- The free plan is enough. Pick the region closest to your users.
- Set a strong **database password** and save it in a password manager. Only the CLI needs it.
- Note the **project ref**, the id in `https://<ref>.supabase.co`.

**2. Create the tables** by applying the two migrations in `supabase/migrations/`. In the repo:
```sh
npx supabase login                         # opens the browser once
npx supabase link --project-ref <ref>      # asks for the database password
npx supabase db push                       # applies profiles + sharing
npx supabase test db --linked              # optional: runs the 43 policy tests there (rolls back)
```
Alternatively, paste the two files into the dashboard's SQL editor, oldest first.

**3. Set up sign-in redirects** under Authentication → URL Configuration.
- **Site URL:** `https://<domain>/app/`
- **Redirect URLs:**
  - `https://<domain>/app/auth/callback`
  - `https://<domain>/app/reset`
  - `http://localhost:5173/app/**` (for local development)
  - If you want Vercel preview deployments to sign in too: `https://*-<your-vercel-team>.vercel.app/app/**`

**4. Set up email** under Authentication.
- Turn **Confirm email** on.
- Add **custom SMTP**, for example Resend's free tier with a domain you own.
- Without custom SMTP, Supabase's built-in mailer only sends to your project's team members and is heavily rate-limited, so real users wouldn't receive sign-up, sign-in-link or reset emails.

**5. Google sign-in.**
- In Google Cloud Console → APIs & Services, set up the OAuth consent screen (External). Then go to Credentials → Create OAuth client ID → Web application:
  - Authorized JavaScript origin: `https://<domain>`
  - Authorized redirect URI: `https://<ref>.supabase.co/auth/v1/callback`
- Copy the Client ID and secret into Supabase → Authentication → Providers → Google.

**6. GitHub sign-in.**
- Go to GitHub → Settings → Developer settings → OAuth Apps → New:
  - Homepage URL: `https://<domain>`
  - Callback URL: `https://<ref>.supabase.co/auth/v1/callback`
- Generate a client secret, then paste the ID and secret into Supabase → Providers → GitHub.

**7. Connect the app.**
- In Vercel → Project → Settings → Environment Variables, add these for Production and Preview:
  - `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`
  - `VITE_SUPABASE_PUBLISHABLE_KEY` = the `sb_publishable_…` key, from Supabase → Project Settings → API Keys
- Then **redeploy**. The build reads these values and adds exactly that host to the page's security policy.

**8. Check it.** Use the checklist in `docs/DEPLOY.md`:
- Sign up by email, with Google and with GitHub.
- Share a dashboard and open its link in a private window.
- Revoke the link and reload: it should say the dashboard is no longer shared.

## Which keys go where

| Key | Where to get it | Where it goes | Secret? |
|---|---|---|---|
| Project URL | Supabase → Settings → API | Vercel env (and `.env.local` to use the hosted project locally) | No, public |
| Publishable key `sb_publishable_…` | Supabase → Settings → API Keys | Same two places | No: it's built into the browser code; the database's per-row access rules protect the data |
| Secret / service-role key | Supabase | **Nowhere.** The app never needs it. | Yes, never in the repo or Vercel |
| Database password | You set it in step 1 | Only typed into `supabase link` | Yes, password manager |
| Supabase CLI login | `supabase login` | Stays in your CLI | Yes |
| Google client ID and secret | Google Cloud Console | Supabase dashboard only | The secret, yes |
| GitHub client ID and secret | GitHub OAuth app | Supabase dashboard only | The secret, yes |
| SMTP key (e.g. Resend) | Your email provider | Supabase dashboard only | Yes |
| AI keys (Anthropic, OpenAI) | — | **Nowhere.** Users bring their own in the app. | — |

Free Supabase projects pause after 7 days without traffic, and the next visit wakes them.

I can do steps 1–2 for you through the Supabase connector: create the project, apply the migrations, and fetch the project URL and publishable key. I can also set the two Vercel variables through the Vercel connector. Both change your live accounts, so I'll only do them if you say so. Steps 4–6 need your Google, GitHub and email accounts, so those are yours either way.