import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { cachedPublishedConfig, loadPublishedConfig } from './configStore';
import { isCloudConfigured } from '../utils/supabaseClient';
import { applySettings } from './appSettings';

/**
 * The published form configuration, available to every screen.
 *
 * Starts from the copy cached on this device (or the built-in default, which
 * is the app exactly as it was before configuration existed), so a surveyor
 * with no signal still gets the fields that were published when they last
 * had one.
 */
const FormsConfigContext = createContext(null);

export const currentPlatform = () => (Capacitor.isNativePlatform() ? 'mobile' : 'web');

export function FormsConfigProvider({ children, enabled = true }) {
  const [state, setState] = useState(() => cachedPublishedConfig('forms'));
  const [reports, setReports] = useState(() => cachedPublishedConfig('reports'));
  // Settings take effect from the device's copy straight away, then the server's.
  const [settings, setSettings] = useState(() => {
    const cached = cachedPublishedConfig('settings');
    applySettings(cached.config);
    return cached;
  });

  const refresh = useCallback(async () => {
    if (!isCloudConfigured) return;
    try {
      const next = await loadPublishedConfig('forms');
      setState((prev) => (prev.version === next.version && JSON.stringify(prev.config) === JSON.stringify(next.config) ? prev : next));
    } catch (err) {
      console.warn('[config] could not refresh the form configuration:', err?.message);
    }
    // Report layouts ride along: loading them caches them on this device, which
    // is where the PDF and Excel generators read them from -- offline too.
    loadPublishedConfig('reports')
      .then((next) => setReports((prev) => (prev.version === next.version && JSON.stringify(prev.config) === JSON.stringify(next.config) ? prev : next)))
      .catch((err) => console.warn('[config] report layouts unavailable:', err?.message));
    loadPublishedConfig('settings')
      .then((next) => {
        applySettings(next.config);
        setSettings((prev) => (prev.version === next.version && JSON.stringify(prev.config) === JSON.stringify(next.config) ? prev : next));
      })
      .catch((err) => console.warn('[config] settings unavailable:', err?.message));
  }, []);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  // Picks up a newly published version when the app comes back to the front.
  useEffect(() => {
    if (!enabled) return undefined;
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, refresh]);

  const value = useMemo(() => ({
    config: state.config,
    version: state.version,
    platform: currentPlatform(),
    reports,
    settings,
    refresh
  }), [state, reports, settings, refresh]);

  return <FormsConfigContext.Provider value={value}>{children}</FormsConfigContext.Provider>;
}

/**
 * Renders children against a draft configuration instead of the published one,
 * so the Admin Dashboard can preview a change exactly as surveyors will see it.
 */
export function FormsConfigPreview({ config, platform = 'web', children }) {
  const value = useMemo(() => ({ config, version: 0, platform, refresh: async () => {} }), [config, platform]);
  return <FormsConfigContext.Provider value={value}>{children}</FormsConfigContext.Provider>;
}

/** Works outside a provider too (tests, isolated components): falls back to the cached/default config. */
export function useFormsConfig() {
  const ctx = useContext(FormsConfigContext);
  if (ctx) return ctx;
  const { config, version } = cachedPublishedConfig('forms');
  return { config, version, platform: currentPlatform(), reports: cachedPublishedConfig('reports'), settings: cachedPublishedConfig('settings'), refresh: async () => {} };
}
