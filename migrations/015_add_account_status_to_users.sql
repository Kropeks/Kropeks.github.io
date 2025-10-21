-- Add account_status column to users if it does not exist
ALTER TABLE users
ADD COLUMN IF NOT EXISTS account_status ENUM('pending', 'active', 'suspended') NOT NULL DEFAULT 'pending';

-- Backfill account_status based on existing is_verified flag if not already set
UPDATE users
SET account_status = CASE
    WHEN is_verified = 1 THEN 'active'
    ELSE 'pending'
END
WHERE account_status IS NULL OR account_status = '';

-- Ensure currently suspended users remain inactive (for idempotency, only run if column exists)
UPDATE users
SET is_verified = 0
WHERE account_status = 'suspended' AND is_verified <> 0;

-- Add index to speed up admin filtering
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users (account_status);
