'use strict';

const mongoose = require('mongoose');
const userMaster = require('../models/userMaster');

/**
 * 🔍 attendanceSessionResolver.js
 * Single symmetric source of truth for finding active attendance sessions.
 * Guarantees that if getActiveAttendance returns ON, toggleAttendance (OFF)
 * will ALWAYS find the exact same record without throwing 404.
 */

/**
 * Resolves all linked identities (both Employees._id and userMaster._id, and Strings/ObjectIds)
 * for a given employeeId or user.
 */
async function resolveAllLinkedIds(queryId, EmployeesModel) {
  const allLinkedIds = [];
  const addId = (val) => {
    if (!val) return;
    const s = String(val._id || val).trim();
    if (s && !allLinkedIds.some((x) => String(x) === s)) {
      allLinkedIds.push(s);
      if (mongoose.isValidObjectId(s)) {
        try {
          allLinkedIds.push(new mongoose.Types.ObjectId(s));
        } catch (_) {}
      }
    }
  };

  addId(queryId);

  let userDoc = null;
  let employeeDoc = null;

  const validOid = mongoose.isValidObjectId(queryId) ? new mongoose.Types.ObjectId(queryId) : null;

  if (validOid) {
    try {
      userDoc = await userMaster.findById(validOid).lean();
    } catch (_) {}
    if (EmployeesModel) {
      try {
        employeeDoc = await EmployeesModel.findById(validOid).lean();
      } catch (_) {}
    }
  }

  // Cross link via mobile / email / user_id
  if (userDoc && !employeeDoc && EmployeesModel) {
    const mob = userDoc.userMobile || userDoc.mobile || userDoc.username;
    const em = userDoc.userEmail || userDoc.email;
    employeeDoc = await EmployeesModel.findOne({
      $or: [
        { user_id: userDoc._id },
        ...(mob ? [{ mobile: mob }] : []),
        ...(em ? [{ email: em }] : []),
      ],
    }).lean();
  } else if (employeeDoc && !userDoc) {
    const mob = employeeDoc.mobile;
    const em = employeeDoc.email;
    userDoc = await userMaster.findOne({
      $or: [
        ...(employeeDoc.user_id ? [{ _id: employeeDoc.user_id }] : []),
        ...(mob ? [{ userMobile: mob }, { mobile: mob }] : []),
        ...(em ? [{ userEmail: em }, { email: em }] : []),
      ],
    }).lean();
  }

  if (userDoc?._id) addId(userDoc._id);
  if (employeeDoc?._id) addId(employeeDoc._id);
  if (employeeDoc?.user_id) addId(employeeDoc.user_id);

  return {
    allLinkedIds,
    userDoc,
    employeeDoc,
  };
}

/**
 * Finds the single open duty session for an employee/user using symmetrical criteria.
 */
async function findActiveSession(AttendanceModel, EmployeesModel, { employeeId, userId, userDisplayName }) {
  if (!AttendanceModel) return null;

  const targetId = employeeId || userId;
  if (!targetId && !userDisplayName) return null;

  const { allLinkedIds, userDoc, employeeDoc } = await resolveAllLinkedIds(targetId, EmployeesModel);

  const openFilter = {
    $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }, { dutyEnd: '' }],
  };

  // 1. Primary search: by all linked IDs (String & ObjectId)
  if (allLinkedIds.length > 0) {
    let session = await AttendanceModel.findOne({
      employeeId: { $in: allLinkedIds },
      ...openFilter,
    })
      .sort({ dutyStart: -1 });

    if (session) return session;
  }

  // 2. Secondary search: by userId or markedByUserName fallback (vital for Admins and Supervisors)
  const fallbacks = [];
  if (userDoc?._id) fallbacks.push({ userId: userDoc._id });
  if (userDisplayName) fallbacks.push({ markedByUserName: userDisplayName });
  if (userDoc?.userDisplayName) fallbacks.push({ markedByUserName: userDoc.userDisplayName });

  if (fallbacks.length > 0) {
    let session = await AttendanceModel.findOne({
      $or: fallbacks,
      ...openFilter,
    })
      .sort({ dutyStart: -1 });

    if (session) return session;
  }

  return null;
}

module.exports = {
  findActiveSession,
  resolveAllLinkedIds,
};
