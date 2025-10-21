ALTER TABLE reports
  MODIFY COLUMN reported_item_type ENUM('recipe', 'comment', 'user', 'community_post') NOT NULL;
