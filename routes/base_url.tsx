import Constants from "expo-constants";

declare const __DEV__: boolean;


// 1. Safe Host Detection
const getDevHost = () => {
  const uri = Constants.expoConfig?.hostUri;
  if (!uri) return "localhost"; // Fallback
  return uri.split(":")[0];
};

const expoHost = getDevHost();

// 2. Set production URL
const productionURL = "https://leadmanager-backend-production.up.railway.app";

// 3. Strict Environment Detection
// Use a literal boolean check
const isDev = process.env.NODE_ENV === 'development' || (typeof __DEV__ !== 'undefined' && __DEV__ === true);


// 4. Build URL with safety check
const api_url = isDev
  ? `http://${expoHost}:5000/api`
  : `${productionURL}/api`;


export default api_url;