import Constants from 'expo-constants';
import { Platform } from 'react-native';

declare const __DEV__: boolean;

const normalizeApiUrl = (url: string) => {
  const trimmed = url.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? `${trimmed}/` : `${trimmed}/api/`;
};

// 1. Safe Host Detection
const getDevHost = () => {
  const uri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).manifest?.debuggerHost;
  if (!uri) return '';
  return uri.split(':')[0];
};

const expoHost = getDevHost();

// 2. Dynamic discovery of backend API URL from process.env / .env
const getDynamicConfiguredApiUrl = (): string => {
  const sources: any[] = [
    typeof process !== 'undefined' && process?.env ? process.env : null,
    Constants?.expoConfig?.extra,
    (Constants as any)?.manifest?.extra,
    (Constants as any)?.manifest2?.extra?.expoClient?.extra,
  ];

  const urlPattern = /^https?:\/\//i;
  const envEntries: [string, string][] = [];
  const seenKeys = new Set<string>();

  // Loop through all sources to collect environment variables
  for (let s = 0; s < sources.length; s++) {
    const src = sources[s];
    if (src && typeof src === 'object') {
      const target =
        src.expoPublicEnv && typeof src.expoPublicEnv === 'object'
          ? { ...src, ...src.expoPublicEnv }
          : src;

      const entries = Object.entries(target);
      // Run loop up to the number of variables
      for (let i = 0; i < entries.length; i++) {
        const [key, val] = entries[i];
        if (
          typeof val === 'string' &&
          val.trim() &&
          urlPattern.test(val.trim()) &&
          !seenKeys.has(key)
        ) {
          seenKeys.add(key);
          envEntries.push([key, val.trim()]);
        }
      }
    }
  }

  // Find key starting with EXPO_PUBLIC_API_URL_ for api host name
  for (let i = 0; i < envEntries.length; i++) {
    const [key, val] = envEntries[i];
    if (key.startsWith('EXPO_PUBLIC_API_URL_')) {
      return val;
    }
  }

  return '';
};

const configuredApiUrl = getDynamicConfiguredApiUrl();
const configuredApiHost = process.env.EXPO_PUBLIC_API_HOST;
const configuredApiPort = process.env.EXPO_PUBLIC_API_PORT || '5001';
const webHost =
  Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hostname : '';
const fallbackHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const resolvedHost = configuredApiHost || webHost || expoHost || fallbackHost;

export const isLocalMachine = Boolean(
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  (Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.endsWith('.local')))
);

export const local_api_url = `http://${resolvedHost}:${configuredApiPort}/api/`;
export const api_url = configuredApiUrl ? normalizeApiUrl(configuredApiUrl) : '';

export default api_url;
