ALTER TABLE user_subscriptions ADD COLUMN provider TEXT;
ALTER TABLE user_subscriptions ADD COLUMN provider_customer_id TEXT;
ALTER TABLE user_subscriptions ADD COLUMN provider_subscription_id TEXT;
ALTER TABLE user_subscriptions ADD COLUMN provider_product_id TEXT;

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
