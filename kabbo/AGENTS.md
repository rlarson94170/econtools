# Kabbo — Publication Pipeline Agent

Kabbo is an academic publication pipeline tracker at https://kabbo.app.
This project connects to the Kabbo MCP server, which exposes tools for managing
publications through seven stages: Idea, Draft, Submitted, Revise & Resubmit,
Resubmitted, Accepted, Published.

## MCP server

```
https://jydnsbaztvmjkebhmoia.supabase.co/functions/v1/mcp-server
```

Authenticate with `?api_key=YOUR_KEY` query parameter or `x-api-key` header.
Generate a key at https://kabbo.app (Settings → Developer → Create Key).

## Available tools

### Core CRUD
- `list_publications` — list with optional query, stage, limit, offset
- `get_publication` — get one by id
- `create_publication` — create (title required, stage defaults to "idea"; upserts by title)
- `update_publication` — update any field by id
- `move_stage` — move to a new stage by id and stage
- `delete_publication` — soft-delete by id

### Analytics
- `get_pipeline_summary` — counts by stage, stalled papers, recently updated
- `get_stalled_papers` — papers inactive for N days (default 30)
- `get_analytics` — velocity, avg time per stage, breakdowns by author/theme/grant/year/output_type
- `get_activity_log` — recent activity with date filtering (sources: web, api, mcp, webhook, github_app)

### Search & batch
- `search_publications` — multi-field search (title, authors, notes, themes, grants, year)
- `bulk_update` — array of {id, ...updates}

### Integration & workflow
- `list_connected_repos` — GitHub App installations and repos linked to the account
- `link_repo` — attach a github_repo and/or overleaf_url to a publication
- `get_writing_progress` — LaTeX word-count history for a paper (writing momentum)
- `set_target_journal` — set the intended journal
- `import_bibtex` — create publications from a BibTeX string
- `manage_related_papers` — list/add/remove related papers
- `manage_data_sources` — list/add/remove data sources

### Reminders / team / export / notes
- `manage_reminders` — action: list | create | complete | delete
- `get_team_summary` — per-member pipeline breakdown (requires team_id)
- `export_bibtex` — BibTeX filtered by stage, year, or ids
- `add_note` — append a timestamped note without overwriting

## Resources & prompts

The server also exposes MCP resources (`kabbo://pipeline/summary`,
`kabbo://publications`, `kabbo://publication/{id}`, `kabbo://activity/recent`)
and prompts (`morning_checkin`, `weekly_review`, `annual_report`,
`submission_prep`, `stalled_triage`). Clients that support resources/prompts can
use them directly; otherwise the equivalent tools cover the same ground.

## GitHub integration (the Kabbo App)

The frictionless path is the **Kabbo GitHub App**: the user installs it once
(kabbo.app → Settings → Developer → Connect GitHub) and picks repos. Then:

- a **push** matches the card (by repo id/URL, then title), applies the repo's
  `.kabbo.yaml`, and records a LaTeX word count;
- a **`[stage:xxx]`** tag in a commit message moves the card;
- a published **release** named/tagged as a stage moves the card;
- installing on a repo that has a `.kabbo.yaml` **auto-creates** its card.

`.kabbo.yaml` (repo root):

```yaml
title: "My Paper Title"
stage: draft        # idea | draft | submitted | revise_resubmit | resubmitted | accepted | published
authors:
  - Alice Smith
themes:
  - colonial economic history
output_type: journal
target_year: 2026
target_journal: "Journal of Economic History"
overleaf_url: "https://www.overleaf.com/project/abc123"
```

## Overleaf

Track Overleaf through GitHub: in Overleaf, **Menu → Sync → GitHub** links the
project to a repo; install the Kabbo GitHub App on that repo. Edits pushed from
Overleaf flow into Kabbo (word count included). Set `overleaf_url` in
`.kabbo.yaml` so the card deep-links back.

## Common prompts

- "How's my pipeline looking?" → get_pipeline_summary
- "Which papers have been stuck longest?" → get_stalled_papers
- "How many papers did I publish this year vs last?" → get_analytics
- "Find all papers about colonial wages" → search_publications
- "Import these from my CV" (paste BibTeX) → import_bibtex
- "How's the writing going on the climate paper?" → get_writing_progress
- "Which repos are connected?" → list_connected_repos
- "Add grant NRF-2026 to all submitted papers" → list then bulk_update
- "BibTeX for all published papers since 2024" → export_bibtex

## Valid stages

idea, draft, submitted, revise_resubmit, resubmitted, accepted, published

Aliases accepted: wip→draft, r&r→revise_resubmit, in-review→submitted,
forthcoming→accepted.

## Project structure

- `src/` — React frontend (TypeScript, Vite, Tailwind, shadcn/ui)
- `plugin/` — the Kabbo Claude Code plugin (MCP config, skill, slash commands, hooks)
- `supabase/functions/` — Deno edge functions (mcp-server, api-publications,
  github-app, github-webhook, ingest-publication); shared helpers in `_shared/`
- `supabase/migrations/` — PostgreSQL migrations
- `src/hooks/useSupabasePublications.ts` — core data layer

## Development

```bash
npm run dev          # Vite dev server
npm run build        # production build
```

Edge function deployment (Supabase CLI):
```bash
supabase functions deploy mcp-server github-app --no-verify-jwt
```
