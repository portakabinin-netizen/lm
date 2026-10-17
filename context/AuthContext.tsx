'use client';
import { AuthContextType, DecodedToken, UserSession } from "@/hooks/interface";
import { appService } from "@/UtilServices/appHelper";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const httpClient = appService.httpClient;
import { jwtDecode } from "jwt-decode";
import { Alert, DeviceEventEmitter } from "react-native";
import { switchTenantRoom } from "@/hooks/Socket";
import { tenantStore } from "@/UtilServices/TenantStore";
import { LocationCacheService } from "@/services/LocationCacheService";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const UserContext = createContext<{ user: UserSession | null; loading: boolean; visitingCardUri: string | null; }>({
  user:    null,
  loading: true,
  visitingCardUri: null,
});

const AuthActionsContext = createContext<{
  login:             (userData: UserSession) => Promise<void>;
  logout:            (showToast?: boolean) => Promise<void>;
  switchCorporate:   (corporateId: string) => Promise<void>;
  updateUserProfile: (updates: Partial<{ userProfileImage: string; CorpProfileImage: string }>) => Promise<void>;
  setVisitingCardUri:(uri: string) => void;
}>({
  login:             async () => {},
  logout:            async () => {},
  switchCorporate:   async () => {},
  updateUserProfile: async () => {},
  setVisitingCardUri:() => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user,    setUser]    = useState<UserSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [visitingCardUri, setVisitingCardUriState] = useState<string | null>(null);

  const setVisitingCardUri = useCallback((uri: string) => {
    setVisitingCardUriState(uri);
  }, []);


  const userRef = useRef<UserSession | null>(user);
  useEffect(() => { userRef.current = user; }, [user]);

  const logout = useCallback(async (showToast = true) => {
    try {
      tenantStore.clear();
      await LocationCacheService.clearCache().catch(() => {});
      await AsyncStorage.multiRemove([
        "userSession",
        "cached_workers",
        "cached_clients",
        "selected_site",
        "registered_sites",
        "gps_cache_profile",
        "gps_cache_leads",
      ]).catch(() => {});
      userRef.current = null;
      setUser(null);
      if (showToast)  appService.showToast("Session Expired", "Info");
    } catch (err) {
      console.error("Logout Error:", err);
      setUser(null);
    }
  }, []); // ← empty deps: this function NEVER changes reference

  const updateUserProfile = useCallback(async (
    updates: Partial<{ userProfileImage: string; CorpProfileImage: string }>
  ) => {
    const current = userRef.current; // ← read from ref, not closure
    if (!current) return;
    try {
      const updatedUser = { ...current, ...updates };

      // Make sure the accessCorporate array also reflects the new CorpProfileImage
      if (updates.CorpProfileImage && updatedUser.dbName && updatedUser.accessCorporate) {
        updatedUser.accessCorporate = updatedUser.accessCorporate.map((c: any) =>
          c.dbName === updatedUser.dbName
            ? { ...c, CorpProfileImage: updates.CorpProfileImage }
            : c
        );
      }

      await AsyncStorage.setItem("userSession", JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch (err) {
      console.error("Failed to update local session:", err);
    }
  }, []); // ← empty deps: this function NEVER changes reference

  const switchCorporate = useCallback(async (corporateId: string) => {
    try {
      setLoading(true);
      const previousDbName = userRef.current?.dbName;
      const res = await appService.switchCorporate(corporateId);
      if (res.data?.success) {
        const { token, userSession } = res.data;
        const cleanToken = token.replace(/['"]+/g, "").trim();
        const updatedUser = { ...userSession, token: cleanToken };

        // 1. Immediately update userRef so in-flight interceptor requests use new tenant
        userRef.current = updatedUser;

        // 2. Set default Authorization header on httpClient
        appService.httpClient.defaults.headers.common['Authorization'] = `Bearer ${cleanToken}`;
        if (updatedUser.dbName) {
          appService.httpClient.defaults.headers.common['x-tenant-id'] = updatedUser.dbName;
        }

        // 3. Clear transient and global caches that belong to the previous corporate
        await LocationCacheService.clearCache().catch(() => {});
        await AsyncStorage.multiRemove([
          'cached_workers',
          'cached_clients',
          'selected_site',
          'registered_sites',
          'gps_cache_profile',
          'gps_cache_leads',
        ]).catch(() => {});

        // 4. Reset in-memory TenantStore for new corporate
        if (updatedUser.dbName) {
          tenantStore.switchTenant(updatedUser.dbName).catch(() => {});
        }

        // 5. Switch socket rooms (leave old room, join new room)
        switchTenantRoom(previousDbName, updatedUser.dbName, {
          corporateName: updatedUser.corporateName,
          corporatePAN: updatedUser.corporatePAN,
        });

        // 6. Persist new user session
        await AsyncStorage.setItem("userSession", JSON.stringify(updatedUser));

        // 7. Emit global CORPORATE_SWITCHED event for all components/services
        DeviceEventEmitter.emit('CORPORATE_SWITCHED', {
          previousDbName,
          newDbName: updatedUser.dbName,
          user: updatedUser,
        });

        // 8. Update React state
        setUser(updatedUser);
        appService.showToast(`Switched to ${userSession.corporateName}`, "Success");
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || "Failed to switch corporate";
      appService.showToast(msg, "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (userData: UserSession) => {
    try {
      setLoading(true);
      userData.token = userData.token.replace(/['"]+/g, "").trim();
      userRef.current = userData;
      appService.httpClient.defaults.headers.common['Authorization'] = `Bearer ${userData.token}`;
      if (userData.dbName) {
        appService.httpClient.defaults.headers.common['x-tenant-id'] = userData.dbName;
        tenantStore.switchTenant(userData.dbName).catch(() => {});
        switchTenantRoom(undefined, userData.dbName, {
          corporateName: userData.corporateName,
          corporatePAN: userData.corporatePAN,
        });
      }
      await AsyncStorage.setItem("userSession", JSON.stringify(userData));
      setUser(userData);
    } finally {
      setLoading(false);
    }
  }, []); // ← empty deps: stable forever

  // ── Interceptors ──────────────────────────────────────────────────────────
  const logoutRef = useRef(logout);
  useEffect(() => { logoutRef.current = logout; }, [logout]);

const PUBLIC_URLS = ['leads/public-inquiry', 'publicform/webInquiry']; 

  useEffect(() => {
    const reqId = appService.httpClient.interceptors.request.use(async (config) => {
      // ✅ Skip auth header for public routes
      const isPublic = PUBLIC_URLS.some(url => config.url?.includes(url));
      if (isPublic) return config;

      // 🚀 Skip auth header ONLY for PUBLIC auth routes (login, register, otp, etc.)
      const PUBLIC_AUTH_URLS = [
        'auth/send-otp',
        'auth/search',
        'auth/verify-otp',
        'auth/check-unique',
        'auth/register',
        'auth/login',
        'auth/unregistered-login',
        'auth/verify-identity',
        'auth/reset-password'
      ];
      const isPublicAuth = PUBLIC_AUTH_URLS.some(url => config.url?.includes(url));
      if (isPublicAuth) return config;

      const currentUser = userRef.current;
      if (currentUser) {
        if (currentUser.token) {
          config.headers.Authorization = `Bearer ${currentUser.token.replace(/['"]+/g, "").trim()}`;
        }
        
        // Routes like service/, payment/, staff/ require a tenant ID
        const needsTenant = config.url?.startsWith("service/") || 
                            config.url?.startsWith("payment/") || 
                            config.url?.startsWith("staff/");

        const hasTenantHeader = !!config.headers?.['x-tenant-id'];
        if (needsTenant && !currentUser.dbName && !hasTenantHeader) {
          // Silent rejection — components are already guarded, so this is just a safety net
          return Promise.reject({ 
            message: "Tenant resolution failed locally", 
            config, 
            response: { status: 400, data: { message: "Local block: No DB Name in session." } } 
          });
        }

        if (currentUser.dbName && !config.headers?.['x-tenant-id']) {
          config.headers['x-tenant-id'] = currentUser.dbName;
        }
      } else {
        // No user in memory, maybe check AsyncStorage once during bootstrap?
        // But Bootstrap should handle setting the user.
        // If we reach here, user is truly not logged in.
      }
      return config;
    });

  const resId = appService.httpClient.interceptors.response.use(
    (response) => response,
    async (error) => {
      const status = error.response?.status;
      const url    = error.config?.url || "";

      if (status === 502) {
        appService.showToast("Server is temporarily down. We are working on it!", "Error");
        return Promise.reject(error);
      }
      if (url.includes("auth/")) return Promise.reject(error);

      // ✅ Skip logout trigger for public routes
      const isPublic = PUBLIC_URLS.some(u => url.includes(u));
      if (isPublic) return Promise.reject(error);

      const stored = await AsyncStorage.getItem("userSession");
      const parsed = stored ? JSON.parse(stored) : null;

      if (status === 401) {
        if (!parsed?.token) {
          // Token missing, create new session (redirect to login) silently
          await logoutRef.current(false);
        } else {
          await logoutRef.current(false);
        }
      } else if (
        status === 400 && 
        error.response?.data?.message?.includes("Tenant resolution failed")
      ) {
        if (parsed?.dbName) {
          Alert.alert(
            "Access Denied", 
            "dbName missing and user not authorised to access app."
          );
        }
        await logoutRef.current(false);
      }
      return Promise.reject(error);
    }
  );

  return () => {
    appService.httpClient.interceptors.request.eject(reqId);
    appService.httpClient.interceptors.response.eject(resId);
  };
}, []); // ← empty deps: runs once on mount only

  // ── Socket Listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.dbName) return;

    const socket = require("@/hooks/Socket").getSocket();
    
    const onCorpUpdated = (data: { data: any }) => {
      console.log("🏢 Corporate profile updated via socket");
      const updatedProfile = data.data;
      if (updatedProfile && updatedProfile.CorpProfileImage) {
        updateUserProfile({ CorpProfileImage: updatedProfile.CorpProfileImage });
      }
    };

    socket.on("corp:updated", onCorpUpdated);

    return () => {
      socket.off("corp:updated", onCorpUpdated);
    };
  }, [user?.dbName, updateUserProfile]);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("userSession");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.token && parsed.token.split(".").length === 3) {
            const decoded = jwtDecode<DecodedToken>(parsed.token);
            if (decoded.exp && decoded.exp > Date.now() / 1000) {
              setUser(parsed as UserSession);

              // 🚀 Self-heal / Sync: If corporate name or multi-tenant corporate list is missing or incomplete, refresh from server
              if (!parsed.corporateName || !parsed.dbName || !parsed.accessCorporate || parsed.accessCorporate.length <= 1) {
                appService.httpClient.get('auth/me').then(async (meRes) => {
                  if (meRes.data?.success && meRes.data?.userSession) {
                    const refreshed = { ...meRes.data.userSession, token: meRes.data.token || parsed.token };
                    await AsyncStorage.setItem("userSession", JSON.stringify(refreshed));
                    setUser(refreshed);
                  }
                }).catch(() => {});
              }
            } else {
              await AsyncStorage.removeItem("userSession");
            }
          }
        }
      } catch (err) {
        console.error("Bootstrap Error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

 
  const userValue = useMemo(() => ({ user, loading, visitingCardUri }), [user, loading, visitingCardUri]);

  const actionsValue = useMemo(() => ({ login, logout, switchCorporate, updateUserProfile, setVisitingCardUri }), [
    login, logout, switchCorporate, updateUserProfile, setVisitingCardUri,
  ]);
 
  return (
    <UserContext.Provider value={userValue}>
      <AuthActionsContext.Provider value={actionsValue}>
        {children}
      </AuthActionsContext.Provider>
    </UserContext.Provider>
  );
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Use this in components that need user data (re-renders when user/loading changes) */
export const useUserContext = () => useContext(UserContext);

/** Use this in components that only need callbacks — NEVER triggers re-renders */
export const useAuthActions = () => useContext(AuthActionsContext);

export const useAuthContext = (): AuthContextType => {
  const { user, loading, visitingCardUri }              = useContext(UserContext);
  const { login, logout, switchCorporate, updateUserProfile, setVisitingCardUri } = useContext(AuthActionsContext);
  return { user, loading, visitingCardUri, login, logout, switchCorporate, updateUserProfile, setVisitingCardUri };
};