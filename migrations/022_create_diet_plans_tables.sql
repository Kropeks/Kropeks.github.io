-- Migration 022: Create diet plan tables
-- Run against your FitSavory database before using the diet plan features.

CREATE TABLE IF NOT EXISTS diet_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  goal ENUM('weight_loss', 'weight_gain', 'maintain_weight', 'build_muscle', 'improve_health', 'other') NOT NULL,
  plan_type ENUM('standard', 'keto', 'mediterranean', 'paleo', 'vegan', 'custom') DEFAULT 'standard',
  start_date DATE NOT NULL,
  end_date DATE,
  target_weight_kg DECIMAL(5, 2),
  daily_calories INT NOT NULL,
  protein_g DECIMAL(5, 2),
  carbs_g DECIMAL(5, 2),
  fat_g DECIMAL(5, 2),
  status ENUM('active', 'paused', 'completed', 'cancelled') DEFAULT 'active',
  progress_percentage DECIMAL(5, 2) DEFAULT 0.0,
  total_days INT DEFAULT 0,
  completed_days INT DEFAULT 0,
  adherence_rate DECIMAL(5, 2) DEFAULT 0.0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_diet_plans_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_diet_plans_user_id (user_id),
  INDEX idx_diet_plans_goal (goal),
  INDEX idx_diet_plans_status (status),
  INDEX idx_diet_plans_date_range (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS diet_plan_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  diet_plan_id INT NOT NULL,
  user_id INT NOT NULL,
  log_date DATE NOT NULL,
  weight_kg DECIMAL(5, 2),
  calories_consumed INT,
  calories_burned INT,
  protein_g DECIMAL(5, 2),
  carbs_g DECIMAL(5, 2),
  fat_g DECIMAL(5, 2),
  water_ml INT,
  workout_duration_minutes INT,
  sleep_hours DECIMAL(3, 1),
  energy_level INT CHECK (energy_level >= 1 AND energy_level <= 10),
  mood ENUM('very_bad', 'bad', 'neutral', 'good', 'very_good'),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_diet_plan_logs_plan
    FOREIGN KEY (diet_plan_id) REFERENCES diet_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_diet_plan_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_diet_plan_logs_plan_id (diet_plan_id),
  INDEX idx_diet_plan_logs_user_id (user_id),
  INDEX idx_diet_plan_logs_log_date (log_date),
  UNIQUE KEY unique_diet_plan_log (diet_plan_id, log_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
