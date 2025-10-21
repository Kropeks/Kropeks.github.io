#!/usr/bin/env node

import 'dotenv/config';

import { query, queryOne } from '../src/lib/db.js';
import { getMealById } from '../src/lib/api/mealdb.js';

const DEFAULT_TOP_MEALS = [
  '53013', // Big Mac
  '52772', // Teriyaki Chicken Casserole
  '52874', // Beef and Mustard Pie
  '52977', // Lasagna
  '52844', // Lasagne
  '52819', // Beef Wellington
  '52820', // Chicken Handi
  '52941', // Red Peas Soup
  '52965', // Chicken Alfredo Primavera
  '52802', // Fish pie
];

const parseFavoriteCount = (meal) => {
  const raw = meal?.strMealThumb?.match(/fav-(\d+)/i)?.[1];
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const numericFields = [
    meal?.strMeasure1,
    meal?.strMeasure2,
    meal?.strMeasure3,
    meal?.strMeasure4,
  ]
    .map((value) => {
      const match = `${value ?? ''}`.match(/(\d+)/);
      return match ? Number.parseInt(match[1], 10) : null;
    })
    .filter((value) => Number.isFinite(value));
  if (!numericFields.length) {
    return 0;
  }
  return numericFields.reduce((sum, value) => sum + value, 0);
};

const upsertExternalFavorite = async ({
  externalId,
  favoriteCount,
  mealName,
  mealThumb,
}) => {
  await query(
    `
    INSERT INTO external_recipe_favorites (external_id, favorite_count, meal_name, meal_thumb, updated_at)
    VALUES (?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
      favorite_count = VALUES(favorite_count),
      meal_name = VALUES(meal_name),
      meal_thumb = VALUES(meal_thumb),
      updated_at = NOW()
    `,
    [externalId, favoriteCount, mealName, mealThumb]
  );
};

const ensureTableExists = async () => {
  const row = await queryOne(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'external_recipe_favorites' LIMIT 1"
  );

  if (row) {
    return;
  }

  await query(
    `
    CREATE TABLE external_recipe_favorites (
      external_id VARCHAR(32) PRIMARY KEY,
      favorite_count INT NOT NULL DEFAULT 0,
      meal_name VARCHAR(255) NULL,
      meal_thumb TEXT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
    `
  );
};

const syncMealDbFavorites = async (mealIds = DEFAULT_TOP_MEALS) => {
  await ensureTableExists();

  for (const mealId of mealIds) {
    try {
      const meal = await getMealById(mealId);
      if (!meal) {
        console.warn(`⚠️ MealDB record for ID ${mealId} not found. Skipping.`);
        continue;
      }

      const favoriteCount = parseFavoriteCount(meal);
      await upsertExternalFavorite({
        externalId: mealId,
        favoriteCount,
        mealName: meal?.strMeal ?? null,
        mealThumb: meal?.strMealThumb ?? null,
      });
      console.log(`✅ Synced MealDB recipe ${mealId} (${meal?.strMeal ?? 'Unknown'}) with ${favoriteCount} favorites.`);
    } catch (error) {
      console.error(`❌ Failed to sync MealDB recipe ${mealId}:`, error?.message || error);
    }
  }
};

const parseArguments = () => {
  const [, , ...args] = process.argv;
  if (!args.length) {
    return DEFAULT_TOP_MEALS;
  }
  return args.map((item) => item.trim()).filter(Boolean);
};

(async () => {
  try {
    const mealIds = parseArguments();
    await syncMealDbFavorites(mealIds);
    console.log('🎉 MealDB favorites sync completed.');
    process.exit(0);
  } catch (error) {
    console.error('❌ MealDB favorites sync failed:', error?.message || error);
    process.exit(1);
  }
})();
