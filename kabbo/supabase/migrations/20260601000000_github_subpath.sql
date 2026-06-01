-- Monorepo support: a publication can map to a FOLDER within a connected repo,
-- not just a whole repo. e.g. github_repo = .../research, github_subpath = "2026_sac".
-- NULL github_subpath = the card maps to the whole repo (single-paper repo).

BEGIN;

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS github_subpath text;

COMMIT;
