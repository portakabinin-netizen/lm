'use strict';

/**
 * 🔒 attendanceLockGuard.js
 * Middleware that prevents non-admin users from altering finalized & locked attendance records.
 */
const attendanceLockGuard = async (req, res, next) => {
  try {
    const { Attendance } = req.tenantModels || {};
    if (!Attendance) return next();

    const recordId = req.params?.id;
    const requesterRole = (req.user?.userRole || req.user?.role || '').toLowerCase();
    const isAdmin = ['corpadmin', 'useradmin', 'admin'].includes(requesterRole);

    // 1. Check for specific record modification (PUT / DELETE)
    if (recordId && recordId !== 'cleanup') {
      const record = await Attendance.findById(recordId).select('lockStatus date').lean();
      if (record && record.lockStatus?.isLocked) {
        if (!isAdmin) {
          return res.status(403).json({
            success: false,
            isLocked: true,
            message: 'Forbidden: Attendance for this period has been finalized and locked. Contact Administrator to unlock.',
          });
        }
      }
    }

    // 2. Check for retrospective insert / batch upload for locked month
    if (req.body?.date && !isAdmin) {
      const targetDate = new Date(req.body.date);
      if (!isNaN(targetDate.getTime())) {
        const startOfMonth = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), 1));
        const endOfMonth = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
        
        const lockedInMonth = await Attendance.findOne({
          date: { $gte: startOfMonth, $lte: endOfMonth },
          'lockStatus.isLocked': true,
        }).select('_id').lean();

        if (lockedInMonth) {
          return res.status(403).json({
            success: false,
            isLocked: true,
            message: 'Forbidden: Attendance for this month is finalized and locked. Only an Admin can make modifications.',
          });
        }
      }
    }

    next();
  } catch (err) {
    console.error('attendanceLockGuard error:', err);
    next();
  }
};

module.exports = attendanceLockGuard;
