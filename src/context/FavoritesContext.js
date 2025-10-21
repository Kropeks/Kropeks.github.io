'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';

const FavoritesContext = createContext();

export function FavoritesProvider({ children }) {
  const { data: session, status } = useSession();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMountedRef = useRef(false);

  const isAuthenticated = Boolean(session?.user?.id);

  const canSyncWithServer = useCallback((recipeId) => {
    if (recipeId === null || recipeId === undefined) {
      return false;
    }
    const parsed = Number.parseInt(recipeId, 10);
    return Number.isFinite(parsed) && parsed >= 0;
  }, []);

  const readLocalFavorites = useCallback(() => {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const stored = window.localStorage.getItem('favorites');
      if (!stored) {
        return [];
      }
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(Boolean);
    } catch (storageError) {
      console.warn('Unable to parse favorites from localStorage:', storageError);
      return [];
    }
  }, []);

  const writeLocalFavorites = useCallback((items = []) => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem('favorites', JSON.stringify(items));
    } catch (storageError) {
      console.warn('Unable to persist favorites to localStorage:', storageError);
    }
  }, []);

  const normalizeFavorite = useCallback((item = {}) => {
    if (!item || typeof item !== 'object') {
      return item;
    }

    const rawPrice = item.price ?? item.recipe_price ?? null;
    const parsedPrice = rawPrice !== null && rawPrice !== undefined ? Number.parseFloat(rawPrice) : null;
    const hasValidPrice = Number.isFinite(parsedPrice) && parsedPrice > 0;
    const isPremium = Boolean(item.isPremium ?? item.recipe_is_premium ?? hasValidPrice);

    const viewerId = item.viewerId ?? null;
    const ownerId = item.ownerId ?? item.recipe_owner_id ?? null;
    const normalizedOwnerId = ownerId !== null ? Number.parseInt(ownerId, 10) : null;
    const purchaseId = item.purchaseId ?? item.purchase_id ?? null;
    const hasPurchaseRecord = purchaseId !== null && purchaseId !== undefined && purchaseId !== '';
    const resolvedHasPurchased = hasPurchaseRecord || (viewerId !== null && normalizedOwnerId !== null && Number.parseInt(viewerId, 10) === normalizedOwnerId);

    return {
      ...item,
      price: hasValidPrice ? Number.parseFloat(parsedPrice.toFixed(2)) : null,
      isPremium,
      hasPurchased: Boolean(item.hasPurchased ?? resolvedHasPurchased)
    };
  }, []);

  const fetchServerFavorites = useCallback(async () => {
    try {
      const response = await fetch('/api/favorites', { cache: 'no-store' });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Favorites request failed with status ${response.status}`);
      }
      const payload = await response.json();
      const incoming = Array.isArray(payload?.favorites) ? payload.favorites : [];
      return incoming.filter(Boolean).map((item) => normalizeFavorite(item));
    } catch (requestError) {
      console.error('Failed to fetch favorites from server:', requestError);
      throw requestError;
    }
  }, []);

  const syncLocalToServer = useCallback(async (localItems = []) => {
    if (!localItems.length) {
      return;
    }

    try {
      await Promise.all(
        localItems.map(async (favorite) => {
          const favoriteId = favorite?.recipeId ?? favorite?.id;
          if (!canSyncWithServer(favoriteId)) {
            return;
          }
          try {
            const response = await fetch('/api/favorites', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipeId: favoriteId,
                payload: favorite
              })
            });
            if (response.status === 422) {
              return;
            }
            if (!response.ok) {
              throw new Error(`Sync failed with status ${response.status}`);
            }
          } catch (syncError) {
            console.warn('Failed to sync favorite to server:', favorite?.id || favorite?.recipeId, syncError);
          }
        })
      );
    } catch (syncError) {
      console.warn('Unable to synchronize favorites to server:', syncError);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    const initializeFavorites = async () => {
      setLoading(true);
      setError(null);

      // Always load local favorites first for immediate UI feedback
      const localItems = readLocalFavorites();
      if (isMountedRef.current) {
        setFavorites(localItems);
      }

      if (status === 'loading') {
        setLoading(false);
        return;
      }

      if (!isAuthenticated) {
        setLoading(false);
        return;
      }

      try {
        if (localItems.length) {
          await syncLocalToServer(localItems);
        }

        const serverItems = await fetchServerFavorites();
        if (isMountedRef.current) {
          const mergedItems = (() => {
            const hasServer = Array.isArray(serverItems) && serverItems.length;
            const hasLocal = Array.isArray(localItems) && localItems.length;

            if (!hasServer && hasLocal) {
              return localItems;
            }

            if (!hasLocal) {
              return serverItems;
            }

            const mergedMap = new Map();

            localItems.forEach((item) => {
              const key = String(item?.id ?? item?.recipeId ?? '');
              if (key) {
                mergedMap.set(key, item);
              }
            });

            serverItems.forEach((item) => {
              const key = String(item?.id ?? item?.recipeId ?? '');
              if (key) {
                mergedMap.set(key, item);
              }
            });

            return Array.from(mergedMap.values());
          })();

          setFavorites(mergedItems);
          writeLocalFavorites(mergedItems);
        }
      } catch (fetchError) {
        if (isMountedRef.current) {
          setError(fetchError);
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    initializeFavorites();

    return () => {
      isMountedRef.current = false;
    };
  }, [status, isAuthenticated, readLocalFavorites, writeLocalFavorites, fetchServerFavorites, syncLocalToServer]);

  useEffect(() => {
    if (!isAuthenticated && !loading) {
      writeLocalFavorites(favorites);
    }
  }, [favorites, isAuthenticated, loading, writeLocalFavorites]);

  const isFavorite = useCallback((recipeId) => {
    if (recipeId === null || recipeId === undefined) {
      return false;
    }
    const lookup = String(recipeId);
    return favorites.some((fav) => String(fav.id) === lookup || String(fav.recipeId) === lookup);
  }, [favorites]);

  const addToFavorites = useCallback(async (recipe) => {
    const recipeId = recipe?.recipeId ?? recipe?.id;
    if (!recipeId) {
      return;
    }

    if (isFavorite(recipeId)) {
      return;
    }

    const shouldAttemptServerSync = isAuthenticated && canSyncWithServer(recipeId);

    const normalizedRecipe = normalizeFavorite({ ...recipe, viewerId: session?.user?.id });

    setFavorites((prev) => {
      const next = [...prev, normalizedRecipe];
      if (!isAuthenticated || !shouldAttemptServerSync) {
        writeLocalFavorites(next);
      }
      return next;
    });

    if (shouldAttemptServerSync) {
      try {
        const response = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipeId,
            payload: recipe
          })
        });

        if (response.status === 422) {
          const message = await response.json().catch(() => ({}));
          console.warn('Server declined favorite sync:', message?.error || 'Unprocessable favorite payload');
          setFavorites((prev) => {
            writeLocalFavorites(prev);
            return prev;
          });
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to save favorite (status ${response.status})`);
        }
        const data = await response.json().catch(() => ({}));
        const serverFavorite = data?.favorite ? normalizeFavorite({ ...data.favorite, viewerId: session?.user?.id }) : null;

        if (serverFavorite) {
          setFavorites((prev) => {
            const filtered = prev.filter((item) => String(item.id) !== String(recipeId));
            const next = [...filtered, serverFavorite];
            writeLocalFavorites(next);
            return next;
          });
        } else {
          // fallback to merging server snapshot if available
          const serverItems = await fetchServerFavorites().catch(() => null);
          if (Array.isArray(serverItems) && serverItems.length) {
            setFavorites(serverItems);
            writeLocalFavorites(serverItems);
          }
        }
      } catch (apiError) {
        console.error('Failed to add favorite on server:', apiError);
        setFavorites((prev) => prev.filter((item) => String(item.id) !== String(recipeId)));
        throw apiError;
      }
    }
  }, [fetchServerFavorites, isAuthenticated, isFavorite, normalizeFavorite, session?.user?.id, writeLocalFavorites]);

  const removeFromFavorites = useCallback(async (recipeId) => {
    if (!recipeId) {
      return;
    }

    setFavorites((prev) => {
      const filtered = prev.filter((fav) => String(fav.id) !== String(recipeId));
      writeLocalFavorites(filtered);
      return filtered;
    });

    if (isAuthenticated) {
      try {
        await fetch(`/api/favorites/${encodeURIComponent(recipeId)}`, {
          method: 'DELETE'
        });
      } catch (apiError) {
        console.error('Failed to remove favorite on server:', apiError);
        throw apiError;
      }
    }
  }, [isAuthenticated, writeLocalFavorites]);

  const toggleFavorite = useCallback(async (recipe) => {
    const recipeId = recipe?.recipeId ?? recipe?.id;
    if (!recipeId) {
      return;
    }

    if (isFavorite(recipeId)) {
      await removeFromFavorites(recipeId);
    } else {
      await addToFavorites(recipe);
    }
  }, [addToFavorites, removeFromFavorites, isFavorite]);

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        isFavorite,
        addToFavorites,
        removeFromFavorites,
        toggleFavorite,
        loading,
        error
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
}
