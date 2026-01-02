import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import api_url from "./routes/base_url";

const api = axios.create({
  baseURL: api_url.replace(/\/$/, ""),
  headers: { "Content-Type": "application/json" },
});

/* ===============================
   REQUEST INTERCEPTOR
================================ */
api.interceptors.request.use(async (config) => {
  const session = await AsyncStorage.getItem("userSession");
  if (session) {
    const { token } = JSON.parse(session);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/* ===============================
   RESPONSE INTERCEPTOR
================================ */
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      await AsyncStorage.removeItem("userSession");
    }
    return Promise.reject(error);
  }
);

export default api;
