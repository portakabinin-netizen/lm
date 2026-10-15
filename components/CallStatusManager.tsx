import LeadModal from "@/modal/LeadModal";
import { appService } from "@/UtilServices/appHelper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { logCallToSQLite } from "@/UtilServices/sqliteService";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Alert,
    Linking,
    NativeEventEmitter,
    NativeModules,
    Platform,
} from "react-native";

const { CallTrackerModule, ContactsModule, OverlayModule } = NativeModules;

const SPAM_KEY = "PERMANENT_SPAM_NUMBERS";
const log = (...args: any[]) => {
  const msg = String(args[0] || "");
  if (msg.toLowerCase().includes('error') || msg.toLowerCase().includes('fail')) {
    console.error("[CallStatus]", ...args);
  }
};

// Helper to ensure data types match what the Native Bridge expects
const sanitizePayload = (payload: any) => {
  const leadNoStr = payload.leadNo !== undefined && payload.leadNo !== null 
    ? String(payload.leadNo) 
    : ""; 

  return {
    type: String(payload.type || "unknown"),
    mobile: String(payload.mobile || ""),
    leadNo: leadNoStr, 
    name: String(payload.name || ""),
    product: String(payload.product || ""),
    status: String(payload.status || ""),
  };
};

const CallStatusManager: React.FC = () => {
  // --- Refs & State ---
  const lastHandledNumber = useRef<string | null>(null);
  const blockedNumbers = useRef<Set<string>>(new Set());
  
  const [isAddLeadModalVisible, setAddLeadModalVisible] = useState(false);
  const [targetMobile, setTargetMobile] = useState("");
  const permissionAlertShown = useRef(false); // 🚀 NEW: Prevent spamming permission alerts

  /* ================= LOAD SPAM DATA ================= */
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(SPAM_KEY);
        if (saved) blockedNumbers.current = new Set(JSON.parse(saved));
        // log("Loaded spam numbers:", blockedNumbers.current.size);
      } catch (e) {
        log("Spam load error:", e);
      }
    })();
  }, []);

  const saveSpamNumbers = async () => {
    try {
      await AsyncStorage.setItem(
        SPAM_KEY,
        JSON.stringify([...blockedNumbers.current])
      );
    } catch (e) {
      log("Spam save error:", e);
    }
  };

  /* ================= UTILITY METHODS ================= */
  const getContactName = async (number: string) => {
    try {
      if (!ContactsModule?.getContactName) return null;
      const name = await ContactsModule.getContactName(number);
      return (!name || name === number) ? null : name;
    } catch (e) {
      log("Contact lookup error:", e);
      return null;
    }
  };

  const searchLead = useCallback(async (mobile: string) => {
    try {
      const session = await AsyncStorage.getItem("userSession");
      if (!session) return null;

      const user = JSON.parse(session);
      if (!user?.token) return null;

      const res = await appService.httpClient.get("/service/leads/search", {
        headers: { Authorization: `Bearer ${user.token}` },
        params: { mobile },
        validateStatus: () => true,
      });

      if (res.status !== 200 || !res?.data?.success) return null;
      return res.data.data;
    } catch (e) {
      log("DB search error:", e);
      return null;
    }
  }, []);

  /* ================= OVERLAY CONTROL ================= */
  const ensureOverlayPermission = async () => {
    if (Platform.OS !== "android") return false;
    try {
      const granted = await OverlayModule?.checkPermission?.();
      
      // 🚀 LOGIC FIX: Native bridge might return truthy values that aren't strict booleans
      if (granted === true || granted === 1 || granted === "true") {
        permissionAlertShown.current = false; // Reset if granted
        return true;
      }

      // If missing, only ask once per app session / call sequence to avoid pestering
      if (!permissionAlertShown.current) {
        permissionAlertShown.current = true;
        
        Alert.alert(
          "Caller Info Overlay", 
          "We need 'Display over other apps' permission to show caller details during calls.", 
          [
            { 
              text: "Open Settings", 
              onPress: () => {
                OverlayModule?.requestPermission?.();
                // Optionally open settings if requestPermission doesn't do it automatically
                // Linking.openSettings(); 
              } 
            },
            { text: "Not Now", style: "cancel" },
          ]
        );
      }
      return false;
    } catch (e) {
      log("Permission check error:", e);
      return false;
    }
  };

  const triggerOverlay = async (rawPayload: any) => {
    try {
      const payload = sanitizePayload(rawPayload);
      const allowed = await ensureOverlayPermission();

      if (allowed && OverlayModule?.showOverlay) {
        OverlayModule.showOverlay(payload);
        // log("Native overlay triggered successfully");
      } else if (!permissionAlertShown.current) {
        // 🚀 DOUBLE ALERT FIX: Only show fallback info if we didn't JUST ask for permission
        Alert.alert(payload.name || "Unknown Caller", `Mobile: ${payload.mobile}\nStatus: ${payload.status || "N/A"}`);
      }
    } catch (e) {
      log("triggerOverlay error:", e);
    }
  };

  const hideOverlay = () => {
    try {
      if (Platform.OS === "android" && OverlayModule?.hideOverlay) {
        OverlayModule.hideOverlay();
        // log("Native overlay hidden");
      }
    } catch (e) {
      log("hideOverlay error:", e);
    }
  };

  /* ================= CORE LOGIC: PROCESS CALL ================= */
  const processCall = useCallback(
    async (number: string) => {
      const formatted = appService.formatMobile(number);
      const mobile = formatted?.plain;

      if (!mobile || mobile.length !== 10 || lastHandledNumber.current === mobile) return;
      
      // Skip if explicitly blocked/spam
      if (blockedNumbers.current.has(mobile)) {
        log("Blocked number detected, ignoring.");
        return;
      }

      lastHandledNumber.current = mobile;

      // 1. Priority Check: Database
      const dbLead = await searchLead(mobile);
      if (dbLead) {
        logCallToSQLite(mobile, dbLead.name || "Lead Caller", dbLead.status || "Recent");
        return triggerOverlay({
          type: "lead",
          mobile,
          leadNo: dbLead?.leadNo || dbLead?.leadno || "",
          name: dbLead?.name,
          product: dbLead?.product,
          status: dbLead?.status,
        });
      }

      // 2. Secondary Check: Local Contacts (If found, we EXIT - no popup)
      const contactName = await getContactName(mobile);
      if (contactName) {
        log("Saved contact found. Suppression overlay.");
        logCallToSQLite(mobile, contactName, "Saved Contact");
        return; 
      }

      // 3. Fallback: Unknown Caller (Enables Add Lead button)
      logCallToSQLite(mobile, "Unknown Caller", "Recent");
      triggerOverlay({ 
        type: "unknown", 
        mobile, 
        name: "Unknown Caller" 
      });
    },
    [searchLead]
  );

  /* ================= LISTENER 1: CALL TRACKER ================= */
  useEffect(() => {
    if (Platform.OS !== "android" || !CallTrackerModule) return;

    const emitter = new NativeEventEmitter(CallTrackerModule);
    const sub = emitter.addListener("onCallStateChange", (data) => {
      try {
        const { state, phoneNumber } = data || {};
        const clean = phoneNumber?.replace(/\D/g, "").slice(-10);

        if ((state === "RINGING" || state === "OFFHOOK") && clean?.length === 10) {
          processCall(clean);
        }

        if (state === "IDLE") {
          lastHandledNumber.current = null;
          hideOverlay(); 
        }
      } catch (e) {
        log("CallTracker listener error:", e);
      }
    });

    return () => sub.remove();
  }, [processCall]);

  /* ================= LISTENER 2: OVERLAY BUTTONS ================= */
  useEffect(() => {
    if (Platform.OS !== "android" || !OverlayModule) return;

    const overlayEmitter = new NativeEventEmitter(OverlayModule);
    const sub = overlayEmitter.addListener("onOverlayAction", (data) => {
      const { action, mobile } = data;
      
      // 🚀 NORMALIZE: consistent cleaning for native buttons
      const formatted = appService.formatMobile(mobile);
      const cleanPhone = formatted ? formatted.plain : (mobile || "").replace(/\D/g, "").slice(-10);

      switch(action) {
        case "ADD_LEAD":
          setTargetMobile(cleanPhone);
          setAddLeadModalVisible(true);
          hideOverlay();
          break;
        case "SPAM":
          blockedNumbers.current.add(cleanPhone);
          saveSpamNumbers();
          hideOverlay();
          break;
        case "IGNORE":
          hideOverlay();
          break;
        default:
          hideOverlay();
      }
    });

    return () => sub.remove();
  }, []);

  /* ================= RENDER ================= */
  return (
    <LeadModal 
      visible={isAddLeadModalVisible}
      mobile={targetMobile}
      type="addLead"
      onClose={() => {
        setAddLeadModalVisible(false);
        setTargetMobile("");
      }}
    />
  );
};

export default CallStatusManager;