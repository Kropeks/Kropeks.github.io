CREATE TABLE IF NOT EXISTS memory_game_leaderboard (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  moves INT UNSIGNED NOT NULL,
  time_seconds INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_memory_game_leaderboard_ordering ON memory_game_leaderboard (moves, time_seconds, created_at);
