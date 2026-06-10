---
name: kabbo
description: Manage your academic publication pipeline via the Kabbo MCP server. List, search, create, update, move, and analyse publications; track stalled papers and reminders; export/import BibTeX; link a data repo or Overleaf project; review team progress.
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
      "url": "https://jydnsbaztvmjkebhmoia.supabase.co/functions/v1/mcp-server",
      "headers": { "x-api-key": "YOUR_API_KEY" }
    }
  }
}
```

The same server backs **Codex** (via `AGENTS.md`) and **Gemini CLI** (in
`~/.gemini/settings.json`, using `httpUrl` instead of `url`). Generate a key at
kabbo.app → **Settings → AI Integration → Create Key**.

## Slash commands (plugin)

- `/kabbo:status` — quick pipeline overview.

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
- **get_activity_log** — recent activity from all sources (api, mcp)

### Search & batch
- **search_publications** — multi-field search (title, authors, notes, themes, grants, year)
- **bulk_update** — array of `{id, ...updates}`

### Workflow & metadata
- **link_repo** — attach a `github_repo` URL and/or `overleaf_url` to a publication (where the data or source lives)
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

## Updating the pipeline on request

This is the main job. When the user says something like *"I just submitted the
climate paper to the AER — update Kabbo"*:

1. `search_publications` (or `list_publications`) to find the card by title.
2. `update_publication` to fill in the metadata — `target_journal`, `authors`,
   `themes`, `notes` — and `link_repo` to record the GitHub/Overleaf URL where
   the data or source lives.
3. `move_stage` to the correct column (here, `submitted`).

There is no GitHub/Overleaf automation — you set these fields directly. The repo
and Overleaf links are plain metadata on the card.

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
