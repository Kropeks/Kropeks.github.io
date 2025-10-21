-- Migration: Add notes column to audit_logs table
-- Description: Adds a nullable notes column for storing contextual information on audit entries.

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER new_values;
