CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id INTEGER PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'free',
  billing_interval TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start DATETIME,
  current_period_end DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_entitlement_usage (
  user_id INTEGER NOT NULL,
  period_key TEXT NOT NULL,
  try_on_credits_used INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, period_key),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
