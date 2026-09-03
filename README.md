# AgentBoard

A real-time observability and debugging dashboard for AI agent runs. Watch your agents think step by step, understand failures instantly, and replay past runs without hitting the LLM again.

## Features

- **Real-time Streaming**: Watch agent steps stream in live as they happen
- **Step Inspection**: Click any step to see full input/output JSON
- **Run History**: Browse all past runs with filtering
- **Replay Mode**: Re-animate past runs without LLM calls
- **Failure Highlighting**: Failed steps are immediately visible in red
- **Token & Latency Tracking**: See resource usage per step and overall

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 3
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI SDK 4 (Unified for all providers)
- **Providers**: OpenAI, Groq, NVIDIA Integrate

## Supported Models

AgentBoard supports multiple LLM providers with specialized handling for reasoning models:

- **OpenAI**: `gpt-4o`, `gpt-4o-mini`
- **Groq**: `llama-3.3-70b-versatile`
- **NVIDIA Integrate**: 
  - `bytedance/seed-oss-36b-instruct` (Reasoning/Thinking support)
  - `mistralai/mistral-large-3-675b-instruct-2512`
  - `minimaxai/minimax-m2.7`

### Reasoning Content support
For models that support "thinking" (like Seed OSS), AgentBoard captures and displays the `reasoning_content` deltas in real-time. Reasoning steps are highlighted within the trace to give you insight into the model's internal logic before it provides a final answer.

## Quick Start

### Prerequisites

- Node.js 18+ installed
- A Supabase project
- At least one API key from the supported providers

### Installation

1. Clone the repository and navigate to the project:
```bash
cd agent-board
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.local.example .env.local
```

