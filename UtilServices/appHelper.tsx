import api_url from '@/backend/routes/base_url';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosInstance } from 'axios';
import { readAsStringAsync } from 'expo-file-system/legacy';
import * as SMS from 'expo-sms';
import { jwtDecode } from 'jwt-decode';
import { Alert, Platform, ToastAndroid } from 'react-native';

// ─── Types & Constants
type NotificationType = 'Success' | 'Error' | 'Info';

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

// ─── AppService
class AppService {
  private static instance: AppService;
  public httpClient: AxiosInstance;
  private currentUrlIndex = 0;
  private baseURLs = [process.env.EXPO_PUBLIC_API_KEY, api_url]
    .filter(Boolean)
    .map((u) => u!.replace(/\/$/, '') + '/') as string[];

  private constructor() {
    this.httpClient = axios.create({
      baseURL: this.baseURLs[0],
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    this.setupInterceptors();
  }

  public static getInstance(): AppService {
    if (!AppService.instance) AppService.instance = new AppService();
    return AppService.instance;
  }

  /* ── UI & NOTIFICATION */

  public showToast(msg: string, type: NotificationType = 'Info') {
    if (Platform.OS === 'android') {
      ToastAndroid.show(`${type}: ${msg}`, ToastAndroid.SHORT);
    } else {
      Alert.alert(type === 'Error' ? '⚠️ Error' : `✅ ${type}`, msg);
    }
  }

  public async sendSMS(phoneNumbers: string | string[], message: string) {
    try {
      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) {
        this.showToast('SMS not supported', 'Error');
        return;
      }
      const recipients = Array.isArray(phoneNumbers) ? phoneNumbers : [phoneNumbers];
      const { result } = await SMS.sendSMSAsync(recipients, message);
      if (result === 'sent') this.showToast('Message sent!', 'Success');
      else if (result === 'unknown') this.showToast('SMS app opened', 'Info');
    } catch {
      this.showToast('Failed to open SMS', 'Error');
    }
  }

  /* ── SYSTEM & INTERCEPTORS */

  /* ✅ Checks both Internet and Database availability
   * Returns { available: boolean, error: string | null }
   */
  public async isSystemLive(): Promise<{ available: boolean; error: string | null }> {
    // 1. Check internet connectivity via a lightweight ping (no third-party package needed)
    try {
      await axios.get('https://www.google.com', { timeout: 4000 });
    } catch (error: any) {
      // No response at all = no internet; if server replied (even with error), internet is up
      if (!error.response) {
        return { available: false, error: 'No internet connection. Please check your WiFi/Data.' };
      }
    }

    // 2. Check Backend & Database connection
    try {
      const response = await this.httpClient.get('auth/health-check', { timeout: 5000 });

      if (response.status === 200) {
        // If backend returns a database field, validate it too
        if (response.data?.database === 'disconnected') {
          return { available: false, error: 'Database is down' };
        }
        return { available: true, error: null };
      }

      return { available: false, error: 'Server Error' };
    } catch (error: any) {
      if (error.response) {
        // Server replied with an error status — check database field
        const database = error.response.data?.database;
        return {
          available: false,
          error: database === 'disconnected' ? 'Database is down' : 'Server Error',
        };
      }
      // No response at all — server unreachable or timed out
      return { available: false, error: 'Backend server is unreachable. Is the server running?' };
    }
  }

  private setupInterceptors() {
    this.httpClient.interceptors.request.use((config) => {
      if (config.url?.startsWith('/')) {
        config.url = config.url.substring(1);
      }
      return config;
    });

    this.httpClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const req = error.config;
        if (!req) return Promise.reject(error);

        const isNetworkError = !error.response;
        req._retryCount = req._retryCount || 0;

        if (isNetworkError && req._retryCount < 3) {
          req._retryCount++;
          await new Promise((r) => setTimeout(r, 4000));
          return this.httpClient(req);
        }

        if (isNetworkError && this.currentUrlIndex < this.baseURLs.length - 1) {
          this.currentUrlIndex++;
          const nextUrl = this.baseURLs[this.currentUrlIndex];
          this.httpClient.defaults.baseURL = nextUrl;
          req.baseURL = nextUrl;
          console.warn(`🔄 Switched to fallback: ${nextUrl}`);
          return this.httpClient(req);
        }

        if (error.response?.status === 401 || error.response?.status === 403) {
          await AsyncStorage.removeItem('userSession');
        }
        return Promise.reject(error);
      }
    );
  }

  public async getSession() {
    const raw = await AsyncStorage.getItem('userSession');
    return raw ? JSON.parse(raw) : null;
  }

  /* ── LEAD HELPERS */

  /** Parses TradeIndia / epoch / ISO date strings into a Date object */
  private parseTradeIndiaDate(dateStr?: string, _timeStr?: string, epoch?: number): Date {
    if (epoch) return new Date(Number(epoch) < 1e10 ? Number(epoch) * 1000 : Number(epoch));
    if (dateStr && typeof dateStr === 'string') {
      if (dateStr.includes('T')) return new Date(dateStr); // ← ISO support added
      const m = dateStr.match(/(\d{1,2}) (\w+) (\d{4})/);
      if (m) {
        const month = MONTHS[m[2].toLowerCase().slice(0, 3)] ?? 0;
        return new Date(parseInt(m[3]), month, parseInt(m[1]));
      }
    }
    return new Date();
  }

  /** Builds a normalized lead object ready for the backend */
  private prepareLead(item: any, leadNo: number, session: any) {
    const now = new Date();
    const actionLabel = item.source === 'Other' ? 'Entered by' : 'Fetched by';
    const statusLabel = item.source === 'Other' ? 'Engaged' : 'Recent';

    return {
      source_id: String(
        item.source_id || item.rfi_id || Math.floor(100000 + Math.random() * 900000)
      ),
      lead_no: leadNo,
      sender_name: item.sender_name || 'Unknown',
      sender_mobile: item.sender_mobile || item.landline_number || '',
      sender_email: item.sender_email || '',
      sender_city: item.sender_city || 'Unknown',
      sender_state: item.sender_state || 'Unknown',
      product_name: item.product_name || 'No Product',
      generated_date: this.parseTradeIndiaDate(
        item.generated_date,
        item.generated_time,
        item.generated
      ),
      source: item.source || 'Other',
      status: item.status || statusLabel,
      corporateId: String(session?.corporateId || ''),
      corpAdminId: String(session?.corpAdminId || ''),
      activity: [{ date: now, action: actionLabel, byUser: session?.userDisplayName || 'User' }],
      ledger: [{ date: now, narration: 'Opening Balance', amount: 0, type: 'Dr' }],
    };
  }

  /** Fetches & normalises leads from TradeIndia + IndiaMart URLs */
  public async getDataProcess(url1: string, url2: string): Promise<any[]> {
    const session = await this.getSession();
    let combined: any[] = [];

    try {
      const r1 = await axios.get(url1);
      const d1 = (Array.isArray(r1.data) ? r1.data : []).map((i: any) => ({
        ...i,
        source: 'TradeIndia',
      }));
      combined = [...combined, ...d1];
      if (d1.length > 0) this.showToast(`TradeIndia: ${d1.length} found`, 'Success');
    } catch (e: any) {
      this.showToast(`URL1 error: ${e.message}`, 'Error');
    }

    try {
      const r2 = await axios.get(url2);
      const d2 = (r2.data?.records || (Array.isArray(r2.data) ? r2.data : [])).map((i: any) => ({
        ...i,
        source: 'IndiaMart',
      }));
      combined = [...combined, ...d2];
      if (d2.length > 0) this.showToast(`IndiaMart: ${d2.length} found`, 'Success');
    } catch (e: any) {
      this.showToast(`URL2 error: ${e.message}`, 'Error');
    }

    if (combined.length === 0) return [];
    return combined.map((item, idx) => this.prepareLead(item, idx + 1, session));
  }

  /** Fetches + sends leads to backend in batches of 50 */
  public async syncExternalLeads(url1: string, url2: string) {
    const leads = await this.getDataProcess(url1, url2);
    if (leads.length === 0) {
      this.showToast('No new data found', 'Info');
      return;
    }

    const session = await this.getSession();
    const token = session?.token;
    jwtDecode(token); // validate token early — throws if malformed

    const BATCH = 50;
    let saved = 0;
    for (let i = 0; i < leads.length; i += BATCH) {
      try {
        // 🚀 FIXED: Casing must match backend router (/addMany)
        await this.httpClient.post('/service/addMany', leads.slice(i, i + BATCH), {
          headers: { Authorization: `Bearer ${token}` },
        });
        saved += Math.min(BATCH, leads.length - i);
      } catch (e: any) {
        this.showToast(`Batch error: ${e.message}`, 'Error');
      }
    }
    if (saved > 0) this.showToast(`Synced ${saved} leads!`, 'Success');
  }

  /** Saves a single manually entered lead */
  public async saveManualLead(manualData: any) {
    const session = await this.getSession();
    if (!session?.token) {
      this.showToast('Authentication failed. Please login again.', 'Error');
      return;
    }

    const lead = this.prepareLead(manualData, 0, session);
    try {
      // 🚀 FIXED: Switch to individual create endpoint for manual leads
      // Backend automatically injects corporate context from token
      const res = await this.httpClient.post('/service/leads/create', lead, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (res.status === 200 || res.status === 201) {
        this.showToast('Manual lead saved!', 'Success');
        return res.data;
      }
    } catch (e: any) {
      this.showToast('Failed to save manual lead', 'Error');
      throw e;
    }
  }

  /* ── RECORDING HELPERS */
  public async getRecordingPath(): Promise<string | null> {
    return await AsyncStorage.getItem('CALL_REC_PATH');
  }

  public async saveRecordingPath(path: string) {
    await AsyncStorage.setItem('CALL_REC_PATH', path);
    this.showToast('Recording path saved', 'Success');
  }

  /** Logs a follow-up activity against an existing lead */
  public async leadFollowUp(activityData: {
    itemId: string;
    action: string;
    token: string;
    corporateId?: string;
  }): Promise<boolean> {
    const { itemId, action, token, corporateId } = activityData;

    // ── Validate inputs ───────────────────────────────────────────────────
    if (!itemId || itemId === 'undefined') {
      this.showToast('Lead reference missing', 'Error');
      return false;
    }
    if (!action.trim()) {
      this.showToast('Please enter a note', 'Error');
      return false;
    }

    // ── Auth ──────────────────────────────────────────────────────────────
    const session = await this.getSession();
    if (!session?.token) {
      this.showToast('Authentication failed. Please login again.', 'Error');
      return false;
    }

    const byUser = session?.userDisplayName ?? 'System';

    // ── Post ──────────────────────────────────────────────────────────────
    try {
      const res = await this.httpClient.post(
        `/service/leads/${itemId}/activity`,
        { action, byUser, corporateId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (res.data?.success) {
        this.showToast(`Activity logged by ${byUser}`, 'Success');
        return true;
      }
      return false;
    } catch (e: any) {
      console.log('❌ Activity Error:', {
        status: e?.response?.status,
        message: e?.response?.data,
        error: e?.message,
      });
      this.showToast(`Failed: ${e?.response?.status} ${e?.message}`, 'Error');
      return false;
    }
  }

  /* ── VALIDATION */

  public readonly regex = {
    name: /^[A-Za-z0-9 .,@'-]+$/,
    mobile: /^[6-9]\d{9}$/,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    pan: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
    gst: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    aadhar: /^\d{12}$/,
    pin: /^\d{6}$/,
    password: /^(?=.*[A-Z])(?=.*[!@#$%^&*()\-_=+{}[\]|;:'",.<>/?]).{8,}$/,
    url: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
  };

  /* ── MEDIA & DEVICE */

  public async switchCorporate(corporateId: string) {
    return this.httpClient.post('auth/switch-corporate', { corporateId });
  }

  public async uploadProfileImage(
    uri: string,
    userId: string,
    field: string,
    corporateId?: string
  ) {
    const ext = uri.split('.').pop()?.toLowerCase() || 'jpeg';
    const mimeType = `image/${ext === 'png' || ext === 'webp' ? ext : 'jpeg'}`;
    const base64 = await readAsStringAsync(uri, { encoding: 'base64' });
    return this.httpClient.post('auth/update-profile-image', {
      userId,
      imageBase64: `data:${mimeType};base64,${base64}`,
      fieldToUpdate: field,
      corporateId,
    });
  }

  public formatDate(date: any): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return [
      String(d.getDate()).padStart(2, '0'),
      String(d.getMonth() + 1).padStart(2, '0'),
      d.getFullYear(),
    ].join('-');
  }

  public formatDateTime(date: any): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const dateStr = this.formatDate(d);
    const timeStr = [
      String(d.getHours()).padStart(2, '0'),
      String(d.getMinutes()).padStart(2, '0'),
    ].join(':');
    return `${dateStr} ${timeStr}`;
  }

  public formatMobile(mobile: any) {
    let m = String(mobile || '').replace(/\D/g, '');
    if (m.length === 12 && m.startsWith('91')) m = m.slice(2);
    else if (m.length === 11 && m.startsWith('0')) m = m.slice(1);
    if (m.length !== 10) return null;
    return { plain: m, with91: `91${m}`, withPlus91: `+91${m}` };
  }

  public isValidPAN(pan: string): boolean {
    return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan);
  }

  public getIST(): string {
    const d = new Date();
    return d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  }

  public playAlertTone(type?: string): void {}

  public async getEmployee(employeeId: string, token: string): Promise<any> {
    try {
      const res = await this.httpClient.get(`service/hr/employees/${employeeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    } catch (e: any) {
      console.log('❌ getEmployee error:', e?.response?.data || e.message);
      throw e;
    }
  }

  public async getAttendanceHistory(
    token: string,
    userId: string,
    fromDate?: string,
    toDate?: string
  ): Promise<any> {
    try {
      const params: any = { employeeId: userId };
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;

      const res = await this.httpClient.get('service/hr/attendance', {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      return res.data;
    } catch (e: any) {
      console.log('❌ getAttendanceHistory error:', e?.response?.data || e.message);
      throw e;
    }
  }

  public async getContactLedger(mobile: string): Promise<any> {
    try {
      const res = await this.httpClient.get(`staff/contact/ledger/${mobile}`);
      return res.data;
    } catch (e: any) {
      console.log('❌ getContactLedger error:', e?.response?.data || e.message);
      throw e;
    }
  }

  public async getActiveDuty(employeeId: string, token: string): Promise<any> {
    try {
      const res = await this.httpClient.get('service/hr/attendance/active', {
        headers: { Authorization: `Bearer ${token}` },
        params: { employeeId },
      });
      return res.data;
    } catch (e: any) {
      console.log('❌ getActiveDuty error:', e?.response?.data || e.message);
      throw e;
    }
  }

  public async continueShift(payload: any, token: string): Promise<any> {
    try {
      const res = await this.httpClient.post('service/hr/attendance/continue-shift', payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    } catch (e: any) {
      console.log('❌ continueShift error:', e?.response?.data || e.message);
      throw e;
    }
  }

  public async sendBroadcast(payload: any, token: string): Promise<any> {
    try {
      const res = await this.httpClient.post('service/hr/broadcast', payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    } catch (e: any) {
      console.log('❌ sendBroadcast error:', e?.response?.data || e.message);
      throw e;
    }
  }

  public async updateGeoHistory(attendanceId: string, geoData: any, token: string): Promise<any> {
    try {
      const res = await this.httpClient.put(`service/hr/attendance/${attendanceId}`, geoData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    } catch (e: any) {
      console.log('❌ updateGeoHistory error:', e?.response?.data || e.message);
      throw e;
    }
  }

  public async getProjectLeads(token: string, corporateId?: string) {
    try {
      // 🚀 ROBUSTNESS: Resolve corporateId from session if missing (fallback)
      let cid = corporateId;
      if (!cid) {
        const session = await this.getSession();
        cid = session?.corporateId || session?.corpAdminId;
      }

      const res = await this.httpClient.get('/service/leads/project-active', {
        headers: { Authorization: `Bearer ${token}` },
        params: { corporateId: cid },
      });
      return res.data;
    } catch (e: any) {
      console.log('❌ getProjectLeads error:', e?.response?.data || e.message);
      throw e;
    }
  }

  public async getActiveStaff(token: string, corporateId?: string) {
    try {
      let cid = corporateId;
      if (!cid) {
        const session = await this.getSession();
        cid = session?.corporateId || session?.corpAdminId;
      }

      const res = await this.httpClient.get('/service/hr/attendance/active-staff', {
        headers: { Authorization: `Bearer ${token}` },
        params: { corporateId: cid },
      });
      return res.data;
    } catch (e: any) {
      console.log('❌ getActiveStaff error:', e?.response?.data || e.message);
      throw e;
    }
  }

  /** Fetches leads from email inbox and saves to MongoDB */
  public async readEmail(loginCredentials: { userName: any; password: any }) {
    try {
      const session = await this.getSession();
      const res = await this.httpClient.post(`/readEmails`, loginCredentials, {
        headers: { Authorization: `Bearer ${session?.token}` },
      });
      if (res.data.status === 'success') {
        this.showToast(`Synced ${res.data.count} new leads!`, 'Success');
        return res.data.data;
      }
      this.showToast(res.data.message || 'Sync failed', 'Error');
      return [];
    } catch (e: any) {
      this.showToast(e.response?.data?.message || e.message || 'Connection error', 'Error');
      return [];
    }
  }
}
export const appService = AppService.getInstance();
