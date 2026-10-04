/**
 * 🛡️ AwakeMonitoringService.ts
 *
 * Central orchestrator for guard alertness monitoring.
 *
 * Architecture:
 *   StaffDashboard → startMonitoring() / stopMonitoring()
 *                 ↓
 *   AwakeMonitoringService
 *     ├── HeartbeatService  (60 s interval → POST /api/monitoring/heartbeat)
 *     ├── ChallengePoller   (10 s interval → GET  /api/monitoring/challenge)
 *     └── AlarmService      (plays alarm when challenge arrives)
 *
 * SECURITY: Challenge codes are generated ONLY on the server.
 *           This service never generates codes — it only submits responses.
 */

import { AppState, AppStateStatus } from "react-native";
import { alarmService } from "./AlarmService";
import { appService } from "@/UtilServices/appHelper";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonitoringChallenge {
  challengeId: string;
  code: string;
  expiresAt: string;
}

export type MonitoringEventType =
  | "CHALLENGE_RECEIVED"
  | "CHALLENGE_PASSED"
  | "CHALLENGE_FAILED"
  | "STATUS_CHANGED"
  | "HEARTBEAT_SENT";

export type MonitoringEventListener = (type: MonitoringEventType, data?: any) => void;

// ─── Service ─────────────────────────────────────────────────────────────────

class AwakeMonitoringService {
  private token: string | null = null;
  private userId: string | null = null;
  private employeeName: string | null = null;
  private siteName: string | null = null;
  private attendanceId: string | null = null;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private challengePoller: ReturnType<typeof setInterval> | null = null;

  private activeChallenge: MonitoringChallenge | null = null;
  private isRunning = false;

  private listeners: MonitoringEventListener[] = [];
  private appStateSubscription: any = null;

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Call this when duty status changes to 'ON'.
   */
  async startMonitoring(params: {
    token: string;
    userId: string;
    employeeName: string;
    siteName: string;
    attendanceId?: string;
  }): Promise<void> {
    if (this.isRunning) {
      console.log("🛡️ [Monitoring] Already running — skipping start");
      return;
    }

    this.token        = params.token;
    this.userId       = params.userId;
    this.employeeName = params.employeeName;
    this.siteName     = params.siteName;
    this.attendanceId = params.attendanceId ?? null;
    this.isRunning    = true;

    console.log("🛡️ [Monitoring] Starting for:", this.employeeName);

    // Register with backend
    try {
      await appService.httpClient.post(
        "monitoring/start",
        {
          employeeId:  this.userId,
          employeeName: this.employeeName,
          siteName:    this.siteName,
          attendanceId: this.attendanceId,
          deviceType:  "SMARTPHONE",
        },
        { headers: { Authorization: `Bearer ${this.token}` } }
      );
    } catch (err) {
      console.warn("⚠️ [Monitoring] start registration failed:", (err as Error).message);
    }

    // Start heartbeat (every 60 s)
    this.startHeartbeat();

    // Poll for challenges every 10 s
    this.startChallengePoller();

    // React to app going background/foreground
    this.appStateSubscription = AppState.addEventListener("change", this._handleAppState);
  }

