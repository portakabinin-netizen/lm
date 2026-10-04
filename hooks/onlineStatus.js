/**
 * ✅ Checks both Internet and Database availability
 * @param {string} apiUrl - The URL of your backend health-check endpoint
 */
export const checkSystemStatus = async (apiUrl) => {
  // 1. Check Browser/Internet Connection
  if (!navigator.onLine) {
    return { 
      available: false, 
      error: "No internet connection. Please check your WiFi/Data." 
    };
  }

  // 2. Check Backend & Database Connection
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout

    const response = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      return { available: true, error: null };
    } else {
      const data = await response.json();
      return { 
        available: false, 
        error: data.database === "disconnected" ? "Database is down" : "Server Error" 
      };
    }
  } catch (error) {
    return { 
      available: false, 
      error: "Backend server is unreachable. Is the server running?" 
    };
  }
};