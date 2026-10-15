/**
 * TenantStore.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Offline-first, in-memory cache for all tenant data domains.
 *
 * Architecture
 * ────────────
 *  • On first launch (or after logout/corporate-switch) the store is empty.
 *  • Each domain loads its data ONCE from the server and persists to AsyncStorage.
 *  • All subsequent reads return the in-memory snapshot INSTANTLY — no HTTP.
 *  • Socket events call patchRecord / removeRecord to surgically update the
 *    in-memory state AND AsyncStorage without re-fetching the whole collection.
 *  • Subscribers (React components via useTenantData) are notified via a
 *    lightweight EventEmitter so they re-render only for their domain.
 *
 * Usage
 * ─────
 *  import { tenantStore } from '@/UtilServices/TenantStore';
 *
 *  // Initialise once on login / corporate switch:
 *  await tenantStore.init(dbName, token, baseUrl);
 *
 *  // Read (instant, from memory):
 *  const employees = tenantStore.get('employees');
 *
 *  // Subscribe to a domain:
 *  const unsub = tenantStore.subscribe('leads', (leads) => setLeads(leads));
 *
 *  // Patch a single record (called from socket events):
 *  tenantStore.patchRecord('leads', updatedLead);
 *
 *  // Remove a single record:
 *  tenantStore.removeRecord('leads', deletedId);
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { appService } from './appHelper';

// ── Domain definitions ────────────────────────────────────────────────────────

export type TenantDomain =
  | 'leads'
  | 'employees'
  | 'activeStaff'
  | 'attendance'
  | 'parties'
  | 'products'
  | 'categories'
  | 'profile'
  | 'staff';

interface DomainConfig {
  /** REST path relative to the tenant service base */
  endpoint: string;
  /** AsyncStorage key — prefixed with dbName at runtime */
  storageKey: string;
  /** Where the array lives inside the API response */
  dataPath?: string;
}

const DOMAIN_CONFIG: Record<TenantDomain, DomainConfig> = {
  leads: { endpoint: 'service/leads/list', storageKey: 'ts:leads', dataPath: 'data' },
  employees: { endpoint: 'service/hr/employees', storageKey: 'ts:employees', dataPath: 'data' },
  activeStaff: {
    endpoint: 'service/hr/attendance/active-staff',
    storageKey: 'ts:activeStaff',
    dataPath: 'data',
  },
  attendance: { endpoint: 'service/hr/attendance', storageKey: 'ts:attendance', dataPath: 'data' },
  parties: { endpoint: 'service/parties/clients', storageKey: 'ts:parties', dataPath: 'data' },
  products: { endpoint: 'service/catalog/products', storageKey: 'ts:products', dataPath: 'data' },
  categories: {
    endpoint: 'service/catalog/categories',
    storageKey: 'ts:categories',
    dataPath: 'data',
  },
  profile: { endpoint: 'service/profile', storageKey: 'ts:profile', dataPath: 'data' },
  staff: { endpoint: 'service/staff', storageKey: 'ts:staff', dataPath: 'data' },
};

/** A record with at least a MongoDB _id */
type StoreRecord = { _id: string; [key: string]: any };

type Listener<T = any> = (data: T) => void;

// ── TenantStore class ─────────────────────────────────────────────────────────

class TenantStore {
  /** In-memory state per domain */
  private _data: Partial<Record<TenantDomain, any>> = {};
  /** Loading flags */
  private _loading: Partial<Record<TenantDomain, boolean>> = {};
  /** Whether the domain has ever been fetched this session */
  private _fetched: Partial<Record<TenantDomain, boolean>> = {};
  /** Subscribers: domain → Set of listeners */
  private _listeners: Partial<Record<TenantDomain, Set<Listener>>> = {};
  /** Current tenant */
  private _dbName: string = '';
  /** Meta-subscribers for loading state */
  private _loadingListeners: Partial<Record<TenantDomain, Set<Listener<boolean>>>> = {};

  // ── Initialisation ──────────────────────────────────────────────────────────

  /**
   * Call once on login or corporate switch.
   * Loads all domains from AsyncStorage immediately (instant warm start),
   * then silently refreshes from server in the background.
   */
  async init(dbName: string) {
    if (this._dbName === dbName) return; // already initialised for this tenant
    this._dbName = dbName;
    this._data = {};
    this._fetched = {};

    // Warm: load all cached domains from AsyncStorage in parallel
    await Promise.all(
      (Object.keys(DOMAIN_CONFIG) as TenantDomain[]).map((domain) => this._loadFromStorage(domain))
    );

    // Background refresh: fetch fresh data from server without blocking UI
    this._refreshAllInBackground();
  }

  /** Clear store on logout */
  clear() {
    this._dbName = '';
    this._data = {};
    this._fetched = {};
    this._loading = {};
    // Notify all subscribers with empty data
    (Object.keys(DOMAIN_CONFIG) as TenantDomain[]).forEach((domain) => {
      this._notify(domain, null);
    });
  }

  /** Reset old tenant state and re-initialize for new corporate tenant */
  async switchTenant(newDbName: string) {
    this.clear();
    await this.init(newDbName);
  }

  // ── Public read API ─────────────────────────────────────────────────────────

  get<T = any>(domain: TenantDomain): T | null {
    return (this._data[domain] ?? null) as T | null;
  }

  isLoading(domain: TenantDomain): boolean {
    return this._loading[domain] ?? false;
  }

