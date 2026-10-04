import Constants from "expo-constants";

declare const __DEV__: boolean;

// 1. Safe Host Detection (gets the LAN IP Expo is running on)
const getDevHost = () => {
  const uri = Constants.expoConfig?.hostUri;
  if (!uri) return "localhost";
  return uri.split(":")[0];
};

const expoHost = getDevHost();

// 2. Production URL — Python FastAPI backend deployed on Render/Railway
//    Update this when you redeploy the Python backend.
const productionURL = process.env.EXPO_PUBLIC_PROD_API_URL || "https://hipk-backend.onrender.com";

// 3. Environment detection
const isDev =
  process.env.NODE_ENV === "development" ||
  (typeof __DEV__ !== "undefined" && __DEV__ === true);

// 4. Default to Python backend (port 5002) locally, but allow override for Node backend (port 5001)
const configuredPort = process.env.EXPO_PUBLIC_API_PORT || "5002";

const api_url = process.env.EXPO_PUBLIC_API_URL
  ? process.env.EXPO_PUBLIC_API_URL
  : isDev
  ? `http://${expoHost}:${configuredPort}/api`
  : `${productionURL}/api`;

export default api_url;

