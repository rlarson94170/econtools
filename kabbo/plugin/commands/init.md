---
description: Scaffold a .kabbo.yaml for the current repo by inspecting it
---

Create a `.kabbo.yaml` file at the root of the current repo so Kabbo can track
this paper automatically.

1. Inspect the repo to infer metadata:
   - title: from `\title{...}` in the main `.tex` (often `main.tex`,
     `paper.tex`, or the largest `.tex`), else the repo/folder name in Title Case;
   - authors: from `\author{...}` (split on `\and`, strip LaTeX);
   - output_type: `journal` unless it clearly looks like a book/chapter;
   - target_year: the current year as a placeholder;
   - github_repo: `git remote get-url origin` if set.

2. Write `.kabbo.yaml` in this exact shape (only include fields you found):

   ```yaml
   # Kabbo pipeline metadata — https://kabbo.app
   title: "<title>"
   stage: draft            # idea | draft | submitted | revise_resubmit | resubmitted | accepted | published
   authors:
     - <author>
   themes:
     - <theme>
   output_type: journal
   target_year: <year>
   target_journal: ""      # optional
   overleaf_url: ""        # optional — paste your Overleaf project URL
   ```

3. Tell the user to commit it, and that once the Kabbo GitHub App is installed on
   this repo (kabbo.app → Settings → Developer → Connect GitHub), every push will
   keep the card up to date — and a `[stage:submitted]` tag in a commit message
   moves the card.

Do NOT overwrite an existing `.kabbo.yaml` without showing the user the diff first.
