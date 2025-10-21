'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthModal } from '@/components/AuthProvider';
import { useFavorites } from '@/context/FavoritesContext';
import { usePricingModal } from '@/context/PricingModalContext.jsx';
import {
  Plus,
  ChefHat,
  Loader2,
  ArrowRight,
  Utensils,
  Sparkles,
  Users,
  Clock,
  Heart
} from 'lucide-react';

const ADDITIONAL_CATEGORY_NAMES = [
  'Appetizer',
  'Beverages',
  'Bread',
  'Brunch',
  'Comfort Food',
  'Grilled',
  'Healthy',
  'Holiday',
  'Quick & Easy',
  'Salad',
  'Slow Cooker',
  'Snack',
  'Soup',
  'Stew',
  'Sweet Treats'
];

const ADDITIONAL_CATEGORY_DETAILS = {
  Appetizer: {
    description: 'Small plates and shareable bites to start every meal.'
  },
  Beverages: {
    description: 'Refreshing drinks to pair perfectly with any dish.'
  },
  Bread: {
    description: 'Freshly baked loaves, rolls, and savory breads.'
  },
  Brunch: {
    description: 'Late-morning favorites that bridge breakfast and lunch.'
  },
  'Comfort Food': {
    description: 'Cozy classics perfect for relaxing nights in.'
  },
  Grilled: {
    description: 'Smoky charred dishes hot off the grill.'
  },
  Healthy: {
    description: 'Nutritious choices for balanced and mindful eating.'
  },
  Holiday: {
    description: 'Festive dishes to make celebrations unforgettable.'
  },
  'Quick & Easy': {
    description: 'Flavor-packed meals ready in minutes when time is short.'
  },
  Salad: {
    description: 'Fresh combinations of greens, grains, and vibrant toppings.'
  },
  'Slow Cooker': {
    description: 'Set-it-and-forget-it comfort meals cooked low and slow.'
  },
  Snack: {
    description: 'Tasty bites to keep you energized between meals.'
  },
  Soup: {
    description: 'Warm bowls of hearty comfort and soothing flavors.'
  },
  Stew: {
    description: 'Rich, simmered dishes packed with depth and warmth.'
  },
  'Sweet Treats': {
    description: 'Sugary delights for every sweet tooth moment.'
  }
};

const getCategoryDescription = (name) => {
  if (ADDITIONAL_CATEGORY_DETAILS[name]) {
    return ADDITIONAL_CATEGORY_DETAILS[name].description;
  }
  return `Discover delicious ${name} recipes curated for you.`;
};

const getCategoryIcon = (name) => {
  const baseClass = 'w-6 h-6 text-green-600 dark:text-green-400';
  const label = name.toLowerCase();

  if (label.includes('dessert') || label.includes('sweet')) {
    return <Sparkles className={baseClass} />;
  }
  if (label.includes('quick') || label.includes('easy') || label.includes('fast')) {
    return <Clock className={baseClass} />;
  }
  if (
    label.includes('healthy') ||
    label.includes('salad') ||
    label.includes('veggie') ||
    label.includes('vegan') ||
    label.includes('vegetarian')
  ) {
    return <Plus className={`${baseClass} rotate-45`} />;
  }
  if (label.includes('soup') || label.includes('stew') || label.includes('snack') || label.includes('appetizer')) {
    return <Utensils className={baseClass} />;
  }
  if (label.includes('grill') || label.includes('bbq')) {
    return <ChefHat className={baseClass} />;
  }
  if (label.includes('drink') || label.includes('beverage')) {
    return <Sparkles className={baseClass} />;
  }

  return <ChefHat className={baseClass} />;
};

