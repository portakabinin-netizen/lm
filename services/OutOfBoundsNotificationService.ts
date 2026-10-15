/**
 * OutOfBoundsNotificationService.ts
 *
 * Sends a one-time chat notification to all Project users and Admins
 * (CorpAdmin | userAdmin) whenever a worker's location goes out-of-bounds
 * (> 500 m from their duty site).
 *
 * Throttle rules:
 *  - One notification per continuous out-of-bounds event (fires once on entry).
 *  - Resets when the worker returns in-bounds so the next breach triggers again.
 *  - Re-arms after REARM_AFTER_MS (default 30 min) even if worker stays OOB,
 *    so supervisors get a reminder if the situation persists.
 */

import { appService } from '@/UtilServices/appHelper';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum time (ms) between repeated OOB notifications for the same breach. */
const REARM_AFTER_MS = 30 * 60 * 1000; // 30 minutes

/** Roles that should receive the out-of-bounds alert. */
const NOTIFY_ROLES = ['CorpAdmin', 'userAdmin', 'Project'] as const;

// ─── Service ─────────────────────────────────────────────────────────────────

class OutOfBoundsNotificationService {
  /** True when the worker is currently flagged as out-of-bounds. */
  private currentlyOOB = false;

  /** Timestamp (ms) of the last notification sent; null = never sent in this event. */
  private lastNotifiedAt: number | null = null;

  /** Rearm timer — fires a reminder notification after REARM_AFTER_MS. */
  private rearmTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Call this every time the isOutOfBounds value changes (or on the poll tick).
   *
   * @param isOutOfBounds - Current out-of-bounds status from useAttendance.
   * @param ctx           - Context needed to send the notification.
   */
  async update(
    isOutOfBounds: boolean,
    ctx: {
      token: string;
      senderId: string;
      senderName: string;
      siteName: string;
      workerLat?: number | null;
      workerLong?: number | null;
    }
  ): Promise<void> {
    if (!isOutOfBounds) {
      // Worker returned in-bounds — reset for next breach
      this._clearRearmTimer();
      this.currentlyOOB = false;
      this.lastNotifiedAt = null;
      return;
    }

    const now = Date.now();

    if (this.currentlyOOB && this.lastNotifiedAt !== null) {
      // Already in an active OOB event — check if rearm window has passed
      if (now - this.lastNotifiedAt < REARM_AFTER_MS) {
        return; // still within throttle window — skip
      }
    }

    // New breach event OR rearm window passed — fire notification
    this.currentlyOOB = true;
    this.lastNotifiedAt = now;

    await this._sendNotifications(ctx);

    // Schedule a reminder in case the worker remains OOB
    this._scheduleRearm(ctx);
  }

  /** Call this when duty ends to fully reset state. */
  reset(): void {
    this._clearRearmTimer();
    this.currentlyOOB = false;
    this.lastNotifiedAt = null;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async _sendNotifications(ctx: {
    token: string;
    senderId: string;
    senderName: string;
    siteName: string;
    workerLat?: number | null;
    workerLong?: number | null;
  }): Promise<void> {
    const authHeaders = { Authorization: `Bearer ${ctx.token}` };

    let staffList: any[] = [];
    try {
      const res = await appService.httpClient.get('service/staff', { headers: authHeaders });
      if (res.data?.success && Array.isArray(res.data.data)) {
        staffList = res.data.data;
      }
    } catch (err) {
      console.warn('⚠️ [OOBNotify] Could not fetch staff list:', (err as Error).message);
      return;
    }

    const recipients = staffList.filter((u: any) => {
      if (u._id === ctx.senderId) return false;
      const roleStr = String(u.userRole || u.role || u.user_role || '').toLowerCase();
      return NOTIFY_ROLES.some((r) => r.toLowerCase() === roleStr);
    });

    if (recipients.length === 0) {
      console.warn('⚠️ [OOBNotify] No recipients found for out-of-bounds alert.');
      return;
    }

    const timestamp = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const locationLine =
      ctx.workerLat && ctx.workerLong
        ? `📍 Worker Location: https://maps.google.com/?q=${ctx.workerLat},${ctx.workerLong}`
        : '';

    const message =
      `🚨 OUT OF BOUNDS ALERT\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Worker : ${ctx.senderName}\n` +
      `Site   : ${ctx.siteName || 'Assigned Site'}\n` +
      `Time   : ${timestamp}\n` +
      `Status : Worker is MORE THAN 500 m away from duty site!\n` +
      (locationLine ? `${locationLine}\n` : '') +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Please take immediate action.`;

    const results = await Promise.allSettled(
      recipients.map((recipient: any) =>
        appService.httpClient.post(
          'service/chat/send',
          {
            senderName: ctx.senderName,
            senderId: ctx.senderId,
            text: message,
            type: 'text',
            isOneToOne: true,
            receiverId: recipient._id,
          },
          { headers: authHeaders }
        )
      )
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - sent;
    console.log(
      `🚨 [OOBNotify] Sent to ${sent}/${recipients.length} recipients.` +
        (failed > 0 ? ` ${failed} failed.` : '')
    );
  }

  private _scheduleRearm(ctx: Parameters<OutOfBoundsNotificationService['update']>[1]): void {
    this._clearRearmTimer();
    this.rearmTimer = setTimeout(() => {
      if (this.currentlyOOB) {
        // Still OOB after rearm window — send a reminder
        this.lastNotifiedAt = null; // allow _sendNotifications on next update() call
      }
    }, REARM_AFTER_MS);
  }

  private _clearRearmTimer(): void {
    if (this.rearmTimer !== null) {
      clearTimeout(this.rearmTimer);
      this.rearmTimer = null;
    }
  }
}

// Singleton export
export const outOfBoundsNotificationService = new OutOfBoundsNotificationService();
