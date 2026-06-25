/**
 * autoEndScheduler.js  (Phase 2b)
 * Lightweight in-memory scheduler for auto-closing single-worker shift attendance.
 * No external queue infrastructure needed.
 */

'use strict';

const MAX_TIMER_MS = 24 * 60 * 60 * 1000; // 24h cap

// Map: attendanceId (string) -> NodeJS.Timeout
const _timers = new Map();

function scheduleAutoEnd(attendanceId, scheduledEndAt, AttendanceModel, tenantDbName, io) {
  const id = String(attendanceId);
  cancelAutoEnd(id); // cancel any existing timer (idempotent)

  const delayMs = Math.max(0, Math.min(new Date(scheduledEndAt).getTime() - Date.now(), MAX_TIMER_MS));

  const timer = setTimeout(async () => {
    _timers.delete(id);
    try {
      const endTime = new Date(scheduledEndAt);
      const result = await AttendanceModel.findOneAndUpdate(
        { _id: id, $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }] },
        { $set: { dutyEnd: endTime, status: 'AUTO_COMPLETED_SCHEDULED', autoCompleted: true, autoCompletedAt: endTime } },
        { new: true }
      );
      if (!result) return; // already clocked out manually — no-op

      const elapsedHrs = (endTime - result.dutyStart) / 3600000;
      const standardHours = result.shiftHours || result.shiftLockHours || 8;
      const hoursWorked = parseFloat(Math.max(0, elapsedHrs).toFixed(2));
      const dailyEarn = parseFloat(((hoursWorked / standardHours) * (result.dailyRate || 0)).toFixed(2));
      await AttendanceModel.updateOne({ _id: id }, { $set: { hoursWorked, dailyEarn } });

      if (io) {
        io.to(tenantDbName).emit('attendance:duty_off', {
          employeeId: String(result.employeeId), attendanceId: id, hoursWorked, autoCompleted: true,
        });
        io.to(tenantDbName).emit('admin:broadcast', {
          id: `auto-end-${id}`,
          title: 'Shift Auto-Completed',
          message: `Single-worker shift (${result.shiftCode || ''}) closed at scheduled end time.`,
          priority: 'normal',
          targetRoles: ['CorpAdmin', 'userAdmin', 'Project'],
          sentBy: 'System',
          at: endTime.toISOString(),
        });
      }
      console.log(`[autoEndScheduler] Auto-closed attendance ${id} at scheduled end.`);
    } catch (err) {
      console.error(`[autoEndScheduler] Error auto-closing attendance ${id}:`, err.message);
    }
  }, delayMs);

  _timers.set(id, timer);
  console.log(`[autoEndScheduler] Scheduled auto-end for ${id} in ${Math.round(delayMs / 60000)} min`);
}

function cancelAutoEnd(attendanceId) {
  const id = String(attendanceId);
  if (_timers.has(id)) {
    clearTimeout(_timers.get(id));
    _timers.delete(id);
  }
}

function activeTimerCount() { return _timers.size; }

module.exports = { scheduleAutoEnd, cancelAutoEnd, activeTimerCount };
