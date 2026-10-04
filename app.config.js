module.exports = ({ config }) => {
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
