-- Adds columns and tables needed for profile management workflows
USE savoryflavors;

-- Ensure user_profiles table has storage for additional profile metadata
ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) AFTER user_id,
    ADD COLUMN IF NOT EXISTS location VARCHAR(255) AFTER bio,
    ADD COLUMN IF NOT EXISTS notification_preferences JSON AFTER dietary_restrictions,
    ADD COLUMN IF NOT EXISTS dietary_preferences JSON AFTER notification_preferences,
    ADD COLUMN IF NOT EXISTS meal_planning_cadence VARCHAR(50) DEFAULT 'manual' AFTER dietary_preferences;

-- Stores security controls managed from the profile modal
CREATE TABLE IF NOT EXISTS user_security_settings (
    user_id INT NOT NULL,
    two_factor_enabled TINYINT(1) DEFAULT 0,
    backup_email VARCHAR(255),
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id),
    CONSTRAINT fk_user_security_settings_profile FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
