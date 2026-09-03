-- AgentBoard — Phase 7: Alerts & notifications
--
-- Alert rules define conditions (metric + threshold over a rolling window)
-- evaluated whenever one of the user's runs finishes. Fired alerts are
-- recorded in alert_events and delivered via email/webhook.

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('failure_rate', 'avg_latency', 'cost')),
  operator TEXT NOT NULL CHECK (operator IN ('gt', 'gte')),
  threshold NUMERIC NOT NULL,
  window_minutes INTEGER NOT NULL DEFAULT 60,
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alert_rules_user_id_idx ON alert_rules (user_id, enabled);

CREATE TABLE IF NOT EXISTS alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES alert_rules(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  value NUMERIC NOT NULL,
  threshold NUMERIC NOT NULL,
  message TEXT NOT NULL,
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alert_events_user_id_fired_idx
  ON alert_events (user_id, fired_at DESC);

ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own alert rules"
  ON alert_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own alert rules"
  ON alert_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own alert rules"
  ON alert_rules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own alert rules"
  ON alert_rules FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own alert events"
  ON alert_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own alert events"
  ON alert_events FOR INSERT WITH CHECK (auth.uid() = user_id);