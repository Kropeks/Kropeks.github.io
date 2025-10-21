# SavoryFlavors - Recipe Management System

A modern recipe and meal-planning platform built with Next.js, MySQL, and Tailwind CSS. Use it to discover, save, and plan meals with nutrition data and subscription-aware experiences.

## 🚀 Features

- **Recipe Discovery**: Pull rich recipe details, filtering, and imports from TheMealDB with nutrition enrichment in `src/lib/recipeAPI.js`
- **Favorites Sync**: Persist favorites client-side and in MySQL with optimistic updates powered by `src/context/FavoritesContext.js`
- **FitSavory Premium**: Subscription-gated meal-planning dashboard (`src/app/fitsavory/page.js`) with dynamic nutrition goals and API-driven plans
- **Admin Operations**: Interactive analytics dashboard (`src/app/admin/page.jsx`) plus tools for recipe approvals, refunds, and notifications
- **Nutrition Integrations**: Combine CalorieNinjas data with FatSecret fallbacks to compute macros and health scores
- **Real-time Notifications**: WebSocket-powered alerts via `scripts/notification-server.js` and admin broadcast utilities
- **Robust MySQL Schema**: Extensive SQL migrations covering auditing, subscriptions, achievements, and nutrition tracking (see `database_schema.sql` & `migrations/`)

## 🛠️ Tech Stack

### Frontend
- **Next.js 15** - App Router experience with client/server components
- **React 18.3** - Hooks-first UI architecture
- **Tailwind CSS** - Utility-first styling with custom olive palette
- **Lucide React & Framer Motion** - Polished iconography and micro-interactions
- **JavaScript** - Plain JS/JSX for faster iteration

### Backend
- **Next.js API Routes** - Modular endpoints under `src/app/api/`
- **mysql2** - Direct pooling and transactions handled in `src/lib/db.js`
- **NextAuth.js** - Credentials login with guest flow toggle
- **Axios** - External API integrations, PayMongo hooks, and async utilities

### External APIs
- **TheMealDB** - Free recipe catalog powering discovery & imports
- **CalorieNinjas** - Primary nutrition lookup source
- **FatSecret** (optional) - Supplemental macro data when credentials exist
- **PayMongo** (optional) - Philippines-focused subscription billing

### Additional Libraries
- **React Hook Form & Zod** - Form handling and validation in admin flows
- **bcryptjs** - Password hashing for credential auth
- **@auth/core** - Shared NextAuth utilities
- **concurrently** - Run Next.js, admin, and websocket servers side by side
- **ws** - Real-time notification channel support

## 🍳 External Recipe Import

Admins can import recipes from external sources like TheMealDB directly into the application:

1. Navigate to the Admin Dashboard > Recipes
2. Click "Import from External"
3. Search for recipes by name, cuisine, or ingredient
4. Click "Import Recipe" to add it to your database

### Features
- Search and preview recipes before importing
- Automatic mapping of ingredients and instructions
- Preserves original recipe information and attribution
- Support for recipe images and categories

## 📋 Prerequisites

- Node.js 18+ and npm
- MySQL 8.0+ (local or managed)
- API keys for CalorieNinjas, FatSecret, PayMongo (optional but recommended)

## 🏗️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd savory-flavors
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Copy environment template**
   ```bash
   cp .env.example .env.local
   ```

   Update `.env.local` with your credentials:
   ```env
   # Database
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your-password
   DB_NAME=savoryflavors
   DB_PORT=3306

   # NextAuth
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your-secret-key-here

   # Optional integrations
   CALORIENINJAS_API_KEY=your-calorie-ninjas-key
   FATSECRET_CLIENT_ID=your-fatsecret-client-id
   FATSECRET_CLIENT_SECRET=your-fatsecret-secret
   PAYMONGO_PUBLIC_KEY=pk_test_your-paymongo-public-key
   PAYMONGO_SECRET_KEY=sk_test_your-paymongo-secret-key

   # Toggle guest access / auth overrides
   DISABLE_AUTH=false
   ```

