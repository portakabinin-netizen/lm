import Constants from "expo-constants";
import { Platform } from "react-native";

declare const __DEV__: boolean;

const normalizeApiUrl = (url: string) => {
  const trimmed = url.trim().replace(/\/$/, "");
  return trimmed.endsWith("/api") ? `${trimmed}/` : `${trimmed}/api/`;
};

// 1. Safe Host Detection
const getDevHost = () => {
  const uri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).manifest?.debuggerHost;
  if (!uri) return "";
  return uri.split(":")[0];
};

const expoHost = getDevHost();

// Helper to collect all dynamic env sources (Expo extra, manifests, process.env)
const getEnvSources = (): Record<string, any>[] => {
  const sources: any[] = [
    Constants?.expoConfig?.extra?.expoPublicEnv,
    Constants?.expoConfig?.extra,
    (Constants as any)?.manifest?.extra?.expoPublicEnv,
    (Constants as any)?.manifest?.extra,
    (Constants as any)?.manifest2?.extra?.expoClient?.extra?.expoPublicEnv,
    (Constants as any)?.manifest2?.extra?.expoClient?.extra,
    typeof process !== 'undefined' && process?.env ? process.env : null,
  ];

  return sources.filter((s): s is Record<string, any> => Boolean(s && typeof s === 'object'));
};

// 2. Dynamic discovery: read all API URLs from .env / Expo config and store in an array
export const getConfiguredApiUrls = (): string[] => {
  const urlPattern = /^https?:\/\//i;
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const src of getEnvSources()) {
    const target =
      src.expoPublicEnv && typeof src.expoPublicEnv === 'object'
        ? { ...src, ...src.expoPublicEnv }
        : src;

    for (const [key, val] of Object.entries(target)) {
      if (
        (key.startsWith('EXPO_PUBLIC_API_URL') || key.startsWith('API_URL')) &&
        typeof val === 'string' &&
        val.trim() &&
        urlPattern.test(val.trim())
      ) {
        const normalized = normalizeApiUrl(val.trim());
        if (!seen.has(normalized)) {
          seen.add(normalized);
          urls.push(normalized);
        }
      }
    }
  }

  return urls;
};

// Array of all configured API URLs extracted dynamically from .env
export const configuredApiUrls: string[] = getConfiguredApiUrls();
export const api_urls: string[] = configuredApiUrls;

export const isLocalMachine = Boolean(
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  (Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.endsWith('.local')))
);

const configuredApiHost = process.env.EXPO_PUBLIC_API_HOST;
const configuredApiPort = process.env.EXPO_PUBLIC_API_PORT || '5001';
const webHost = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hostname : '';
const fallbackHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const resolvedHost = configuredApiHost || webHost || expoHost || fallbackHost;

export const local_api_url = `http://${resolvedHost}:${configuredApiPort}/api/`;
export const api_url = configuredApiUrls.length > 0 ? configuredApiUrls[0] : '';

export default api_url;
