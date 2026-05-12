import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import type { Run, Step, RunWithSteps } from "@/types";

const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/agentboard.db' 
  : './agentboard.db';

const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Initialize database schema
export function initializeDatabase() {
  // Create runs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      task TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
      max_steps INTEGER NOT NULL DEFAULT 10,
      status TEXT NOT NULL DEFAULT 'running',
      total_steps INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      total_latency_ms INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      final_output TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);

  // Create steps table
  db.exec(`
    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      step_number INTEGER NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      tool_name TEXT,
      input TEXT NOT NULL DEFAULT '{}',
      output TEXT,
      error_message TEXT,
      latency_ms INTEGER,
      tokens_used INTEGER,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_steps_run_id ON steps(run_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
    CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC);
  `);
}

// Initialize on module load
initializeDatabase();

// Run functions
export function createRun(run: Omit<Run, 'total_steps' | 'total_tokens' | 'total_latency_ms' | 'failure_count' | 'status'>): Run {
  const newRun: Run = {
    ...run,
    total_steps: 0,
    total_tokens: 0,
    total_latency_ms: 0,
    failure_count: 0,
    status: 'running',
  };

  const stmt = db.prepare(`
    INSERT INTO runs (
      id, task, model, max_steps, status, total_steps, total_tokens,
      total_latency_ms, failure_count, final_output, error_message,
      created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    newRun.id,
    newRun.task,
    newRun.model,
    newRun.max_steps,
    newRun.status,
    newRun.total_steps,
    newRun.total_tokens,
    newRun.total_latency_ms,
    newRun.failure_count,
    newRun.final_output,
    newRun.error_message,
    newRun.created_at,
    newRun.completed_at
  );

  return newRun;
}

export function getRunById(id: string): Run | null {
  const stmt = db.prepare('SELECT * FROM runs WHERE id = ?');
  const row = stmt.get(id) as Run | undefined;
  return row || null;
}

export function getAllRuns(): Run[] {
  const stmt = db.prepare('SELECT * FROM runs ORDER BY created_at DESC');
  return stmt.all() as Run[];
}

export function updateRun(id: string, updates: Partial<Omit<Run, 'id'>>): void {
  const fields = Object.keys(updates);
  if (fields.length === 0) return;

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => (updates as any)[f]);

  const stmt = db.prepare(`UPDATE runs SET ${setClause} WHERE id = ?`);
  stmt.run(...values, id);
}

export function deleteRun(id: string): void {
  const stmt = db.prepare('DELETE FROM runs WHERE id = ?');
  stmt.run(id);
}

// Step functions
export function createStep(step: Omit<Step, 'status' | 'output' | 'latency_ms' | 'tokens_used' | 'completed_at' | 'error_message'>): Step {
  const newStep: Step = {
    ...step,
    status: 'running',
    output: null,
    latency_ms: null,
    tokens_used: null,
    completed_at: null,
    error_message: null,
  };

  const stmt = db.prepare(`
    INSERT INTO steps (
      id, run_id, step_number, type, status, tool_name, input, output,
      error_message, latency_ms, tokens_used, created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    newStep.id,
    newStep.run_id,
    newStep.step_number,
    newStep.type,
    newStep.status,
    newStep.tool_name,
    newStep.input,
    newStep.output,
    newStep.error_message,
    newStep.latency_ms,
    newStep.tokens_used,
    newStep.created_at,
    newStep.completed_at
  );

  return newStep;
}

export function getStepsByRunId(run_id: string): Step[] {
  const stmt = db.prepare('SELECT * FROM steps WHERE run_id = ? ORDER BY step_number ASC');
  return stmt.all(run_id) as Step[];
}

export function updateStep(id: string, updates: Partial<Omit<Step, 'id'>>): void {
  const fields = Object.keys(updates);
  if (fields.length === 0) return;

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => (updates as any)[f]);

  const stmt = db.prepare(`UPDATE steps SET ${setClause} WHERE id = ?`);
  stmt.run(...values, id);
}

export function getRunWithSteps(id: string): RunWithSteps | null {
  const run = getRunById(id);
  if (!run) return null;

  const steps = getStepsByRunId(id);
  return { ...run, steps };
}