4. **Prepare the database**
   ```bash
   # create database if it does not yet exist
   mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS savoryflavors;"

   # load the full schema (tables, views, routines)
   mysql -u root -p savoryflavors < database_schema.sql

   # alternatively, run the guided script
   node setup_database.js
   ```
   Need a minimal schema? import `database_schema_enhanced.sql` or apply the SQL files in `migrations/` sequentially.

5. **Smoke-test connectivity**
   ```bash
   node test-db-connection.js
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```

   Visit [http://localhost:3000](http://localhost:3000) and the admin portal at [http://localhost:3000/admin](http://localhost:3000/admin).

## 🗄️ Database Configuration

### Prerequisites
- **XAMPP** installed and running
- **MySQL** service started in XAMPP Control Panel
- **savoryflavors** database created

### Environment Variables
Update your `.env` file with these settings for XAMPP:

```env
# Database Configuration
DATABASE_URL="mysql://root:password@localhost:3306/savoryflavors"

# Individual Settings (for direct connection)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=password
DB_NAME=savoryflavors
DB_PORT=3306
```

### Database Connection Helpers

1. **`src/lib/db.js`** – Connection pool, query helpers, graceful shutdown
2. **`src/lib/db-init.js`** – Optional schema validation checks
3. **`src/app/api/test-db/route.js`** – API endpoint to validate connectivity
4. **`test-db-connection.js`** – CLI smoke test for the MySQL pool

### Test Database Connection

- **CLI**
  ```bash
  node test-db-connection.js
  ```
- **HTTP endpoint**
  ```bash
  npm run dev
  # then open
  http://localhost:3000/api/test-db
  ```

### Expected Output
```
🚀 Starting SavoryFlavors Database Connection Test...

🔄 Initializing database connection...
✅ Database connected successfully!
📊 Connected to: savoryflavors

🎉 Database connection test completed successfully!
✅ You can now start your Next.js application
💡 Run: npm run dev
```

### Troubleshooting

**If connection fails:**
1. ✅ Check XAMPP Control Panel - MySQL should be running
2. ✅ Verify database exists: `mysql -u root -e "SHOW DATABASES;"`
3. ✅ Check .env file configuration
4. ✅ Try: `mysql -u root -h localhost -P 3306`

**Common Issues:**
- **"Access denied"** → Check password in .env file
- **"Connection refused"** → Start MySQL in XAMPP Control Panel
- **"Unknown database"** → Create database: `CREATE DATABASE savoryflavors;`

### Troubleshooting XAMPP MySQL Connection

#### **Problem: "Access denied for user 'root'@'localhost'"**

**Solution 1: Test Different Passwords**
```bash
node xampp-mysql-test.js
```
This script will test common XAMPP passwords automatically.

**Solution 2: Reset MySQL Root Password**
1. **Stop MySQL** in XAMPP Control Panel
2. **Open Command Prompt as Administrator**
3. **Navigate to MySQL bin directory**:
   ```cmd
   cd C:\xampp\mysql\bin
   ```
4. **Start MySQL with skip-grant-tables**:
   ```cmd
   mysqld --skip-grant-tables
   ```
5. **Open new Command Prompt** and connect:
   ```cmd
   mysql -u root
   ```
6. **Reset password**:
   ```sql
   USE mysql;
   UPDATE user SET authentication_string = PASSWORD('') WHERE User = 'root';
   UPDATE user SET plugin = 'mysql_native_password' WHERE User = 'root';
   FLUSH PRIVILEGES;
   ```
7. **Stop MySQL** and restart XAMPP Control Panel

**Solution 3: Check MySQL Service**
```cmd
# Check if MySQL is running on port 3306
netstat -an | find "3306"

# Or check listening ports
netstat -an | findstr LISTENING | find "3306"
```

**Solution 4: Manual Connection Test**
```cmd
# Test with empty password
mysql -u root -h localhost -P 3306

# Test with different passwords
mysql -u root -p -h localhost -P 3306
```

#### **Common XAMPP Passwords to Try:**
- **Empty** (most common)
- `root`
- `password`
- `admin`
- `xampp`

#### **If Still Failing:**

1. **Check XAMPP Installation:**
   - Verify XAMPP is installed in `C:\xampp\`
   - Check if MySQL is in `C:\xampp\mysql\`

2. **Check Windows Services:**
   ```cmd
   services.msc
   ```
   Look for MySQL services

3. **Check for Port Conflicts:**
   ```cmd
   netstat -an | find "3306"
   ```

4. **Reinstall XAMPP MySQL:**
   - Stop XAMPP
   - Delete `C:\xampp\mysql\` folder
   - Reinstall MySQL through XAMPP

#### **Quick Fix Commands:**
```bash
# Test connection
mysql -u root -e "SELECT 1;"

# Create database if missing
mysql -u root -e "CREATE DATABASE IF NOT EXISTS savoryflavors;"

# Check databases
mysql -u root -e "SHOW DATABASES;"
```

### Next Steps

1. **Run optional setup script**
   ```bash
   ./setup_database.sh
   ```
2. **Verify DB connectivity** using `node test-db-connection.js`
3. **Start the app** with `npm run dev`
4. **Explore premium surfaces** at `/fitsavory`, `/admin`, `/pricing`

### Database Schema
Your database now includes **24 comprehensive tables** for:
- ✅ User management & authentication
- ✅ Recipe management with nutrition data
- ✅ Complete FitSavory nutrition tracking
- ✅ Meal planning & diet management
- ✅ Progress tracking & achievements
- ✅ Calendar & scheduling features

### Nutrition API Integration

#### **🔍 Food & Nutrition APIs Integrated:**
1. **CalorieNinjas API** – Detailed nutrition information for free-text queries
2. **FatSecret** (optional) – Macro enrichment for premium recipes

#### **📊 API Endpoints:**
- **`/api/nutrition/search`** – Search foods with combined data sources
- **`/api/nutrition/lookup`** – Direct lookup by food name
- **`/api/nutrition/meal-calculate`** – Macro scoring with recommendations
- **`/api/nutrition/test`** – Health-check endpoint for integrations
- **Deprecated:** `/api/nutrition/barcode` (returns HTTP 410)

### Environment Variables Required

```env
# Nutrition APIs
CALORIENINJAS_API_KEY=your-calorie-ninjas-api-key
```

### API Usage Examples

#### **1. Search Foods**
```bash
# Search for foods
curl "http://localhost:3000/api/nutrition/search?query=apple&limit=5"

# Response includes nutrition data from multiple sources
{
  "success": true,
  "query": "apple",
  "count": 3,
  "foods": [
    {
      "id": "apple",
      "name": "Apple",
      "category": "Fruits",
      "source": "calorieninjas"
    }
  ],
  "apis": {
    "calorieNinjas": {
      "available": true,
      "nutritionData": {
        "name": "Apple",
        "calories": 78,
        "protein": 0.4,
        "carbs": 21,
        "fat": 0.3,
        "fiber": 3.6,
        "sugar": 15.6,
        "sodium": 1,
        "potassium": 159,
        "servingSize": 150,
        "servingUnit": "g"
      },
      "macros": {
        "protein": 2,
        "carbs": 95,
        "fat": 3
      }
    }
  }
}
```

#### **3. Calculate Meal Nutrition**
```bash
# Calculate nutrition with health recommendations
curl -X POST "http://localhost:3000/api/nutrition/meal-calculate" \
  -H "Content-Type: application/json" \
  -d '{
    "foodName": "grilled chicken breast",
    "servingSize": 200,
    "servingUnit": "g"
  }'

