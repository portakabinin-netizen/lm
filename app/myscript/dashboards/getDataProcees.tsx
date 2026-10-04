import api_url from "@/backend/routes/base_url";
import { httpClient } from "@/context/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { jwtDecode } from "jwt-decode";
import { Alert, Platform, ToastAndroid } from "react-native";

// -------------------- 🔹 Types & Constants --------------------
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

// -------------------- 🔹 Helper Functions --------------------
const showToast = (msg: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  } else {
    Alert.alert("Sync Update", msg);
  }
};

const parseTradeIndiaDate = (dateStr?: string, timeStr?: string, epoch?: number): Date => {
  if (epoch) {
    return new Date(Number(epoch) < 1e10 ? Number(epoch) * 1000 : Number(epoch));
  }
  if (dateStr && typeof dateStr === 'string') {
    if (dateStr.includes('T')) return new Date(dateStr);
    const m = dateStr.match(/(\d{1,2}) (\w+) (\d{4})/);
    if (m) {
      const day = parseInt(m[1], 10);
      const month = MONTHS[m[2].toLowerCase().slice(0, 3)] ?? 0;
      const year = parseInt(m[3], 10);
      return new Date(year, month, day);
    }
  }
  return new Date();
};

// -------------------- 🔹 Core Logic --------------------

/**
 * Prepares a single lead object for the backend
 * Defined as a function declaration to ensure it's available throughout the file
 */
function prepareLead(item: any, leadNo: number, session: any) {
  const now = new Date();
  return {
    source_id: String(item.source_id || item.rfi_id || Date.now()),
    lead_no: leadNo,
    sender_name: item.sender_name || "Unknown",
    sender_mobile: item.sender_mobile || item.landline_number || "",
    sender_email: item.sender_email || "",
    sender_city: item.sender_city || "Unknown",
    sender_state: item.sender_state || "Unknown",
    product_name: item.product_name || "No Product",
    generated_date: parseTradeIndiaDate(item.generated_date, item.generated_time, item.generated),
    source: item.source || "Other",
    status: "Recent",
    corporateId: session?.corporateId,
    corpAdminId: session?.corpAdminId,
    activity: [{ date: now, action: `Fetched by`, byUser:session.userDisplayName }],
    ledger: [{ date: now, narration: "Opening Balance", amount: 0, type: "Dr" }],
  };
}

/**
 * Fetches data from multiple sources with independent error handling
 */
export const getDataProcess = async (url1: string, url2: string) => {
  const sessionString = await AsyncStorage.getItem("userSession");
  const session = sessionString ? JSON.parse(sessionString) : null;
  let combined: any[] = [];

  // --- 🔹 URL 1 (TradeIndia) ---
  try {
   
    const resp1 = await axios.get(url1);
    const data1 = Array.isArray(resp1.data) ? resp1.data : [];
    const normalized1 = data1.map((item: any) => ({ ...item, source: "TradeIndia" }));
    combined = [...combined, ...normalized1];
    if (normalized1.length > 0) showToast(`✅ TradeIndia: ${normalized1.length} found`);
  } catch (err: any) {
    showToast(`❌ URL 1 ${err.message}`);
  }

  // --- 🔹 URL 2 (IndiaMart / PythonAnywhere) ---
  try {
    const resp2 = await axios.get(url2);
    const data2 = resp2.data?.records || (Array.isArray(resp2.data) ? resp2.data : []);
    const normalized2 = data2.map((item: any) => ({ ...item, source: "IndiaMart" }));
    combined = [...combined, ...normalized2];
    if (normalized2.length > 0) showToast(`✅ IndiaMart: ${normalized2.length} found`);
  } catch (err: any) {
     showToast(`❌ URL 2 ${err.message}`); 
  }

  if (combined.length === 0) return [];
  
  // Now prepareLead is guaranteed to be found
  return combined.map((item: any, idx: number) => prepareLead(item, idx + 1, session));
};

/**
 * Sends processed leads to the backend in batches
 */
export const sendLeadsToBackend = async (url1: string, url2: string) => {

  const leads = await getDataProcess(url1, url2);
  
  if (!leads || leads.length === 0) {
    showToast("ℹ️ No new data to save");
    return;
  }

  const sessionString = await AsyncStorage.getItem("userSession");
  const session = sessionString ? JSON.parse(sessionString) : null;
  const token = session?.token; 
  const decoded =jwtDecode(token);
  
  const BATCH_SIZE = 50;
  let totalSaved = 0;

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    try {
     
      await httpClient.post(`${api_url}/service/addmany`, batch, {
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
      });
      totalSaved += batch.length;
    } catch (error: any) {
      console.error("Sync Error:", error.message);
      showToast("❌ Error saving batch to database");
    }
  }

  if (totalSaved > 0) {
    showToast(`🚀 Successfully synced ${totalSaved} leads!`);
  }
};