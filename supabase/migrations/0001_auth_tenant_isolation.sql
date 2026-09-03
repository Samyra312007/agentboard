-- AgentBoard — Phase 3: Auth & multi-tenancy
--
-- Adds per-user ownership to runs and enables Row Level Security so data
-- can never leak between users, even if a user-scoped client is used.
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI).

-- 1. Add owner column to runs
ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Index the hot query path: a user's runs, newest first
CREATE INDEX IF NOT EXISTS runs_user_id_created_at_idx
  ON runs (user_id, created_at DESC);

-- 3. Enable RLS on both tables
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE steps ENABLE ROW LEVEL SECURITY;

-- 4. Drop the old permissive "allow all" policies if they exist
DROP POLICY IF EXISTS "Allow all access" ON runs;
DROP POLICY IF EXISTS "Allow all access" ON steps;

-- 5. Runs policies — users can only touch their own runs
CREATE POLICY "Users can view their own runs"
  ON runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own runs"
  ON runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own runs"
  ON runs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own runs"
  ON runs FOR DELETE
  USING (auth.uid() = user_id);

-- 6. Steps policies — ownership is inherited from the parent run
CREATE POLICY "Users can view steps of their runs"
  ON steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM runs
      WHERE runs.id = steps.run_id AND runs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert steps into their runs"
  ON steps FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM runs
      WHERE runs.id = steps.run_id AND runs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update steps of their runs"
  ON steps FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM runs
      WHERE runs.id = steps.run_id AND runs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete steps of their runs"
  ON steps FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM runs
      WHERE runs.id = steps.run_id AND runs.user_id = auth.uid()
    )
  );