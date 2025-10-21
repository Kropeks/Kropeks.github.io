-- Migration 024: Align diet plan logs with wellness metrics
-- Adds missing hydration and recovery fields and indexes for analytics

ALTER TABLE diet_plan_logs
  ADD COLUMN IF NOT EXISTS water_ml INT,
  ADD COLUMN IF NOT EXISTS workout_duration_minutes INT,
  ADD COLUMN IF NOT EXISTS sleep_hours DECIMAL(3,1),
  ADD COLUMN IF NOT EXISTS energy_level INT,
  ADD COLUMN IF NOT EXISTS mood ENUM('very_bad','bad','neutral','good','very_good'),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD INDEX IF NOT EXISTS idx_diet_plan_logs_water (water_ml),
  ADD INDEX IF NOT EXISTS idx_diet_plan_logs_sleep (sleep_hours),
  ADD INDEX IF NOT EXISTS idx_diet_plan_logs_energy (energy_level);
