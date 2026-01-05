# InventorAI

AI-powered web app that guides inventors through market research & validation.

## Tech Stack
- **Framework**: Next.js 14+ (App Router)
- **Database**: Supabase (Postgres + Auth + pgvector)
- **AI**: Anthropic Claude API
- **Styling**: Tailwind CSS + shadcn/ui
- **Hosting**: Vercel

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

## Commands
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run lint     # Run ESLint
```

## Environment Variables
See `.env.example` for required variables.

---

## Technical Audit (2026-01-04)

### Current Implementation Status

| Area                    | Status              | Notes                                      |
|-------------------------|---------------------|---------------------------------------------|
| Multi-Tenancy           | NOT IMPLEMENTED     | Single-user model only (no Organizations)  |
| Vector Database / RAG   | NOT IMPLEMENTED     | OpenAI SDK installed but unused            |
| Token Efficiency        | BASIC               | Fixed 20-message limit, 2048 max_tokens    |
| System Prompt           | IMPLEMENTED         | Static constant in `/api/chat/route.ts`    |

### Architecture Gaps

1. **Multi-Tenancy**: No `organizations` table. All data isolated by `user_id` only via RLS.

2. **RAG Pipeline**: Not implemented despite CLAUDE.md mentioning it.
   - `knowledge_articles` table exists but has NO vector column
   - No pgvector extension enabled
   - No embedding generation
   - No semantic search function

3. **Token Efficiency**:
   - Hard-coded 20-message history limit
   - Fixed 2048 max_tokens output
   - No input token counting
   - No usage tracking per subscription tier

4. **Chat Handler** (`src/app/api/chat/route.ts`):
   - Context = System Prompt + Project Metadata ONLY
   - No RAG retrieval injected
   - No streaming responses

### Files to Know

| Purpose              | File                                           |
|----------------------|------------------------------------------------|
| Database Schema      | `supabase/migrations/0001_initial_schema.sql`  |
| Type Definitions     | `src/types/database.ts`                        |
| Chat API Handler     | `src/app/api/chat/route.ts`                    |
| System Prompt        | `src/app/api/chat/route.ts` (lines 10-31)      |
| Supabase Client      | `src/lib/supabase/server.ts`                   |

### Next Steps (Suggested)

- [ ] Add pgvector extension and embedding column to `knowledge_articles`
- [ ] Implement embedding generation pipeline (OpenAI)
- [ ] Add vector search function with user filtering
- [ ] Inject RAG results into chat context
- [ ] Add token counting before API calls
- [ ] Consider `organizations` table for B2B multi-tenancy
