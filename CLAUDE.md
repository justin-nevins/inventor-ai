# InventorAI

AI-powered web app that guides inventors through market research & validation.

## Tech Stack
- **Framework**: Next.js 14+ (App Router)
- **Database**: Supabase (Postgres + Auth + pgvector)
- **AI**: Anthropic Claude API
- **Styling**: Tailwind CSS + shadcn/ui
- **Hosting**: DigitalOcean VPS (do-stoic, 157.230.167.214) — Docker + Caddy reverse proxy

## Project Structure
```
src/
├── app/
│   ├── (auth)/     # Auth routes (login, signup, callback)
│   ├── (app)/      # Authenticated app routes
│   └── api/        # API routes
├── components/
│   ├── ui/         # shadcn/ui components
│   ├── layout/     # App shell components
│   ├── chat/       # Chat interface
│   └── research/   # Research workflow components
├── lib/
│   ├── supabase/   # Supabase clients
│   ├── ai/         # AI agents, memory, prompts
│   ├── research/   # Web scraping, data collection
│   └── knowledge/  # Blog scraper, RAG retrieval
├── hooks/          # React hooks
└── types/          # TypeScript types
```

## Key Patterns

### AI Agents
All agents use the 4-part prompt formula:
1. **Role**: Who the AI acts as
2. **Task**: What to accomplish
3. **How-To**: Step-by-step method
4. **Output**: Expected format

### Graduated Truth Model
Every AI output includes scores (0-1):
- `objective_truth`: How verifiable
- `practical_truth`: How actionable
- `completeness`: How comprehensive
- `contextual_scope`: How applicable to user's context

### Database Tables
- `profiles` - User accounts
- `projects` - Invention projects
- `ai_memory` - Personalized AI memory
- `conversations` / `messages` - Chat history
- `research_*` - Market research data
- `knowledge_articles` - Curated blog content

## Deployment

**CRITICAL: Deploys from GitHub (master branch), NOT from local.**
- NEVER run `vercel --prod` or `vercel deploy` from local. This overrides the GitHub-based deployment pipeline.
- To redeploy with updated env vars, use `vercel redeploy <existing-deployment-url>` to rebuild from the same GitHub commit.
- When adding env vars via CLI, use `printf` (not `echo`) to avoid trailing newlines: `printf 'value' | vercel env add KEY production`

## Commands
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run lint     # Run ESLint
```

## Environment Variables
See `.env.example` for required variables.

---

## NEXUS Knowledge Layer

Cross-project patterns and learnings are stored in NEXUS.

| Need | Command |
|------|---------|
| Check existing patterns | `/recall {topic}` |
| Store new learning | `/remember {insight}` |
| Research + store | `/research {topic}` |

**Vault:** `~/projects/nexus/`