4. Edit `.env.local` and add your keys:
```env
OPENAI_API_KEY=your_openai_api_key_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Database Setup

Create the base tables with this SQL in your Supabase SQL Editor:

```sql
CREATE TABLE runs (
  id UUID PRIMARY KEY,
  task TEXT NOT NULL,
  model TEXT NOT NULL,
  max_steps INTEGER NOT NULL,
  status TEXT NOT NULL,
  total_steps INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_latency_ms INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  final_output TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE steps (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  tool_name TEXT,
  input TEXT,
  output TEXT,
  error_message TEXT,
  latency_ms INTEGER,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

Then apply the auth/tenant-isolation migration (adds `user_id`, RLS policies,
and indexes) from `supabase/migrations/0001_auth_tenant_isolation.sql`.

### Authentication

AgentBoard uses Supabase Auth (email/password or magic link). In the Supabase
dashboard: **Authentication → Providers** and enable Email (both password and
magic link). If you require email confirmation, add the site URL to
**Authentication → URL Configuration** (e.g. `http://localhost:3000`).

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser and
   create an account — every run is scoped to your user.

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase Anon (publishable) Key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Service Role Key (server-only)
- `OPENAI_API_KEY`: OpenAI key (used for OpenAI models)
- `GROQAPI_KEY`: Groq key (used for Groq models)
- `MINIMAX_API_KEY` / `MISTRAL_API_KEY` / `BYTEDANCE_API_KEY`: NVIDIA-hosted model keys
- `TAVILY_API_KEY`: Tavily web search key (optional — web search degrades gracefully without it)
- `RESEND_API_KEY`: Resend key for email alerts (optional — email delivery is skipped without it)
- `ALERT_EMAIL_FROM`: From address for alert emails (optional, defaults to `AgentBoard Alerts <onboarding@resend.dev>`)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│                                                              │
│   page.tsx          runs/[id]/page.tsx                      │
│   (Home + RunForm)  (Run Detail)                            │
│        │                    │                                │
│   SSE Connection        HTTP fetch                           │
│        │                    │                                │
└────────┼────────────────────┼────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                     Next.js API Routes                       │
│                                                              │
│   /api/agent/run     → starts agent, returns run_id         │
│   /api/agent/stream  → SSE endpoint, streams steps live     │
│   /api/runs          → GET all runs / GET single run        │
│                                                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
         ┌────────────────┴────────────────┐
         │                                 │
         ▼                                 ▼
┌─────────────────┐             ┌──────────────────────┐
│   lib/agent.ts  │             │     lib/db.ts         │
│                 │             │                        │
│  AgentRunner    │             │  Supabase (PostgreSQL) │
│  TraceEmitter   │             │                        │
│  Tool registry  │             │  runs table            │
│  OpenAI calls   │             │  steps table           │
└────────┬────────┘             └──────────────────────┘
         │
         ▼
┌─────────────────┐
│   lib/tools.ts  │
│                 │
│  web_search     │
│  calculator     │
│  summarizer     │
│  weather        │
└─────────────────┘
```

## Available Tools

The agent has access to 5 tools — every tool hits a real API or fails gracefully:

1. **web_search**: Web search via Tavily (set `TAVILY_API_KEY`; returns a
   clear error result when the key is missing)
2. **weather**: Live conditions via Open-Meteo (free, no API key)
3. **http_fetch**: Fetch any HTTP(S) URL with SSRF protection (private/loopback
   addresses blocked, 512KB body cap, 8s timeout)
4. **calculator**: Safe local expression evaluation (no `eval`)
5. **summarizer**: Deterministic local text summarization

## Usage

### Starting a New Run

1. Navigate to the home page
2. Enter a task description (e.g., "Research top AI startups in India")
3. Select a model (gpt-4o-mini or gpt-4o)
4. Set max steps (5, 10, 15, or 20)
5. Click "Run Agent"
6. Watch steps stream in real-time

### Inspecting Steps

- Click any step card to open the detail panel
- View full input/output JSON
- See latency and token usage
- Check error messages if the step failed

### Viewing Run History

- Click "History" in the header
- Filter by All, Success, or Failed runs
- Click any run to view full details

### Replay Mode

- Navigate to a past run
- Click "Replay" button
- Watch the run animate step-by-step from stored data
- No LLM calls are made during replay

## Project Structure

```
agent-board/
├── app/
│   ├── api/
│   │   ├── agent/
│   │   │   ├── run/route.ts       # POST endpoint to start a run
│   │   │   └── stream/route.ts    # SSE endpoint for live streaming
│   │   └── runs/route.ts          # GET endpoint for runs history
│   ├── layout.tsx                 # Root layout with dark theme
│   ├── page.tsx                   # Home page with RunForm + LiveTrace
│   ├── runs/
│   │   ├── page.tsx               # History page
│   │   └── [id]/page.tsx          # Run detail page with replay
│   └── globals.css                # Global styles
├── components/
│   ├── dashboard/
│   │   ├── Header.tsx             # Navigation header
│   │   ├── RunForm.tsx            # Form to start new runs
│   │   ├── LiveTrace.tsx          # Real-time trace viewer
│   │   ├── StepCard.tsx           # Individual step card
│   │   ├── StepDetail.tsx         # Step detail panel
│   │   ├── RunSummary.tsx         # Run summary bar
│   │   └── RunHistory.tsx         # Run history list
│   └── ui/
│       ├── button.tsx             # Button component
│       ├── card.tsx               # Card component
│       ├── badge.tsx              # Badge component
│       ├── scroll-area.tsx        # Scroll area component
│       └── separator.tsx          # Separator component
├── lib/
│   ├── agent.ts                   # AgentRunner + TraceEmitter
│   ├── tools.ts                   # Tool implementations
│   ├── db.ts                      # Supabase database layer
│   └── utils.ts                   # Utility functions
├── types/
│   └── index.ts                   # TypeScript interfaces
├── next.config.js                 # Next.js configuration
├── tailwind.config.ts            # Tailwind CSS configuration
├── tsconfig.json                  # TypeScript configuration
└── package.json                  # Dependencies
```

## Alerts

Create rules on the **Alerts** page (failure rate, average latency, or cost
over a rolling window). Rules are evaluated whenever a run finishes and fire
at most once per window. Delivery channels:

- **Webhook** — receives a `POST` with `{ event, message, sent_at }`
- **Email** — requires `RESEND_API_KEY` (and a verified domain for production
  sending; the sandbox default from-address works for testing)

## Public Ingestion API

External agents can report traces to AgentBoard without a browser session.
Create an API key in **Settings**, then authenticate with
`Authorization: Bearer <key>`:

- `POST /api/v1/runs` — create a run `{ task, model?, metadata? }` → `{ run_id }`
- `POST /api/v1/runs/:id/steps` — report a step
  `{ id?, step_number, type, status?, tool_name?, input?, output?,
  error_message?, latency_ms?, tokens_used?, created_at? }`
- `PATCH /api/v1/runs/:id` — complete/fail a run `{ status, final_output?, error_message? }`

See `openapi.yaml` for the full spec, and `packages/agentboard-sdk` for the
TypeScript SDK (buffered reporting with auto-flush):

```ts
import { AgentBoardClient } from "agentboard-sdk";

const client = new AgentBoardClient({ apiKey: "ab_live_..." });
const run = await client.startRun({ task: "Watch my agent" });
run.trackStep({ step_number: 1, type: "llm_call", status: "success" });
await run.end({ status: "completed" });
```

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Database

AgentBoard uses Supabase (PostgreSQL) for persistence.

### Schema

**runs table**:
- id, task, model, max_steps, status
- total_steps, total_tokens, total_latency_ms, failure_count
- final_output, error_message, created_at, completed_at

**steps table**:
- id, run_id, step_number, type, status
- tool_name, input, output, error_message
- latency_ms, tokens_used, created_at, completed_at

## Acknowledgments

Build by ❤️ for the developer community.
