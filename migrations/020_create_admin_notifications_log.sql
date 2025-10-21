USE savoryflavors;

CREATE TABLE IF NOT EXISTS admin_notifications_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id INT(11) NULL,
  type ENUM('admin_message', 'system') NOT NULL DEFAULT 'admin_message',
  title VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  metadata LONGTEXT DEFAULT NULL CHECK (metadata IS NULL OR JSON_VALID(metadata)),
  target_count INT UNSIGNED NOT NULL,
  created_count INT UNSIGNED NOT NULL,
  notify TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_admin_notifications_log_admin (admin_id),
  KEY idx_admin_notifications_log_created (created_at),
  CONSTRAINT fk_admin_notifications_log_admin FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
