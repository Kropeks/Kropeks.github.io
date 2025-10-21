-- Ensure favorites table exists for authenticated syncing
CREATE TABLE IF NOT EXISTS user_favorites (
  user_id INT NOT NULL,
  recipe_id INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ensure primary key (user_id, recipe_id)
SET @user_favorites_has_pk := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_favorites'
    AND CONSTRAINT_TYPE = 'PRIMARY KEY'
);

SET @user_favorites_pk_sql := IF(
  @user_favorites_has_pk = 0,
  'ALTER TABLE user_favorites ADD PRIMARY KEY (user_id, recipe_id)',
  'SELECT 1'
);

PREPARE stmt FROM @user_favorites_pk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ensure helper index on recipe_id
SET @user_favorites_recipe_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_favorites'
    AND INDEX_NAME = 'user_favorites_recipe_id_idx'
);

SET @user_favorites_recipe_idx_sql := IF(
  @user_favorites_recipe_idx_exists = 0,
  'CREATE INDEX user_favorites_recipe_id_idx ON user_favorites (recipe_id)',
  'SELECT 1'
);

PREPARE stmt FROM @user_favorites_recipe_idx_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ensure FK to users
SET @user_favorites_fk_user_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_favorites'
    AND CONSTRAINT_NAME = 'user_favorites_user_id_fkey'
);

SET @user_favorites_fk_user_sql := IF(
  @user_favorites_fk_user_exists = 0,
  'ALTER TABLE user_favorites ADD CONSTRAINT user_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);

PREPARE stmt FROM @user_favorites_fk_user_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ensure FK to recipes
SET @user_favorites_fk_recipe_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_favorites'
    AND CONSTRAINT_NAME = 'user_favorites_recipe_id_fkey'
);

SET @user_favorites_fk_recipe_sql := IF(
  @user_favorites_fk_recipe_exists = 0,
  'ALTER TABLE user_favorites ADD CONSTRAINT user_favorites_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);

PREPARE stmt FROM @user_favorites_fk_recipe_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
