import api_url, { isLocalMachine, local_api_url } from '@/backend/routes/base_url';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosInstance } from 'axios';
import Constants from 'expo-constants';
import { readAsStringAsync } from 'expo-file-system/legacy';
import * as SMS from 'expo-sms';
import { jwtDecode } from 'jwt-decode';
import { Alert, DeviceEventEmitter, Platform, ToastAndroid } from 'react-native';

// ─── Types & Constants
type NotificationType = 'Success' | 'Error' | 'Info' | 'Warning';

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
  private baseURLs: string[];
  private liveURLs: string[] = [];
  private static readonly STORAGE_HOST_KEY = 'SELECTED_HOST_URL';
  private hasUserSelectedHost = false;

  private constructor() {
    this.baseURLs = this.buildCandidateURLs();
    this.httpClient = axios.create({
      baseURL: this.baseURLs[0] || api_url,
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    this.setupInterceptors();
  }

  public isLocal(url: string): boolean {
    return /https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|10\.\d+\.\d+\.\d+|.*\.local)/i.test(
      url
    );
  }

  public getExpoPublicEnv(): Record<string, string> {
    const envMap: Record<string, string> = {};

    const sources: any[] = [
      Constants?.expoConfig?.extra?.expoPublicEnv,
      Constants?.expoConfig?.extra,
      (Constants as any)?.manifest?.extra?.expoPublicEnv,
      (Constants as any)?.manifest?.extra,
      (Constants as any)?.manifest2?.extra?.expoClient?.extra?.expoPublicEnv,
      (Constants as any)?.manifest2?.extra?.expoClient?.extra,
      typeof process !== 'undefined' && process?.env ? process.env : null,
    ];

    for (let s = 0; s < sources.length; s++) {
      const source = sources[s];
      if (source && typeof source === 'object') {
        const target =
          source.expoPublicEnv && typeof source.expoPublicEnv === 'object'
            ? { ...source, ...source.expoPublicEnv }
            : source;

        const entries = Object.entries(target);
        for (let i = 0; i < entries.length; i++) {
          const [key, val] = entries[i];
          if (
            key.startsWith('EXPO_PUBLIC_API_URL') &&
            typeof val === 'string' &&
            val.trim() &&
            !envMap[key]
          ) {
            envMap[key] = val.trim();
          }
        }
      }
    }

    return envMap;
  }

  private formatCamelCase(str: string): string {
    if (!str) return 'Server';
    const lower = str.toLowerCase();
    if (lower === 'onrender') return 'OnRender';
    if (lower === 'oracle') return 'Oracle';
    if (lower === 'vercel') return 'Vercel';
    if (lower === 'railway') return 'Railway';
    if (lower === 'local') return 'Local';
    if (lower === 'render') return 'Render';
    if (lower === 'machin') return 'Machin';
    if (lower === 'server') return 'Server';

    return str
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  public getHostDisplayName(url?: string): string {
    const raw = (url || this.getCurrentBaseURL() || '').trim();
    if (!raw) return 'Server';

    const cleanUrl = (u: string) =>
      u.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const targetClean = cleanUrl(raw);
    const targetHost = targetClean.split('/')[0].split(':')[0];

    // 1. Dynamic check against EXPO_PUBLIC_API_URL environment variables
    const publicEnv = this.getExpoPublicEnv();
    for (const [key, val] of Object.entries(publicEnv)) {
      if (
        key.startsWith('EXPO_PUBLIC_API_URL') &&
        typeof val === 'string' &&
        val.trim()
      ) {
        const valClean = cleanUrl(val);
        const valHost = valClean.split('/')[0].split(':')[0];

        if (
          valClean === targetClean ||
          valClean.startsWith(targetClean) ||
          targetClean.startsWith(valClean) ||
          valHost === targetHost
        ) {
          if (key.startsWith('EXPO_PUBLIC_API_URL_')) {
            return this.formatCamelCase(key.replace('EXPO_PUBLIC_API_URL_', ''));
          }
          return this.formatCamelCase(key.replace('EXPO_PUBLIC_API_URL', ''));
        }
      }
    }

    // 2. Fallbacks for known providers/IPs
    const lower = raw.toLowerCase();
    if (lower.includes('onrender.com') || lower.includes('render')) return 'OnRender';
    if (lower.includes('137.23.37.25') || lower.includes('80.225.215.140') || lower.includes('oracle')) return 'Oracle';
    if (lower.includes('vercel.app') || lower.includes('vercel')) return 'Vercel';
    if (lower.includes('railway.app') || lower.includes('railway')) return 'Railway';
    if (lower.includes('localhost') || lower.includes('127.0.0.1')) return 'Local';

    // 3. Fallback to host/server
    if (targetHost) return this.formatCamelCase(targetHost);
    return 'Server';
  }

  private buildCandidateURLs(): string[] {
    const normalize = (url: string) => {
      const clean = url.trim().replace(/\/+$/, '');
      return clean.endsWith('/api') ? clean + '/' : clean + '/api/';
    };

    const seen = new Set<string>();
    const urls: string[] = [];
    const urlPattern = /^https?:\/\//i;

    const publicEnv = this.getExpoPublicEnv();
    const envEntries = Object.entries(publicEnv);

    const rawCandidates: string[] = [];

    // 1. Capture all variables matching prefix EXPO_PUBLIC_API_URL_
    for (let i = 0; i < envEntries.length; i++) {
      const [key, val] = envEntries[i];
      if (
        key.startsWith('EXPO_PUBLIC_API_URL_') &&
        typeof val === 'string' &&
        urlPattern.test(val.trim())
      ) {
        rawCandidates.push(val.trim());
      }
    }

    // 2. Capture any exact EXPO_PUBLIC_API_URL variables (e.g. EXPO_PUBLIC_API_URL, EXPO_PUBLIC_API_URL1, etc.)
    for (let i = 0; i < envEntries.length; i++) {
      const [key, val] = envEntries[i];
      if (
        !key.startsWith('EXPO_PUBLIC_API_URL_') &&
        key.startsWith('EXPO_PUBLIC_API_URL') &&
        typeof val === 'string' &&
        urlPattern.test(val.trim())
      ) {
        rawCandidates.push(val.trim());
      }
    }

    // Static references for inlining into APK bundle (only EXPO_PUBLIC_API_URL*)
    const staticFallbacks: (string | undefined)[] = [
      process.env.EXPO_PUBLIC_API_URL_MACHIN,
      process.env.EXPO_PUBLIC_API_URL_ORACLE,
      process.env.EXPO_PUBLIC_API_URL_ONRENDER,
      process.env.EXPO_PUBLIC_API_URL_RENDER,
      process.env.EXPO_PUBLIC_API_URL_CF,
      process.env.EXPO_PUBLIC_API_URL,
      process.env.EXPO_PUBLIC_API_URL1,
      process.env.EXPO_PUBLIC_API_URL2,
    ];
    for (const fb of staticFallbacks) {
      if (fb && typeof fb === 'string' && urlPattern.test(fb.trim())) {
        rawCandidates.push(fb.trim());
      }
    }

    for (let i = 0; i < rawCandidates.length; i++) {
      const val = rawCandidates[i];
      if (
        val &&
        typeof val === 'string' &&
        urlPattern.test(val.trim())
      ) {
        const n = normalize(val);
        if (!seen.has(n)) {
          seen.add(n);
          urls.push(n);
        }
      }
    }

    if (urls.length === 0) {
      if (api_url) {
        const n = normalize(api_url);
        seen.add(n);
        urls.push(n);
      }
      if (local_api_url) {
        const n = normalize(local_api_url);
        if (!seen.has(n)) {
          seen.add(n);
          urls.push(n);
        }
      }
      const local5001 = normalize('http://localhost:5001/api');
      if (!seen.has(local5001)) {
        seen.add(local5001);
        urls.push(local5001);
      }
      const emu5001 = normalize('http://10.0.2.2:5001/api');
      if (!seen.has(emu5001)) {
        seen.add(emu5001);
        urls.push(emu5001);
      }
    }

    return urls;
  }

  public getBaseURLs(): string[] {
    return [...this.baseURLs];
  }

  public getLiveURLs(): string[] {
    return [...this.liveURLs];
  }

  public getCurrentBaseURL(): string {
    return this.httpClient.defaults.baseURL || this.baseURLs[this.currentUrlIndex] || api_url || '';
  }

  public getHostList(): string[] {
    const seen = new Set<string>();
    const merged: string[] = [];
    const add = (u: string | undefined) => {
      if (u && typeof u === 'string') {
        const clean = u.trim().replace(/\/+$/, '');
        if (!clean) return;
        const normalized = clean.endsWith('/api') ? clean + '/' : clean + '/api/';
        if (!seen.has(normalized)) {
          seen.add(normalized);
          merged.push(normalized);
        }
      }
    };

    this.liveURLs.forEach(add);
    this.baseURLs.forEach(add);
    if (api_url) add(api_url);
    add('http://localhost:5001/api/');
    add('http://10.0.2.2:5001/api/');
    return merged;
  }

  public checkLiveURLs = async (): Promise<string[]> => {
    const candidates = this.getHostList();
    if (candidates.length === 0) return [];

    const fallbackUrl = candidates[0];
    const liveList: string[] = [];
    let selectedActiveUrl: string | null = null;

    for (let i = 0; i < candidates.length; i++) {
      const url = candidates[i];
      try {
        const res = await axios.get(`${url}auth/health-check`, { timeout: 4000 });
        const isSuspended =
          typeof res.data === 'string' &&
          (res.data.includes('<title>Service Suspended</title>') ||
            res.data.includes('<!DOCTYPE html>'));
        const isDbDown = res.data?.database === 'disconnected';

        if (res.status === 200 && !isSuspended && !isDbDown) {
          liveList.push(url);
          if (!selectedActiveUrl) {
            selectedActiveUrl = url;
          }
        }
      } catch (err: any) {
        // unreachable
      }
    }

    this.liveURLs = liveList;

    const targetUrl = selectedActiveUrl || fallbackUrl;
    const currentBase = this.httpClient.defaults.baseURL || '';

    const isCurrentBaseLive = this.liveURLs.includes(currentBase);
    if ((!this.hasUserSelectedHost || !isCurrentBaseLive) && targetUrl && targetUrl !== currentBase) {
      this.httpClient.defaults.baseURL = targetUrl;
      const matchingIdx = this.baseURLs.indexOf(targetUrl);
      if (matchingIdx !== -1) this.currentUrlIndex = matchingIdx;
      DeviceEventEmitter.emit('SERVER_HOST_CHANGED', targetUrl);
      DeviceEventEmitter.emit('api_host_changed', targetUrl);
    }

    return [...this.liveURLs];
  };

  public async updateHost(newHost: string) {
    const clean = newHost.trim().replace(/\/+$/, '');
    const normalized = clean.endsWith('/api') ? clean + '/' : clean + '/api/';
    this.httpClient.defaults.baseURL = normalized;
    if (!this.baseURLs.includes(normalized)) {
      this.baseURLs.unshift(normalized);
    }
    this.currentUrlIndex = this.baseURLs.indexOf(normalized);
    this.hasUserSelectedHost = true;
    await AsyncStorage.setItem(AppService.STORAGE_HOST_KEY, normalized).catch(() => {});
    DeviceEventEmitter.emit('SERVER_HOST_CHANGED', normalized);
    DeviceEventEmitter.emit('api_host_changed', normalized);
  }

  public loadPersistedHost = async (): Promise<string> => {
    this.checkLiveURLs().catch(() => {});
    try {
      const saved = await AsyncStorage.getItem(AppService.STORAGE_HOST_KEY);
      if (saved && saved.startsWith('http')) {
        const clean = saved.trim().replace(/\/+$/, '');
        if (
          (!isLocalMachine && this.isLocal(clean)) ||
          clean.includes('hibiz-nine.vercel.app') ||
          clean.includes(':5000')
        ) {
          console.log('[AppService] Discarding invalid persisted host on APK:', clean);
          await AsyncStorage.removeItem(AppService.STORAGE_HOST_KEY).catch(() => {});
          return this.getCurrentBaseURL();
        }
        const normalized = clean.endsWith('/api') ? clean + '/' : clean + '/api/';
        if (!this.baseURLs.includes(normalized)) {
          this.baseURLs.unshift(normalized);
        }
        this.currentUrlIndex = this.baseURLs.indexOf(normalized);
        this.httpClient.defaults.baseURL = normalized;
        this.hasUserSelectedHost = true;
        return normalized;
      }
    } catch (e) {
      console.warn('[AppService] Failed to load persisted host:', e);
    }
    return this.getCurrentBaseURL();
  };

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

  public async isSystemLive(): Promise<{ available: boolean; error: string | null }> {
    try {
      await axios.get('https://www.google.com', { timeout: 4000 });
    } catch (error: any) {
      if (!error.response) {
        return { available: false, error: 'No internet connection. Please check your WiFi/Data.' };
      }
    }

    const targetBase = this.httpClient.defaults.baseURL || this.baseURLs[0] || api_url;
    try {
      const response = await this.httpClient.get('auth/health-check', { timeout: 5000 });

      if (response.status === 200) {
        if (response.data?.database === 'disconnected') {
          this.liveURLs = this.liveURLs.filter((u) => u !== targetBase);
          return { available: false, error: 'Database is down' };
        }
        if (!this.liveURLs.includes(targetBase)) {
          this.liveURLs.push(targetBase);
        }
        return { available: true, error: null };
      }
      this.liveURLs = this.liveURLs.filter((u) => u !== targetBase);
      return { available: false, error: 'Backend server returned unexpected status.' };
    } catch (error: any) {
      this.liveURLs = this.liveURLs.filter((u) => u !== targetBase);
      const errMsg =
        error.response?.data?.message ||
        (error.response?.data?.database === 'disconnected' ? 'Database is down' : error.message);
      return { available: false, error: errMsg || 'Backend server is unreachable.' };
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
        req._failoverCount = req._failoverCount || 0;

        if (isNetworkError && req._retryCount < 2) {
          req._retryCount++;
          await new Promise((r) => setTimeout(r, 2000));
          return this.httpClient(req);
        }

        if (isNetworkError && req._failoverCount < this.baseURLs.length) {
          req._failoverCount++;
          this.currentUrlIndex = (this.currentUrlIndex + 1) % this.baseURLs.length;
          const nextUrl = this.baseURLs[this.currentUrlIndex];
          console.warn(
            `🔄 [AppService] Failing over to next baseURL [${this.currentUrlIndex}]: ${nextUrl}`
          );
          this.httpClient.defaults.baseURL = nextUrl;
          req.baseURL = nextUrl;
          DeviceEventEmitter.emit('SERVER_HOST_CHANGED', nextUrl);
          DeviceEventEmitter.emit('api_host_changed', nextUrl);
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
export const httpClient = appService.httpClient;
export const baseURLs = appService.getBaseURLs();
export const getLiveURLs = () => appService.getLiveURLs();
export const checkLiveURLs = () => appService.checkLiveURLs();
export const getCurrentBaseURL = () => appService.getCurrentBaseURL();
export const loadPersistedHost = () => appService.loadPersistedHost();
export const getHostDisplayName = (url?: string) => appService.getHostDisplayName(url);
export {
  api_url,
  api_urls,
  configuredApiUrls,
  getConfiguredApiUrls,
  isLocalMachine,
  local_api_url
} from '@/backend/routes/base_url';
