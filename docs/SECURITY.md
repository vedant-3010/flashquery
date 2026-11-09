# Security model

What HushGlance protects, from whom, and where the limits are. Decisions behind it are in
`docs/PRD.md` §12 (D66 CSP, D100–D104 accounts, D116 sharing, D119–D122 hosted AI and Strict,
D123 the encrypted workspace, D125 guests).

## The promises

1. **The AI never sees your rows unless you allow it.** Analysis runs in the browser (DuckDB-WASM,
   Pyodide). Only `src/ai/context.ts` builds what a model receives: in Strict (the default) table
   and column names, types, row counts and the user's notes; in Balanced (opt-in) a few statistics
   and sample values too. Strict error repairs carry no data values (`scrubError`). Every request is
   shown in the AI inspector exactly as sent.
2. **We can't read what you save.** Signed in, projects (files, history, dashboards, notes,
   suggestions, the file list) are encrypted in the browser before they're saved to the account,
   with a key only the user's passphrase or recovery key opens.
3. **Nothing uploads by surprise.** Sharing a dashboard (plaintext results, by design) happens only
   after a consent dialog lists what goes. Guests and the demo make no request to the account
   service at all, until a guest turns on HushGlance AI themselves (D125).

## The encrypted workspace (M17)

| Piece | Where | What |
|---|---|---|
| Data key | browser only | AES-GCM-256, random per account. Non-extractable once unlocked. |
| Passphrase key | derived in the browser | PBKDF2-SHA256, 600,000 iterations, 16-byte random salt. Wraps the data key. |
| Recovery key | the user | 32 random bytes, shown once as Crockford base32. Also wraps the data key. |
| `vaults` row | account service | the KDF parameters and the two wrapped copies of the data key. |
| `sync_records` | account service | one encrypted envelope per record, with a version. |
| `vault` bucket | account service | each file in 4 MiB encrypted chunks, `<user>/<file>/<index>`. |

- **Encryption:** AES-GCM with a fresh 12-byte IV per record and per chunk. The additional data
  names the owner, the record or file, and the version or chunk position
  (`hushglance/record/<user>/<scope>/<key>/<version>`, `hushglance/chunk/<user>/<file>/<i>/<n>`),
  so a ciphertext only decrypts in its own place: the service can't swap records, move chunks
  between files or reorder them.
- **Wrong passphrase:** the unwrap fails its authentication tag. No password hash or check value is
  stored.
- **Remember on this device:** the unlocked key is stored in IndexedDB as a non-extractable
  `CryptoKey`: scripts on the page can use it but never read its bytes. It's tied to the account
  and the vault, and forgotten on sign-out, "Lock on this device" and a vault set up again.
- **Changing the passphrase or the recovery key** unwraps the key (extractable, in memory only) and
  wraps it again; no record is re-encrypted.

### What the service can see

- That an account has a vault, and when it was set up.
- Record names (`projects`, `history`, `dashboards`, `notes`, `suggestions`, `persistedDatasets`),
  project ids (random), versions, sizes and times.
- File ids (a project id and a dataset id), sizes and chunk counts.

Never: file contents, file or project names, column names, questions, answers, SQL, notes, the
passphrase or the recovery key.

### Server-side rules (`supabase/migrations/…_vault.sql`, tested in `supabase/tests/vault.test.sql`)

- Row-level security: each person reaches only their own vault, records, reservations and storage
  folder.
- `sync_put` saves only over the version the device read (another device's save is never
  overwritten unseen); `updated_at` is the service's clock; a record's owner can't change.
- File space is reserved only through `vault_reserve`, which checks the plan's limit; the storage
  insert policy accepts a chunk only for a reserved file and an index below its chunk count.
- Without a vault nothing can be saved, so a device still running after the cloud copy was deleted
  elsewhere can't write under the old key.
- Deleting the account deletes the stored files first (`deleteEverything`), then the rows cascade.

### Tests

- `src/lib/vault.test.ts`: wrapping and unwrapping, wrong passphrase and recovery key, non-
  extractable keys, additional data mismatches refused, chunked files round-trip.
- `src/stores/syncEngine.test.ts`: two devices against a fake service, conflicts, deletions,
  local-only projects, a foreign key refused, and a canary over what was sent.
- `e2e/sync.spec.ts` (J12): two browser contexts, the real WebCrypto and supabase-js, and a canary
  over every request body either device sent.

## Limits we accept

- **Rollback.** A malicious service could serve an older copy of a record, or withhold one. The
  additional data stops swapping, not rollback.