# Response includes nutrition analysis and suggestions
{
  "success": true,
  "mealEntry": {
    "foodName": "Grilled Chicken Breast",
    "calories": 330,
    "protein": 62,
    "carbs": 0,
    "fat": 7.2,
    "nutritionScore": {
      "protein": "high",
      "fiber": "medium",
      "sugar": "low",
      "sodium": "low"
    },
    "recommendations": {
      "isHealthy": true,
      "suggestions": []
    }
  }
}
```

#### **4. Test Nutrition APIs**
```bash
# Test all integrated APIs
curl "http://localhost:3000/api/nutrition/test?test=apple"

# Response shows which APIs are working
{
  "success": true,
  "results": {
    "testFood": "apple",
    "apis": {
      "spoonacular": { "available": true, "foodsFound": 5 },
      "calorieNinjas": { "available": true, "nutritionData": {...} },
      "edamam": { "available": true, "foodsFound": 3 }
    }
  }
}
```

### Integration Features

#### **🔄 Automatic Nutrition Lookup**
- **CalorieNinjas Integration**: Ingredient-based nutrient extraction
- **FatSecret Fallbacks**: Enrich macros when premium credentials exist
- **Serving Size Normalization**: Converts common units for consistent totals
- **Fallback Estimates**: Provides baseline estimates when all APIs miss

#### **📱 Enhanced Meal Entry**
- **Auto-nutrition**: Nutrition data automatically populated when adding foods
- **Health Scoring**: Each food gets nutrition quality assessment
- **Recommendations**: Personalized suggestions for better nutrition
- **Macro Tracking**: Real-time macronutrient percentage calculation

#### **📊 Nutrition Analysis**
- **Recipe Analysis**: Calculate total nutrition for entire recipes
- **Daily Summaries**: Enhanced daily nutrition tracking with API data
- **Quality Assessment**: Rate nutrition quality based on macro balance
- **Progress Insights**: Track nutrition trends over time

### API Keys Setup

#### **Get API Keys:**
1. **CalorieNinjas**: https://calorieninjas.com/
2. **FatSecret**: https://platform.fatsecret.com/

#### **Rate Limits:**
- **CalorieNinjas**: 100 requests/hour (free tier)

### Error Handling

#### **Graceful Degradation:**
- If one API fails, system automatically tries others
- Fallback to manual entry if all APIs fail
- Clear error messages with suggestions

#### **Common Issues:**
- **API Key Missing**: Clear message about which API key is needed
- **Rate Limit Exceeded**: Automatic retry with exponential backoff
- **Network Issues**: Timeout handling with fallback options

### Next Steps

1. **Get API Keys**: Sign up for the nutrition APIs listed above
2. **Test Integration**: Use `/api/nutrition/test?test=apple` to verify setup
3. **Try Food Search**: Test with `/api/nutrition/search?query=chicken`
4. **Meal Integration**: Use meal calculation with nutrition recommendations

### Integration Benefits

- ✅ **Accurate Nutrition**: Real-time nutrition data from authoritative sources
- ✅ **Smart Suggestions**: Personalized nutrition recommendations
- ✅ **Recipe Analysis**: Complete nutrition breakdown for recipes
- ✅ **Health Insights**: Nutrition quality scoring and macro tracking
- ✅ **User Experience**: Automatic nutrition calculation reduces manual entry

## 📁 Project Structure

```
savory-flavors/
├── src/
│   ├── app/                     # App Router routes, admin + premium dashboards
│   │   ├── api/                # REST-ish API endpoints (favorites, nutrition, meal-planner, etc.)
│   │   ├── favorites/          # Saved recipe UI with purchase modal
│   │   ├── fitsavory/          # Premium meal planner experience
│   │   ├── admin/              # Analytics dashboards & management tools
│   │   └── auth/               # Sign-in / sign-up / guest flows
│   ├── components/             # Reusable UI elements and modals
│   ├── config/                 # Shared runtime configuration (`app.js`)
│   ├── context/                # React contexts (favorites, notifications, pricing)
│   └── lib/                    # Data access, API wrappers, PayMongo helpers
├── migrations/                 # Raw SQL migrations for MySQL features
├── scripts/                    # Utility scripts (schema checks, notifications)
├── database_schema.sql         # Primary schema import
├── database_schema_enhanced.sql# Extended schema variant
└── package.json                # Scripts & dependencies
```

## 🎯 Key Features Implemented

### ✅ Completed Features
- **Modern UI/UX**: Responsive design system with themed cards, charts, and modals
- **Recipe Discovery**: MealDB-driven discovery with nutrition enrichment
- **Favorites System**: Authenticated sync, optimistic removal, premium purchase modal
- **FitSavory Planner**: Subscription-gated weekly plans with macro dashboards
- **Admin Suite**: Analytics charts, refunds, notifications, and subscription oversight
- **Nutrition APIs**: CalorieNinjas + FatSecret integrations baked in
- **Subscription Billing**: PayMongo-ready flow for premium upgrades

### 🔄 Ready for Implementation / Expansion
- **Recommendation Engine**: TensorFlow.js embeddings groundwork in place
- **Advanced Search**: AI-enhanced search & filtering scaffolding
- **Community Recipes**: Extend CMS workflows for approval queues

## 🔧 API Endpoints

### Recipes & Discovery
- `GET /api/external/recipes` – Fetch MealDB-backed recipes with filtering
- `GET /api/mealdb` – Cuisines, categories, and raw MealDB helpers
- `GET /api/search` – Unified search entry point

### Favorites & Community
- `GET /api/favorites` – Authenticated list of saved recipes
- `POST /api/favorites` – Save a recipe (handles optimistic sync)
- `DELETE /api/favorites/:id` – Remove a favorite recipe
- `GET /api/community/...` – Community recipe utilities (see folder for details)

### FitSavory & Subscriptions
- `GET /api/meal-planner` – Fetch latest generated plan
- `POST /api/meal-planner` – Generate new plan with nutrition targets
- `GET|POST|DELETE /api/user/subscription` – Subscription lifecycle management
- `POST /api/payment/...` – PayMongo billing + webhook handlers

### Nutrition
- `GET /api/nutrition/search|lookup|meal-calculate|test`

### Notifications
- `POST /api/notifications/broadcast` – Admin broadcast to websocket clients
- `GET /api/notifications` – Fetch user notifications

## 🎨 Design System

### Colors
- **Primary**: Olive Green (#6B8E23)
- **Secondary**: Various shades of green and earth tones
- **Accent**: Complementary colors for highlights

### Typography
- **Headings**: Geist Sans (bold, modern)
- **Body**: Geist Sans (clean, readable)
- **Special**: Geist Mono for code/technical text

### Components
- **Cards**: Rounded corners, subtle shadows, hover effects
- **Buttons**: Primary (olive), secondary (outline), ghost styles
- **Forms**: Clean inputs with focus states and validation
- **Icons**: Lucide React icon library

## 🚀 Deployment

### Environment Setup
1. Configure production environment variables (`DB_*`, `NEXTAUTH_*`, API keys)
2. Provision a production MySQL instance and import `database_schema.sql`
3. Apply any newer SQL scripts from `migrations/`
4. Build the application: `npm run build`
5. Start production server: `npm start`

### Recommended Platforms
- **Frontend**: Vercel, Netlify
- **Database**: AWS RDS, PlanetScale, Railway
- **APIs**: Keep as serverless functions or move to dedicated backend

## 📚 Database Schema

The application uses a comprehensive MySQL schema with the following main entities:

- **Users**: Authentication and profile information
- **Recipes**: Recipe data with relationships
- **Categories & Cuisines**: Recipe classification
- **Ingredients**: Recipe ingredients with measurements
- **Nutrition**: Detailed nutritional information
- **Favorites**: User favorite recipes
- **Reviews**: Recipe ratings and reviews
- **Payments**: Payment processing data

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Align changes with the conventions in `src/app/` and `migrations/`
4. Run targeted tests or linting when applicable
5. Submit a pull request with context on API/DB updates

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Next.js** for the App Router framework
- **Tailwind CSS** for the utility-first design system
- **Lucide React** for iconography
- **CalorieNinjas & TheMealDB** for open APIs powering nutrition and discovery

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the API documentation

---

**Happy Cooking! 🍳👨‍🍳**

## 🍽️ **Complete MealDB API Reference - FREE Endpoints**

### **📊 API Overview:**
- **Base URL:** `https://www.themealdb.com/api/json/v1/1/`
- **Format:** JSON
- **Rate Limit:** No official limit mentioned (be reasonable)
- **Authentication:** None required ✅

