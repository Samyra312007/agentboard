# AgentBoard SDK

TypeScript SDK for reporting AI agent traces to [AgentBoard](https://github.com/Samyra312007/agentboard).

Works in Node.js 18+ and modern browsers.

## Install

```bash
npm install agentboard-sdk
```

## Usage

```ts
import { AgentBoardClient } from "agentboard-sdk";

const client = new AgentBoardClient({
  apiKey: "ab_live_...", // from AgentBoard → Settings
  baseUrl: "https://your-agentboard-host.com", // defaults to AGENTBOARD_BASE_URL or http://localhost:3000
});

// Simple mode
const runId = await client.createRun({ task: "Research AI startups", model: "gpt-4o" });
await client.reportStep(runId, {
  step_number: 1,
  type: "llm_call",
  status: "success",
  output: { answer: "..." },
  tokens_used: 512,
});
await client.completeRun(runId, { status: "completed", final_output: "..." });

// Buffered mode with auto-flush
const run = await client.startRun({ task: "Watch my agent" });
run.trackStep({ step_number: 1, type: "tool_call", tool_name: "web_search", status: "running" });
// ... more steps; the buffer flushes automatically
await run.end({ status: "completed", final_output: "Done" });
```

## API

- `client.createRun(input)` → `runId`
- `client.reportStep(runId, step)` — create or update a step
- `client.completeRun(runId, { status, final_output?, error_message? })`
- `client.startRun(input, { autoFlushEvery? })` → buffered `RunReporter`
- `reporter.trackStep(step)`, `reporter.flush()`, `reporter.end(input?)`

## Development

```bash
npm run build  # from packages/agentboard-sdk — emits dist/
```