- **Lost passphrase and recovery key.** The cloud copy can't be opened by anyone, us included.
  Devices that still have the data can delete the cloud copy and set up again.
- **Concurrent edits.** The later save of a record wins (by the devices' clocks); the other device
  is told the project changed and offered a reload.
- **A compromised page** (a malicious script running in the app's origin) could use an unlocked
  key, as it could read the data the page already shows. The production CSP (no inline scripts,
  named hosts only) is the defence; "Remember on this device" is off-able for shared computers.
- **Metadata.** Sizes, counts and timing are visible to the service.
- **Offline guessing.** Whoever holds the database (us, or someone who breaks in) can try
  passphrases against the wrapped key, at 600,000 PBKDF2 rounds each. A passphrase needs 12
  characters and is refused when it's a pattern or made of the words tried first
  (`src/features/sync/passphrase.ts`); the recovery key (256 bits) can't be guessed.
- **Shared computers.** Projects live in the browser, not per account. While another account is
  signed in, the projects of the account this browser saves to stay hidden (`useOtherAccount`);
  "Sign out and clear this browser" (Account) removes them, and any saved AI key, for good.
- **Shared dashboards** are plaintext by design: the people they're shared with must read them.

## Spending and storage limits (D124)

Limits that keep one account from running up costs for everyone, checked on the server:

- **Hosted AI:** a question's later calls stay at the price it was charged (a fast model for its
  summary, or one of the same weight or less); each question has a spend limit
  (`ai_models.max_question_usd`); each person a daily one (`plans.daily_usd`); and all of hosted AI
  a global one (`AI_DAILY_BUDGET_USD`), under the OpenRouter key's own credit limit.
- **Storage:** a file reserves exactly the chunks its size needs; a reservation is released only
  once its chunks are gone (`vault_release`); records and files count against the plan.
- **Sharing:** at most 100 shared dashboards per owner, 5 MB each.
- **Payments:** a full refund or a lost dispute ends the paid plan at once; a subscription whose
  period ended more than 3 days ago with no webhook stops counting; an account with a plan still
  charging can't be deleted (cancel first); a subscription waiting on a payment goes to the portal,
  not a second checkout.

## Guests and HushGlance AI (D125)

Guests use Home and projects in their browser without an account. HushGlance AI is off for them
until they turn it on; then they get 3 questions a day per IP address
(`supabase/migrations/…_guests.sql`, tested in `supabase/tests/guests.test.sql`):

- **Which address:** Cloudflare's `cf-connecting-ip`, which Supabase's edge sets (a client can't),
  else the last `x-forwarded-for` entry. Never the first: a client can prepend anything to it. If
  the fallback ever named a proxy, guests would share one allowance (too strict, never too loose).
  An IPv6 address counts by its /64, so rotating through one connection's block buys nothing.
- **Never stored:** the `ai` function turns the address into HMAC-SHA256 with `GUEST_KEY_SECRET`
  (a function secret, at least 32 characters), and only that reaches the database, logs and
  OpenRouter (which gets a pseudonym of it). A copy of the database doesn't give the addresses
  back without the secret. Hashes older than 2 days are cleared every hour (Supabase Cron) and
  before each guest call; the calls' costs stay, linked to no one. Supabase itself sees the
  address, as for any request.
- **Limits:** the same per-question limits as an account, standard models only, $0.25 a day per
  address and $5 a day for all guests together (`guest_limits`), and guests' spend counts towards
  the global breaker. So rotating addresses can cost at most the all-guests budget a day.
- **No session, no supabase-js:** a guest's calls carry only the publishable key and the question
  id (`src/platform/guestAi.ts`). An expired or forged session is refused, never treated as a guest.
- **Shared computers:** in a browser whose workspace is linked to an account, its projects stay
  hidden from a guest, as from another account (D124).

## About the prompts

The prompts are part of the app, which runs in the browser, so they ship with its JavaScript, and
the AI inspector shows every request exactly as sent: that's a promise, not a leak. They hold no
secret. What they could be misused for is the hosted proxy as a free model, which the limits above
prevent.

## Other controls (unchanged)

- SQL from a model runs only after `src/engine/sqlGuard.ts` (one read-only statement, known tables,
  allow-listed table functions); Python runs only on the user's approval, with the network locked.
- Hosted AI: the `ai` Edge Function forces zero data retention on every OpenRouter request and never
  stores or logs a body (or a guest's address); plans and quotas change only on the server; payments only through Dodo's
  hosted pages and the signed webhook.
- Users' own API keys stay in memory unless "Remember on this device" is ticked; they're never
  logged or exported.
