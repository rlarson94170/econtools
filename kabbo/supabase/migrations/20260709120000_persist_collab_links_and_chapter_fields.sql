-- Persist fields the UI/import already produce but the schema couldn't hold.
--
-- 1. collaboration_links: the drawer writes every project link (GitHub /
--    Overleaf / Prism / custom) into a single array, but only the legacy scalar
--    github_repo / overleaf_link columns existed, so any added link was silently
--    dropped on save and gone after reload. Store the array directly. dbToLocal
--    falls back to deriving from the legacy scalars when this is empty, so old
--    rows keep working.
-- 2. type_b / type_c: chapter book-title and editors. BibTeX import sets type_b
--    (booktitle) and the exporter emits booktitle/editor from these, but with no
--    columns to hold them they always round-tripped back to empty.

BEGIN;

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS collaboration_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS type_b TEXT,
  ADD COLUMN IF NOT EXISTS type_c TEXT;

COMMIT;
