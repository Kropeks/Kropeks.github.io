-- This migration updates the legacy schema toward the reference structure found in `savoryflavors (3).sql`.

-- Ensure cancellation metadata exists on subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(255) DEFAULT NULL AFTER status,
  ADD COLUMN IF NOT EXISTS cancel_source ENUM('user','system','admin') NOT NULL DEFAULT 'user' AFTER cancel_reason,
  ADD COLUMN IF NOT EXISTS canceled_at DATETIME DEFAULT NULL AFTER cancel_source;

-- Ensure refund tracking columns match reference dump
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS refund_status ENUM('not_requested','pending','processed','denied') NOT NULL DEFAULT 'not_requested' AFTER canceled_at,
  ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2) DEFAULT NULL AFTER refund_status,
  ADD COLUMN IF NOT EXISTS refund_currency CHAR(3) DEFAULT NULL AFTER refund_amount;

-- Align date columns used in reference data
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS start_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER cancel_source,
  ADD COLUMN IF NOT EXISTS end_date DATETIME DEFAULT NULL AFTER start_date;

-- Add cancellation and billing metadata consistent with reference
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT NULL AFTER refund_currency,
  ADD COLUMN IF NOT EXISTS last_payment_date DATETIME DEFAULT NULL AFTER payment_method,
  ADD COLUMN IF NOT EXISTS next_billing_date DATETIME DEFAULT NULL AFTER last_payment_date,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100) DEFAULT NULL AFTER next_billing_date,
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100) DEFAULT NULL AFTER stripe_subscription_id;

-- Ensure payments table links to subscriptions and can track refunds similarly to reference
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS subscription_id INT NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS refunded_amount DECIMAL(10,2) DEFAULT NULL AFTER amount,
  ADD COLUMN IF NOT EXISTS refund_id VARCHAR(255) DEFAULT NULL AFTER payment_intent_id,
  ADD COLUMN IF NOT EXISTS refund_status ENUM('none','pending','processed','failed') NOT NULL DEFAULT 'none' AFTER refund_id,
  ADD COLUMN IF NOT EXISTS refund_metadata JSON DEFAULT NULL AFTER refund_status;

-- Add foreign key only if it does not already exist (MariaDB/MySQL compatible)
SET @fk_name := (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'payments'
    AND COLUMN_NAME = 'subscription_id'
    AND REFERENCED_TABLE_NAME = 'subscriptions'
    AND CONSTRAINT_NAME = 'fk_payments_subscription'
  LIMIT 1
);

SET @ddl := IF(
  @fk_name IS NULL,
  'ALTER TABLE payments ADD CONSTRAINT fk_payments_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_refund_status ON payments(refund_status);

-- Create subscription_refunds table if absent (not present in reference dump but required for tracking)
CREATE TABLE IF NOT EXISTS subscription_refunds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subscription_id INT NOT NULL,
    user_id INT NOT NULL,
    payment_id INT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'PHP',
    status ENUM('pending','processing','processed','failed','manual') NOT NULL DEFAULT 'pending',
    guarantee_type ENUM('money_back','pro_rated','manual') NOT NULL DEFAULT 'money_back',
    reason VARCHAR(255) DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    reference_id VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_subscription_refunds_subscription
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_subscription_refunds_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_subscription_refunds_payment
        FOREIGN KEY (payment_id) REFERENCES payments(id)
        ON DELETE SET NULL,
    INDEX idx_subscription_refunds_subscription (subscription_id),
    INDEX idx_subscription_refunds_status (status)
);

-- Guarantee window for existing rows (14-day money-back)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS guarantee_expires_at DATETIME NULL AFTER end_date;

UPDATE subscriptions
SET guarantee_expires_at = DATE_ADD(start_date, INTERVAL 14 DAY)
WHERE guarantee_expires_at IS NULL AND start_date IS NOT NULL;
