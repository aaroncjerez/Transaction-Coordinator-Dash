import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getSetting, setSetting } from '../lib/database';

export interface UserPreferences {
  /** Kanban card density: 'compact' | 'expanded' */
  cardDensity: 'compact' | 'expanded';
  /** Task view default mode: 'byDeal' | 'all' */
  taskViewMode: 'byDeal' | 'all';
  /** Days before deadline to start alerts */
  deadlineAlertLeadDays: number;
  /** Days inactive before deal is considered "stale" */
  staleDealThresholdDays: number;
}

const DEFAULTS: UserPreferences = {
  cardDensity: 'expanded',
  taskViewMode: 'byDeal',
  deadlineAlertLeadDays: 7,
  staleDealThresholdDays: 14,
};

interface PreferencesContextValue {
  prefs: UserPreferences;
  updatePref: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => Promise<void>;
  loaded: boolean;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  prefs: DEFAULTS,
  updatePref: async () => {},
  loaded: false,
});

export const usePreferences = () => useContext(PreferencesContext);

const SETTINGS_KEY = 'user_preferences';

export const PreferencesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await getSetting(SETTINGS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setPrefs({ ...DEFAULTS, ...parsed });
        }
      } catch (err) {
        console.error('[Preferences] Failed to load:', err);
      } finally {
        setLoaded(true);
      }
    };
    load();
  }, []);

  const updatePref = useCallback(async <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      // Persist async (fire-and-forget with error logging)
      setSetting(SETTINGS_KEY, JSON.stringify(next)).catch(err =>
        console.error('[Preferences] Failed to save:', err)
      );
      return next;
    });
  }, []);

  return (
    <PreferencesContext.Provider value={{ prefs, updatePref, loaded }}>
      {children}
    </PreferencesContext.Provider>
  );
};
