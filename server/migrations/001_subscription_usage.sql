CREATE TABLE IF NOT EXISTS user_usage_settings (
  user_id TEXT PRIMARY KEY,
  time_zone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_feature_usage (
  user_id TEXT NOT NULL,
  local_day DATE NOT NULL,
  feature TEXT NOT NULL CHECK (feature IN ('analysis', 'puzzle', 'puzzleRush')),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, local_day, feature)
);

CREATE TABLE IF NOT EXISTS subscription_analytics (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  event TEXT NOT NULL,
  source TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscription_analytics_created_at_idx
  ON subscription_analytics (created_at DESC);

CREATE TABLE IF NOT EXISTS revenuecat_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  app_user_id TEXT,
  product_id TEXT,
  event_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);