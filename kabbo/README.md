# Kabbo

**Because research is a journey.**

A Kanban-style publication pipeline for academics. Track every paper from
Idea → Draft → Submitted → Revise & Resubmit → Resubmitted → Accepted →
Published, collaborate with co-authors, run analytics over your own
backlog, and plug Claude Code or Codex straight into your pipeline.

Live at **[kabbo.app](https://kabbo.app)**.

## What the name means

*ǀKabbo* (pronounced /ˈkabːo/) was a ǀxam storyteller whose accounts,
recorded by Wilhelm Bleek and Lucy Lloyd in the 1870s, are among the
most important surviving sources of Southern African oral history. In
ǀxam the word itself means *a dream, a story yet to be told* — which
is what an unfinished paper is, too. The logomark is a stylised kanna
flower (*Sceletium tortuosum*); the wordmark is drawn in haematite
ochre, the pigment used in San rock art.

## Features

- **Drag-and-drop pipeline** across seven stages
- **Team collaboration** — invite members, per-role visibility, team analytics
- **Publication sharing** — invite collaborators as viewer or editor
- **Claude Code / Codex integration** — MCP server with 23 tools plus resources
  and prompts; install the Kabbo Claude Code plugin in one command
- **GitHub App** — install once, pick repos, and pushes / releases / merged PRs
  keep your pipeline current; `.kabbo.yaml` and `[stage:xxx]` commit tags drive
  it, and LaTeX word counts track writing momentum
- **Overleaf** — tracked through Overleaf's GitHub sync (no Overleaf API needed)
- **Import / export** — BibTeX (in and out), PDF, Excel
- **REST API and webhooks** — automate the pipeline from external tools
- **Offline support** with a sync queue
- **Light / dark mode** and swappable palettes

## Tech stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend:** Supabase — PostgreSQL, Auth, Realtime, Edge Functions (Deno)
- **Deployment:** Vercel (frontend) + Supabase (backend)

## Local development

```sh
git clone https://github.com/johanfourieza/econtools.git
cd econtools/kabbo

npm install
cp .env.example .env        # fill in VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

Dev server runs at `http://localhost:8080`.

### Environment variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase anon / public key |

## AI integration (MCP)

The Supabase edge function at `supabase/functions/mcp-server/` exposes the MCP
tools (CRUD + analytics + search + bulk updates + reminders + BibTeX in/out +
repo linking + writing progress), plus MCP **resources** (`kabbo://...`) and
**prompts** (`weekly_review`, `annual_report`, …). Agents authenticate with a
personal API key (generate one under *Settings → Developer*).

- **Claude Code users** install the one-command plugin:
  `/plugin marketplace add johanfourieza/econtools` then `/plugin install kabbo`.
  It bundles the MCP config, the skill, and slash commands (`/kabbo:status`,
  `/kabbo:sync`, `/kabbo:init`, `/kabbo:install-hooks`). The standalone
  `skill.md` download from *Settings → AI Integration* still works too.
- **Codex users** point Codex at the repo-root `AGENTS.md`.

### GitHub App

Install the Kabbo GitHub App from *Settings → Developer → Connect GitHub*, pick
your repos, and the pipeline updates itself: pushes match cards and record LaTeX
word counts, `[stage:xxx]` commit tags and stage-named releases move cards, and a
repo with a `.kabbo.yaml` is auto-imported on install. The App webhook is signed
(no API key in URLs); the per-repo `github-webhook` remains for manual setups.

See `AGENTS.md` for the full tool reference and example prompts.

## Deployment

Vercel builds from `kabbo/` as the project root and redeploys on every
push to `main`. Supabase (database, auth, edge functions) runs on
Supabase's managed infrastructure; deploy edge functions with:

```sh
supabase functions deploy mcp-server --no-verify-jwt
```

## Brand kit

A full brand kit (logomark + contour wordmark + lockups, in ochre /
black / white, SVG and PNG) lives in `brand/` — gitignored, local-only.
Regenerate it from source with `node brand/generate.mjs` and open
`brand/brand.html` for the specimen sheet.

## Project layout

- `src/` — React frontend
- `src/hooks/useSupabasePublications.ts` — core data layer
- `src/hooks/useTeams.ts` — teams hook
- `src/data/kabboQuotes.ts` — ǀKabbo wisdom quotes shown on stage transitions
- `src/hooks/useGithubInstallations.ts` — GitHub App install state + connect flow
- `plugin/` — the Kabbo Claude Code plugin (manifest, skill, commands, hooks);
  surfaced to users via `.claude-plugin/marketplace.json` at the repo root
- `supabase/functions/` — Deno edge functions (`mcp-server`, `api-publications`,
  `github-app`, `github-webhook`, `ingest-publication`); shared GitHub helpers
  in `supabase/functions/_shared/github.ts`
- `supabase/migrations/` — PostgreSQL migrations
- `AGENTS.md` — contract for agents (Claude Code, Codex)
- `theplan.txt` — long-running roadmap / strategy notes

## License

Free to use. No monetization planned.
