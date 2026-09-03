# AgentBoard — 12-Month Production Roadmap

End-to-end plan to take AgentBoard from a working demo to a production-grade
observability platform for AI agents. Each phase ships independently, ends with
a commit + push, and has explicit exit criteria.

---

## Q1 — Foundation (Months 1–3)

### Phase 1 · Foundation & Security Hardening
**Goal:** eliminate the security/robustness gaps that block production.

- Server-only Supabase client (service-role key never reachable from client code)
- Replace `Function()`-based calculator with a safe expression parser
- Input validation on every API route (task, model, max steps, run id)
- Rate limiting on the agent-run endpoint
- Pagination + status filtering for run history
- Lazy environment validation with clear error messages
- Model registry (single source of truth for supported models + costs)
- `PLAN.md` committed with the full roadmap

**Exit criteria:** `npm run build` passes; no `eval`/`Function` in the codebase;
all API routes validate input and return consistent error envelopes.

### Phase 2 · Quality & CI
**Goal:** automated verification so regressions cannot ship.

- ESLint flat config (Next.js rules) wired into `npm run lint`
- Vitest unit tests: expression parser, validators, rate limiter, tools, model registry
- GitHub Actions CI: typecheck → lint → test → build on every push/PR
- `npm run typecheck` script

**Exit criteria:** CI green on `main`; test coverage for all pure logic modules.

### Phase 3 · Auth & Multi-tenancy
**Goal:** every run belongs to a user; data is isolated and protected.

- Supabase Auth (email/password + magic link), `/login` page, sign-out
- `middleware.ts` protecting `/runs`, `/analytics`, and agent API routes
- `runs.user_id` + `steps` ownership, RLS policies in `supabase/migrations/`
- Ownership checks in the DB layer (query by `user_id`, never trust client)
- Header shows signed-in user

**Exit criteria:** unauthenticated requests are rejected; users only see their
own runs; RLS enabled on all tables.

### Phase 4 · Real Tool Integrations & Provider Registry
**Goal:** the agent does real work, not simulations.

- Weather tool backed by Open-Meteo (no API key)
- Web search backed by Tavily (env key, graceful fallback when missing)
- HTTP fetch tool with protocol/domain allowlist + size caps
- Token usage captured from stream chunks (fixes `tokens_used = 0`)
- Model registry drives the UI dropdown + client selection

**Exit criteria:** every tool hits a real API or fails gracefully; usage/cost
numbers are accurate.

## Q2 — Core Product (Months 4–6)

### Phase 5 · Public Ingestion API + SDK
**Goal:** any agent (any language) can report traces to AgentBoard.

- `POST /api/v1/runs` + `POST /api/v1/runs/:id/steps` with API-key auth
- API keys table + key management UI (Settings)
- TypeScript SDK (`packages/agentboard-sdk`): `AgentBoardClient`, auto-flush,
  manual step reporting, typed events
- OpenAPI spec for the public API

**Exit criteria:** an external agent can stream a full trace into AgentBoard
via the SDK and see it in the dashboard.

### Phase 6 · Analytics & Cost Dashboard
**Goal:** answer "what is happening across all my runs?"

- `GET /api/runs/stats`: runs/day, tokens/day, avg latency, failure rate,
  cost per model (from registry pricing)
- `/analytics` page: time-series charts, top models, failure breakdown
- CSV export of run history

**Exit criteria:** dashboard renders real aggregates; cost estimates match
provider pricing tables.

## Q3 — Collaboration & Ops (Months 7–9)

### Phase 7 · Alerts & Notifications
**Goal:** get notified when agents misbehave, instead of discovering it.

- Alert rules per user: failure-rate threshold, latency p95, cost spike
- Delivery via email (Resend) and generic webhooks
- Alert history + rule management UI

**Exit criteria:** a failing run triggers a configured email/webhook within
minutes; alert rules are testable.

### Phase 8 · Collaboration & Sharing
**Goal:** traces are shareable and reviewable by teams.

- Public share links with revocable share tokens
- Comments/annotations on steps (threaded)
- Team workspaces (multiple users per org) with roles

**Exit criteria:** share a run with a colleague; they can view and comment
without an account; revocation works.

### Phase 9 · Eval Harness
**Goal:** measure agent quality, compare models, prevent regressions.

- Datasets (input + expected behavior), eval runs against the agent
- Score reporting (pass/fail, rubric), model-vs-model comparison view
- Regression tracking over time

**Exit criteria:** run an eval on 2 models over the same dataset and see a
comparison report.

## Q4 — Scale & Launch (Months 10–12)

### Phase 10 · Performance & Reliability
**Goal:** handle real traffic without degradation.

- DB indexes on hot query paths; cursor pagination
- Agent runs moved to a background job queue (no SSE-held execution)
- Edge-friendly streaming + retry/resume for interrupted runs
- Health endpoint, structured logging, uptime checks

**Exit criteria:** load test: 100 concurrent runs complete with p95 latency
under budget; zero lost runs on process restart (queue replay).

### Phase 11 · Enterprise
**Goal:** compliance and admin capabilities for larger customers.

- SSO (SAML/OIDC), SCIM provisioning
- Audit log (who did what, when)
- Data retention policies + export/delete (GDPR)

**Exit criteria:** enterprise checklist verified with a pilot customer.

### Phase 12 · Monetization & Launch
**Goal:** revenue and a polished public product.

- Stripe usage-based billing (seats + trace volume), payment portal
- Docs site (getting started, SDK reference, API reference)
- Onboarding flow (first agent instrumented in < 5 minutes)
- Public launch: landing page, changelog, support channel

**Exit criteria:** self-serve signup → paid plan in under 10 minutes; first
paying customers onboarded.

---

## Guiding principles

- Every phase must keep `npm run build` green.
- Every phase ships as its own commit + push (max 3-line commit message).
- Secrets only via environment variables; never commit `.env*` files.
- All data access goes through the DB layer with ownership checks.
- No new dependency without a reason; prefer small, maintained libraries.