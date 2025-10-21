USE savoryflavors;

CREATE TABLE IF NOT EXISTS user_sessions (
  id INT(11) NOT NULL AUTO_INCREMENT,
  user_id INT(11) NOT NULL,
  session_token VARCHAR(255) NOT NULL,
  last_activity DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  device_info LONGTEXT DEFAULT NULL CHECK (json_valid(device_info)),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uniq_user_sessions_token (session_token),
  KEY idx_user_sessions_user_id (user_id),
  KEY idx_user_sessions_last_activity (last_activity),
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_sessions (
  id INT(11) NOT NULL AUTO_INCREMENT,
  session_id VARCHAR(255) NOT NULL,
  user_id INT(11) DEFAULT NULL,
  session_duration INT NOT NULL DEFAULT 0,
  bounce_rate DECIMAL(5,2) DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_analytics_sessions_created_at (created_at),
  KEY idx_analytics_sessions_user_id (user_id),
  CONSTRAINT fk_analytics_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_traffic (
  id INT(11) NOT NULL AUTO_INCREMENT,
  source VARCHAR(100) NOT NULL,
  visits INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_analytics_traffic_source (source),
  KEY idx_analytics_traffic_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login DATETIME NULL DEFAULT NULL;

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending';
