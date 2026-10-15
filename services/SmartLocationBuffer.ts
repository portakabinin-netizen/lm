/**
 * SmartLocationBuffer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side intelligent GPS point filter and compressor.
 *
 * PURPOSE — Prevent server overload from high-frequency GPS ticks.
 *
 * FILTER PIPELINE (per tick):
 *  Gate 1 — Accuracy:  discard fixes worse than MAX_ACCURACY_M (120 m)
 *  Gate 2 — Speed:     discard stationary jitter < MIN_SPEED_MPS (0.5 m/s)
 *                      BUT only after 2 consecutive slow ticks (prevents
 *                      dropping the "departure" tick after a site dwell).
 *  Gate 3 — Distance:  discard ticks < MIN_MOVE_M (30 m) from last accepted.
 *
 * STATIC SITE / DWELL HEARTBEAT:
 *  When a worker is stationary at a client site, the speed+distance gates
 *  would normally drop every tick and the server gets NO updates.
 *  Fix: if DWELL_HEARTBEAT_MS (5 min) elapses since the last accepted or
 *  flushed point, one "dwell" tick is force-accepted regardless of movement.
 *  This ensures the server always knows the worker is still on-site.
 *
 * FLUSH TRIGGERS (subject to MIN_SERVER_INTERVAL_MS hard rate-limit):
 *  (a) Buffer >= FLUSH_COUNT accepted ticks
 *  (b) Device moved >= SIGNIFICANT_MOVE_M from last flush position
 *  (c) MAX_FLUSH_INTERVAL_MS heartbeat elapsed (includes dwell ticks)
 *
 * COMPACT PAYLOAD:
 *  "<baseEpochMs>|<lat>,<lng>,<tsOff_s>,<acc>|..."
 *  acc = -1 when accuracy is unknown (prevents false "perfect fix" display)
 *
 * RESULT — Typical: ~1 req/3-5 min (drive). Static site: 1 req/5 min max.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrackingPoint } from '../types/gps';

// ─── Tuneable Constants ───────────────────────────────────────────────────────

/** Minimum real-world movement to accept a tick (metres) */
const MIN_MOVE_M = 30;

/** Minimum movement from last flush to trigger an early flush (metres) */
const SIGNIFICANT_MOVE_M = 150;

/** Buffer size that triggers a flush regardless of distance */
const FLUSH_COUNT = 8;

/** Maximum gap between server flushes — heartbeat while driving (ms) */
const MAX_FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 min

/** Hard server rate-limit — never flush more often than this (ms) */
const MIN_SERVER_INTERVAL_MS = 90 * 1000; // 90 s

/** Discard GPS fixes worse than this (metres). 0 = disabled */
const MAX_ACCURACY_M = 120;

/** Minimum speed (m/s) to count as movement. Must be slow for N consecutive
 *  ticks before the gate actually rejects (avoids dropping departure ticks). */
const MIN_SPEED_MPS = 0.5;

/** Number of consecutive slow ticks required before speed gate activates */
const SLOW_TICK_THRESHOLD = 2;

/**
 * When stationary, force-accept one heartbeat tick every DWELL_HEARTBEAT_MS
 * so the server always knows the worker is still on-site.
 */
const DWELL_HEARTBEAT_MS = 5 * 60 * 1000; // 5 min

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const BUFFER_KEY = 'slb_buffer_v2';
const META_KEY   = 'slb_meta_v2';

// ─── Internal Types ───────────────────────────────────────────────────────────

interface BufferMeta {
  /** Last ACCEPTED tick position (distance gate reference) */
  lastAcceptedLat: number;
  lastAcceptedLng: number;
  lastAcceptedTs: number;
  /** Last FLUSHED position (significant-move gate reference) */
  lastFlushedLat: number;
  lastFlushedLng: number;
  /** Timestamp of last server flush */
  lastFlushTs: number;
  /** Count of consecutive slow-speed ticks (for the 2-tick speed gate) */
  consecutiveSlowTicks: number;
}

interface CompactTick {
  lat: number;
  lng: number;
  ts: number;
  /** Accuracy in metres. -1 = unknown */
  acc: number;
  /** true = dwell heartbeat, not real movement */
  dwell?: boolean;
}

// ─── Haversine (inline — avoids circular import) ──────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Compact Payload Encoding / Decoding ─────────────────────────────────────

/**
 * Encode ticks into a compact pipe-separated string.
 * Format: "<baseEpochMs>|<lat>,<lng>,<tsOff_s>,<acc>|..."
 * acc = -1 when accuracy is unknown.
 */
