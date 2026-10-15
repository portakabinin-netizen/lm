require('dotenv').config();

module.exports = ({ config }) => {
  const expoPublicEnv = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (key.startsWith('EXPO_PUBLIC_') && typeof val === 'string' && val.trim()) {
      expoPublicEnv[key] = val.trim();
    }
  }

  return {
    ...config,
    name: "HiBiz",
    slug: "hibiz",
    // 🚀 This project uses custom native modules — ALWAYS use development build, never Expo Go
    developmentClient: true,
    splash: {
      ...config.splash,
      backgroundColor: "#f1ededff"
    },
    extra: {
      ...(config.extra || {}),
      ...expoPublicEnv,
      expoPublicEnv,
    },
    ios: {
      ...config.ios,
      config: {
        ...config.ios?.config,
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyCvpWBZy4vz7LD4IXEoydWevdJNG5k9uGc"
      }
    },
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyCvpWBZy4vz7LD4IXEoydWevdJNG5k9uGc"
        }
      }
    },
    plugins: [
      ...(config.plugins || []),
      "expo-image",
      "expo-sharing",
      "expo-sqlite"
    ].filter((val, i, arr) => {
      const name = Array.isArray(val) ? val[0] : val;
      return arr.findIndex(item => (Array.isArray(item) ? item[0] : item) === name) === i;
    })
  };
};
