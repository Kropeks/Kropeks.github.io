const config = {
  app: {
    name: 'SavoryFlavors',
    description: 'Discover, save, and share amazing recipes',
    url: process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || '',
  },

  api: {
    calorieNinjas: {
      baseURL: process.env.CALORIENINJAS_API_BASE || 'https://api.calorieninjas.com/v1',
      key: process.env.CALORIENINJAS_API_KEY,
    },
    fatsecret: {
      baseURL: process.env.FATSECRET_API_BASE || 'https://platform.fatsecret.com/rest/server.api',
      authURL: process.env.FATSECRET_AUTH_URL || 'https://oauth.fatsecret.com/connect/token',
      clientId: process.env.FATSECRET_CLIENT_ID,
      clientSecret: process.env.FATSECRET_CLIENT_SECRET,
      scope: process.env.FATSECRET_SCOPE || 'basic',
    },
    mealdb: {
      baseURL: 'https://www.themealdb.com/api/json/v1/1',
    },
  },

  paymongo: {
    publicKey: process.env.PAYMONGO_PUBLIC_KEY,
    secretKey: process.env.PAYMONGO_SECRET_KEY,
    baseURL: 'https://api.paymongo.com/v1',
  },

  categories: [
    { id: 'Beef', name: 'Beef', icon: '🥩' },
    { id: 'Chicken', name: 'Chicken', icon: '🍗' },
    { id: 'Seafood', name: 'Seafood', icon: '🐟' },
    { id: 'Vegetarian', name: 'Vegetarian', icon: '🥕' },
    { id: 'Dessert', name: 'Dessert', icon: '🍰' },
    { id: 'Pasta', name: 'Pasta', icon: '🍝' },
  ],

  cuisines: [
    { id: 'American', name: 'American', flag: '🇺🇸' },
    { id: 'British', name: 'British', flag: '🇬🇧' },
    { id: 'Canadian', name: 'Canadian', flag: '🇨🇦' },
    { id: 'Chinese', name: 'Chinese', flag: '🇨🇳' },
    { id: 'Dutch', name: 'Dutch', flag: '🇳🇱' },
    { id: 'Egyptian', name: 'Egyptian', flag: '🇪🇬' },
    { id: 'French', name: 'French', flag: '🇫🇷' },
    { id: 'Greek', name: 'Greek', flag: '🇬🇷' },
    { id: 'Indian', name: 'Indian', flag: '🇮🇳' },
    { id: 'Italian', name: 'Italian', flag: '🇮🇹' },
    { id: 'Japanese', name: 'Japanese', flag: '🇯🇵' },
    { id: 'Malaysian', name: 'Malaysian', flag: '🇲🇾' },
    { id: 'Mexican', name: 'Mexican', flag: '🇲🇽' },
    { id: 'Moroccan', name: 'Moroccan', flag: '🇲🇦' },
    { id: 'Russian', name: 'Russian', flag: '🇷🇺' },
    { id: 'Spanish', name: 'Spanish', flag: '🇪🇸' },
    { id: 'Thai', name: 'Thai', flag: '🇹🇭' },
    { id: 'Turkish', name: 'Turkish', flag: '🇹🇷' },
    { id: 'Vietnamese', name: 'Vietnamese', flag: '🇻🇳' },
  ],

  dietaryRestrictions: [
    { id: 'vegetarian', name: 'Vegetarian' },
    { id: 'vegan', name: 'Vegan' },
    { id: 'gluten-free', name: 'Gluten Free' },
    { id: 'keto', name: 'Keto' },
    { id: 'low-carb', name: 'Low Carb' },
    { id: 'dairy-free', name: 'Dairy Free' },
    { id: 'nut-free', name: 'Nut Free' },
  ],
}

export default config
