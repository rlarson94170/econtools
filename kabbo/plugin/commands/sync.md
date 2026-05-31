---
description: Sync the current git repo's paper into the Kabbo pipeline
---

Sync the paper in the current working directory into Kabbo.

Steps:

1. Determine the repo identity and recent work:
   - `git remote get-url origin` (the GitHub URL, if any),
   - `git log -5 --pretty=%s` (recent commit subjects — look for a
     `[stage:xxx]` tag),
   - read `.kabbo.yaml` at the repo root if it exists,
   - otherwise infer a title from the repo/folder name (kebab/snake → Title Case)
     and look for `\title{...}` in the main `.tex` file.

2. Decide the metadata: title, authors, stage, themes, target_journal,
   github_repo (the remote URL), and overleaf_url if present in `.kabbo.yaml`.
   A `[stage:xxx]` commit tag wins over `.kabbo.yaml` stage.

3. Search Kabbo first with `search_publications` (by title) to avoid duplicates.
   - If it exists, `update_publication` / `move_stage` and `link_repo` to attach
     the GitHub/Overleaf links.
   - If not, `create_publication` with the metadata above.

4. Report what you created or changed in one or two lines.

If the user passed $ARGUMENTS, treat it as an explicit stage or note to apply.
