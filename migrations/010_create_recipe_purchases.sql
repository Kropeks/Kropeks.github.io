-- Migration: Create recipe_purchases table (reference: savoryflavors (3).sql)
-- Run with whichever migration process you use (e.g., mysql < migrations/010_create_recipe_purchases.sql)

CREATE TABLE IF NOT EXISTS recipe_purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    recipe_id INT NOT NULL,
    amount_paid DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    transaction_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
    UNIQUE KEY unique_purchase (user_id, recipe_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_recipe_purchases_user ON recipe_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_purchases_recipe ON recipe_purchases(recipe_id);