  /**
   * Call this when duty status changes to 'OFF'.
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    console.log("🛡️ [Monitoring] Stopping");

    this.stopHeartbeat();
    this.stopChallengePoller();
    await alarmService.stopAlarm();

    this.activeChallenge = null;

    this.appStateSubscription?.remove?.();
    this.appStateSubscription = null;

    // Notify backend
    try {
      await appService.httpClient.post(
        "monitoring/stop",
        { employeeId: this.userId },
        { headers: { Authorization: `Bearer ${this.token}` } }
      );
    } catch (err) {
      console.warn("⚠️ [Monitoring] stop notification failed:", (err as Error).message);
    }

    this.token        = null;
    this.userId       = null;
    this.employeeName = null;
    this.siteName     = null;
    this.attendanceId = null;
  }

  // ── Heartbeat ───────────────────────────────────────────────────────────────

  startHeartbeat(): void {
    this.stopHeartbeat();
    // Send immediately, then every 60 s
    this._sendHeartbeat();
    this.heartbeatTimer = setInterval(() => this._sendHeartbeat(), 60_000);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async _sendHeartbeat(): Promise<void> {
    if (!this.isRunning || !this.token) return;
    try {
      await appService.httpClient.post(
        "monitoring/heartbeat",
        {
          employeeId:   this.userId,
          batteryLevel: null, // optional: integrate expo-battery if needed
          latitude:     null,
          longitude:    null,
        },
        { headers: { Authorization: `Bearer ${this.token}` } }
      );
      this._emit("HEARTBEAT_SENT");
    } catch (err) {
      console.warn("⚠️ [Monitoring] heartbeat failed:", (err as Error).message);
    }
  }

  // ── Challenge Poller ────────────────────────────────────────────────────────

  startChallengePoller(): void {
    this.stopChallengePoller();
    this.challengePoller = setInterval(() => this._pollChallenge(), 10_000);
  }

  stopChallengePoller(): void {
    if (this.challengePoller !== null) {
      clearInterval(this.challengePoller);
      this.challengePoller = null;
    }
  }

  private async _pollChallenge(): Promise<void> {
    if (!this.isRunning || !this.token || this.activeChallenge) return;
    try {
      const res = await appService.httpClient.get("monitoring/challenge", {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      const data = res.data;

      if (data?.challengePending && data?.challengeId) {
        const challenge: MonitoringChallenge = {
          challengeId: data.challengeId,
          code:        data.code,
          expiresAt:   data.expiresAt,
        };
        this.activeChallenge = challenge;

        // Start alarm
        await alarmService.startAlarm();

        // Notify listeners (triggers AwakeChallengeModal)
        this._emit("CHALLENGE_RECEIVED", challenge);
      }
    } catch (err) {
      console.warn("⚠️ [Monitoring] challenge poll failed:", (err as Error).message);
    }
  }

  // ── Challenge Submission ────────────────────────────────────────────────────

  async submitChallenge(enteredCode: string): Promise<{ success: boolean; message: string; failed?: boolean }> {
    if (!this.activeChallenge || !this.token) {
      return { success: false, message: "No active challenge" };
    }

    try {
      const res = await appService.httpClient.post(
        "monitoring/respond",
        {
          challengeId:  this.activeChallenge.challengeId,
          enteredCode,
        },
        { headers: { Authorization: `Bearer ${this.token}` } }
      );

      const data = res.data;

      if (data?.success) {
        this.activeChallenge = null;
        await alarmService.stopAlarm();
        this._emit("CHALLENGE_PASSED");
        return { success: true, message: data.message ?? "Alertness confirmed ✅" };
      }

      if (data?.failed) {
        this.activeChallenge = null;
        await alarmService.stopAlarm();
        this._emit("CHALLENGE_FAILED");
      }

      return { success: false, message: data?.message ?? "Wrong code", failed: data?.failed };
    } catch (err) {
      return { success: false, message: "Network error" };
    }
  }

  async reportFailure(reason: string): Promise<void> {
    if (!this.activeChallenge || !this.token) return;
    try {
      await appService.httpClient.post(
        "monitoring/failure",
        {
          challengeId: this.activeChallenge.challengeId,
          employeeId:  this.userId,
          reason,
        },
        { headers: { Authorization: `Bearer ${this.token}` } }
      );
    } catch (err) {
      console.warn("⚠️ [Monitoring] reportFailure error:", (err as Error).message);
    }
    this.activeChallenge = null;
    await alarmService.stopAlarm();
    this._emit("CHALLENGE_FAILED");
  }

  // ── Event Emitter ───────────────────────────────────────────────────────────

  addEventListener(listener: MonitoringEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private _emit(type: MonitoringEventType, data?: any): void {
    this.listeners.forEach((l) => {
      try { l(type, data); } catch (_) {}
    });
  }

  // ── App State ───────────────────────────────────────────────────────────────

  private _handleAppState = (state: AppStateStatus): void => {
    if (state === "active" && this.isRunning) {
      // Resume heartbeat and polling when app comes to foreground
      this._sendHeartbeat();
      this._pollChallenge();
    }
  };

  // ── Getters ─────────────────────────────────────────────────────────────────

  get running(): boolean { return this.isRunning; }
  get currentChallenge(): MonitoringChallenge | null { return this.activeChallenge; }
}

// Singleton instance
export const awakeMonitoringService = new AwakeMonitoringService();
