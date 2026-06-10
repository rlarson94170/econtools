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
- **AI-agent integration** — connect Claude Code, Codex, or Gemini to the Kabbo
  MCP server with a personal API key, and your agent can read and update the
  pipeline on request ("I just submitted this paper — update Kabbo")
- **Import / export** — BibTeX (in and out), PDF, Excel
- **Offline support** with a sync queue
- **Light / dark mode** and swappable palettes

Kabbo is driven two ways: by you, in the web app, or by your AI coding agent over
MCP. There is no GitHub / Overleaf / webhook automation — an agent records a
data-repo or Overleaf link as plain card metadata when you ask it to.

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

## Connect your agent (Claude Code · Codex · Gemini)

The Supabase edge function at `supabase/functions/mcp-server/` exposes the MCP
tools (CRUD + analytics + search + bulk updates + reminders + BibTeX in/out +
repo/Overleaf linking), plus MCP **resources** (`kabbo://...`) and **prompts**
(`weekly_review`, `annual_report`, …). All three agents connect to the same
server, authenticated with a personal API key (generate one under *Settings → AI
Integration → Create Key*).

- **Claude Code** — install the one-command plugin:
  `/plugin marketplace add johanfourieza/econtools` then `/plugin install kabbo`.
  It bundles the MCP config, the skill, and the `/kabbo:status` command. The
  standalone `skill.md` download from *Settings → AI Integration* still works too.
- **Codex** — point Codex at the repo-root `AGENTS.md`.
- **Gemini CLI** — add the server to `~/.gemini/settings.json` (copy the config
  from *Settings → AI Integration*; it uses `httpUrl` + an `x-api-key` header).

Once connected, your agent keeps the pipeline current on request — filling in the
journal, co-authors, a data-repo link, and moving the card to the right column.
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
- `plugin/` — the Kabbo Claude Code plugin (manifest, skill, `/kabbo:status`);
  surfaced to users via `.claude-plugin/marketplace.json` at the repo root
- `supabase/functions/` — Deno edge functions (`mcp-server`, `api-publications`,
  `ingest-publication`); shared helpers in `supabase/functions/_shared/`
- `supabase/migrations/` — PostgreSQL migrations
- `AGENTS.md` — contract for agents (Claude Code, Codex, Gemini)
- `theplan.txt` — long-running roadmap / strategy notes

## License

Free to use. No monetization planned.
