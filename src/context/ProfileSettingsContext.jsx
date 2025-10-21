'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

const ProfileSettingsContext = createContext(null);

export function ProfileSettingsProvider({ children }) {
  const { status } = useSession();
  const [profileSettings, setProfileSettings] = useState(null);
  const [profileSettingsLoading, setProfileSettingsLoading] = useState(false);
  const [profileSettingsError, setProfileSettingsError] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);
  const fetchControllerRef = useRef(null);
  const ttlMillisecondsRef = useRef(5 * 60 * 1000);

  const refreshProfileSettings = useCallback(
    async ({ silent = false, force = false } = {}) => {
      if (status !== 'authenticated') {
        setProfileSettings(null);
        setLastFetchedAt(null);
        setProfileSettingsLoading(false);
        setProfileSettingsError(null);
        if (fetchControllerRef.current) {
          fetchControllerRef.current.abort();
          fetchControllerRef.current = null;
        }
        return null;
      }

      if (!force && lastFetchedAt) {
        const age = Date.now() - new Date(lastFetchedAt).getTime();
        if (age < ttlMillisecondsRef.current) {
          return profileSettings;
        }
      }

      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
      }

      const controller = new AbortController();
      fetchControllerRef.current = controller;

      if (!silent) {
        setProfileSettingsLoading(true);
      }
      setProfileSettingsError(null);

      try {
        const response = await fetch('/api/profile', {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || 'Failed to load profile settings');
        }

        const data = await response.json();
        setProfileSettings(data);
        setLastFetchedAt(new Date());
        return data;
      } catch (error) {
        if (error.name === 'AbortError') {
          return null;
        }
        console.error('Profile settings fetch failed:', error);
        setProfileSettingsError(error.message || 'Unable to load profile settings');
        throw error;
      } finally {
        if (fetchControllerRef.current === controller) {
          fetchControllerRef.current = null;
        }
        if (!silent) {
          setProfileSettingsLoading(false);
        }
        if (force) {
          setIsForceRefreshing(false);
        }
      }
    },
    [lastFetchedAt, profileSettings, status],
  );

  useEffect(() => {
    if (status === 'authenticated') {
      refreshProfileSettings({ silent: profileSettings !== null });
    } else if (status === 'unauthenticated') {
      setProfileSettings(null);
      setProfileSettingsError(null);
      setProfileSettingsLoading(false);
      setLastFetchedAt(null);
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
        fetchControllerRef.current = null;
      }
    }
    // We intentionally omit refreshProfileSettings from dependency array to avoid refetch storms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated' || !profileSettings) {
      return undefined;
    }

    const ttlId = setInterval(() => {
      refreshProfileSettings({ silent: true });
    }, ttlMillisecondsRef.current);

    return () => {
      clearInterval(ttlId);
    };
  }, [profileSettings, refreshProfileSettings, status]);

  const forceRefreshProfileSettings = useCallback(async () => {
    setIsForceRefreshing(true);
    try {
      await refreshProfileSettings({ silent: false, force: true });
    } catch (error) {
      console.error('Force refresh failed:', error);
    } finally {
      setIsForceRefreshing(false);
    }
  }, [refreshProfileSettings]);

  const contextValue = useMemo(
    () => ({
      profileSettings,
      setProfileSettings,
      profileSettingsLoading,
      setProfileSettingsLoading,
      profileSettingsError,
      setProfileSettingsError,
      refreshProfileSettings,
      lastFetchedAt,
      forceRefreshProfileSettings,
      isForceRefreshing,
    }),
    [
      profileSettings,
      profileSettingsLoading,
      profileSettingsError,
      refreshProfileSettings,
      lastFetchedAt,
      forceRefreshProfileSettings,
      isForceRefreshing,
    ],
  );

  return (
    <ProfileSettingsContext.Provider value={contextValue}>
      {children}
    </ProfileSettingsContext.Provider>
  );
}

export function useProfileSettings() {
  const context = useContext(ProfileSettingsContext);
  if (!context) {
    throw new Error('useProfileSettings must be used within a ProfileSettingsProvider');
  }
  return context;
}
