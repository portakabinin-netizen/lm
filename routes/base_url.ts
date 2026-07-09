import Constants from "expo-constants";
import { Platform } from "react-native";

declare const __DEV__: boolean;

const normalizeApiUrl = (url: string) => {
  const trimmed = url.trim().replace(/\/$/, "");
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

// 2. Local/LAN backend URL.
// Set EXPO_PUBLIC_API_URL to a full URL (for example http://192.168.1.25:5001/api)
// or EXPO_PUBLIC_API_HOST to just the host/IP for standalone builds on local devices.
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
const configuredApiHost = process.env.EXPO_PUBLIC_API_HOST;
const configuredApiPort = process.env.EXPO_PUBLIC_API_PORT || "5001";
const webHost =
  Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.hostname
    : "";
const fallbackHost = Platform.OS === "android" ? "10.0.2.2" : "localhost";
const resolvedHost = configuredApiHost || webHost || expoHost || fallbackHost;

const api_url = configuredApiUrl
  ? normalizeApiUrl(configuredApiUrl)
  : `http://${resolvedHost}:${configuredApiPort}/api`;

export default api_url;
