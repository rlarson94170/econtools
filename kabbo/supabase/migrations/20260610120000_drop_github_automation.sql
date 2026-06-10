-- Drop the GitHub-automation schema.
--
-- Kabbo no longer runs the GitHub App, webhooks, or repo/word-count sync. The
-- only machine path is the MCP server (API-key auth), driven by Claude Code /
-- Codex / Gemini agents. We keep publications.github_repo and .overleaf_link as
-- plain metadata fields (an agent or user can still record where the data /
-- source lives via link_repo); everything the automation needed is removed.
--
-- Removed here:
--   * github_installations            (App installation -> user mapping)
--   * publications.github_repo_id      (numeric repo id, used for push matching)
--   * publications.word_count_history  (per-push LaTeX word-count series)
--   * publications.github_subpath      (monorepo folder mapping)
--
-- Historical activity_log rows with source 'webhook' / 'github_app' are left in
-- place as audit history; no new ones are produced.

BEGIN;

DROP TABLE IF EXISTS public.github_installations CASCADE;

DROP INDEX IF EXISTS public.publications_github_repo_id_idx;

ALTER TABLE public.publications
  DROP COLUMN IF EXISTS github_repo_id,
  DROP COLUMN IF EXISTS word_count_history,
  DROP COLUMN IF EXISTS github_subpath;

COMMIT;