---

### **🔍 Search & Filter Endpoints:**

#### **1. Search by Recipe Name**
```javascript
GET /search.php?s={query}
// Example: /search.php?s=chicken
```
- **Purpose:** Search recipes by name
- **Returns:** Array of meals matching the search term
- **Use Case:** Recipe search functionality

#### **2. Filter by Category**
```javascript
GET /filter.php?c={category}
// Example: /filter.php?c=Seafood
```
- **Purpose:** Get recipes by category (Beef, Chicken, Dessert, etc.)
- **Returns:** Basic meal info (no full details)
- **Use Case:** Category-based recipe browsing

#### **3. Filter by Cuisine/Area**
```javascript
GET /filter.php?a={area}
// Example: /filter.php?a=Italian
```
- **Purpose:** Get recipes by cuisine/area
- **Returns:** Basic meal info (no full details)
- **Use Case:** Cuisine-based recipe discovery

#### **4. Filter by Main Ingredient**
```javascript
GET /filter.php?i={ingredient}
// Example: /filter.php?i=chicken
```
- **Purpose:** Get recipes containing specific ingredient
- **Returns:** Basic meal info (no full details)
- **Use Case:** Ingredient-based recipe search

---

### **📋 List & Lookup Endpoints:**

#### **5. Get Single Recipe by ID**
```javascript
GET /lookup.php?i={meal_id}
// Example: /lookup.php?i=52772
```
- **Purpose:** Get complete recipe details by ID
- **Returns:** Full meal object with all details
- **Use Case:** Recipe detail pages