  /**
   * Subscribe to changes on a specific domain.
   * The callback fires immediately with the current value.
   * Returns an unsubscribe function.
   */
  subscribe<T = any>(domain: TenantDomain, listener: Listener<T>): () => void {
    if (!this._listeners[domain]) {
      this._listeners[domain] = new Set();
    }
    this._listeners[domain]!.add(listener as Listener);

    // Immediate emit with current data
    listener(this._data[domain] ?? null);

    // Also auto-fetch if we don't have data yet
    if (!this._fetched[domain] && this._dbName) {
      this.refresh(domain);
    }

    return () => {
      this._listeners[domain]?.delete(listener as Listener);
    };
  }

  subscribeLoading(domain: TenantDomain, listener: Listener<boolean>): () => void {
    if (!this._loadingListeners[domain]) {
      this._loadingListeners[domain] = new Set();
    }
    this._loadingListeners[domain]!.add(listener);
    listener(this._loading[domain] ?? false);
    return () => {
      this._loadingListeners[domain]?.delete(listener);
    };
  }

  // ── Fetch & refresh ─────────────────────────────────────────────────────────

  /** Force-fetch a domain from the server and update cache. */
  async refresh(domain: TenantDomain): Promise<void> {
    if (!this._dbName) return;
    const config = DOMAIN_CONFIG[domain];
    if (!config) return;

    // 🚀 Deduplication: if a refresh is already in-flight for this domain,
    // don't fire a second HTTP request — just wait for the first to finish.
    if (this._loading[domain]) return;

    this._setLoading(domain, true);
    try {
      const res = await appService.httpClient.get(config.endpoint);
      const raw = res.data;
      const data = config.dataPath ? raw?.[config.dataPath] : raw;
      if (data !== undefined) {
        this._setData(domain, data);
        this._fetched[domain] = true;
        await this._persistToStorage(domain, data);
      }
    } catch (err: any) {
      // On error, keep existing cached data — don't wipe it
      console.warn(`[TenantStore] refresh(${domain}) failed:`, err?.message);
    } finally {
      this._setLoading(domain, false);
    }
  }

  // ── Surgical update helpers (called by socket event handlers) ───────────────

  /**
   * Upsert a single record into a list domain.
   * If the record already exists (matched by _id), it is replaced.
   * If it is new, it is prepended to the list.
   */
  patchRecord(domain: TenantDomain, record: StoreRecord) {
    const current: StoreRecord[] = Array.isArray(this._data[domain]) ? [...this._data[domain]] : [];

    const idx = current.findIndex((r) => String(r._id) === String(record._id));
    if (idx !== -1) {
      current[idx] = { ...current[idx], ...record };
    } else {
      current.unshift(record); // new record → prepend
    }

    this._setData(domain, current);
    this._persistToStorage(domain, current);
  }

  /**
   * Merge partial fields into a single record without replacing the whole object.
   * Useful for field-level socket updates.
   */
  mergeRecord(domain: TenantDomain, id: string, partial: Record<string, any>) {
    const current: StoreRecord[] = Array.isArray(this._data[domain]) ? [...this._data[domain]] : [];
    const idx = current.findIndex((r) => String(r._id) === String(id));
    if (idx !== -1) {
      current[idx] = { ...current[idx], ...partial };
      this._setData(domain, current);
      this._persistToStorage(domain, current);
    }
  }

  /** Remove a single record from a list domain by _id. */
  removeRecord(domain: TenantDomain, id: string) {
    const current: StoreRecord[] = Array.isArray(this._data[domain]) ? this._data[domain] : [];
    const updated = current.filter((r) => String(r._id) !== String(id));
    this._setData(domain, updated);
    this._persistToStorage(domain, updated);
  }

  /** Replace the entire value for a non-list domain (e.g., profile). */
  setDoc(domain: TenantDomain, doc: any) {
    this._setData(domain, doc);
    this._persistToStorage(domain, doc);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _storageKey(domain: TenantDomain): string {
    return `${DOMAIN_CONFIG[domain].storageKey}:${this._dbName}`;
  }

  private async _loadFromStorage(domain: TenantDomain) {
    try {
      const raw = await AsyncStorage.getItem(this._storageKey(domain));
      if (raw) {
        const parsed = JSON.parse(raw);
        this._data[domain] = parsed;
        // Notify subscribers who mounted before init finished
        this._notify(domain, parsed);
      }
    } catch {
      // Corrupt cache — ignore, will be overwritten on next refresh
    }
  }

  private async _persistToStorage(domain: TenantDomain, data: any) {
    try {
      await AsyncStorage.setItem(this._storageKey(domain), JSON.stringify(data));
    } catch (err: any) {
      console.warn(`[TenantStore] persist(${domain}) failed:`, err?.message);
    }
  }

  private _setData(domain: TenantDomain, data: any) {
    this._data[domain] = data;
    this._notify(domain, data);
  }

  private _setLoading(domain: TenantDomain, val: boolean) {
    this._loading[domain] = val;
    this._loadingListeners[domain]?.forEach((cb) => {
      try {
        cb(val);
      } catch {}
    });
  }

  private _notify(domain: TenantDomain, data: any) {
    this._listeners[domain]?.forEach((cb) => {
      try {
        cb(data);
      } catch {}
    });
  }

  private _refreshAllInBackground() {
    // 🚀 Only refresh domains that have active subscribers.
    // This means a screen that doesn't use `useProducts` won't trigger
    // a /catalog/products HTTP request on login — saving server CPU.
    const domains = (Object.keys(DOMAIN_CONFIG) as TenantDomain[])
      .filter((d) => (this._listeners[d]?.size ?? 0) > 0);

    // Stagger with 400ms gaps so requests don't all arrive in the same burst
    domains.forEach((domain, i) => {
      setTimeout(() => this.refresh(domain), i * 400);
    });
  }
}

// Singleton — one store for the entire app lifetime
export const tenantStore = new TenantStore();
