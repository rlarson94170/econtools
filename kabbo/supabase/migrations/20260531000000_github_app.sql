-- Kabbo GitHub App + writing-momentum support.
--
-- 1. github_installations: maps a GitHub App installation to a Kabbo user.
--    The App webhook resolves the owning user from installation.id (no API key
--    in the URL). One user may have several installations (personal + orgs).
-- 2. publications.github_repo_id: GitHub's numeric repo id, a stable match key
--    that survives repo renames (github_repo URL matching is the fallback).
-- 3. publications.word_count_history: append-only [{at, words}] series filled
--    on each push to a connected repo, powering the Draft-stage momentum view.

BEGIN;

CREATE TABLE IF NOT EXISTS public.github_installations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: a GitHub "installation" webhook can arrive before our OAuth
  -- callback binds the Kabbo user. Such rows are transient and unbound; the
  -- callback fills user_id, and push events skip installations that are still
  -- unbound (we can't attribute them yet).
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  installation_id bigint NOT NULL UNIQUE,
  account_login   text,
  account_type    text,                       -- 'User' | 'Organization'
  repositories    jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{id, full_name}] or {"all": true}
  suspended_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS github_installations_user_id_idx
  ON public.github_installations (user_id);

ALTER TABLE public.github_installations ENABLE ROW LEVEL SECURITY;

-- Users may read/manage only their own installations. The edge function uses
-- the service role and bypasses RLS.
CREATE POLICY "Users manage their own GitHub installations"
  ON public.github_installations FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS github_repo_id      bigint,
  ADD COLUMN IF NOT EXISTS word_count_history  jsonb;

CREATE INDEX IF NOT EXISTS publications_github_repo_id_idx
  ON public.publications (github_repo_id)
  WHERE github_repo_id IS NOT NULL;

COMMIT;