#### **6. Get All Categories**
```javascript
GET /categories.php
```
- **Purpose:** Get list of all meal categories
- **Returns:** Array of category objects
- **Use Case:** Category filter dropdown

#### **7. Get All Cuisines/Areas**
```javascript
GET /list.php?a=list
```
- **Purpose:** Get list of all available cuisines
- **Returns:** Array of area objects
- **Use Case:** Cuisine filter dropdown

#### **8. Get All Ingredients**
```javascript
GET /list.php?i=list
```
- **Purpose:** Get list of all ingredients
- **Returns:** Array of ingredient objects
- **Use Case:** Ingredient search/filter

---

### **🎲 Random & Special Endpoints:**

#### **9. Get Random Recipe**
```javascript
GET /random.php
```
- **Purpose:** Get a random recipe
- **Returns:** Single random meal object
- **Use Case:** "Recipe of the Day" feature

#### **10. Get Latest Recipes**
```javascript
GET /latest.php
```
- **Purpose:** Get recently added recipes
- **Returns:** Array of latest meals
- **Use Case:** New recipes section

---

### **📊 Response Data Structure:**

#### **Basic Meal Object (from filter endpoints):**
```json
{
  "idMeal": "52772",
  "strMeal": "Teriyaki Chicken Casserole",
  "strDrinkAlternate": null,
  "strCategory": "Chicken",
  "strArea": "Japanese",
  "strInstructions": "...",
  "strMealThumb": "https://www.themealdb.com/images/media/meals/wvpsxx1468256321.jpg",
  "strTags": "Meat,Casserole",
  "strYoutube": "https://www.youtube.com/watch?v=4aZr5hZXP_s",
  // ... ingredients strIngredient1-20
  // ... measures strMeasure1-20
}
```

