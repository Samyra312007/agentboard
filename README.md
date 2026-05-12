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
- **Database**: SQLite (better-sqlite3)
- **AI**: OpenAI SDK 4
- **Streaming**: Server-Sent Events (SSE)

## Quick Start

### Prerequisites

- Node.js 18+ installed
- OpenAI API key

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

Edit `.env.local` and add your OpenAI API key:
```
OPENAI_API_KEY=your_openai_api_key_here
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

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
│  AgentRunner    │             │  SQLite via            │
│  TraceEmitter   │             │  better-sqlite3        │
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

The agent has access to 4 simulated tools:

1. **web_search**: Searches for information about a topic (simulated results)
2. **calculator**: Performs mathematical calculations
3. **summarizer**: Summarizes long text into key points
4. **weather**: Gets current weather information for a location (simulated)

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
│   ├── db.ts                      # SQLite database layer
│   └── utils.ts                   # Utility functions
├── types/
│   └── index.ts                   # TypeScript interfaces
├── next.config.js                 # Next.js configuration
├── tailwind.config.ts            # Tailwind CSS configuration
├── tsconfig.json                  # TypeScript configuration
└── package.json                  # Dependencies
```

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (required)

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

AgentBoard uses SQLite with better-sqlite3. The database file (`agentboard.db`) is created automatically on first run and is gitignored.

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
