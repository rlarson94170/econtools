# Kabbo GitHub App — one-time setup

The code for the GitHub App ships in `supabase/functions/github-app/`. To turn
it on you (Johan) need to register the App on github.com once and set five
Supabase secrets. ~15 minutes.

## 1. Register the App

GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**
(register under the `johanfourieza` account; you can transfer to an org later).

- **GitHub App name:** `Kabbo`
- **Homepage URL:** `https://kabbo.app`
- **Webhook → Active:** ✓
- **Webhook URL:**
  `https://jydnsbaztvmjkebhmoia.supabase.co/functions/v1/github-app`
- **Webhook secret:** generate a long random string — save it (→ `GITHUB_APP_WEBHOOK_SECRET`)
- **Setup URL (after install):**
  `https://jydnsbaztvmjkebhmoia.supabase.co/functions/v1/github-app/callback`
  and tick **"Redirect on update"**.
- **Repository permissions:**
  - Contents → **Read-only**
  - Metadata → **Read-only** (auto-selected)
  - Pull requests → **Read-only**
- **Subscribe to events:** Push, Release, Pull request, Installation,
  Installation repositories.
- **Where can this app be installed:** "Any account" (or "Only this account"
  while testing).

Create the App. Then on its page:

- Note the **App ID** (→ `GITHUB_APP_ID`).
- Note the **public slug** in the App's URL `github.com/apps/<slug>` — if it
  isn't `kabbo`, set `GITHUB_APP_SLUG` to the actual slug.
- **Generate a private key** → downloads a `.pem` (PKCS#1). Convert to PKCS#8
  (Web Crypto needs PKCS#8):

  ```bash
  openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
    -in kabbo.<date>.private-key.pem -out kabbo.pkcs8.pem
  ```

## 2. Set Supabase secrets

```bash
supabase secrets set \
  GITHUB_APP_ID=123456 \
  GITHUB_APP_SLUG=kabbo \
  GITHUB_APP_WEBHOOK_SECRET='the-random-string-from-step-1' \
  SITE_URL='https://kabbo.app'
# Multiline PEM — pass the file contents:
supabase secrets set GITHUB_APP_PRIVATE_KEY="$(cat kabbo.pkcs8.pem)"
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` already exist for edge functions.)

## 3. Run the migration & deploy

```bash
# from kabbo/
supabase db push                      # applies 20260531000000_github_app.sql
supabase functions deploy github-app mcp-server github-webhook --no-verify-jwt
```

> `mcp-server` must be redeployed: its source was migrated to mcp-lite 0.10.0's
> `tool(name, def)` API in this change. `github-webhook` now imports the shared
> helpers, so redeploy it too.

## 4. Test

1. kabbo.app → **Settings → Developer → Connect GitHub**, install on a throwaway
   repo that contains a `.kabbo.yaml`. You should be redirected back with
   "GitHub connected", and a card should appear (auto-import).
2. `git commit -m "wip [stage:submitted]" && git push` → the card moves to
   Submitted and its word count updates (see the drawer).
3. Cut a GitHub Release named `accepted` → the card moves to Accepted.
4. Check **Settings → Developer → Activity** for `github_app` entries.

## Notes

- The webhook is signed with `GITHUB_APP_WEBHOOK_SECRET`; no API key travels in
  any URL.
- An `installation` webhook can arrive before the browser callback; that's fine —
  the row is created unbound (null `user_id`) and the callback binds it, then
  re-runs the (idempotent) repo import.
- The legacy per-repo `github-webhook` still works for anyone who set it up
  manually.
