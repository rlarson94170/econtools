---
description: Install a local git hook that syncs commits to Kabbo (for repos not on the GitHub App)
---

Install a `post-commit` git hook in the current repo so commits sync to Kabbo
even when the GitHub App isn't available (private mirrors, local-only repos, or
an Overleaf git bridge).

> If this repo is on GitHub and you've installed the Kabbo GitHub App, you do
> NOT need this — the App already syncs pushes. Use hooks only for repos the App
> can't reach. Say so, then proceed only if the user confirms.

Steps:

1. Confirm we're in a git repo (`git rev-parse --git-dir`).
2. Ask the user for their Kabbo API key (or read `KABBO_API_KEY` from the env)
   and store it in `.git/kabbo-key` (chmod 600) — never commit it.
3. Copy the template hook into place and make it executable:

   ```bash
   cp "${CLAUDE_PLUGIN_ROOT}/templates/post-commit" "$(git rev-parse --git-dir)/hooks/post-commit"
   chmod +x "$(git rev-parse --git-dir)/hooks/post-commit"
   ```

4. Explain that the hook reads `.kabbo.yaml` (or the repo name) and POSTs to the
   Kabbo ingest endpoint on each commit, moving the card when the commit message
   contains a `[stage:xxx]` tag. Suggest running `/kabbo:init` first if there's
   no `.kabbo.yaml` yet.