export default function HomeContent() {
  const { status } = useSession();
  const router = useRouter();
  const { requireAuth } = useAuthModal();
  const { addToFavorites, isFavorite } = useFavorites();
  const { openModal: openPricingModal } = usePricingModal();

  const [featuredRecipes, setFeaturedRecipes] = useState([]);
  const [featuredError, setFeaturedError] = useState(null);
  const [categories, setCategories] = useState([]);
  const categoriesScrollRef = useRef(null);

  const pesoFormatter = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  });

  useEffect(() => {
    let isMounted = true;

    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/mealdb?type=categories');
        let apiCategoryNames = [];

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            apiCategoryNames = data
              .map((item) => (typeof item?.strCategory === 'string' ? item.strCategory.trim() : ''))
              .filter((name) => name.length > 0);
          }
        }

        const combinedNames = [...apiCategoryNames, ...ADDITIONAL_CATEGORY_NAMES];
        const seen = new Set();
        const normalized = [];

        combinedNames.forEach((name) => {
          const label = typeof name === 'string' ? name.trim() : '';
          if (!label) {
            return;
          }
          const key = label.toLowerCase();
          if (seen.has(key)) {
            return;
          }
          seen.add(key);
          normalized.push({
            id: label,
            name: label
          });
        });

        normalized.sort((a, b) => a.name.localeCompare(b.name));

        if (isMounted) {
          setCategories(normalized);
        }
      } catch (error) {
        console.error('Error loading categories:', error);
        if (isMounted) {
          const fallback = ADDITIONAL_CATEGORY_NAMES.map((name) => ({
            id: name,
            name
          }));
          fallback.sort((a, b) => a.name.localeCompare(b.name));
          setCategories(fallback);
        }
      }
    };

    fetchCategories();

    return () => {
      isMounted = false;
    };
  }, []);

  const scrollByAmount = useCallback((direction) => {
    const container = categoriesScrollRef.current;
    if (!container) {
      return;
    }

    const card = container.querySelector('a');
    const cardWidth = card ? card.getBoundingClientRect().width + 24 : 240;
    const scrollDistance = cardWidth * 2;

    container.scrollTo({
      left: container.scrollLeft + direction * scrollDistance,
      behavior: 'smooth'
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const normalizeCommunityRecipe = (recipe) => ({
      id: `community-${recipe.id}`,
      recipeId: recipe.id,
      title: recipe.title || 'Untitled Recipe',
      image: recipe.image || '/placeholder-recipe.jpg',
      readyInMinutes: recipe.readyInMinutes ?? null,
      servings: recipe.servings ?? null,
      source: 'community',
      sourceKey: 'community',
      sourceLabel: 'Community',
      description: recipe.previewText || recipe.description || '',
      href: `/recipes/${encodeURIComponent(recipe.slug || recipe.id)}?source=community`,
      price: recipe.price ?? null,
      isPremium: Boolean(recipe.isPremium || recipe.is_premium),
      hasPurchased: Boolean(recipe.hasPurchased || recipe.has_purchased)
    });

    const normalizeMealdbRecipe = (recipe) => {
      const originalId = recipe.originalId || recipe.id;
      return {
        id: `mealdb-${originalId}`,
        title: recipe.title || recipe.strMeal || 'Featured Recipe',
        image: recipe.image || recipe.strMealThumb || '/placeholder-recipe.jpg',
        readyInMinutes: recipe.readyInMinutes ?? null,
        servings: recipe.servings ?? null,
        sourceLabel: 'MealDB',
        description: recipe.description || recipe.category || '',
        href: originalId ? `/recipes/${encodeURIComponent(originalId)}?source=mealdb` : '/recipes'
      };
    };

    const buildFeaturedList = (community, mealdb, max = 4) => {
      const combined = [];
      let communityIndex = 0;
      let mealdbIndex = 0;

      while (combined.length < max && (communityIndex < community.length || mealdbIndex < mealdb.length)) {
        if (communityIndex < community.length) {
          combined.push(community[communityIndex]);
          communityIndex += 1;
        }
        if (combined.length >= max) break;
        if (mealdbIndex < mealdb.length) {
          combined.push(mealdb[mealdbIndex]);
          mealdbIndex += 1;
        }
      }

      while (combined.length < max && communityIndex < community.length) {
        combined.push(community[communityIndex]);
        communityIndex += 1;
      }

      while (combined.length < max && mealdbIndex < mealdb.length) {
        combined.push(mealdb[mealdbIndex]);
        mealdbIndex += 1;
      }

      return combined;
    };

    const fetchFeaturedRecipes = async () => {
      setFeaturedError(null);

      try {
        const communityPromise = fetch('/api/recipes?limit=6&page=1');
        const mealdbPromise = fetch('/api/external/recipes?source=mealdb&number=6');

        const [communityResponse, mealdbResponse] = await Promise.all([communityPromise, mealdbPromise]);

        let communityRecipes = [];
        if (communityResponse.ok) {
          const communityData = await communityResponse.json();
          communityRecipes = Array.isArray(communityData?.recipes)
            ? communityData.recipes.map(normalizeCommunityRecipe)
            : [];
        } else {
          console.warn('Community recipes request failed:', communityResponse.status, communityResponse.statusText);
        }

        let mealdbRecipes = [];
        if (mealdbResponse.ok) {
          const mealdbData = await mealdbResponse.json();
          const rawMealdbRecipes = Array.isArray(mealdbData?.recipes) ? mealdbData.recipes : [];
          mealdbRecipes = rawMealdbRecipes.map(normalizeMealdbRecipe);
        } else {
          console.warn('MealDB recipes request failed:', mealdbResponse.status, mealdbResponse.statusText);
        }

        if (!communityResponse.ok && !mealdbResponse.ok) {
          throw new Error('Unable to load featured recipes. Please try again later.');
        }

        const combinedFeatured = buildFeaturedList(communityRecipes, mealdbRecipes);

        if (isMounted) {
          setFeaturedRecipes(combinedFeatured);
        }

        if (isMounted && combinedFeatured.length === 0) {
          setFeaturedError('No featured recipes are available right now.');
        }
      } catch (error) {
        console.error('Error loading featured recipes:', error);
        if (isMounted) {
          setFeaturedRecipes([]);
          setFeaturedError(error.message || 'Failed to load featured recipes.');
        }
      }
    };

    fetchFeaturedRecipes();

    return () => {
      isMounted = false;
    };
  }, []);

  const FeaturedRecipeCard = ({ recipe }) => {
    const [imageSrc, setImageSrc] = useState(recipe.image || '/placeholder-recipe.jpg');
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);
    const favoriteId = getRecipeFavoriteId(recipe);
    const isRecipeFavorite = favoriteId ? isFavorite(favoriteId) : false;
    const priceValue = Number.parseFloat(recipe.price);
    const isForSale = Number.isFinite(priceValue) && priceValue > 0;
    const hasPurchased = Boolean(recipe.hasPurchased);
    const ctaLabel = isForSale
      ? hasPurchased
        ? 'View recipe'
        : `Unlock for ${pesoFormatter.format(priceValue)}`
      : 'View recipe';
    const ctaColor = isForSale && !hasPurchased
      ? 'text-amber-600 dark:text-amber-300'
      : 'text-green-600 dark:text-green-400';

    useEffect(() => {
      let isMounted = true;
      let objectUrl = null;

      const resolveImage = async () => {
        const rawUrl = recipe.image?.toString() || '';
        if (!rawUrl) {
          if (isMounted) {
            setImageSrc('/placeholder-recipe.jpg');
            setImageLoaded(false);
            setImageError(false);
          }
          return;
        }

        if (/^https?:/i.test(rawUrl) || /^data:/i.test(rawUrl)) {
          if (isMounted) {
            setImageSrc(rawUrl);
            setImageLoaded(false);
            setImageError(false);
          }
          return;
        }

        try {
          const response = await fetch(rawUrl, { cache: 'no-store' });
          if (!response.ok) {
            throw new Error(`Failed to fetch featured recipe image (${response.status})`);
          }
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          if (isMounted) {
            setImageSrc(objectUrl);
            setImageLoaded(false);
            setImageError(false);
          }
        } catch (error) {
          console.error('Unable to resolve featured recipe image:', error);
          if (isMounted) {
            setImageSrc('/placeholder-recipe.jpg');
            setImageLoaded(false);
            setImageError(true);
          }
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
          }
        }
      };

      resolveImage();

      return () => {
        isMounted = false;
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      };
    }, [recipe.image]);

    return (
      <Link
        href={recipe.href}
        onClick={(event) => {
          if (!isForSale || hasPurchased) {
            return;
          }
          event.preventDefault();
          openPricingModal('monthly');
        }}
        className="group bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 h-full flex flex-col"
      >
        <div className="relative h-48 w-full flex-shrink-0">
          <img
            src={imageSrc}
            alt={recipe.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            style={{ opacity: imageLoaded ? 1 : 0, transition: 'opacity 200ms ease-in-out' }}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              if (!imageError) {
                setImageSrc('/placeholder-recipe.jpg');
                setImageLoaded(false);
                setImageError(true);
              }
            }}
          />
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleFavoriteRedirect(recipe);
            }}
            aria-label={isRecipeFavorite ? 'View favorites' : 'Add to favorites'}
            className={`absolute top-3 right-3 z-10 p-2 rounded-full transition-colors ${
              isRecipeFavorite
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-white/80 text-gray-700 hover:bg-red-100 dark:bg-gray-900/60 dark:text-gray-100'
            }`}
          >
            <Heart className="w-5 h-5" fill={isRecipeFavorite ? 'currentColor' : 'none'} />
          </button>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50" />
          <div className="absolute top-3 left-3 flex flex-wrap gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/90 text-gray-800">
              {recipe.sourceLabel}
            </span>
            {isForSale ? (
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  hasPurchased
                    ? 'bg-green-500/90 text-white'
                    : 'bg-amber-400/90 text-gray-900'
                }`}
              >
                {hasPurchased ? 'Purchased' : 'For Sale'}
              </span>
            ) : null}
          </div>
        </div>
        <div className="p-5 flex flex-col flex-1 w-full">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 line-clamp-2">
            {recipe.title}
          </h3>
          {recipe.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
              {recipe.description}
            </p>
          )}
          {isForSale ? (
            <div className="flex items-center justify-between text-sm font-semibold mb-4">
              <span
                className={hasPurchased ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-300'}
              >
                {hasPurchased ? 'Owned' : 'Premium Access'}
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {hasPurchased ? 'Unlocked' : pesoFormatter.format(priceValue)}
              </span>
            </div>
          ) : null}
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 gap-4 mb-4">
            {recipe.readyInMinutes ? (
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {recipe.readyInMinutes} min
              </span>
            ) : null}
            {recipe.servings ? (
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {recipe.servings} {recipe.servings === 1 ? 'serving' : 'servings'}
              </span>
            ) : null}
          </div>
          <span className={`inline-flex items-center text-sm font-medium ${ctaColor} mt-auto`}>
            {ctaLabel}
            <ArrowRight className="ml-1 w-4 h-4 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </Link>
    );
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 text-green-600 dark:text-green-400 animate-spin" />
      </div>
    );
  }

  const getRecipeFavoriteId = (recipe = {}) => {
    if (!recipe) return null;

    const toNumericId = (value) => {
      if (value === null || value === undefined) {
        return null;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
      const stringValue = value.toString().trim();
      if (!stringValue) {
        return null;
      }
      return /^\d+$/.test(stringValue) ? stringValue : null;
    };

    const numericCandidates = [
      recipe.favoriteId,
      recipe.recipeId,
      recipe.originalId,
      recipe.id
    ];

    for (const candidate of numericCandidates) {
      const normalized = toNumericId(candidate);
      if (normalized !== null) {
        return normalized;
      }
    }

    const baseId = recipe.slug || recipe.href;
    return baseId ? String(baseId) : null;
  };

  const buildFavoritePayload = (recipe = {}, favoriteId) => {
    const sourceKeyRaw = recipe.sourceKey || recipe.sourceLabel || recipe.source;
    const sourceKey = typeof sourceKeyRaw === 'string' ? sourceKeyRaw.toLowerCase() : null;
    const readyMinutes = recipe.readyInMinutes ?? null;

    const parsedPrice = Number.parseFloat(recipe.price);
    const price = Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null;
    const isPremium = Boolean(recipe.isPremium);
    const hasPurchased = Boolean(recipe.hasPurchased);

    let href = recipe.href;
    if (!href) {
      if (favoriteId) {
        const query = sourceKey ? `?source=${encodeURIComponent(sourceKey)}` : '';
        href = `/recipes/${encodeURIComponent(favoriteId)}${query}`;
      } else {
        href = '/recipes';
      }
    }

    return {
      id: favoriteId,
      recipeId: favoriteId,
      originalId: recipe.id,
      slug: recipe.slug || null,
      title: recipe.title || 'Untitled Recipe',
      image: recipe.image || '/placeholder-recipe.jpg',
      description: recipe.description || '',
      readyInMinutes: readyMinutes,
      servings: recipe.servings ?? null,
      healthScore: recipe.healthScore ?? null,
      sourceKey,
      href,
      price,
      isPremium,
      hasPurchased
    };
  };

  const handleFavoriteRedirect = (recipe) => {
    const favoriteId = getRecipeFavoriteId(recipe);
    if (!favoriteId) {
      return;
    }

    if (!requireAuth('save favorite recipes')) {
      return;
    }

    if (!isFavorite(favoriteId)) {
      const payload = buildFavoritePayload(recipe, favoriteId);
      addToFavorites(payload);
    }
  };

  return (
    <main className="min-h-screen bg-white dark:bg-gray-900 pt-0 m-0">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-green-700 via-green-600 to-green-800 text-white pt-20 pb-24 md:pt-24 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0 bg-gradient-to-br from-green-800/20 to-green-600/20"></div>
        </div>
        <div className="absolute -bottom-1 left-0 right-0 h-24 bg-gradient-to-t from-white dark:from-gray-900 to-transparent"></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-6">
            {/* Badge */}
            <div className="inline-flex items-center bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full border border-white/20 mb-4">
              <Sparkles className="w-5 h-5 mr-2 text-yellow-300" />
              <span className="text-sm font-medium">Discover your next favorite meal</span>
            </div>

            {/* Main heading */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight max-w-4xl mx-auto">
              Discover & Share{' '}
              <span className="relative">
                <span className="relative z-10 bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-yellow-200">
                  Amazing Recipes
                </span>
              </span>
            </h1>

            {/* Subheading */}
            <p className="text-lg md:text-xl max-w-2xl mx-auto text-green-100/90 leading-relaxed">
              Find the perfect recipe for any occasion. Cook like a pro with our easy-to-follow recipes and cooking guides.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link
                href="/recipes"
                className="relative inline-flex items-center justify-center overflow-hidden font-medium transition-all rounded-xl group px-8 py-4 text-lg text-green-700 bg-white hover:text-white"
              >
                <span className="relative z-10 flex items-center gap-2">
                  <Utensils className="w-5 h-5" />
                  Explore Recipes
                </span>
                <span className="absolute bottom-0 left-0 w-0 h-0 transition-all duration-500 ease-out transform rounded-full bg-green-600 group-hover:w-64 group-hover:h-64 group-hover:-ml-2 group-hover:translate-x-full group-hover:translate-y-full"></span>
              </Link>
              <Link
                href="/community"
                className="relative inline-flex items-center justify-center overflow-hidden font-medium transition-all rounded-xl group px-8 py-4 text-lg text-white border-2 border-white/30 hover:border-transparent"
              >
                <span className="relative z-10 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Join Community
                </span>
                <span className="absolute bottom-0 left-0 w-0 h-0 transition-all duration-500 ease-out transform rounded-full bg-white/10 group-hover:w-64 group-hover:h-64 group-hover:-ml-2 group-hover:translate-x-full group-hover:translate-y-full"></span>
              </Link>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap justify-center gap-8 pt-12">
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-300">500+</div>
                <div className="text-green-100/80">Recipes</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-300">50+</div>
                <div className="text-green-100/80">Chefs</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-300">10K+</div>
                <div className="text-green-100/80">Community Members</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Recipes Section */}
      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Featured Recipes</h2>
              <p className="text-gray-600 dark:text-gray-300 max-w-2xl">
                Handpicked dishes from the SavoryFlavors community and TheMealDB to jump-start your next meal idea.
              </p>
            </div>
            <Link
              href="/recipes"
              className="inline-flex items-center font-medium text-green-600 dark:text-green-400 hover:text-green-700"
            >
              Browse all recipes
              <ArrowRight className="ml-1 w-4 h-4" />
            </Link>
          </div>

          {featuredError ? (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-6 text-amber-800 dark:text-amber-200">
              {featuredError}
            </div>
          ) : featuredRecipes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredRecipes.map((recipe) => (
                <FeaturedRecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-10 text-center text-gray-600 dark:text-gray-300">
              Check back soon for featured recipes.
            </div>
          )}
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-16 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Browse by Category</h2>
            <p className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Explore curated collections tailored to every craving and occasion.
            </p>
          </div>

          {categories.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => scrollByAmount(-1)}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-white/40 dark:bg-gray-900/30 border border-white/20 dark:border-gray-700/30 backdrop-blur-sm opacity-50 hover:opacity-90 focus-visible:opacity-95 transition-opacity duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 hidden sm:flex items-center justify-center"
                aria-label="Scroll categories left"
              >
                <ArrowRight className="w-5 h-5 text-green-600 dark:text-green-300 rotate-180" />
              </button>

              <div
                ref={categoriesScrollRef}
                className="flex gap-6 overflow-x-auto pb-2 scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-1"
              >
                {categories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/recipes?category=${encodeURIComponent(category.name)}`}
                    className="group bg-white dark:bg-gray-800 rounded-xl p-6 text-center transition-all duration-200 hover:shadow-lg hover:-translate-y-1 min-w-[220px] flex-shrink-0"
                  >
                    <div className="bg-green-50 dark:bg-green-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-green-100 dark:group-hover:bg-green-900/50 transition-colors">
                      {getCategoryIcon(category.name)}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{category.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {getCategoryDescription(category.name)}
                    </p>
                  </Link>
                ))}
              </div>

              <button
                type="button"
                onClick={() => scrollByAmount(1)}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 w-8 h-8 rounded-full bg-white/40 dark:bg-gray-900/30 border border-white/20 dark:border-gray-700/30 backdrop-blur-sm opacity-50 hover:opacity-90 focus-visible:opacity-95 transition-opacity duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 hidden sm:flex items-center justify-center"
                aria-label="Scroll categories right"
              >
                <ArrowRight className="w-5 h-5 text-green-600 dark:text-green-300" />
              </button>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-10 text-center text-gray-600 dark:text-gray-300">
              Categories are loading. Please check back shortly.
            </div>
          )}
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-16 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
              Why Choose SavoryFlavors?
            </h2>
            <p className="mt-3 max-w-2xl mx-auto text-xl text-gray-600 dark:text-gray-300 sm:mt-4">
              We make cooking enjoyable and accessible for everyone
            </p>
          </div>
          
          <div className="mt-10">
            <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
              {/* Feature 1 */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300">
                <div className="bg-green-100 dark:bg-green-900/30 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                  <ChefHat className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Expert Recipes</h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Handpicked recipes from professional chefs and home cooks around the world.
                </p>
              </div>
              
              {/* Feature 2 */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300">
                <div className="bg-green-100 dark:bg-green-900/30 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Community Driven</h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Join a community of food lovers, share your recipes, and get feedback.
                </p>
              </div>
              
              {/* Feature 3 */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300">
                <div className="bg-green-100 dark:bg-green-900/30 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Endless Inspiration</h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Find new recipes based on your preferences, dietary needs, and ingredients you have.
                </p>
              </div>
            </div>
          </div>
          
          <div className="mt-16 text-center">
            <Link
              href="/about"
              className="relative inline-flex items-center justify-center overflow-hidden font-medium transition-all rounded-xl group px-8 py-4 text-lg text-green-700 border-2 border-green-600 hover:text-white"
            >
              <span className="relative z-10 flex items-center gap-2">
                Learn more about us
              </span>
              <span className="absolute bottom-0 left-0 w-0 h-0 transition-all duration-500 ease-out transform rounded-full bg-green-600 group-hover:w-full group-hover:h-full"></span>
            </Link>
          </div>
        </div>
      </section>

    </main>
  );
}
