CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    actor_id VARCHAR(36),
    type ENUM(
        'new_follower',
        'recipe_comment',
        'admin_message',
        'recipe_like',
        'recipe_share',
        'system'
    ) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    metadata JSON,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_notifications_user_created_at (user_id, created_at DESC),
    INDEX idx_notifications_user_is_read (user_id, is_read),
    INDEX idx_notifications_type (type)
);
