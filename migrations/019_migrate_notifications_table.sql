USE savoryflavors;

-- Ensure no leftover temporary tables
DROP TABLE IF EXISTS notifications_new;

CREATE TABLE notifications_new (
  id VARCHAR(36) NOT NULL,
  user_id INT(11) NOT NULL,
  actor_id INT(11) DEFAULT NULL,
  type ENUM('new_follower','recipe_comment','admin_message','recipe_like','recipe_share','system') NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  metadata LONGTEXT DEFAULT NULL CHECK (metadata IS NULL OR JSON_VALID(metadata)),
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  read_at DATETIME(3) DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX idx_notifications_user_created_at (user_id, created_at),
  INDEX idx_notifications_user_is_read (user_id, is_read),
  INDEX idx_notifications_type (type),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- If an existing notifications table is present, migrate its data
SET @has_notifications := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'notifications'
);

SET @rename_sql := IF(
  @has_notifications > 0,
  'RENAME TABLE notifications TO notifications_legacy;',
  'SELECT 1;'
);
PREPARE rename_stmt FROM @rename_sql;
EXECUTE rename_stmt;
DEALLOCATE PREPARE rename_stmt;

SET @has_legacy := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'notifications_legacy'
);

SET @actor_column := IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'notifications_legacy'
      AND column_name = 'actor_id'
  ),
  'actor_id',
  'NULL'
);

SET @body_column := IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'notifications_legacy'
      AND column_name = 'body'
  ),
  'body',
  IF(
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'notifications_legacy'
        AND column_name = 'message'
    ),
    'message',
    'NULL'
  )
);

SET @metadata_column := IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'notifications_legacy'
      AND column_name = 'metadata'
  ),
  'metadata',
  'NULL'
);

SET @is_read_column := IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'notifications_legacy'
      AND column_name = 'is_read'
  ),
  'is_read',
  '0'
);

SET @read_at_column := IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'notifications_legacy'
      AND column_name = 'read_at'
  ),
  'read_at',
  'NULL'
);

SET @created_at_column := IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'notifications_legacy'
      AND column_name = 'created_at'
  ),
  'created_at',
  'CURRENT_TIMESTAMP(3)'
);

SET @copy_sql := IF(
  @has_legacy > 0,
  CONCAT(
    'INSERT INTO notifications_new (id, user_id, actor_id, type, title, body, metadata, is_read, read_at, created_at) ',
    'SELECT CAST(id AS CHAR(36)), user_id, ', @actor_column, ', type, title, ', @body_column, ', ', @metadata_column,
    ', ', @is_read_column, ', ', @read_at_column, ', ', @created_at_column, ' FROM notifications_legacy;'
  ),
  'SELECT 1;'
);
PREPARE copy_stmt FROM @copy_sql;
EXECUTE copy_stmt;
DEALLOCATE PREPARE copy_stmt;

-- Preserve legacy data for safety; drop only after successful copy
SET @drop_legacy_sql := IF(
  @has_legacy > 0,
  'DROP TABLE notifications_legacy;',
  'SELECT 1;'
);
PREPARE drop_legacy_stmt FROM @drop_legacy_sql;
EXECUTE drop_legacy_stmt;
DEALLOCATE PREPARE drop_legacy_stmt;

RENAME TABLE notifications_new TO notifications;