#### **Category Object:**
```json
{
  "idCategory": "1",
  "strCategory": "Beef",
  "strCategoryThumb": "https://www.themealdb.com/images/category/beef.png",
  "strCategoryDescription": "Beef is the culinary name for meat from cattle..."
}
```

#### **Area/Cuisine Object:**
```json
{
  "strArea": "American"
}
```

---

### **🚀 Implementation Status:**

#### **✅ Already Implemented:**
- ✅ `searchRecipesByNameMealDB()` - Search by name
- ✅ `getRecipesByCategoryMealDB()` - Filter by category
- ✅ `getRecipesByAreaMealDB()` - Filter by cuisine
- ✅ `getRandomRecipesMealDB()` - Random recipes
- ✅ `getRecipeByIdMealDB()` - Get single recipe
- ✅ `transformMealDBRecipe()` - Data transformation

#### **✅ Ready to Implement:**
- ✅ `getCategoriesMealDB()` - Get all categories
- ✅ `getAreasMealDB()` - Get all cuisines
- ✅ `getIngredientsMealDB()` - Get all ingredients
- ✅ `searchByIngredientMealDB()` - Search by ingredient
- ✅ `getLatestRecipesMealDB()` - Latest recipes
- ✅ `getPopularRecipesMealDB()` - Popular recipes

