/**
 * OfflineQueue.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Offline-first mutation queue with optimistic UI support.
 *
 * How it works
 * ────────────
 *  1. When a mutation (POST/PUT/DELETE) is requested:
 *     a. OPTIMISTIC UPDATE: The change is applied to TenantStore immediately
 *        so the UI reflects it without waiting for the server.
 *     b. QUEUE: The mutation is serialised and appended to AsyncStorage.
 *
 *  2. When the device is online:
 *     a. The queue drains in order (FIFO).
 *     b. On success the server emits a socket event that confirms/corrects the
 *        optimistic record (patchRecord with the real server doc).
 *     c. On permanent failure (4xx) the optimistic change is rolled back.
 *
 *  3. When the device is offline:
 *     a. Mutations stack up in the queue.
 *     b. On reconnect, NetInfo listener triggers queue drain.
 *
 * Usage
 * ─────
 *   import { offlineQueue } from '@/UtilServices/OfflineQueue';
 *
 *   // Instead of directly calling appService.httpClient.post(...)
 *   await offlineQueue.enqueue({
 *     id: uuid(),                     // idempotency key
 *     method: 'POST',
 *     url: 'service/leads/create',
 *     body: leadPayload,
 *     domain: 'leads',
 *     optimisticRecord: { _id: tempId, ...leadPayload }, // shown immediately
 *   });
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { appService } from './appHelper';
import { tenantStore, TenantDomain } from './TenantStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface QueuedMutation {
  /** Unique idempotency key — use a UUID so duplicate drains are safe */
  id: string;
  method: HttpMethod;
  /** Relative URL (same as you'd pass to appService.httpClient) */
  url: string;
  body?: Record<string, any>;
  /** Optional headers to forward */
  headers?: Record<string, string>;
  /** If set, the record is immediately patched into the store as optimistic state */
  domain?: TenantDomain;
  optimisticRecord?: { _id: string; [key: string]: any };
  /** If this is a delete, we remove the record optimistically */
  optimisticRemoveId?: string;
  /** Timestamp for ordering and expiry */
  enqueuedAt: number;
  /** How many retry attempts have been made */
  attempts: number;
}

const QUEUE_KEY = 'offlineQueue:v1';
const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 3000;

// ── OfflineQueue singleton ────────────────────────────────────────────────────

class OfflineQueue {
  private _queue: QueuedMutation[] = [];
  private _draining = false;
  private _initialized = false;
  private _isOnline = true;

  constructor() {
    // Observe network state
    NetInfo.addEventListener((state) => {
      const wasOffline = !this._isOnline;
      this._isOnline = !!(state.isConnected && state.isInternetReachable !== false);
      if (wasOffline && this._isOnline) {
        console.log('[OfflineQueue] Back online — draining queue');
        this.drain();
      }
    });
  }

  // ── Initialise (call once on app boot) ─────────────────────────────────────

  async init() {
    if (this._initialized) return;
    this._initialized = true;
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (raw) {
        this._queue = JSON.parse(raw);
        console.log(`[OfflineQueue] Loaded ${this._queue.length} pending mutations`);
      }
    } catch {
      this._queue = [];
    }
    // Drain any queued mutations from a previous session
    this.drain();
  }

  // ── Enqueue ─────────────────────────────────────────────────────────────────

  async enqueue(mutation: Omit<QueuedMutation, 'enqueuedAt' | 'attempts'>): Promise<void> {
    const item: QueuedMutation = {
      ...mutation,
      enqueuedAt: Date.now(),
      attempts: 0,
    };

    // Optimistic update — show change in UI immediately
    if (item.domain && item.optimisticRecord) {
      tenantStore.patchRecord(item.domain, item.optimisticRecord);
    }
    if (item.domain && item.optimisticRemoveId) {
      tenantStore.removeRecord(item.domain, item.optimisticRemoveId);
    }

    this._queue.push(item);
    await this._persist();

    if (this._isOnline) {
      this.drain();
    }
  }

  // ── Drain ───────────────────────────────────────────────────────────────────

  async drain(): Promise<void> {
    if (this._draining || this._queue.length === 0) return;
    this._draining = true;

    while (this._queue.length > 0) {
      if (!this._isOnline) break;

      const item = this._queue[0];

      try {
        const res = await this._execute(item);
        // Success — remove from queue
        this._queue.shift();
        await this._persist();

        // If the server returned the updated record, patch the store
        // (the socket event will also arrive, so this is just belt-and-braces)
        if (item.domain) {
          const serverDoc =
            res?.data?.data ?? res?.data?.attendance ?? res?.data?.lead ?? res?.data;
          if (serverDoc && typeof serverDoc === 'object' && serverDoc._id) {
            tenantStore.patchRecord(item.domain, serverDoc);
          }
        }
      } catch (err: any) {
        const status = err?.response?.status;
        item.attempts++;

        if (status && status >= 400 && status < 500) {
          // Permanent client error — discard and ROLLBACK optimistic change
          console.warn(`[OfflineQueue] Permanent failure (${status}) for ${item.url} — rolling back`);
          if (item.domain) tenantStore.refresh(item.domain);
          this._queue.shift();
          await this._persist();
        } else if (item.attempts >= MAX_ATTEMPTS) {
          // Too many retries — discard
          console.warn(`[OfflineQueue] Exceeded max attempts for ${item.url} — discarding`);
          if (item.domain) tenantStore.refresh(item.domain);
          this._queue.shift();
          await this._persist();
        } else {
          // Transient error — wait and retry
          console.warn(`[OfflineQueue] Transient error (attempt ${item.attempts}) for ${item.url}`);
          await this._sleep(RETRY_DELAY_MS * item.attempts);
        }
      }
    }

    this._draining = false;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async _execute(item: QueuedMutation) {
    const config = { headers: item.headers ?? {} };
    switch (item.method) {
      case 'POST':   return appService.httpClient.post(item.url, item.body, config);
      case 'PUT':    return appService.httpClient.put(item.url, item.body, config);
      case 'PATCH':  return appService.httpClient.patch(item.url, item.body, config);
      case 'DELETE': return appService.httpClient.delete(item.url, { ...config, data: item.body });
      default:       return appService.httpClient.get(item.url, config);
    }
  }

  private async _persist() {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this._queue));
    } catch {}
  }

  private _sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  /** Pending count — useful for showing a sync badge in the UI */
  get pendingCount(): number {
    return this._queue.length;
  }
}

export const offlineQueue = new OfflineQueue();
