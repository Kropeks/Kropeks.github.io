'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Heart, Clock, Users, Star, Utensils } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useFavorites } from '@/context/FavoritesContext';
import RecipePurchaseModal from '@/components/recipes/RecipePurchaseModal';
import { useAuthModal } from '@/components/AuthProvider';

export default function Favorites() {
  const { status } = useSession();
  const router = useRouter();
  const { favorites, removeFromFavorites } = useFavorites();
  const { requireAuth } = useAuthModal();
  const [isClient, setIsClient] = useState(false);
  const [isRemoving, setIsRemoving] = useState({});
  const [loading, setLoading] = useState(true);
  const [purchaseRecipe, setPurchaseRecipe] = useState(null);
  const [purchasedRecipeIds, setPurchasedRecipeIds] = useState(() => new Set());
  const [activeSaleRecipeId, setActiveSaleRecipeId] = useState(null);

  // Check if we're on the client side
  useEffect(() => {
    setIsClient(true);
    setLoading(false);
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login?callbackUrl=/favorites');
    }
  }, [status, router]);

  const handleRemoveFavorite = async (recipeId) => {
    try {
      setIsRemoving(prev => ({ ...prev, [recipeId]: true }));
      await removeFromFavorites(recipeId);
      // Small delay to show the loading state
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Error removing favorite:', error);
    } finally {
      setIsRemoving(prev => ({ ...prev, [recipeId]: false }));
    }
  };

  if (status === 'loading' || !isClient || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-pulse space-y-4">
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mx-auto"></div>
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mx-auto"></div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden animate-pulse">
                <div className="h-48 bg-gray-200 dark:bg-gray-700"></div>
                <div className="p-4 space-y-3">
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  <div className="flex items-center space-x-4 pt-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!favorites || favorites.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
          <div className="mx-auto flex items-center justify-center h-24 w-24 rounded-full bg-red-50 dark:bg-red-900/30 mb-6">
            <Heart className="h-12 w-12 text-red-400 dark:text-red-300" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">No favorites yet</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">Start saving your favorite recipes by clicking the heart icon on any recipe card.</p>
          <Link
            href="/recipes"
            className="inline-flex items-center justify-center px-4 py-2 bg-olive-600 text-white rounded-md hover:bg-olive-700 transition-colors"
          >
            <Utensils className="w-4 h-4 mr-2" />
            Browse Recipes
          </Link>
        </div>
      </div>
    );
  }

  const handleOpenPurchase = (recipe, favoriteId) => {
    if (!recipe) return;

    const resolvedId = favoriteId ?? String(recipe.slug ?? recipe.id ?? '');
    if (resolvedId) {
      setActiveSaleRecipeId(resolvedId);
    }

    if (!requireAuth('purchase premium recipes')) {
      setActiveSaleRecipeId(null);
      return;
    }

    const priceValue = Number.parseFloat(recipe.price);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setActiveSaleRecipeId(null);
      return;
    }

    setPurchaseRecipe({
      id: recipe.id,
      slug: recipe.slug,
      title: recipe.title,
      price: priceValue,
      hasPurchased: Boolean(recipe.hasPurchased),
      href: recipe.href,
      sourceKey: recipe.sourceKey
    });
  };

  const handleClosePurchase = () => {
    setPurchaseRecipe(null);
    setActiveSaleRecipeId(null);
  };
  const handlePurchaseSuccess = (result) => {
    if (!result) {
      return;
    }

    const resolvedId = result.recipeId ?? purchaseRecipe?.id ?? purchaseRecipe?.slug;
    if (resolvedId) {
      setPurchasedRecipeIds((prev) => {
        const next = new Set(prev);
        next.add(String(resolvedId));
        return next;
      });
    }

    setPurchaseRecipe((prev) => (prev ? { ...prev, hasPurchased: true } : prev));
    setActiveSaleRecipeId(null);

    const detailPath = (() => {
      if (!purchaseRecipe) {
        return null;
      }
      if (purchaseRecipe.href) {
        return purchaseRecipe.href;
      }
      if (purchaseRecipe.slug) {
        return `/recipes/${purchaseRecipe.slug}`;
      }
      if (purchaseRecipe.id) {
        return `/recipes/${purchaseRecipe.id}`;
      }
      return null;
    })();

    if (detailPath) {
      router.push(detailPath);
    }
  };
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Your Favorite Recipes</h1>
          <p className="text-gray-600 dark:text-gray-300">All your saved recipes in one place</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {favorites.map((recipe) => {
            const favoriteId = String(recipe.slug ?? recipe.id ?? '');
            const isPremium = Boolean(recipe.isPremium);
            const hasPurchased = Boolean(recipe.hasPurchased) || purchasedRecipeIds.has(favoriteId);
            const parsedPrice = Number.parseFloat(recipe.price);
            const hasValidPrice = Number.isFinite(parsedPrice) && parsedPrice > 0;
            const isForSale = hasValidPrice;
            const requiresPurchase = isForSale && !hasPurchased;
            const displayPrice = hasValidPrice ? `₱${parsedPrice.toFixed(2)}` : null;
            const isActiveSale = requiresPurchase && activeSaleRecipeId === favoriteId;

            const cardBody = (
              <>
                <div className="relative h-48">
                  <Image
                    src={recipe.image || '/placeholder-recipe.jpg'}
                    alt={recipe.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300 opacity-100"
                    style={{ opacity: 1 }}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  />
                  {(isPremium || isForSale) && (
                    <div className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">
                      {isForSale ? 'Premium' : 'For Sale'}
                    </div>
                  )}
                  {displayPrice && (
                    <div className="absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-semibold bg-white/80 text-olive-700 dark:bg-gray-900/60 dark:text-olive-200">
                      {displayPrice}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 line-clamp-2">
                    {recipe.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm mb-3 line-clamp-2">
                    {recipe.description || 'No description available'}
                  </p>
                  <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 mr-1" />
                        <span>{recipe.readyInMinutes || 'N/A'} min</span>
                      </div>
                      <div className="flex items-center">
                        <Users className="w-4 h-4 mr-1" />
                        <span>{recipe.servings || 2} servings</span>
                      </div>
                    </div>
                    {requiresPurchase ? (
                      <span className="text-xs font-semibold text-olive-600 dark:text-olive-300">
                        Tap to unlock
                      </span>
                    ) : isForSale && hasPurchased ? (
                      <span className="text-xs font-semibold text-green-600 dark:text-green-300">
                        Purchased
                      </span>
                    ) : recipe.healthScore ? (
                      <div className="flex items-center bg-yellow-50 dark:bg-yellow-900/30 px-2 py-1 rounded">
                        <Star className="w-4 h-4 text-yellow-400 dark:text-yellow-300 fill-current mr-1" />
                        <span className="text-sm font-medium text-yellow-700 dark:text-yellow-200">
                          {Math.round(recipe.healthScore)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            );

            return (
              <div
                key={recipe.id}
                className="relative group bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
              >
                {isActiveSale && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none">
                    <span className="px-4 py-2 text-sm font-semibold text-white bg-olive-600 rounded-full shadow-lg">
                      For Sale – Payment Required
                    </span>
                  </div>
                )}
                {requiresPurchase ? (
                  <button
                    type="button"
                    onClick={() => handleOpenPurchase(recipe, favoriteId)}
                    className="block w-full text-left bg-transparent focus:outline-none"
                  >
                    {cardBody}
                  </button>
                ) : (
                  <Link href={recipe.href || `/recipes/${recipe.id}`} className="block">
                    {cardBody}
                  </Link>
                )}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleRemoveFavorite(recipe.id);
                  }}
                  disabled={isRemoving[recipe.id]}
                  className={`absolute top-3 right-3 p-2 rounded-full transition-colors ${
                    isRemoving[recipe.id]
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-wait'
                      : 'bg-white/80 dark:bg-gray-900/60 hover:bg-red-50 dark:hover:bg-red-900/40 text-red-500'
                  }`}
                  aria-label="Remove from favorites"
                >
                  <Heart className={`w-5 h-5 ${isRemoving[recipe.id] ? 'animate-pulse' : 'fill-current'}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <RecipePurchaseModal
        isOpen={Boolean(purchaseRecipe)}
        onClose={handleClosePurchase}
        recipeId={purchaseRecipe?.id}
        recipeTitle={purchaseRecipe?.title}
        price={purchaseRecipe?.price}
        onSuccess={handlePurchaseSuccess}
        requireAuth={requireAuth}
      />
    </div>
  );
}