---

### **💡 Usage Examples:**

#### **For Recipe Search:**
```javascript
// Search for chicken recipes
const chickenRecipes = await recipeAPI.searchRecipesByNameMealDB('chicken')

// Get recipes by category
const beefRecipes = await recipeAPI.getRecipesByCategoryMealDB('Beef')

// Get recipes by cuisine
const italianRecipes = await recipeAPI.getRecipesByAreaMealDB('Italian')
```

#### **For Filters & Navigation:**
```javascript
// Get all categories for filter dropdown
const categories = await recipeAPI.getCategoriesMealDB()

// Get all cuisines for filter dropdown
const cuisines = await recipeAPI.getAreasMealDB()

// Get all ingredients for autocomplete
const ingredients = await recipeAPI.getIngredientsMealDB()
```

#### **For Dynamic Content:**
```javascript
// Get random recipe for featured section
const randomRecipe = await recipeAPI.getRandomRecipesMealDB(1)

// Get latest recipes
const latestRecipes = await recipeAPI.getLatestRecipesMealDB(5)
```

---

### **🎯 Integration Benefits:**

1. **✅ Completely Free** - No API keys required
2. **✅ Rich Data** - Complete recipe information
3. **✅ Global Cuisines** - 25+ countries represented
4. **✅ Images Included** - Recipe photos provided
5. **✅ Structured Data** - Consistent JSON format
6. **✅ No Rate Limits** - Reliable for production use
7. **✅ Video Links** - YouTube tutorials included
8. **✅ Multiple Search Options** - Name, category, cuisine, ingredient

---

### **🔧 Next Steps:**

Would you like me to:
1. **Add the remaining MealDB methods** to complete the integration?
2. **Create enhanced filter pages** using these endpoints?
3. **Build a comprehensive recipe discovery system** using all these APIs?
4. **Add ingredient-based search** functionality?

The MealDB API provides excellent free data for recipe applications! 🍽️✨
"# SavoryFlavorsDelight" 
"# SAVORY-FLAVORS-BACKUPPLAN" 
"# savoryflavors" 
"# BACKUP-SAVORY-FLAVORS-main" 