export function encodeCompactPayload(ticks: CompactTick[]): string {
  if (ticks.length === 0) return '';
  const base = ticks[0].ts;
  const parts = ticks.map((t) => {
    const lat = t.lat.toFixed(6);
    const lng = t.lng.toFixed(6);
    const off = Math.round((t.ts - base) / 1000);
    const acc = t.acc < 0 ? -1 : Math.round(t.acc); // -1 = unknown
    return `${lat},${lng},${off},${acc}`;
  });
  return `${base}|${parts.join('|')}`;
}

/**
 * Decode a compact payload back into geoHistory-compatible objects.
 * Exported for server-side use.
 */
export function decodeCompactPayload(
  payload: string
): Array<{ lat: number; long: number; accuracy: number | null; timestamp: string; type: string }> {
  if (!payload) return [];
  const segments = payload.split('|');
  if (segments.length < 2) return [];
  const base = parseInt(segments[0], 10);
  if (isNaN(base)) return [];

  const result: Array<{
    lat: number;
    long: number;
    accuracy: number | null;
    timestamp: string;
    type: string;
  }> = [];

  for (let i = 1; i < segments.length; i++) {
    const parts = segments[i].split(',');
    if (parts.length < 4) continue;
    const lat  = parseFloat(parts[0]);
    const lng  = parseFloat(parts[1]);
    const off  = parseInt(parts[2], 10) * 1000;
    const acc  = parseInt(parts[3], 10);
    if (isNaN(lat) || isNaN(lng)) continue;
    result.push({
      lat,
      long: lng,
      accuracy: acc === -1 ? null : acc,
      timestamp: new Date(base + off).toISOString(),
      type: 'tick',
    });
  }
  return result;
}

// ─── SmartLocationBuffer ──────────────────────────────────────────────────────

export class SmartLocationBuffer {
  private static _meta: BufferMeta | null = null;
  private static _buffer: CompactTick[] = [];
  private static _loaded = false;

  // ─── Persistence ──────────────────────────────────────────────────────────

  private static async _load(): Promise<void> {
    if (this._loaded) return;
    try {
      const [bufRaw, metaRaw] = await Promise.all([
        AsyncStorage.getItem(BUFFER_KEY),
        AsyncStorage.getItem(META_KEY),
      ]);
      this._buffer = bufRaw ? JSON.parse(bufRaw) : [];
      this._meta   = metaRaw ? JSON.parse(metaRaw) : null;
    } catch {
      this._buffer = [];
      this._meta   = null;
    }
    this._loaded = true;
  }

