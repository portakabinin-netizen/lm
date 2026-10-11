import Constants from "expo-constants";
import { Platform } from "react-native";

declare const __DEV__: boolean;

const normalizeApiUrl = (url: string) => {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
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
const fallbackHost = Platform.OS === "android" ? "10.0.2.2" : "localhost";
const resolvedHost = expoHost || fallbackHost;

// 2. Set production URL
const productionURL = "https://leadmanager-backend-production.up.railway.app/api";

// 3. Strict Environment Detection
const isDev =
  process.env.NODE_ENV === "development" ||
  (typeof __DEV__ !== "undefined" && __DEV__ === true);

export const isLocalMachine = Boolean(
  (typeof __DEV__ !== "undefined" && __DEV__) ||
    (Platform.OS === "web" &&
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname.endsWith(".local")))
);

const configuredPort = process.env.EXPO_PUBLIC_API_PORT || "5001";

export const local_api_url = `http://${resolvedHost}:${configuredPort}/api`;

// 4. Build URL with safety check
export const api_url = isDev
  ? `http://${resolvedHost}:${configuredPort}/api`
  : normalizeApiUrl(productionURL);

export const api_urls: string[] = [api_url];
export const configuredApiUrls: string[] = [api_url];
export const getConfiguredApiUrls = (): string[] => [api_url];

export default api_url;