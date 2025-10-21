ALTER TABLE user_profiles
  ADD COLUMN admin_title VARCHAR(150) NULL DEFAULT NULL AFTER display_name;
