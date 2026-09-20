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

// 2. Local/LAN or Cloud backend URL.
const configuredApiUrl =
  process.env.EXPO_PUBLIC_ONRENDER_DBC1 ||
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.EXPO_PUBLIC_VERCEL_DBC1 ||
  'https://hipk-gsz6.onrender.com/api';
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
export const api_url = configuredApiUrl
  ? normalizeApiUrl(configuredApiUrl)
  : 'https://hipk-gsz6.onrender.com/api/';

export default api_url;
