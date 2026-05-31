---
name: kabbo
description: Manage your academic publication pipeline via the Kabbo MCP server. List, search, create, update, move, and analyse publications; track stalled papers and reminders; export/import BibTeX; sync papers from GitHub and Overleaf; review team progress.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
user-invocable: true
---

# Kabbo — Publication Pipeline Skill

Kabbo (https://kabbo.app) tracks academic papers through seven stages:
**Idea → Draft → Submitted → Revise & Resubmit → Resubmitted → Accepted →
Published.** This skill drives the Kabbo MCP server.

## Connection

If you installed the **Kabbo plugin** (`/plugin install kabbo@econtools`), the
MCP server is already configured — you were prompted for your API key at install.

Otherwise add this to `~/.claude/settings.json` (replace YOUR_API_KEY):

```json
{
  "mcpServers": {
    "kabbo": {
      "type": "http",
      "url": "https://jydnsbaztvmjkebhmoia.supabase.co/functions/v1/mcp-server?api_key=YOUR_API_KEY"
    }
  }
}
```

Generate a key at kabbo.app → **Settings → Developer → Create Key**.

## Slash commands (plugin)

- `/kabbo:status` — quick pipeline overview.
- `/kabbo:sync` — read the current git repo and create/update its Kabbo card.
- `/kabbo:init` — scaffold a `.kabbo.yaml` for the current repo.
- `/kabbo:install-hooks` — install a local git hook (for repos not on the GitHub App).

## Tools

### Core CRUD
- **list_publications** — list with optional `query`, `stage`, `limit`, `offset`
- **get_publication** — one by `id`
- **create_publication** — create (title required; stage defaults to "idea"; upserts by title)
- **update_publication** — update any field by `id`
- **move_stage** — move to a new `stage` by `id`
- **delete_publication** — soft-delete (bin) by `id`

### Analytics & insights
- **get_pipeline_summary** — counts by stage, stalled (30+ days), recently updated
- **get_stalled_papers** — papers inactive for N days (default 30)
- **get_analytics** — velocity, avg time per stage, breakdowns by author/theme/grant/year/output_type
- **get_activity_log** — recent activity from all sources (web, api, mcp, webhook, github_app)

### Search & batch
- **search_publications** — multi-field search (title, authors, notes, themes, grants, year)
- **bulk_update** — array of `{id, ...updates}`

### Integration & workflow
- **list_connected_repos** — GitHub App installations + repos linked to your account
- **link_repo** — attach a `github_repo` and/or `overleaf_url` to a publication
- **get_writing_progress** — LaTeX word-count history for a paper (writing momentum)
- **set_target_journal** — set the intended journal
- **import_bibtex** — create publications from a BibTeX string
- **manage_related_papers** — list/add/remove related papers
- **manage_data_sources** — list/add/remove data sources

### Reminders, team, export, notes
- **manage_reminders** — `action`: list | create | complete | delete
- **get_team_summary** — per-member pipeline (needs `team_id`)
- **export_bibtex** — BibTeX for selected/all publications (filter by stage/year/ids)
- **add_note** — append a timestamped note without overwriting

## Resources (read as context)

- `kabbo://pipeline/summary` · `kabbo://publications` ·
  `kabbo://publication/{id}` · `kabbo://activity/recent`

## Prompts (slash commands in Claude Code)

`morning_checkin` · `weekly_review` · `annual_report` (arg: year) ·
`submission_prep` (arg: title) · `stalled_triage`

## GitHub integration (recommended: the Kabbo App)

Install the **Kabbo GitHub App** once (kabbo.app → Settings → Developer →
Connect GitHub), pick your repos, and the pipeline updates itself:

- **push** → matches the card (by repo, then title), applies `.kabbo.yaml`,
  and records a LaTeX word count for writing momentum;
- a **`[stage:xxx]`** tag in a commit message moves the card,
  e.g. `git commit -m "Submitted to AER [stage:submitted]"`;
- a published **release** named/tagged as a stage moves the card;
- a repo with a `.kabbo.yaml` is **auto-imported** as a card on install.

### `.kabbo.yaml`

```yaml
title: "My Paper Title"
stage: draft        # idea | draft | submitted | revise_resubmit | resubmitted | accepted | published
authors:
  - Alice Smith
  - Bob Jones
themes:
  - colonial economic history
output_type: journal
target_year: 2026
target_journal: "Journal of Economic History"
overleaf_url: "https://www.overleaf.com/project/abc123"
```

## Overleaf

Kabbo tracks Overleaf through GitHub: in Overleaf use **Menu → Sync → GitHub**
to link your project to a repo, then install the Kabbo GitHub App on that repo.
Edits you push from Overleaf flow into Kabbo, word count and all. Put your
project URL in `.kabbo.yaml` as `overleaf_url` so the card deep-links back.

## Common workflows

- **Morning check-in** → `get_pipeline_summary`
- **Weekly review** → `get_activity_log` (days: 7) + `get_pipeline_summary`
- **Find stalled work** → `get_stalled_papers`
- **Annual review** → `get_analytics` + `export_bibtex`
- **Import a CV/BibTeX** → `import_bibtex`
- **Batch tag** → `list_publications` then `bulk_update`
- **Set a reminder** → `manage_reminders` (action: create, due_date ISO)
- **Team oversight** → `get_team_summary` (team_id required)

## Tips

- Search by title before creating — `create_publication` upserts by title.
- Stage names use underscores: `revise_resubmit`. Aliases accepted: r&r, wip, in-review, forthcoming.
- `get_pipeline_summary` is the best single-call overview.
- For team operations you need the team UUID (from the Kabbo web UI).