  private static async _saveBuffer(): Promise<void> {
    try { await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(this._buffer)); } catch { /* non-fatal */ }
  }

  private static async _saveMeta(): Promise<void> {
    if (!this._meta) return;
    try { await AsyncStorage.setItem(META_KEY, JSON.stringify(this._meta)); } catch { /* non-fatal */ }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Feed a GPS tick through the full filter pipeline.
   *
   * Returns { accepted, shouldFlush, isDwell }
   *   accepted   — tick passed filters and was buffered locally
   *   shouldFlush — caller should drain() and upload to server now
   *   isDwell     — this was a heartbeat tick (worker stationary on-site)
   */
  static async ingest(
    point: TrackingPoint
  ): Promise<{ accepted: boolean; shouldFlush: boolean; isDwell: boolean }> {
    await this._load();

    const { latitude: lat, longitude: lng, accuracy, speed, timestamp: ts } = point;
    const now = Date.now();

    // ── Gate 1: Accuracy ─────────────────────────────────────────────────────
    if (MAX_ACCURACY_M > 0 && accuracy !== null && accuracy > MAX_ACCURACY_M) {
      return { accepted: false, shouldFlush: false, isDwell: false };
    }

    // ── Dwell heartbeat check ────────────────────────────────────────────────
    // If the worker appears stationary (will likely fail speed+distance gates),
    // check whether enough time has passed to force a heartbeat tick.
    const timeSinceLastAccepted = this._meta
      ? now - this._meta.lastAcceptedTs
      : DWELL_HEARTBEAT_MS + 1;

    const willBeStationary =
      (speed !== null && speed < MIN_SPEED_MPS) ||
      (this._meta
        ? haversineM(lat, lng, this._meta.lastAcceptedLat, this._meta.lastAcceptedLng) < MIN_MOVE_M
        : false);

    if (willBeStationary && timeSinceLastAccepted >= DWELL_HEARTBEAT_MS) {
      // Force-accept a dwell heartbeat
      return await this._acceptTick(lat, lng, ts, accuracy, now, true);
    }

    // ── Gate 2: Speed (2-consecutive-slow-ticks rule) ─────────────────────────
    // Only reject after SLOW_TICK_THRESHOLD consecutive slow ticks.
    // This prevents dropping the "departure" fix when a worker starts driving.
    if (speed !== null && speed < MIN_SPEED_MPS && this._buffer.length > 0) {
      const slowCount = (this._meta?.consecutiveSlowTicks ?? 0) + 1;
      if (this._meta) this._meta.consecutiveSlowTicks = slowCount;
      if (slowCount >= SLOW_TICK_THRESHOLD) {
        await this._saveMeta();
        return { accepted: false, shouldFlush: false, isDwell: false };
      }
      // First slow tick — update counter but don't reject yet (fall through)
      await this._saveMeta();
    } else {
      // Moving tick — reset slow counter
      if (this._meta) this._meta.consecutiveSlowTicks = 0;
    }

    // ── Gate 3: Distance ──────────────────────────────────────────────────────
    if (this._meta) {
      const distFromLast = haversineM(
        lat, lng,
        this._meta.lastAcceptedLat,
        this._meta.lastAcceptedLng
      );
      if (distFromLast < MIN_MOVE_M) {
        return { accepted: false, shouldFlush: false, isDwell: false };
      }
    }

    // All gates passed — accept the tick
    return await this._acceptTick(lat, lng, ts, accuracy, now, false);
  }

  /**
   * Drain all buffered ticks as a compact encoded string.
   * Updates flush metadata so distance-gate resets correctly.
   */
  static async drain(): Promise<string> {
    await this._load();
    if (this._buffer.length === 0) return '';

    const payload = encodeCompactPayload(this._buffer);
    const last = this._buffer[this._buffer.length - 1];
    if (this._meta) {
      this._meta.lastFlushedLat = last.lat;
      this._meta.lastFlushedLng = last.lng;
      this._meta.lastFlushTs    = Date.now();
    }

    this._buffer = [];
    await Promise.all([this._saveBuffer(), this._saveMeta()]);
    return payload;
  }

  /** How many accepted ticks are waiting in the local buffer. */
  static async pendingCount(): Promise<number> {
    await this._load();
    return this._buffer.length;
  }

  /** Hard-reset — call on duty-end or logout. */
  static async reset(): Promise<void> {
    this._buffer = [];
    this._meta   = null;
    this._loaded = false;
    await Promise.all([
      AsyncStorage.removeItem(BUFFER_KEY),
      AsyncStorage.removeItem(META_KEY),
    ]);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private static async _acceptTick(
    lat: number,
    lng: number,
    ts: number,
    accuracy: number | null,
    now: number,
    isDwell: boolean
  ): Promise<{ accepted: boolean; shouldFlush: boolean; isDwell: boolean }> {
    const tick: CompactTick = {
      lat,
      lng,
      ts,
      acc: accuracy !== null ? accuracy : -1, // -1 = unknown
      ...(isDwell ? { dwell: true } : {}),
    };
    this._buffer.push(tick);

    if (!this._meta) {
      this._meta = {
        lastAcceptedLat: lat,
        lastAcceptedLng: lng,
        lastAcceptedTs: ts,
        lastFlushedLat: lat,
        lastFlushedLng: lng,
        lastFlushTs: 0,
        consecutiveSlowTicks: 0,
      };
    } else {
      this._meta.lastAcceptedLat = lat;
      this._meta.lastAcceptedLng = lng;
      this._meta.lastAcceptedTs  = ts;
      if (!isDwell) this._meta.consecutiveSlowTicks = 0; // reset on real movement
    }

    await Promise.all([this._saveBuffer(), this._saveMeta()]);

    const shouldFlush = this._shouldFlush(lat, lng, now);
    return { accepted: true, shouldFlush, isDwell };
  }

  private static _shouldFlush(currentLat: number, currentLng: number, now: number): boolean {
    if (!this._meta) return false;

    const timeSinceFlush = now - this._meta.lastFlushTs;

    // Hard rate-limit — never more than once per MIN_SERVER_INTERVAL_MS
    if (timeSinceFlush < MIN_SERVER_INTERVAL_MS) return false;

    // (a) Buffer count threshold
    if (this._buffer.length >= FLUSH_COUNT) return true;

    // (b) Significant movement from last flush position
    const distFromFlush = haversineM(
      currentLat, currentLng,
      this._meta.lastFlushedLat,
      this._meta.lastFlushedLng
    );
    if (distFromFlush >= SIGNIFICANT_MOVE_M) return true;

    // (c) Heartbeat — max allowed server silence (includes dwell ticks)
    if (timeSinceFlush >= MAX_FLUSH_INTERVAL_MS && this._buffer.length > 0) return true;

    return false;
  }
}
