import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, useColorScheme, ActivityIndicator, Image, Modal, FlatList, TextInput, KeyboardAvoidingView, Platform, Linking, Switch } from 'react-native';
import FastImage from '@/components/FastImageCompat';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { appService } from '@/UtilServices/appHelper';
import { COLORS } from '@/styles/stylesIndex';
import LiveTracker from '@/UtilServices/LiveTracker';
import { useRouter } from 'expo-router';
import { useUserContext } from '@/context/AuthContext';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Existing Modals
import { AttendanceModal } from '@/modal/AttendanceModal';
import { ExpenseModal } from '@/modal/ExpenseModal';
import { SiteVisitModal } from '@/modal/SiteVisitModal';
import { ClientMeetModal } from '@/modal/ClientMeetModal';
import { VoucherEntryModal } from '@/modal/VoucherEntryModal';
import { WorkProgressModal } from '@/modal/WorkProgressModal';
import { SitewiseAttendanceRegisterModal } from '@/modal/SitewiseAttendanceRegisterModal';
import { BillCollectionModal } from '@/modal/BillCollectionModal';
import { StaffFinanceModal } from '@/modal/StaffFinanceModal';
import ChatRoomModal from '@/modal/ChatRoomModal';
import { useAttendance } from '@/hooks/useAttendance';
import { getSocket } from '@/hooks/Socket';
import * as Location from 'expo-location';

// Add/Edit Modals
import { AddEmployeeModal } from '@/modal/AddEmployeeModal';
import LeadModal from '@/modal/LeadModal';
import SalaryRegisterModal from '@/modal/SalaryRegisterModal';
import { missedShiftChecker } from '@/services/MissedShiftCheckerService';
import LoadingTimerSpinner from '@/components/ui/LoadingTimerSpinner';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Helper to print enrollment form
const handlePrintEnrollment = async (emp: any) => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 30px; color: #1e293b; line-height: 1.5; }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px; }
          .title { font-size: 24px; font-weight: 800; color: #4f46e5; }
          .photo-container { width: 100px; height: 100px; border: 2px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #f1f5f9; display: flex; align-items: center; justify-content: center; }
          .photo { width: 100%; height: 100%; object-fit: cover; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .field { border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }
          .label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
          .value { font-size: 14px; font-weight: 700; color: #0f172a; }
          .section-title { font-size: 14px; font-weight: 800; color: #4f46e5; margin: 30px 0 15px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; text-transform: uppercase; }
          .footer { text-align: center; margin-top: 60px; font-size: 10px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px; }
          .signature-row { display: flex; justify-content: space-between; margin-top: 80px; }
          .signature-box { border-top: 1px solid #94a3b8; width: 180px; text-align: center; padding-top: 8px; font-size: 12px; font-weight: 600; color: #475569; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">Staff Enrollment Form</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Form No: EFN# ${emp.enrollment_no || 'N/A'}</div>
          </div>
          <div class="photo-container">
            ${emp.photo || emp.photo_url ? `<img src="${emp.photo || emp.photo_url}" class="photo" />` : '<span style="color: #cbd5e1; font-size: 11px;">No Photo</span>'}
          </div>
        </div>

        <div class="section-title">Personal Details</div>
        <div class="grid">
          <div class="field">
            <div class="label">Full Name</div>
            <div class="value">${emp.name}</div>
          </div>
          <div class="field">
            <div class="label">Father's / Husband's Name</div>
            <div class="value">${emp.fatherName || emp.father_name || 'N/A'}</div>
          </div>
          <div class="field">
            <div class="label">Mobile Number</div>
            <div class="value">${emp.mobile}</div>
          </div>
          <div class="field">
            <div class="label">Aadhar Number</div>
            <div class="value">${emp.aadhar || 'N/A'}</div>
          </div>
          <div class="field">
            <div class="label">Date of Birth</div>
            <div class="value">${emp.dob ? new Date(emp.dob).toLocaleDateString('en-IN') : 'N/A'}</div>
          </div>
          <div class="field">
            <div class="label">Gender</div>
            <div class="value">${emp.gender || 'N/A'}</div>
          </div>
        </div>

        <div class="section-title">Employment Details</div>
        <div class="grid">
          <div class="field">
            <div class="label">Designation / Role</div>
            <div class="value">${emp.role || 'Worker'}</div>
          </div>
          <div class="field">
            <div class="label">Monthly Rate (Gross)</div>
            <div class="value">Ã¢â€šÂ¹${(emp.monthlyRate || 0).toLocaleString('en-IN')}</div>
          </div>
          <div class="field">
            <div class="label">Daily Rate</div>
            <div class="value">Ã¢â€šÂ¹${(emp.rate || emp.dailyRate || 0).toLocaleString('en-IN')}</div>
          </div>
          <div class="field">
            <div class="label">Status</div>
            <div class="value" style="color: ${emp.active !== false ? '#16a34a' : '#dc2626'}">${emp.active !== false ? 'LINKED (ACTIVE)' : 'DELINKED (INACTIVE)'}</div>
          </div>
        </div>

        <div class="signature-row">
          <div class="signature-box">Employee Signature</div>
          <div class="signature-box">Authorized Signatory</div>
        </div>

        <div class="footer">
          Generated via Nex App on ${new Date().toLocaleString()}
        </div>
      </body>
    </html>
  `;
  try {
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Enrollment_Form_${emp.name}`,
      UTI: 'com.adobe.pdf',
    });
  } catch (error: any) {
    Alert.alert('Print Error', error.message || 'Failed to print enrollment form.');
  }
};

interface Props {
  token: string;
  userId: string;
  corporateId: string;
  corpAdminId: string;
  dbName?: string;
  name?: string;
  userProfileImage?: string;
  userRole?: string;
  socket?: any;
  hideHeader?: boolean;
}

const ProjectDashboard: React.FC<Props> = ({
  token,
  userId,
  corporateId,
  corpAdminId,
  dbName: propDbName,
  name,
  userProfileImage: propUserProfileImage,
  userRole,
  socket,
  hideHeader = false,
}) => {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  // Chat States
  const [chatVisible, setChatVisible] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const [broadcastUnseenCount, setBroadcastUnseenCount] = useState(0);
  const [groupUnseenCount, setGroupUnseenCount] = useState(0);

  // Duty State
  const { dutyStatus, isLoading: dutyLoading, toggleDuty, startDuty, endDuty, isShiftComplete, assignedShiftDetails, activeDuty, employeeProfile } = useAttendance();

  const handleToggleDuty = async () => {
    if (dutyLoading) return; // prevent double-tap while request in flight
    await toggleDuty();
  };

  useEffect(() => {
    if (dutyStatus) {
      AsyncStorage.setItem('current_duty_status', dutyStatus).catch(() => {});
      AsyncStorage.setItem('user_role', 'Project').catch(() => {});
      if (dutyStatus === 'ON') {
        missedShiftChecker.checkPendingAlarmsNow().catch(() => {});
      }
    }
  }, [dutyStatus]);

  const { user } = useUserContext();
  const tenantDbName = propDbName || user?.dbName || '';
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState(name || user?.userDisplayName || user?.name || '');
  const [userProfileImage, setUserProfileImage] = useState<string | undefined>(propUserProfileImage || user?.userProfileImage);

  const isUserAdmin = useMemo(() => {
    const role = (user?.userRole || (user as any)?.role || userRole || '').toLowerCase();
    return ['corpadmin', 'useradmin', 'admin', 'superadmin', 'owner'].includes(role);
  }, [user?.userRole, (user as any)?.role, userRole]);
  
  // Data Arrays
  const [workers, setWorkers] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [activeStaff, setActiveStaff] = useState<any[]>([]);

  // Modals
  const [selectedItem, setSelectedItem] = useState<any>(null);
  
  const [addEmpVisible, setAddEmpVisible] = useState(false);
  const [addLeadVisible, setAddLeadVisible] = useState(false);
  const [modalType, setModalType] = useState<"add" | "edit">("add");

  const [siteVisitVisible, setSiteVisitVisible] = useState(false);
  const [clientMeetVisible, setClientMeetVisible] = useState(false);
  const [workProgressVisible, setWorkProgressVisible] = useState(false);
  const [attendanceVisible, setAttendanceVisible] = useState(false);
  const [voucherVisible, setVoucherVisible] = useState(false);
  const [expenseVisible, setExpenseVisible] = useState(false);

  // New Menu States
  const [activeMainMenu, setActiveMainMenu] = useState<'staff' | 'operation' | 'finance' | 'report' | 'service' | null>(null);
  const [galleryVisible, setGalleryVisible] = useState(false);
  
  // New Modals States
  const [staffModalMode, setStaffModalMode] = useState<'edit' | 'linked' | 'delinked' | 'print'>('edit');
  const [staffListVisible, setStaffListVisible] = useState(false);
  
  const [attendanceLogMode, setAttendanceLogMode] = useState<'edit' | 'delete' | 'backup'>('edit');
  const [attendanceLogVisible, setAttendanceLogVisible] = useState(false);
  
  const [salaryRegisterVisible, setSalaryRegisterVisible] = useState(false);
  const [penaltyRegisterVisible, setPenaltyRegisterVisible] = useState(false);
  const [attendanceRegisterVisible, setAttendanceRegisterVisible] = useState(false);
  const [voucherMode, setVoucherMode] = useState<'bill_collection' | 'advance' | 'salary' | 'payment' | 'receipt' | 'contra' | 'journal' | 'sales' | 'purchase'>('payment');
  
  const [billCollectionVisible, setBillCollectionVisible] = useState(false);
  const [staffFinanceVisible, setStaffFinanceVisible] = useState(false);

  useEffect(() => {
    if (name || user?.userDisplayName || user?.name) {
      setUserName(name || user?.userDisplayName || user?.name || '');
    }
    if (propUserProfileImage || user?.userProfileImage) {
      setUserProfileImage(propUserProfileImage || user?.userProfileImage);
    }
  }, [name, propUserProfileImage, user?.userDisplayName, user?.name, user?.userProfileImage]);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let authToken = token || (user as any)?.token;
      if (!authToken) {
        const session = await appService.getSession().catch(() => null);
        authToken = session?.token || '';
      }
      const activeDb = tenantDbName || user?.dbName || '';
      const reqHeaders = {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(activeDb ? { 'x-tenant-id': activeDb } : {}),
      };
      const todayStr = new Date().toISOString().split('T')[0];
      const [empRes, activeRes, clientRes, attRes] = await Promise.all([
        appService.httpClient.get('service/hr/employees', { params: { all: 'true' }, headers: reqHeaders }).catch(() => ({ data: { success: false, data: [] } })),
        appService.httpClient.get('service/hr/attendance/active-staff', { headers: reqHeaders }).catch(() => ({ data: { success: true, data: [] } })),
        appService.httpClient.get('service/leads/project-active', { headers: reqHeaders }).catch(() => {
          return appService.httpClient.get('service/leads/list', { headers: reqHeaders }).catch(() => ({ data: { success: false, data: [] } }));
        }),
        appService.httpClient.get('service/hr/attendance', { params: { date: todayStr }, headers: reqHeaders }).catch(() => ({ data: { success: true, data: [] } })),
      ]);
      if (empRes.data?.success) {
        setWorkers(empRes.data.data || []);
        AsyncStorage.setItem('cached_workers', JSON.stringify(empRes.data.data || [])).catch(() => {});
      }
      if (activeRes.data?.success) setActiveStaff(activeRes.data.data || []);
      if (clientRes.data?.success) {
        const loadedClients = clientRes.data.data || [];
        setClients(loadedClients);
        AsyncStorage.setItem('cached_clients', JSON.stringify(loadedClients)).catch(() => {});

        const currentRole = String(user?.userRole || (user as any)?.role || '').trim();
        const loadedAtt = attRes.data?.data || (Array.isArray(attRes.data) ? attRes.data : []);
        if (loadedClients.length > 0 && currentRole.toLowerCase() === 'project') {
          missedShiftChecker.checkAll(loadedClients, loadedAtt, currentRole);
        }
      }
    } catch (e) {
      console.warn("Failed to fetch data", e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, tenantDbName, user]);

  useEffect(() => {
    AsyncStorage.getItem('cached_workers').then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed) && parsed.length > 0) setWorkers(parsed);
        } catch {}
      }
    }).catch(() => {});
    AsyncStorage.getItem('cached_clients').then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed) && parsed.length > 0) setClients(parsed);
        } catch {}
      }
    }).catch(() => {});

    appService.getSession().then((session) => {
      if (session) {
        if (!name) setUserName(session.userDisplayName || session.displayName || session.name || session.employeeName || 'User');
        if (!propUserProfileImage) setUserProfileImage(session.photo || session.userProfileImage || session.employeeImage || session.photo_url || session.profileimage || session.profileImage || '');
      }
    });
    fetchData();
  }, [fetchData]);

  // Real-time Socket Event Subscription for Attendance, Staff, Leads & Active Staff Synchronization
  useEffect(() => {
    const socketInstance = socket || getSocket();
    if (!socketInstance) return;

    let debounceTimer: any = null;
    const handleDataChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchData(true);
      }, 600);
    };

    // Attendance events
    socketInstance.on('attendance:duty_on', handleDataChange);
    socketInstance.on('attendance:duty_off', handleDataChange);
    socketInstance.on('attendance:created', handleDataChange);
    socketInstance.on('attendance:updated', handleDataChange);
    socketInstance.on('attendance:deleted', handleDataChange);
    socketInstance.on('attendance:permission_approved', handleDataChange);
    socketInstance.on('attendance:permission_denied', handleDataChange);
    socketInstance.on('attendance:active_updated', handleDataChange);
    socketInstance.on('attendance:emergency_end', handleDataChange);

    // Lead & Staff events
    socketInstance.on('lead:created', handleDataChange);
    socketInstance.on('lead:updated', handleDataChange);
    socketInstance.on('lead:deleted', handleDataChange);
    socketInstance.on('employee:created', handleDataChange);
    socketInstance.on('employee:updated', handleDataChange);
    socketInstance.on('employee:deleted', handleDataChange);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      socketInstance.off('attendance:duty_on', handleDataChange);
      socketInstance.off('attendance:duty_off', handleDataChange);
      socketInstance.off('attendance:created', handleDataChange);
      socketInstance.off('attendance:updated', handleDataChange);
      socketInstance.off('attendance:deleted', handleDataChange);
      socketInstance.off('attendance:permission_approved', handleDataChange);
      socketInstance.off('attendance:permission_denied', handleDataChange);
      socketInstance.off('attendance:active_updated', handleDataChange);
      socketInstance.off('attendance:emergency_end', handleDataChange);
      socketInstance.off('lead:created', handleDataChange);
      socketInstance.off('lead:updated', handleDataChange);
      socketInstance.off('lead:deleted', handleDataChange);
      socketInstance.off('employee:created', handleDataChange);
      socketInstance.off('employee:updated', handleDataChange);
      socketInstance.off('employee:deleted', handleDataChange);
    };
  }, [socket, tenantDbName, fetchData]);

  const handleAdd = useCallback((type: 'Worker' | 'Client') => {
    setSelectedItem(null);
    setModalType("add");
    if (type === 'Worker') setAddEmpVisible(true);
    else setAddLeadVisible(true);
  }, []);

  const mainTabStyle = (isActive: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: isActive
      ? '#16a34a'
      : isDark ? '#1e293b' : '#f0fdf4',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 14,
    marginRight: 6,
    borderWidth: 1,
    borderColor: isActive
      ? '#16a34a'
      : isDark ? 'rgba(22, 163, 74, 0.3)' : 'rgba(22, 163, 74, 0.15)',
  });

  const mainTabTextStyle = (isActive: boolean) => ({
    color: isActive ? '#ffffff' : (isDark ? '#cbd5e1' : '#16a34a'),
    fontWeight: 'bold' as const,
    fontSize: 11.5,
  });

  const subTabStyle = () => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: isDark ? '#1e293b' : '#f0fdf4',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 6,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(22, 163, 74, 0.3)' : 'rgba(22, 163, 74, 0.15)',
  });

  const subTabTextStyle = () => ({
    color: isDark ? '#cbd5e1' : '#16a34a',
    fontWeight: 'bold' as const,
    fontSize: 11,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#f8fafc' }} edges={['bottom', 'left', 'right']}>
      {/* ── User & Duty Status Bar ── */}
      {!hideHeader && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: '#0B192C',
            borderBottomWidth: 1,
            borderColor: '#1e293b',
          }}
        >
          <Text
            style={{
              fontSize: 19,
              fontWeight: '800',
              color: '#ffffff',
              flex: 1,
              marginRight: 10,
            }}
            numberOfLines={1}
          >
            {userName || 'Suresh Chauhan'}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {/* Duty Switch Capsule */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.15)',
                borderRadius: 20,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Switch
                value={dutyStatus === 'ON'}
                onValueChange={handleToggleDuty}
                disabled={dutyLoading}
                trackColor={{ false: '#7f1d1d', true: '#14532d' }}
                thumbColor={dutyStatus === 'ON' ? '#22c55e' : '#ef4444'}
                style={{
                  transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
                  marginVertical: -4,
                  marginRight: 2,
                }}
              />
              <Text
                style={{
                  color: dutyLoading
                    ? '#94a3b8'
                    : dutyStatus === 'ON'
                      ? '#4ade80'
                      : '#f87171',
                  fontSize: 12,
                  fontWeight: '800',
                  letterSpacing: 0.4,
                }}
              >
                {dutyLoading
                  ? 'UPDATING...'
                  : dutyStatus === 'ON'
                    ? 'ON DUTY'
                    : 'OFF DUTY'}
              </Text>
              {dutyLoading && (
                <ActivityIndicator
                  size="small"
                  color="#94a3b8"
                  style={{ marginLeft: 4, transform: [{ scale: 0.7 }] }}
                />
              )}
            </View>

            {/* Chat Icon Button */}
            <TouchableOpacity
              onPress={() => setChatVisible(true)}
              style={{ position: 'relative', padding: 2 }}
            >
              <Ionicons name="chatbubbles-outline" size={24} color="#ffffff" />
              {unseenCount + broadcastUnseenCount + groupUnseenCount > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    backgroundColor: '#dc2626',
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingHorizontal: 3,
                    borderWidth: 1,
                    borderColor: '#0B192C',
                  }}
                >
                  <Text
                    style={{
                      color: '#ffffff',
                      fontSize: 9,
                      fontWeight: 'bold',
                    }}
                  >
                    {unseenCount + broadcastUnseenCount + groupUnseenCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 2-Tier Dashboard Menu */}
      <View style={{ backgroundColor: isDark ? '#1e293b' : '#000000', borderBottomWidth: 1, borderColor: isDark ? '#334155' : '#e2e8f0', paddingBottom: activeMainMenu ? 3 : 0 }}>
        {/* Tier 1: Main Menu â€” Smooth Horizontal Sliding Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingLeft: 8,
            paddingRight: 28,
            paddingVertical: 5,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          {[
            { id: 'staff', label: 'Staff', icon: 'people' },
            { id: 'operation', label: 'Attendance', icon: 'calendar' },
            { id: 'finance', label: 'Voucher', icon: 'cash' },
            { id: 'report', label: 'Report', icon: 'document-text' },
            { id: 'service', label: 'Services', icon: 'apps' }
          ].map(menu => {
            const isActive = activeMainMenu === menu.id;
            return (
              <TouchableOpacity
                key={menu.id}
                onPress={() => {
                  if (menu.id === 'finance') {
                    setVoucherVisible(true);
                  } else {
                    setActiveMainMenu(prev => prev === menu.id ? null : menu.id as any);
                  }
                }}
                activeOpacity={0.7}
                style={mainTabStyle(isActive)}
              >
                <Ionicons
                  name={menu.icon as any}
                  size={13}
                  color={isActive ? '#ffffff' : (isDark ? '#cbd5e1' : '#16a34a')}
                  style={{ marginRight: 4 }}
                />
                <Text style={mainTabTextStyle(isActive)}>
                  {menu.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Tier 2: Sub-Menu */}
        {activeMainMenu && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingLeft: 8,
              paddingRight: 28,
              paddingVertical: 4,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            {activeMainMenu === 'staff' && (
              <>
                <TouchableOpacity onPress={() => handleAdd('Worker')} style={subTabStyle()}>
                  <Ionicons name="person-add" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Add Staff</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setStaffModalMode('edit'); setStaffListVisible(true); }} style={subTabStyle()}>
                  <Ionicons name="create" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Edit Staff</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setStaffModalMode('linked'); setStaffListVisible(true); }} style={subTabStyle()}>
                  <Ionicons name="link" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Linked Staff</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setStaffModalMode('delinked'); setStaffListVisible(true); }} style={subTabStyle()}>
                  <Ionicons name="unlink" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Delinked Staff</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setStaffModalMode('print'); setStaffListVisible(true); }} style={subTabStyle()}>
                  <Ionicons name="share" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Print/Share EFN</Text>
                </TouchableOpacity>
              </>
            )}

            {activeMainMenu === 'operation' && (
              <>
                <TouchableOpacity onPress={() => setAttendanceVisible(true)} style={subTabStyle()}>
                  <Ionicons name="checkmark-circle" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Daily Present</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setAttendanceLogMode('edit'); setAttendanceLogVisible(true); }} style={subTabStyle()}>
                  <Ionicons name="create" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Modify</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setAttendanceLogMode('delete'); setAttendanceLogVisible(true); }} style={subTabStyle()}>
                  <Ionicons name="trash" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Clean</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setAttendanceLogMode('backup'); setAttendanceLogVisible(true); }} style={subTabStyle()}>
                  <Ionicons name="cloud-download" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Backup</Text>
                </TouchableOpacity>
              </>
            )}



            {activeMainMenu === 'report' && (
              <>
                <TouchableOpacity onPress={() => router.push('/adminPettyCash?forceUserMode=true')} style={subTabStyle()}>
                  <Ionicons name="book" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>My Petty Cash Book</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setAttendanceRegisterVisible(true)} style={subTabStyle()}>
                  <Ionicons name="grid" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Attendance</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSalaryRegisterVisible(true)} style={subTabStyle()}>
                  <Ionicons name="calculator" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Salary</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPenaltyRegisterVisible(true)} style={subTabStyle()}>
                  <Ionicons name="warning" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Penalty</Text>
                </TouchableOpacity>

              </>
            )}

            {activeMainMenu === 'service' && (
              <>
                <TouchableOpacity
                  onPress={() => { setSelectedItem(null); setSiteVisitVisible(true); }}
                  style={subTabStyle()}
                >
                  <Ionicons name="location" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>GeoTag</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setSelectedItem(null); setClientMeetVisible(true); }}
                  style={subTabStyle()}
                >
                  <Ionicons name="people" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>ClientMeet</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => { setSelectedItem(null); setWorkProgressVisible(true); }}
                  style={subTabStyle()}
                >
                  <Ionicons name="construct" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>WorkProgress</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setGalleryVisible(true)}
                  style={subTabStyle()}
                >
                  <Ionicons name="images" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Gallery</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        )}
      </View>

      {/* Map Live Tracker */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <LoadingTimerSpinner label="Loading Map & Staff Live GPS..." estimatedSeconds={1.5} />
          </View>
        ) : (dutyStatus === 'ON' || isUserAdmin) ? (
          <LiveTracker 
            activeStaff={isUserAdmin ? activeStaff : []} 
            leads={clients} 
            employees={workers} 
            name={userName || user?.name || user?.userDisplayName || ''}
            profileImage={userProfileImage || user?.userProfileImage || (user as any)?.photo || (user as any)?.photo_url || (user as any)?.profileImage}
            employee={employeeProfile || user}
            geoHistory={activeDuty?.geoHistory}
            onRefresh={() => fetchData(true)}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }}>
            <Ionicons name="location-outline" size={48} color="#94a3b8" />
            <Text style={{ marginTop: 12, fontSize: 16, fontWeight: 'bold', color: isDark ? '#cbd5e1' : '#475569' }}>Tracking Paused</Text>
            <Text style={{ marginTop: 8, fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingHorizontal: 40 }}>
              Live tracker starts only when you are on duty. Please mark your attendance to begin tracking.
            </Text>
          </View>
        )}
      </View>

      {/* Modals */}
      <AddEmployeeModal
        visible={addEmpVisible}
        employee={selectedItem}
        onClose={() => setAddEmpVisible(false)}
        onComplete={fetchData}
        onEditComplete={fetchData}
      />

      <LeadModal
        visible={addLeadVisible}
        leadInfo={selectedItem ? {
          name: selectedItem.sender_name,
          status: selectedItem.status,
          product: selectedItem.product_name
        } : undefined}
        onClose={() => setAddLeadVisible(false)}
        type={modalType === 'add' ? 'addLead' : 'edit'}
        mobile={selectedItem?.sender_mobile}
      />

      {/* Operation Modals */}
      <SiteVisitModal visible={siteVisitVisible} lead={selectedItem} leads={clients} onClose={() => setSiteVisitVisible(false)} onComplete={fetchData} />
      <ClientMeetModal visible={clientMeetVisible} lead={selectedItem} leads={clients} onClose={() => setClientMeetVisible(false)} onComplete={fetchData} />
      <WorkProgressModal visible={workProgressVisible} lead={selectedItem} leads={clients} onClose={() => setWorkProgressVisible(false)} onComplete={fetchData} />
      <AttendanceModal visible={attendanceVisible} onClose={() => setAttendanceVisible(false)} onComplete={() => {}} leads={clients} />
      <ExpenseModal visible={expenseVisible} lead={selectedItem} leads={clients} onClose={() => setExpenseVisible(false)} onComplete={fetchData} />
      <VoucherEntryModal visible={voucherVisible} onClose={() => setVoucherVisible(false)} token={token} mode={voucherMode} restrictToOwnPettyCash={true} />
      <ProjectGalleryModal visible={galleryVisible} onClose={() => setGalleryVisible(false)} clients={clients} />
      <BillCollectionModal visible={billCollectionVisible} onClose={() => setBillCollectionVisible(false)} token={token} />
      <StaffFinanceModal visible={staffFinanceVisible} onClose={() => setStaffFinanceVisible(false)} token={token} />

      {/* Custom Sub-menu Modals */}
      <StaffListModal
        visible={staffListVisible}
        onClose={() => setStaffListVisible(false)}
        workers={workers}
        mode={staffModalMode}
        token={token}
        onEditWorker={(w) => {
          setSelectedItem(w);
          setModalType("edit");
          setAddEmpVisible(true);
        }}
        onRefresh={fetchData}
      />

      <AttendanceLogModal
        visible={attendanceLogVisible}
        onClose={() => setAttendanceLogVisible(false)}
        token={token}
        clients={clients}
        mode={attendanceLogMode}
        tenantDbName={tenantDbName}
      />

      <SalaryRegisterModal
        visible={salaryRegisterVisible}
        onClose={() => setSalaryRegisterVisible(false)}
        token={token}
        user={user}
      />

      <PenaltyRegisterModal
        visible={penaltyRegisterVisible}
        onClose={() => setPenaltyRegisterVisible(false)}
        token={token}
        user={user}
      />

      <SitewiseAttendanceRegisterModal
        visible={attendanceRegisterVisible}
        onClose={() => setAttendanceRegisterVisible(false)}
        leads={clients}
        token={token}
        user={user}
      />

      {/* Chat Room Modal */}
      <ChatRoomModal
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
        token={token}
        userId={userId}
        name={userName}
        onUnseenCountChange={setUnseenCount}
        onBroadcastUnseenChange={setBroadcastUnseenCount}
        onGroupUnseenChange={setGroupUnseenCount}
      />

      {/* Voucher Entry Modal */}
      <VoucherEntryModal
        visible={voucherVisible}
        onClose={() => setVoucherVisible(false)}
        token={token}
        dbName={tenantDbName}
      />

    </SafeAreaView>
  );
};

// â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”
// 1. StaffListModal Component
// â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”
interface StaffListModalProps {
  visible: boolean;
  onClose: () => void;
  workers: any[];
  mode: 'edit' | 'linked' | 'delinked' | 'print';
  token: string;
  onEditWorker: (worker: any) => void;
  onRefresh: () => void;
}

const StaffListModal: React.FC<StaffListModalProps> = ({ visible, onClose, workers, mode, token, onEditWorker, onRefresh }) => {
  const isDark = useColorScheme() === "dark";
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return workers.filter(w => {
      if (mode === 'linked' && w.active === false) return false;
      if (mode === 'delinked' && w.active !== false) return false;
      
      if (!search) return true;
      const q = search.toLowerCase();
      return (w.name || '').toLowerCase().includes(q) || 
             (w.mobile || '').toLowerCase().includes(q) || 
             (w.enrollment_no || '').toLowerCase().includes(q);
    });
  }, [workers, mode, search]);

  const toggleStatus = async (worker: any) => {
    const nextActive = worker.active === false ? true : false;
    try {
      const res = await appService.httpClient.put(
        `service/hr/employees/${worker._id}`,
        { active: nextActive },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.success || res.status === 200) {
        appService.showToast(nextActive ? 'Staff Linked Successfully' : 'Staff Delinked Successfully', 'Success');
        onRefresh();
      } else {
        Alert.alert('Error', 'Failed to update status.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update status.');
    }
  };

  const handleAction = (worker: any) => {
    if (mode === 'edit') {
      onEditWorker(worker);
      onClose();
    } else if (mode === 'print') {
      handlePrintEnrollment(worker);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#f8fafc' }}>
        <View style={{ height: 60, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', marginLeft: 8 }}>
            {mode === 'edit' && 'Edit Staff Profile'}
            {mode === 'linked' && 'Linked Staff (Active)'}
            {mode === 'delinked' && 'Delinked Staff (Inactive)'}
            {mode === 'print' && 'Print/Share EFN'}
          </Text>
        </View>

        <View style={{ padding: 12, justifyContent: 'center' }}>
          <TextInput
            placeholder="Search by name, mobile, or EFN#"
            placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
            style={{
              height: 44,
              backgroundColor: isDark ? '#1e293b' : '#fff',
              borderRadius: 8,
              paddingLeft: 12,
              paddingRight: search ? 36 : 12,
              color: isDark ? '#fff' : '#000',
              borderWidth: 1,
              borderColor: isDark ? '#334155' : '#e2e8f0',
              fontWeight: '600',
            }}
            value={search}
            onChangeText={setSearch}
          />
          {!!search && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              style={{ position: 'absolute', right: 22, padding: 4 }}
            >
              <Ionicons name="close-circle" size={16} color={isDark ? '#94a3b8' : '#64748b'} />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Ionicons name="people-outline" size={48} color="#94a3b8" />
              <Text style={{ marginTop: 8, color: '#94a3b8', fontWeight: 'bold' }}>No staff found.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isDark ? '#1e293b' : '#fff',
              padding: 12,
              borderRadius: 12,
              marginBottom: 8,
              borderWidth: 1,
              borderColor: isDark ? '#334155' : '#e2e8f0',
            }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#f1f5f9', overflow: 'hidden', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                <FastImage
                  source={item.photo || item.photo_url}
                  style={{ width: '100%', height: '100%' }}
                  fallbackIcon={<Ionicons name="person" size={24} color="#cbd5e1" />}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: isDark ? '#fff' : '#0f172a' }}>
                  {item.name} {item.enrollment_no ? `(EFN# ${item.enrollment_no})` : ''}
                </Text>
                <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  {item.role || 'Worker'} • {item.mobile}
                </Text>
              </View>

              {(mode === 'linked' || mode === 'delinked') ? (
                <TouchableOpacity
                  onPress={() => toggleStatus(item)}
                  style={{
                    backgroundColor: item.active !== false ? '#fee2e2' : '#dcfce7',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 12,
                  }}
                >
                  <Text style={{
                    fontSize: 12,
                    fontWeight: 'bold',
                    color: item.active !== false ? '#dc2626' : '#15803d',
                  }}>
                    {item.active !== false ? 'Delink' : 'Link'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => handleAction(item)}
                  style={{
                    backgroundColor: mode === 'print' ? '#ecfeff' : '#eef2ff',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 12,
                  }}
                >
                  <Text style={{
                    fontSize: 12,
                    fontWeight: 'bold',
                    color: mode === 'print' ? '#0891b2' : '#4f46e5',
                  }}>
                    {mode === 'print' ? 'Share EFN' : 'Edit'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
};

// â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”
// 2. AttendanceLogModal Component
// â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”
interface AttendanceLogModalProps {
  visible: boolean;
  onClose: () => void;
  token: string;
  clients: any[];
  mode: 'edit' | 'delete' | 'backup';
  tenantDbName?: string;
}

const AttendanceLogModal: React.FC<AttendanceLogModalProps> = ({ visible, onClose, token, clients, mode, tenantDbName }) => {
  const isDark = useColorScheme() === "dark";
  const { user } = useUserContext();
  const currentCorpName = user?.corporateName || (user as any)?.companyName || 'Corporate Office';
  const activeDb = tenantDbName || user?.dbName || '';

  const reqHeaders = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    ...(activeDb ? { 'x-tenant-id': activeDb } : {}),
  }), [token, activeDb]);

  // Resolve effective headers with session fallback — called at request time, not render time
  const getEffectiveHeaders = async () => {
    let authToken = token;
    if (!authToken) {
      const session = await appService.getSession().catch(() => null);
      authToken = session?.token || '';
    }
    const dbName = activeDb || (user as any)?.dbName || '';
    return {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(dbName ? { 'x-tenant-id': dbName } : {}),
    };
  };

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  const [editingLog, setEditingLog] = useState<any>(null);
  const [editStatus, setEditStatus] = useState('Present');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editRate, setEditRate] = useState('');

  // Sitewise, Shift, and Worker expansion states
  const [expandedSites, setExpandedSites] = useState<Record<string, boolean>>({});
  const [expandedShifts, setExpandedShifts] = useState<Record<string, boolean>>({});
  const [expandedWorkers, setExpandedWorkers] = useState<Record<string, boolean>>({});

  // Shift view mode: 'current' (time-based shift active now) vs 'all' (all shifts)
  const [shiftFilterMode, setShiftFilterMode] = useState<'current' | 'all'>('current');
  // Per-site shift override (allows user to tap another shift pill on a specific site card)
  const [siteShiftOverrides, setSiteShiftOverrides] = useState<Record<string, string>>({});

  // Manual workers (add-on) and clean mode state
  const [manualWorkers, setManualWorkers] = useState<Array<{ siteId: string; siteName: string; shiftCode: string; workerData: any }>>([]);
  const [cleaning, setCleaning] = useState(false);

  // Leads and employee state for the modal
  const [modalLeads, setModalLeads] = useState<any[]>(clients || []);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [addWorkerModalVisible, setAddWorkerModalVisible] = useState(false);
  const [addWorkerContext, setAddWorkerContext] = useState<{ siteId: string; siteName: string; shiftCode: string } | null>(null);
  const [addWorkerSearch, setAddWorkerSearch] = useState('');
  const [dayActionModal, setDayActionModal] = useState<{
    worker: any;
    day: number;
    siteId: string;
    siteName: string;
    shiftCode: string;
    logForDay: any;
    targetDate: Date;
  } | null>(null);

  useEffect(() => {
    if (clients && clients.length > 0) {
      setModalLeads(clients);
    }
  }, [clients]);

  // 🧹 Calculate reconciliation metrics for Clean Mode
  const reconciliationStats = useMemo(() => {
    const workerDateSiteShiftMap = new Map<string, number>();
    const slotDateMap = new Map<string, Set<string>>();

    logs.forEach(log => {
      const d = new Date(log.date || log.dutyStart);
      const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const empId = String(log.employeeId?._id || log.employeeId || '');
      const siteId = String(log.leadId?._id || log.leadId || 'none');
      const shift = log.shiftCode || 'G';

      const key = `${dateKey}_${empId}_${siteId}_${shift}`;
      workerDateSiteShiftMap.set(key, (workerDateSiteShiftMap.get(key) || 0) + 1);

      if (siteId !== 'none') {
        const slotKey = `${dateKey}_${siteId}_${shift}`;
        if (!slotDateMap.has(slotKey)) slotDateMap.set(slotKey, new Set());
        slotDateMap.get(slotKey)!.add(empId);
      }
    });

    let fragmentedGroups = 0;
    workerDateSiteShiftMap.forEach(count => {
      if (count > 1) fragmentedGroups++;
    });

    let sharedSlots = 0;
    slotDateMap.forEach(workerSet => {
      if (workerSet.size >= 2) sharedSlots++;
    });

    return { fragmentedGroups, sharedSlots, totalLogs: logs.length };
  }, [logs]);

  // ⚡ One-tap Clean & Reconcile handler
  const handleRunCleanAndReconcile = async () => {
    Alert.alert(
      "Run Attendance Clean & Reconcile",
      `This will:\n1. Merge fragmented crash logs for the same worker, site & shift (hours capped to shift limit).\n2. Split shared slots (>half shift) into 2 half-duties for both workers.\n3. Preserve valid overtime shifts.\n4. Normalize statuses to P, W, L, A.\n\nProceed for ${MONTHS[selectedMonth]} ${selectedYear}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clean & Reconcile",
          style: "destructive",
          onPress: async () => {
            try {
              setCleaning(true);
              const effectiveHeaders = await getEffectiveHeaders();
              const res = await appService.httpClient.post(
                'service/hr/attendance/clean-reconcile',
                { month: selectedMonth, year: selectedYear },
                { headers: effectiveHeaders }
              );
              if (res.data?.success) {
                const d = res.data.data;
                Alert.alert(
                  "Clean Completed",
                  `✅ Reconciliation Summary:\n• Consolidated Fragment Groups: ${d.mergedCount}\n• Redundant Logs Deleted: ${d.deletedFragmentsCount}\n• Shared Shift Half Duties: ${d.halfDutyAdjustedCount}\n• Statuses Normalized: ${d.normalizedStatusCount}`
                );
                fetchLogs();
              } else {
                Alert.alert('Error', res.data?.message || 'Failed to clean logs');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Clean failed');
            } finally {
              setCleaning(false);
            }
          }
        }
      ]
    );
  };

  const [workerLoading, setWorkerLoading] = useState<Record<string, boolean>>({});

  const fetchWorkerLogs = async (empId: string) => {
    if (!empId || workerLoading[empId]) return;
    setWorkerLoading(prev => ({ ...prev, [empId]: true }));
    try {
      const effectiveHeaders = await getEffectiveHeaders();
      const now = new Date();
      const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
      const fromDate = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0);
      const toDate = isCurrentMonth
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
        : new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);

      const res = await appService.httpClient.get('service/hr/attendance', {
        params: {
          employeeId: empId,
          from_date: fromDate.toISOString(),
          to_date: toDate.toISOString(),
        },
        headers: effectiveHeaders,
        timeout: 12000,
      });
      const newLogs = res.data?.data || (Array.isArray(res.data) ? res.data : []);
      if (Array.isArray(newLogs) && newLogs.length > 0) {
        setLogs(prev => {
          const existingIds = new Set(prev.map(l => String(l._id || l.id)));
          const toAdd = newLogs.filter((l: any) => !existingIds.has(String(l._id || l.id)));
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });
      }
    } catch (err: any) {
      console.warn(`[AttendanceLogModal] fetchWorkerLogs for ${empId} failed:`, err.message);
    } finally {
      setWorkerLoading(prev => ({ ...prev, [empId]: false }));
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const effectiveHeaders = await getEffectiveHeaders();
      const now = new Date();
      const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
      const fromDate = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0);
      // Ensure toDate covers the complete month so completed duties and all shifts are fetched
      const toDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
      const startOfMonthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
      const endOfMonthDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const endOfMonthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(endOfMonthDay).padStart(2, '0')}`;

      // Concurrently fetch Leads (both active and full list), Employees, and Active Staff
      const [projLeadRes, allLeadRes, empRes, activeStaffRes] = await Promise.all([
        appService.httpClient.get('service/leads/project-active', {
          headers: effectiveHeaders,
          timeout: 8000,
        }).catch(() => ({ data: { success: false, data: [] } })),
        appService.httpClient.get('service/leads/list', {
          headers: effectiveHeaders,
          timeout: 8000,
        }).catch(() => ({ data: { success: false, data: [] } })),
        appService.httpClient.get('service/hr/employees', {
          params: { all: 'true' },
          headers: effectiveHeaders,
          timeout: 8000,
        }).catch(() => ({ data: { success: false, data: [] } })),
        appService.httpClient.get('service/hr/attendance/active-staff', {
          headers: effectiveHeaders,
          timeout: 8000,
        }).catch(() => ({ data: { success: true, data: [] } })),
      ]);

      // Merge all leads by ObjectId to ensure all configured sites and siteShifts are present
      const combinedLeadsMap = new Map<string, any>();
      (clients || []).forEach((c: any) => {
        const id = String(c?._id || c?.id || '');
        if (id) combinedLeadsMap.set(id, c);
      });
      const listLeads = allLeadRes.data?.data || (Array.isArray(allLeadRes.data) ? allLeadRes.data : []);
      listLeads.forEach((c: any) => {
        const id = String(c?._id || c?.id || '');
        if (id) combinedLeadsMap.set(id, { ...(combinedLeadsMap.get(id) || {}), ...c });
      });
      const projLeads = projLeadRes.data?.data || (Array.isArray(projLeadRes.data) ? projLeadRes.data : []);
      projLeads.forEach((c: any) => {
        const id = String(c?._id || c?.id || '');
        if (id) combinedLeadsMap.set(id, { ...(combinedLeadsMap.get(id) || {}), ...c });
      });

      const mergedLeads = Array.from(combinedLeadsMap.values());
      if (mergedLeads.length > 0) {
        setModalLeads(mergedLeads);
      }

      const fetchedEmployees = (empRes.data?.success && Array.isArray(empRes.data.data))
        ? empRes.data.data
        : (Array.isArray(empRes.data) ? empRes.data : []);
      if (fetchedEmployees.length > 0) {
        const seenEmpIds = new Set<string>();
        const uniqueEmployees = fetchedEmployees.filter((e: any) => {
          const id = String(e._id || e.id || '');
          if (!id || seenEmpIds.has(id)) return false;
          seenEmpIds.add(id);
          return true;
        });
        setAllEmployees(uniqueEmployees);
      }

      let baseLogs: any[] = [];
      // Safe bulk attendance fetch with both ISO and YYYY-MM-DD date range for complete database compatibility
      try {
        const [attResIso, attResStr] = await Promise.all([
          appService.httpClient.get('service/hr/attendance', {
            params: {
              from_date: fromDate.toISOString(),
              to_date: toDate.toISOString(),
            },
            headers: effectiveHeaders,
            timeout: 10000,
          }).catch(() => ({ data: { success: false, data: [] } })),
          appService.httpClient.get('service/hr/attendance', {
            params: {
              from_date: startOfMonthStr,
              to_date: endOfMonthStr,
            },
            headers: effectiveHeaders,
            timeout: 10000,
          }).catch(() => ({ data: { success: false, data: [] } })),
        ]);

        const logsIso = attResIso.data?.data || (Array.isArray(attResIso.data) ? attResIso.data : []);
        const logsStr = attResStr.data?.data || (Array.isArray(attResStr.data) ? attResStr.data : []);
        const combined = new Map<string, any>();
        [...logsIso, ...logsStr].forEach((l: any) => {
          const id = String(l._id || l.id || `${l.date}_${l.dutyStart}_${l.employeeId?._id || l.employeeId}`);
          combined.set(id, l);
        });
        baseLogs = Array.from(combined.values());
      } catch (bulkErr: any) {
        console.warn('[AttendanceLogModal] Bulk attendance fetch error/timeout:', bulkErr?.message);
      }

      // Merge active staff logs (workers currently on duty)
      const logMap = new Map<string, any>();
      baseLogs.forEach((l: any) => {
        const k = String(l._id || l.id || `${l.date}_${l.dutyStart}_${l.employeeId?._id || l.employeeId}`);
        logMap.set(k, l);
      });

      if (activeStaffRes.data?.success && Array.isArray(activeStaffRes.data.data)) {
        activeStaffRes.data.data.forEach((l: any) => {
          const k = String(l._id || l.id || `${l.date}_${l.dutyStart}_${l.employeeId?._id || l.employeeId}`);
          const isActive = !l.dutyEnd || l.dutyEnd === null;
          const logD = (l.date || l.dutyStart) ? new Date(l.date || l.dutyStart) : null;
          const isThisMonth = logD && !isNaN(logD.getTime())
            ? (logD.getFullYear() === selectedYear && logD.getMonth() === selectedMonth)
            : false;

          if (isThisMonth || (isCurrentMonth && isActive)) {
            const activeLog = { ...l, status: l.status || 'Present' };
            const existing = logMap.get(k) || {};
            logMap.set(k, { ...existing, ...activeLog });
          }
        });
      }

      const mergedLogs = Array.from(logMap.values());
      setLogs(mergedLogs);

      // Fast background prefetch for complete monthly logs of all candidate employees across sites
      const candidateEmpIds = [
        ...new Set([
          ...mergedLogs.map((l: any) => String(l.employeeId?._id || l.employeeId || '')),
          ...fetchedEmployees.map((e: any) => String(e._id || e.id || '')),
        ].filter(Boolean))
      ];

      if (candidateEmpIds.length > 0) {
        (async () => {
          for (let i = 0; i < candidateEmpIds.length; i += 6) {
            const chunk = candidateEmpIds.slice(i, i + 6);
            const chunkResults = await Promise.all(
              chunk.map(async (empId) => {
                try {
                  const res = await appService.httpClient.get('service/hr/attendance', {
                    params: {
                      employeeId: empId,
                      from_date: startOfMonthStr,
                      to_date: endOfMonthStr,
                    },
                    headers: effectiveHeaders,
                    timeout: 10000,
                  });
                  return res.data?.data || (Array.isArray(res.data) ? res.data : []);
                } catch {
                  return [];
                }
              })
            );
            const newItems = chunkResults.flat();
            if (newItems.length > 0) {
              setLogs(prev => {
                const existingIds = new Set(prev.map(l => String(l._id || l.id)));
                const toAdd = newItems.filter((l: any) => !existingIds.has(String(l._id || l.id)));
                return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
              });
            }
          }
        })();
      }

      const activeLeads = mergedLeads.length > 0 ? mergedLeads : (clients || []);
      const currentRole = String(user?.userRole || (user as any)?.role || '').trim();
      if (activeLeads && activeLeads.length > 0 && currentRole.toLowerCase() === 'project') {
        missedShiftChecker.checkAll(activeLeads, mergedLogs, currentRole);
      }
    } catch (e: any) {
      console.warn('[AttendanceLogModal] fetchLogs warning:', e?.message);
    } finally {
      setLoading(false);
    }
  };

  const resolveSiteName = useCallback((l: any) => {
    const leadObj = (l?.leadId && typeof l.leadId === 'object') ? l.leadId : null;
    const rawLeadId = leadObj?._id || l?.leadId || l?.siteId || l?.clientId;
    const leadIdStr = rawLeadId ? String(rawLeadId) : '';
    const matchedClient = leadObj || (leadIdStr && clients?.find((c: any) => String(c._id) === leadIdStr));
    const actualLeadSiteName = matchedClient?.sender_name || 
                               matchedClient?.displayName || 
                               matchedClient?.client_name || 
                               matchedClient?.product_name || 
                               matchedClient?.name;
    if (actualLeadSiteName && actualLeadSiteName !== 'New Site') return actualLeadSiteName;

    const isRegisteredUser =
      l?.employeeType === 'userMaster' ||
      l?.employeeId?.employeeType === 'userMaster' ||
      l?.employeeId?.user_id ||
      ['CorpAdmin', 'userAdmin', 'Admin', 'Supervisor', 'Project', 'Finance', 'Sales'].includes(
        l?.role || l?.employeeId?.role || ''
      );

    if (isRegisteredUser || l?.site_name === 'New Site' || !leadIdStr || leadIdStr === 'hq_remote') {
      return currentCorpName;
    }

    if (l?.site_name && l.site_name !== 'Field Duty' && l.site_name !== 'New Site') {
      return l.site_name;
    }
    return (leadIdStr && leadIdStr !== 'hq_remote') ? 'Site Duty' : currentCorpName;
  }, [clients, currentCorpName]);

  const handleShareBackup = async () => {
    if (logs.length === 0) {
      Alert.alert('No Data', 'There are no attendance records to backup for the selected month.');
      return;
    }
    try {
      const fileName = `attendance_${MONTHS[selectedMonth]}_${selectedYear}.json`;
      const tempUri = `${FileSystem.documentDirectory}${fileName}`;
      
      const cleanLogs = logs.map((l: any) => ({
        _id: l._id,
        employeeName: l.employeeId?.name || l.displayName || 'Worker',
        enrollment_no: l.employeeId?.enrollment_no || 'N/A',
        role: l.role || l.employeeId?.role || 'Worker',
        siteName: resolveSiteName(l),
        date: l.date,
        dutyStart: l.dutyStart,
        dutyEnd: l.dutyEnd,
        status: l.status,
        shiftCode: l.shiftCode,
        shiftPeriod: l.shiftPeriod,
        hoursWorked: l.hoursWorked,
        rate: l.rate,
        markedBy: l.markedByUserName || 'System',
      }));

      await FileSystem.writeAsStringAsync(tempUri, JSON.stringify(cleanLogs, null, 2), {
        encoding: 'utf8',
      });

      await Sharing.shareAsync(tempUri, {
        mimeType: 'application/json',
        dialogTitle: `Share ${MONTHS[selectedMonth]} ${selectedYear} Attendance Backup`,
        UTI: 'public.json',
      });
    } catch (e: any) {
      Alert.alert('Backup Error', e.message || 'Failed to generate JSON backup.');
    }
  };

  const handleWhatsAppShare = async () => {
    if (logs.length === 0) {
      Alert.alert('No Data', 'There are no attendance records to share for the selected month.');
      return;
    }
    try {
      let msg = `*📊 Attendance Summary - ${MONTHS[selectedMonth]} ${selectedYear}*\n\n`;
      msg += `*Total Records:* ${logs.length}\n`;
      msg += `*Unique Workers:* ${uniqueEmployees.length}\n\n`;
      msg += `*Recent Records Preview:*\n`;
      
      logs.slice(0, 15).forEach((l: any, i: number) => {
        const empName = l.employeeId?.name || l.displayName || 'Worker';
        const dateStr = l.date ? new Date(l.date).toLocaleDateString('en-IN') : '';
        const resolvedSite = resolveSiteName(l);
        msg += `${i + 1}. ${empName} - ${resolvedSite} (${dateStr})\n`;
      });
      
      if (logs.length > 15) {
        msg += `...and ${logs.length - 15} more records.`;
      }
      
      const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(msg)}`;
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) {
        await Linking.openURL(whatsappUrl);
      } else {
        Alert.alert('WhatsApp Not Installed', 'Please install WhatsApp to share directly.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to open WhatsApp.');
    }
  };

  useEffect(() => {
    if (visible) {
      setManualWorkers([]);
      fetchLogs();
    }
  }, [visible, selectedMonth, selectedYear]);


  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedMonth, selectedYear]);

  const uniqueEmployees = useMemo(() => {
    const map = new Map<string, any>();
    logs.forEach(l => {
      const emp = l.employeeId;
      const empId = emp?._id || l.markedByUserId || 'Unknown';
      if (!map.has(empId)) {
        map.set(empId, {
          _id: empId,
          name: emp?.name || l.displayName || 'Worker',
          role: emp?.role || l.role || 'Worker',
          enrollment_no: emp?.enrollment_no || '',
          photo: emp?.photo || emp?.photo_url || '',
          logs: [l],
        });
      } else {
        map.get(empId).logs.push(l);
      }
    });
    const list = Array.from(map.values());
    list.forEach(e => {
      e.logs.sort((a: any, b: any) => new Date(a.date || a.dutyStart).getTime() - new Date(b.date || b.dutyStart).getTime());
    });
    return list;
  }, [logs]);

  // Shift code normalization helper: maps variants to canonical 'D', 'N2', 'M', 'A', 'N', 'G'
  const normalizeShiftCode = (code?: any, period?: any, name?: any): string => {
    const c = String(code || '').trim().toLowerCase();
    const p = String(period || '').trim().toLowerCase();
    const n = String(name || '').trim().toLowerCase();

    // 1. Direct code matching takes highest precedence!
    if (['m', 'morning'].includes(c)) return 'M';
    if (['a', 'afternoon'].includes(c)) return 'A';
    if (['n2', 'night2', 'night12', 'night 12', 'night shift 12'].includes(c)) return 'N2';
    if (['n', 'night', 'night8', 'night shift 8'].includes(c)) return 'N';
    if (['d', 'day', 'day12', 'day 12', 'day shift'].includes(c)) return 'D';
    if (['g', 'general', 'general shift'].includes(c)) return 'G';

    // 2. Period matching (only if code was absent or unrecognized)
    if (['m', 'morning'].includes(p)) return 'M';
    if (['a', 'afternoon'].includes(p)) return 'A';
    if (['night12', 'night2'].includes(p)) return 'N2';
    if (['n', 'night', 'night8'].includes(p)) return 'N';
    if (['day', 'day12', 'd'].includes(p)) return 'D';
    if (['general', 'g'].includes(p)) return 'G';

    // 3. Name matching
    if (n.includes('morning')) return 'M';
    if (n.includes('afternoon')) return 'A';
    if (n.includes('night12') || n.includes('night 12')) return 'N2';
    if (n.includes('night')) return 'N';
    if (n.includes('day') && !n.includes('sunday') && !n.includes('monday')) return 'D';
    if (n.includes('general')) return 'G';

    const raw = String(code || period || name || 'G').trim().toUpperCase();
    return raw || 'G';
  };

  const getShiftDisplayName = (code: string): string => {
    switch (code) {
      case 'D': return 'Day Shift (12 hrs)';
      case 'N2': return 'Night Shift (12 hrs)';
      case 'M': return 'Morning Shift (8 hrs)';
      case 'A': return 'Afternoon Shift (8 hrs)';
      case 'N': return 'Night Shift (8 hrs)';
      case 'G': return 'General Shift (8 hrs)';
      default: return `${code} Shift`;
    }
  };

  // Helper to determine if a shift is active right now based on current time
  const isShiftActiveAtTime = (shift: any, now: Date = new Date()): boolean => {
    const normCode = normalizeShiftCode(shift.shiftCode, null, shift.shiftName);
    const nowHours = now.getHours();
    const nowMins = nowHours * 60 + now.getMinutes();

    if (shift.startTime && typeof shift.startTime === 'string' && shift.startTime.includes(':')) {
      const [sh, sm] = shift.startTime.split(':').map(Number);
      const startMins = sh * 60 + (sm || 0);
      const durationHrs = Number(shift.durationHrs) || (normCode === 'D' || normCode === 'N2' ? 12 : 8);
      const endMins = (startMins + durationHrs * 60) % 1440;
      if (startMins < endMins) {
        return nowMins >= startMins && nowMins < endMins;
      } else {
        return nowMins >= startMins || nowMins < endMins;
      }
    }

    // Default time windows if startTime is not explicitly configured:
    switch (normCode) {
      case 'M': // Morning 06:00 - 14:00
        return nowHours >= 6 && nowHours < 14;
      case 'A': // Afternoon 14:00 - 22:00
        return nowHours >= 14 && nowHours < 22;
      case 'N': // Night 8hr 22:00 - 06:00
        return nowHours >= 22 || nowHours < 6;
      case 'D': // Day 12hr 08:00 - 20:00
        return nowHours >= 8 && nowHours < 20;
      case 'N2': // Night 12hr 20:00 - 08:00
        return nowHours >= 20 || nowHours < 8;
      case 'G': // General 09:00 - 18:00
        return nowHours >= 9 && nowHours < 18;
      default:
        return true;
    }
  };

  // Group logs by site (Leads), shift, and then by worker with accurate site/shift mapping
  const groupedSitewise = useMemo(() => {
    const effectiveLeads = modalLeads && modalLeads.length > 0 ? modalLeads : clients || [];

    // Top-level map is by siteId
    const siteMap = new Map<string, {
      siteId: string;
      siteName: string;
      matchedLead: any;
      shifts: Map<string, {
        shiftCode: string;
        shiftName: string;
        workerSlots: number;
        exemptDays: string[];
        startTime?: string;
        durationHrs?: number;
        workers: Map<string, any>;
      }>;
    }>();

    // 0. Pre-seed siteMap with all configured leads and their configured shifts from Leads collection
    effectiveLeads.forEach((lead: any) => {
      const siteId = String(lead._id || lead.id || '');
      if (!siteId || siteId === '[object Object]') return;
      const siteName = lead.sender_name || lead.displayName || lead.client_name || lead.product_name || lead.name || 'Site';
      if (!siteMap.has(siteId)) {
        siteMap.set(siteId, { siteId, siteName, matchedLead: lead, shifts: new Map() });
      } else {
        siteMap.get(siteId)!.matchedLead = lead;
      }

      const siteGroup = siteMap.get(siteId)!;
      const leadShifts = (lead.siteShifts || lead.shifts || []).filter((s: any) => s.active !== false);
      leadShifts.forEach((ls: any) => {
        const norm = normalizeShiftCode(ls.shiftCode, null, ls.shiftName);
        if (!siteGroup.shifts.has(norm)) {
          siteGroup.shifts.set(norm, {
            shiftCode: norm,
            shiftName: ls.shiftName || getShiftDisplayName(norm),
            workerSlots: Number(ls.workerSlots || ls.requiredWorkers || ls.workersRequired || 0),
            exemptDays: Array.isArray(ls.exemptDays) ? ls.exemptDays : [],
            startTime: ls.startTime || '',
            durationHrs: ls.durationHrs || 0,
            workers: new Map(),
          });
        }
      });
    });

    const resolveLogSite = (log: any) => {
      const allKnownLeads = effectiveLeads.length >= (clients || []).length ? effectiveLeads : [...effectiveLeads, ...(clients || [])];
      
      // 1. Exact Client / Lead Object ID match (highest priority)
      const rawLeadId = (typeof log.clientId === 'object' ? (log.clientId?._id || log.clientId?.id) : log.clientId) ||
                        (typeof log.leadId === 'object' ? (log.leadId?._id || log.leadId?.id) : log.leadId) ||
                        (typeof log.siteId === 'object' ? (log.siteId?._id || log.siteId?.id) : log.siteId);
      if (rawLeadId) {
        const sId = String(rawLeadId).trim();
        const found = allKnownLeads.find((l: any) => String(l._id || l.id) === sId);
        if (found) {
          const siteName = found.sender_name || found.displayName || found.client_name || found.product_name || found.name || 'Site';
          return { siteId: String(found._id || found.id), siteName, matchedLead: found };
        }
      }

      // 2. Exact or fuzzy site name match (e.g. "Golden Dragon" -> "Golden Dragon-C2VV")
      const logSite = String(log.site_name || '').trim();
      const isGenericSite = !logSite ||
                            logSite.toLowerCase() === 'field duty' ||
                            logSite.toLowerCase() === 'new site' ||
                            logSite.toLowerCase() === 'site';

      if (!isGenericSite) {
        const ls = logSite.toLowerCase();
        const foundByName = allKnownLeads.find((l: any) => {
          const lName = (l.sender_name || l.displayName || l.client_name || l.name || '').trim().toLowerCase();
          if (lName === ls) return true;
          // Strip trailing short site code like "-c2vv", "-w98gk1", " m36gk1"
          const lBase = lName.replace(/[-_\s]+[a-z0-9]+$/i, '').trim();
          const lsBase = ls.replace(/[-_\s]+[a-z0-9]+$/i, '').trim();
          if (lBase.length >= 3 && lsBase.length >= 3 && (lBase === lsBase || lBase.includes(lsBase) || lsBase.includes(lBase))) return true;
          return (lName.length >= 4 && ls.length >= 4 && (lName.includes(ls) || ls.includes(lName)));
        });
        if (foundByName) {
          const siteName = foundByName.sender_name || foundByName.displayName || foundByName.client_name || foundByName.name;
          return { siteId: String(foundByName._id || foundByName.id), siteName, matchedLead: foundByName };
        }
      }

      // 3. Address match from geoHistory ONLY if site_name was generic / Field Duty
      if (isGenericSite && Array.isArray(log.geoHistory) && log.geoHistory.length > 0) {
        for (const g of log.geoHistory) {
          const addr = String(typeof g === 'string' ? g : (g?.address || '')).toLowerCase();
          if (addr) {
            const found = allKnownLeads.find((l: any) => {
              const lName = (l.sender_name || l.displayName || '').trim().toLowerCase();
              return lName && lName.length >= 4 && addr.includes(lName);
            });
            if (found) {
              const siteName = found.sender_name || found.displayName || found.client_name || found.product_name || found.name || 'Site';
              return { siteId: String(found._id || found.id), siteName, matchedLead: found };
            }
          }
        }
      }

      const fallbackSiteId = rawLeadId ? String(rawLeadId) : (logSite || 'hq_remote');
      const fallbackSiteName = (logSite && logSite !== 'Field Duty' && logSite !== 'New Site')
        ? logSite
        : currentCorpName;
      return { siteId: fallbackSiteId, siteName: fallbackSiteName, matchedLead: null };
    };

    // Strict shift resolution: attendance log's actual shift code matched against lead's configured shifts
    const resolveLogShift = (log: any, matchedLead: any = null): string => {
      const leadShifts = (matchedLead?.siteShifts || matchedLead?.shifts || []).filter((s: any) => s.active !== false);
      const directShift = normalizeShiftCode(log.shiftCode, log.shiftPeriod, log.shiftGroupName);

      if (leadShifts.length > 0) {
        // Direct code match against lead's configured shifts
        const exactMatch = leadShifts.find((s: any) => normalizeShiftCode(s.shiftCode, null, s.shiftName) === directShift);
        if (exactMatch) return normalizeShiftCode(exactMatch.shiftCode, null, exactMatch.shiftName);

        // Fallback: match by shiftPeriod or shiftGroupName against lead's shifts
        const periodMatch = leadShifts.find((s: any) => {
          const sNorm = normalizeShiftCode(s.shiftCode, null, s.shiftName);
          return sNorm === normalizeShiftCode(null, log.shiftPeriod, null) ||
                 sNorm === normalizeShiftCode(null, null, log.shiftGroupName);
        });
        if (periodMatch) return normalizeShiftCode(periodMatch.shiftCode, null, periodMatch.shiftName);

        // If site only has 1 configured shift, attendance on this site maps to that shift
        if (leadShifts.length === 1) {
          return normalizeShiftCode(leadShifts[0].shiftCode, null, leadShifts[0].shiftName);
        }

        // If shift code on log doesn't match site configured shifts, match by duty hours
        const startHour = log.dutyStart ? new Date(log.dutyStart).getHours() : -1;
        if (startHour >= 7 && startHour < 19) {
          const dayShift = leadShifts.find((s: any) => {
            const sc = normalizeShiftCode(s.shiftCode, null, s.shiftName);
            return sc === 'D' || sc === 'M' || sc === 'G' || sc === 'A';
          });
          if (dayShift) return normalizeShiftCode(dayShift.shiftCode, null, dayShift.shiftName);
        } else if (startHour >= 19 || (startHour >= 1 && startHour < 5)) {
          const nightShift = leadShifts.find((s: any) => {
            const sc = normalizeShiftCode(s.shiftCode, null, s.shiftName);
            return sc === 'N2' || sc === 'N';
          });
          if (nightShift) return normalizeShiftCode(nightShift.shiftCode, null, nightShift.shiftName);
        }

        // Snap to daytime/first configured shift
        const dayCandidate = leadShifts.find((s: any) => {
          const sc = normalizeShiftCode(s.shiftCode, null, s.shiftName);
          return sc === 'D' || sc === 'M' || sc === 'G' || sc === 'A';
        });
        return normalizeShiftCode(dayCandidate ? dayCandidate.shiftCode : leadShifts[0].shiftCode, null, dayCandidate ? dayCandidate.shiftName : leadShifts[0].shiftName);
      }

      return directShift;
    };

    const addWorkerToMap = (siteId: string, siteName: string, shiftCode: string, emp: any, log: any = null) => {
      if (!siteMap.has(siteId)) {
        const matchedLead = effectiveLeads.find((l: any) => String(l._id || l.id) === siteId);
        siteMap.set(siteId, { siteId, siteName, matchedLead, shifts: new Map() });
      }

      const siteGroup = siteMap.get(siteId)!;
      const normShift = normalizeShiftCode(shiftCode);
      if (!siteGroup.shifts.has(normShift)) {
        const leadShift = (siteGroup.matchedLead?.siteShifts || siteGroup.matchedLead?.shifts || [])?.find(
          (s: any) => normalizeShiftCode(s.shiftCode, null, s.shiftName) === normShift
        );
        siteGroup.shifts.set(normShift, {
          shiftCode: normShift,
          shiftName: leadShift?.shiftName || getShiftDisplayName(normShift),
          workerSlots: Number(leadShift?.workerSlots || leadShift?.requiredWorkers || leadShift?.workersRequired || 0),
          exemptDays: Array.isArray(leadShift?.exemptDays) ? leadShift.exemptDays : [],
          startTime: leadShift?.startTime || '',
          durationHrs: leadShift?.durationHrs || 0,
          workers: new Map(),
        });
      }

      const shiftGroup = siteGroup.shifts.get(normShift)!;
      const rawEmpId = (typeof emp === 'object' ? (emp._id || emp.id) : emp) ||
                       (typeof log?.employeeId === 'object' ? (log.employeeId._id || log.employeeId.id) : log?.employeeId) ||
                       log?.markedByUserId || '';
      const empIdStr = String(rawEmpId).trim();
      if (!empIdStr || empIdStr === '[object Object]') return;

      const empDetail = allEmployees.find(e => String(e._id || e.id) === empIdStr) ||
                        (typeof log?.employeeId === 'object' ? log.employeeId : null) ||
                        (typeof emp === 'object' ? emp : null);

      // Extract accurate worker name - prioritize employee master name or displayName, never supervisor markedByUserName
      const workerName = empDetail?.name ||
                         log?.displayName ||
                         (log?.employeeId && typeof log.employeeId === 'object' && log.employeeId.name) ||
                         'Worker';

      if (!shiftGroup.workers.has(empIdStr)) {
        shiftGroup.workers.set(empIdStr, {
          _id: empIdStr,
          name: workerName,
          role: empDetail?.role || (log && log.role) || 'Worker',
          enrollment_no: empDetail?.enrollment_no || '',
          photo: empDetail?.photo || empDetail?.photo_url || empDetail?.userProfileImage ||
            (log && (log.photo || log.photo_url || log.userProfileImage)) || '',
          rate: (log && (log.rate || log.dailyRate)) || empDetail?.employmentHistory?.find((h: any) => h.active)?.daily_rate || 0,
          logs: [],
        });
      }

      if (log) {
        const workerLogs = shiftGroup.workers.get(empIdStr)!.logs;
        const logIdStr = String(log._id || log.id || `${log.date}_${log.dutyStart}`);
        const alreadyExists = workerLogs.some((existing: any) => String(existing._id || existing.id || `${existing.date}_${existing.dutyStart}`) === logIdStr);
        if (!alreadyExists) {
          workerLogs.push(log);
        }
      }
    };

    // 1. Pre-seed assigned workers from allEmployees for each site and shift
    const candidateEmployees = allEmployees || [];
    candidateEmployees.forEach((emp: any) => {
      const rawEmpId = String(emp._id || emp.id || '');
      if (!rawEmpId || rawEmpId === '[object Object]') return;

      const activeHist = (emp.employmentHistory || []).find((h: any) => h.active) ||
                         (emp.employmentHistory || [])[0];
      const targetLeadId = activeHist?.leadId || emp.leadId;
      const targetSiteName = activeHist?.siteName || emp.siteName;
      const targetShiftCode = activeHist?.shiftCode || emp.selectedShift || emp.shiftCode || 'D';

      let resolvedSiteId: string | null = null;
      let resolvedSiteName: string = targetSiteName || '';
      let matchedLead: any = null;

      if (targetLeadId) {
        const tidStr = String(targetLeadId._id || targetLeadId);
        matchedLead = effectiveLeads.find((l: any) => String(l._id || l.id) === tidStr);
        if (matchedLead) {
          resolvedSiteId = String(matchedLead._id || matchedLead.id);
          resolvedSiteName = matchedLead.sender_name || matchedLead.displayName || matchedLead.client_name || matchedLead.name;
        }
      }

      if (!resolvedSiteId && targetSiteName) {
        const ts = targetSiteName.toLowerCase();
        const found = effectiveLeads.find((l: any) => {
          const lName = (l.sender_name || l.displayName || l.client_name || l.name || '').trim().toLowerCase();
          const lBase = lName.replace(/[-_\s]+[a-z0-9]+$/i, '').trim();
          const tsBase = ts.replace(/[-_\s]+[a-z0-9]+$/i, '').trim();
          if (lBase.length >= 3 && tsBase.length >= 3 && (lBase === tsBase || lBase.includes(tsBase) || tsBase.includes(lBase))) return true;
          return lName === ts || lName.includes(ts) || ts.includes(lName);
        });
        if (found) {
          resolvedSiteId = String(found._id || found.id);
          resolvedSiteName = found.sender_name || found.displayName || found.client_name || found.name;
          matchedLead = found;
        }
      }

      if (resolvedSiteId) {
        const normShift = resolveLogShift({ shiftCode: targetShiftCode }, matchedLead);
        addWorkerToMap(resolvedSiteId, resolvedSiteName, normShift, emp, null);
      }
    });

    // 2. Map attendance logs to correct client object ID and shift
    logs.forEach((log) => {
      const rawEmpId = (typeof log.employeeId === 'object' ? (log.employeeId._id || log.employeeId.id) : log.employeeId) || log.markedByUserId;
      const empIdStr = rawEmpId ? String(rawEmpId).trim() : '';
      if (!empIdStr || empIdStr === '[object Object]') return;

      const emp = typeof log.employeeId === 'object' ? log.employeeId : { _id: empIdStr };
      const resolvedSite = resolveLogSite(log);
      const shiftCode = resolveLogShift(log, resolvedSite.matchedLead);

      addWorkerToMap(resolvedSite.siteId, resolvedSite.siteName, shiftCode, emp, log);
    });

    // 3. Populate manually added workers
    manualWorkers.forEach((mw) => {
      addWorkerToMap(mw.siteId, mw.siteName, mw.shiftCode, mw.workerData, null);
    });

    // 3. Build output list (sites with configured shifts, active workers or matching search)
    const result: any[] = [];
    siteMap.forEach((siteGroup) => {
      const displayShifts: any[] = [];
      let totalSiteWorkers = 0;

      siteGroup.shifts.forEach((shiftGroup) => {
        const workersList = Array.from(shiftGroup.workers.values()).sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );

        let displayWorkers = workersList;
        if (search) {
          const q = search.toLowerCase();
          const matchesSiteOrShift = siteGroup.siteName.toLowerCase().includes(q) ||
                                     shiftGroup.shiftCode.toLowerCase().includes(q) ||
                                     shiftGroup.shiftName.toLowerCase().includes(q);
          if (!matchesSiteOrShift) {
            displayWorkers = workersList.filter(w =>
              w.name.toLowerCase().includes(q) ||
              (w.enrollment_no && String(w.enrollment_no).toLowerCase().includes(q))
            );
          }
        }

        // Calculate daily on-duty strength for each day of the selected month.
        // Daily strength means workers on duty on a single day. Different workers on different days is NOT excess.
        // A shift is ONLY in excess if on any SINGLE day, the count of workers on duty exceeds the shift's daily required slots.
        const dayDutyWorkersMap = new Map<number, Set<string>>();
        shiftGroup.workers.forEach((w: any) => {
          (w.logs || []).forEach((l: any) => {
            const rawDate = l.date || l.dutyStart;
            if (!rawDate) return;
            let logYear: number | null = null;
            let logMonth: number | null = null;
            let logDay: number | null = null;

            if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
              const parts = rawDate.slice(0, 10).split('-');
              logYear = parseInt(parts[0], 10);
              logMonth = parseInt(parts[1], 10) - 1;
              logDay = parseInt(parts[2], 10);
            } else {
              const dt = new Date(rawDate);
              if (!isNaN(dt.getTime())) {
                logYear = dt.getFullYear();
                logMonth = dt.getMonth();
                logDay = dt.getDate();
              }
            }

            if (logYear === selectedYear && logMonth === selectedMonth && logDay !== null) {
              const st = String(l.status || 'Present').trim().toLowerCase();
              const isNotOnDuty = st === 'absent' || st === 'a' || st === 'leave' || st === 'paid leave' || st === 'l' || 
                                  st === 'nr' || st === 'no reliever' || st === 'weekly off' || st === 'w' || st === 'wo';
              const isOnDuty = !isNotOnDuty && (st === 'present' || st === 'p' || st === 'half day' || st === 'p1/2' || st === 'p½' || (l.dutyLevel != null && l.dutyLevel > 0));
              if (isOnDuty) {
                if (!dayDutyWorkersMap.has(logDay)) {
                  dayDutyWorkersMap.set(logDay, new Set());
                }
                dayDutyWorkersMap.get(logDay)!.add(String(w._id));
              }
            }
          });
        });

        let maxDailyOnDuty = 0;
        const excessDays: number[] = [];
        dayDutyWorkersMap.forEach((workerIds, d) => {
          if (workerIds.size > maxDailyOnDuty) {
            maxDailyOnDuty = workerIds.size;
          }
          if (shiftGroup.workerSlots > 0 && workerIds.size > shiftGroup.workerSlots) {
            excessDays.push(d);
          }
        });

        const isExcess = shiftGroup.workerSlots > 0 && excessDays.length > 0;

        // Display shift if it has workers or if search matched the site or site has configured shifts
        if (displayWorkers.length > 0 || (!search && siteGroup.shifts.size > 0)) {
          displayShifts.push({
            shiftCode: shiftGroup.shiftCode,
            shiftName: shiftGroup.shiftName,
            workerSlots: shiftGroup.workerSlots,
            exemptDays: shiftGroup.exemptDays,
            startTime: shiftGroup.startTime,
            durationHrs: shiftGroup.durationHrs,
            workers: displayWorkers,
            isExcess,
            maxDailyOnDuty,
            excessDays,
          });
          totalSiteWorkers += displayWorkers.length;
        }
      });

      // Determine current active shift for this site based on current time
      const now = new Date();
      let currentActiveShift = displayShifts.find(s => isShiftActiveAtTime(s, now));
      if (!currentActiveShift && displayShifts.length > 0) {
        // Fallback to daytime or first shift
        currentActiveShift = displayShifts.find(s => {
          const c = normalizeShiftCode(s.shiftCode, null, s.shiftName);
          return c === 'D' || c === 'M' || c === 'G';
        }) || displayShifts[0];
      }

      // Tag each shift with isCurrent and audit status strictly based on DAILY present count
      let totalReqSlots = 0;
      displayShifts.forEach(s => {
        s.isCurrent = Boolean(currentActiveShift && s.shiftCode === currentActiveShift.shiftCode);
        totalReqSlots += (s.workerSlots || 0);
        if (s.workerSlots > 0) {
          if (s.maxDailyOnDuty > s.workerSlots) s.auditStatus = 'excess';
          else if (s.maxDailyOnDuty === s.workerSlots) s.auditStatus = 'optimal';
          else if (s.maxDailyOnDuty === 0) s.auditStatus = 'shortage';
          else s.auditStatus = 'understaffed';
        } else {
          s.auditStatus = 'unspecified';
        }
      });

      // Filter shifts to display based on shiftFilterMode and per-site override
      const siteOverride = siteShiftOverrides[siteGroup.siteId];
      let visibleShifts = displayShifts;
      if (displayShifts.length > 1) {
        if (siteOverride && siteOverride !== 'ALL' && siteOverride !== 'CURRENT') {
          visibleShifts = displayShifts.filter(s => s.shiftCode === siteOverride);
        } else if (shiftFilterMode === 'current' && (!siteOverride || siteOverride === 'CURRENT')) {
          visibleShifts = currentActiveShift ? [currentActiveShift] : displayShifts;
        }
      }

      if (displayShifts.length > 0) {
        displayShifts.sort((a, b) => a.shiftCode.localeCompare(b.shiftCode));
        result.push({
          siteId: siteGroup.siteId,
          siteName: siteGroup.siteName,
          totalWorkers: totalSiteWorkers,
          totalRequiredSlots: totalReqSlots,
          allShifts: displayShifts,
          shifts: visibleShifts,
          currentShift: currentActiveShift,
          isMultiShift: displayShifts.length > 1,
        });
      }
    });

    return result.sort((a, b) => a.siteName.localeCompare(b.siteName));
  }, [logs, modalLeads, clients, search, manualWorkers, currentCorpName, allEmployees, shiftFilterMode, siteShiftOverrides]);



  const handleToggleDay = (worker: any, day: number, siteId: string, siteName: string, shiftCode: string) => {
    const targetDate = new Date(selectedYear, selectedMonth, day, 12, 0, 0);
    const logForDay = (worker.logs || []).find((l: any) => {
      const d = new Date(l.date || l.dutyStart);
      return d.getDate() === day && d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });

    setDayActionModal({
      worker,
      day,
      siteId,
      siteName,
      shiftCode,
      logForDay,
      targetDate,
    });
  };

  const applyStatus = async (
    status: string, dutyLevel: number,
    worker: any, day: number, siteId: string, siteName: string, shiftCode: string,
    logForDay: any, targetDate: Date, effectiveHeaders: any
  ) => {
    try {
      const logId = logForDay?._id || logForDay?.id;
      const isValidLogId = Boolean(logId && /^[0-9a-fA-F]{24}$/.test(String(logId)));
      const validLeadId = siteId && siteId !== 'hq_remote' && siteId !== 'corp_site' && /^[0-9a-fA-F]{24}$/.test(String(siteId)) ? siteId : null;
      const rate = Number(worker?.rate || worker?.dailyRate) || 0;
      const startISO = new Date(selectedYear, selectedMonth, day, 9, 0, 0).toISOString();
      const endISO = new Date(selectedYear, selectedMonth, day, 17, 0, 0).toISOString();
      const is12Hr = shiftCode === 'D' || shiftCode === 'N2';
      const scheduledHours = is12Hr ? 12 : 8;

      // Canonical shiftPeriod for Mongo persistence
      let canonicalPeriod = 'General';
      if (shiftCode === 'D') canonicalPeriod = 'Day';
      else if (shiftCode === 'N2') canonicalPeriod = 'Night12';
      else if (shiftCode === 'M') canonicalPeriod = 'Morning';
      else if (shiftCode === 'A') canonicalPeriod = 'Afternoon';
      else if (shiftCode === 'N') canonicalPeriod = 'Night';
      else if (shiftCode === 'G') canonicalPeriod = 'General';

      const createPayload = {
        employeeId: worker._id || worker.id,
        employeeType: worker.employeeType || 'Employees',
        leadId: validLeadId,
        status,
        dutyLevel,
        rate,
        dailyRate: rate,
        date: targetDate.toISOString(),
        dutyStart: startISO,
        dutyEndScheduled: endISO,
        dutyEnd: endISO,
        hoursWorked: status === 'Present' ? (dutyLevel === 0.5 ? scheduledHours / 2 : scheduledHours) : 0,
        shiftCode: shiftCode || 'G',
        shiftPeriod: canonicalPeriod,
        site_name: siteName,
      };

      const tempId = isValidLogId ? logId : `temp_${Date.now()}`;
      const optimisticRecord = {
        _id: tempId,
        id: tempId,
        ...createPayload,
        displayName: worker.name,
        employeeId: { _id: worker._id || worker.id, name: worker.name },
      };

      if (status === 'Absent') {
        if (isValidLogId) {
          // Optimistic local state update
          setLogs(prev => prev.filter(l => String(l._id || l.id) !== String(logId)));
          try {
            await appService.httpClient.delete(`service/hr/attendance/${logId}`, { headers: effectiveHeaders });
          } catch (delErr: any) {
            if (delErr?.response?.status !== 404) throw delErr;
          }
        }
        appService.showToast('Marked Absent', 'Success');
      } else if (isValidLogId) {
        // Optimistic local state update
        setLogs(prev => prev.map(l => String(l._id || l.id) === String(logId) ? { ...l, ...optimisticRecord, status, dutyLevel } : l));
        try {
          const updateRes = await appService.httpClient.put(
            `service/hr/attendance/${logId}`,
            { status, dutyLevel },
            { headers: effectiveHeaders }
          );
          if (updateRes.data?.data) {
            setLogs(prev => prev.map(l => String(l._id || l.id) === String(logId) ? updateRes.data.data : l));
          }
        } catch (putErr: any) {
          if (putErr?.response?.status === 404) {
            const postRes = await appService.httpClient.post('service/hr/attendance', createPayload, { headers: effectiveHeaders });
            if (postRes.data?.data) {
              setLogs(prev => prev.map(l => String(l._id || l.id) === String(logId) ? postRes.data.data : l));
            }
          } else {
            throw putErr;
          }
        }
        appService.showToast(`Marked ${status}`, 'Success');
      } else {
        // Optimistic local state update
        setLogs(prev => [...prev, optimisticRecord]);
        const postRes = await appService.httpClient.post('service/hr/attendance', createPayload, { headers: effectiveHeaders });
        if (postRes.data?.data) {
          setLogs(prev => prev.map(l => (l._id === tempId || l.id === tempId) ? postRes.data.data : l));
        }
        appService.showToast(`Marked ${status}`, 'Success');
      }

      // Sync worker logs in background
      if (worker._id) {
        fetchWorkerLogs(worker._id);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || err.message || 'Failed to update attendance');
    }
  };

  const startEdit = (log: any) => {
    setEditingLog(log);
    const rawSt = log.status || 'Present';
    if ((rawSt === 'Present' || rawSt === 'P') && (log.dutyLevel === 0.5 || log.dutyCount === 0.5)) {
      setEditStatus('Half Day');
    } else {
      setEditStatus(rawSt);
    }
    setEditStart(log.dutyStart ? new Date(log.dutyStart).toISOString().slice(0, 16).replace('T', ' ') : '');
    setEditEnd(log.dutyEnd ? new Date(log.dutyEnd).toISOString().slice(0, 16).replace('T', ' ') : '');
    setEditRate(String(log.rate || log.dailyRate || 0));
  };

  const deleteLog = async (logId: string) => {
    if (!logId || !/^[0-9a-fA-F]{24}$/.test(String(logId))) {
      Alert.alert('Error', 'Invalid attendance record ID');
      return;
    }
    Alert.alert(
      'Delete Attendance Record',
      'Are you sure you want to permanently delete this attendance record?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const effectiveHeaders = await getEffectiveHeaders();
              setLogs(prev => prev.filter(l => String(l._id || l.id) !== String(logId)));
              if (editingLog && String(editingLog._id || editingLog.id) === String(logId)) {
                setEditingLog(null);
              }
              await appService.httpClient.delete(`service/hr/attendance/${logId}`, { headers: effectiveHeaders });
              appService.showToast('Attendance record deleted', 'Success');
              fetchLogs();
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.message || err.message || 'Failed to delete attendance record');
              fetchLogs();
            }
          }
        }
      ]
    );
  };

  const saveEdit = async () => {
    if (!editingLog) return;
    try {
      const logId = editingLog._id || editingLog.id;
      if (!logId || !/^[0-9a-fA-F]{24}$/.test(String(logId))) {
        Alert.alert('Error', 'Invalid attendance record ID');
        return;
      }

      const effectiveHeaders = await getEffectiveHeaders();
      const actualStatus = editStatus === 'Half Day' ? 'Present' : editStatus;
      const actualDutyLevel = editStatus === 'Half Day' ? 0.5 : (editStatus === 'Absent' || editStatus === 'NR' ? 0 : 1);

      const payload: any = {
        status: actualStatus,
        dutyLevel: actualDutyLevel,
        rate: parseFloat(editRate) || 0,
        dailyRate: parseFloat(editRate) || 0,
      };
      if (editStart) {
        payload.dutyStart = new Date(editStart.replace(' ', 'T')).toISOString();
      }
      if (editEnd) {
        payload.dutyEnd = new Date(editEnd.replace(' ', 'T')).toISOString();
      } else {
        payload.dutyEnd = null;
      }

      await appService.httpClient.put(
        `service/hr/attendance/${logId}`,
        payload,
        { headers: effectiveHeaders }
      );
      appService.showToast('Attendance updated successfully', 'Success');
      setEditingLog(null);
      fetchLogs();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || e.message || 'Failed to update attendance.');
    }
  };

  const renderMonthCalendar = (worker: any, siteId: string, siteName: string, shiftCode: string) => {
    const effectiveLeads = modalLeads && modalLeads.length > 0 ? modalLeads : clients || [];
    const leadObj = effectiveLeads.find((c: any) => String(c._id || c.id) === String(siteId));
    const normTargetShift = normalizeShiftCode(shiftCode);
    const matchedShift = (leadObj?.siteShifts || leadObj?.shifts || [])?.find(
      (s: any) => normalizeShiftCode(s.shiftCode, null, s.shiftName) === normTargetShift
    );
    const shiftScheduleExemptDays: string[] = Array.isArray(matchedShift?.exemptDays)
      ? matchedShift.exemptDays
      : [];

    const now = new Date();
    const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
    const isPastMonth = selectedYear < now.getFullYear() || (selectedYear === now.getFullYear() && selectedMonth < now.getMonth());
    const todayDate = now.getDate();

    // Upgrade: for current month, only render from 1st day of month till today (e.g. 1 to 17).
    // Avoid rendering unnecessary future days!
    const maxDay = isCurrentMonth ? todayDate : (isPastMonth ? daysInMonth : 0);

    let presentDays = 0;
    let halfDays = 0;
    let weeklyOffDays = 0;
    let leaveDays = 0;
    let nrDays = 0;
    let absentDays = 0;

    const days = [];
    for (let d = 1; d <= maxDay; d++) {
      const dayDate = new Date(selectedYear, selectedMonth, d);
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayDate.getDay()];

      const logForDay = (worker.logs || []).find((l: any) => {
        const logDate = new Date(l.date || l.dutyStart);
        return logDate.getFullYear() === selectedYear &&
               logDate.getMonth() === selectedMonth &&
               logDate.getDate() === d;
      });

      // Weekly off strictly from shift schedule in leads document
      const isExempt = shiftScheduleExemptDays.some(ed => {
        const edStr = String(ed).toLowerCase().slice(0, 3);
        return edStr === dayName.toLowerCase().slice(0, 3);
      });

      let statusChar = 'A';
      let statusColor = '#ef4444';
      let bgStyle = isDark ? '#1e293b' : '#fee2e2';
      let borderColor = isDark ? '#334155' : '#fca5a5';

      if (logForDay) {
        const st = (logForDay.status || 'Present').toLowerCase();
        if (st === 'present' || st === 'p') {
          if (logForDay.dutyLevel === 0.5 || logForDay.dutyCount === 0.5) {
            statusChar = 'P½';
            halfDays += 1;
            statusColor = '#059669';
            bgStyle = isDark ? '#064e3b25' : '#ecfdf5';
            borderColor = '#10b981';
          } else {
            statusChar = 'P';
            presentDays += 1;
            statusColor = '#15803d';
            bgStyle = isDark ? '#14532d25' : '#f0fdf4';
            borderColor = '#22c55e';
          }
        } else if (st === 'weekly off' || st === 'w') {
          statusChar = 'W';
          weeklyOffDays += 1;
          statusColor = '#2563eb';
          bgStyle = isDark ? '#1e3a8a25' : '#eff6ff';
          borderColor = '#3b82f6';
        } else if (st === 'leave' || st === 'paid leave' || st === 'l') {
          statusChar = 'L';
          leaveDays += 1;
          statusColor = '#d97706';
          bgStyle = isDark ? '#78350f25' : '#fffbeb';
          borderColor = '#f59e0b';
        } else if (st === 'nr' || st === 'no reliever') {
          statusChar = 'NR';
          nrDays += 1;
          statusColor = '#7c3aed';
          bgStyle = isDark ? '#581c8725' : '#f3e8ff';
          borderColor = '#a855f7';
        } else {
          statusChar = 'A';
          absentDays += 1;
          statusColor = '#ef4444';
          bgStyle = isDark ? '#7f1d1d25' : '#fee2e2';
          borderColor = '#fca5a5';
        }
      } else {
        // Scheduled exempt days (not stored in DB) treated as Weekly Off (W)
        if (isExempt) {
          statusChar = 'W';
          weeklyOffDays += 1;
          statusColor = '#2563eb';
          bgStyle = isDark ? '#1e3a8a25' : '#eff6ff';
          borderColor = '#3b82f6';
        } else {
          statusChar = 'A';
          absentDays += 1;
          statusColor = '#ef4444';
          bgStyle = isDark ? '#1e293b' : '#fee2e2';
          borderColor = isDark ? '#334155' : '#fca5a5';
        }
      }

      const isToday = isCurrentMonth && d === todayDate;
      if (isToday) {
        borderColor = COLORS.primary;
      }

      days.push(
        <TouchableOpacity
          key={d}
          onPress={() => handleToggleDay(worker, d, siteId, siteName, shiftCode)}
          style={{
            width: '12.5%',
            aspectRatio: 1,
            borderRadius: 10,
            borderWidth: isToday ? 2.5 : 1.5,
            borderColor: isToday ? COLORS.primary : borderColor,
            backgroundColor: bgStyle,
            justifyContent: 'center',
            alignItems: 'center',
            margin: '0.8%',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
            elevation: 1,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: 9, fontWeight: isToday ? '900' : '700', color: isToday ? COLORS.primary : (isDark ? '#94a3b8' : '#64748b') }}>{d}</Text>
            {isToday && (
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.primary }} />
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1, gap: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '900', color: statusColor }}>
              {statusChar}
            </Text>
            <Ionicons name="pencil" size={7} color={statusColor} style={{ opacity: 0.7 }} />
          </View>
        </TouchableOpacity>
      );
    }

    const totalPayDays = presentDays + (halfDays * 0.5) + weeklyOffDays + leaveDays;

    return (
      <View>
        {/* Pay Days Summary Badge Row */}
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 8,
          marginBottom: 8,
          borderWidth: 1,
          borderColor: isDark ? '#334155' : '#e2e8f0',
        }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803d' }}>P: {presentDays}</Text>
            {halfDays > 0 && <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>P½: {halfDays}</Text>}
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563eb' }}>W: {weeklyOffDays}</Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#d97706' }}>L: {leaveDays}</Text>
            {nrDays > 0 && <Text style={{ fontSize: 11, fontWeight: '700', color: '#7c3aed' }}>NR: {nrDays}</Text>}
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#ef4444' }}>A: {absentDays}</Text>
          </View>
          <View style={{ backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '900', color: '#ffffff' }}>
              Pay Days: {totalPayDays}
            </Text>
          </View>
        </View>

        {maxDay === 0 ? (
          <View style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: '#94a3b8' }}>This month has not started yet.</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8, backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderRadius: 12 }}>
            {days}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#f8fafc' }}>
        {/* Header */}
        <View style={{ height: 60, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', marginLeft: 8 }}>
            {mode === 'edit' ? 'Modify Attendance' : mode === 'delete' ? 'Voucher / Attendance Clean & Reconcile' : 'Backup Attendance (JSON)'}
          </Text>
        </View>

        {/* Month Navigation & Search */}
        <View style={{ padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {mode === 'backup' ? (
            <View style={{ flex: 2, height: 44, justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#94a3b8' : '#475569' }}>
                Select Month to Export:
              </Text>
            </View>
          ) : (
            <View style={{ flex: 2, height: 44, justifyContent: 'center' }}>
              <TextInput
                placeholder="Search by worker or site"
                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                style={{
                  height: '100%',
                  backgroundColor: isDark ? '#1e293b' : '#fff',
                  borderRadius: 8,
                  paddingLeft: 12,
                  paddingRight: search ? 36 : 12,
                  color: isDark ? '#fff' : '#000',
                  borderWidth: 1,
                  borderColor: isDark ? '#334155' : '#e2e8f0',
                }}
                value={search}
                onChangeText={setSearch}
              />
              {!!search && (
                <TouchableOpacity
                  onPress={() => setSearch('')}
                  style={{ position: 'absolute', right: 10, padding: 4 }}
                >
                  <Ionicons name="close-circle" size={16} color={isDark ? '#94a3b8' : '#64748b'} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Month switch in < > style */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#1e293b' : '#fff', borderRadius: 8, borderWidth: 1, borderColor: isDark ? '#334155' : '#e2e8f0', overflow: 'hidden' }}>
            <TouchableOpacity 
              onPress={() => {
                const nextMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
                const nextYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
                setSelectedMonth(nextMonth);
                setSelectedYear(nextYear);
              }} 
              style={{ paddingHorizontal: 10, paddingVertical: 10 }}
            >
              <Ionicons name="chevron-back-outline" size={20} color={COLORS.primary} />
            </TouchableOpacity>
            <View style={{ paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', minWidth: 100 }}>
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: isDark ? '#fff' : '#000' }}>
                {MONTHS[selectedMonth].substring(0, 3)} {selectedYear}
              </Text>
            </View>
            <TouchableOpacity 
              onPress={() => {
                const nextMonth = selectedMonth === 11 ? 0 : selectedMonth + 1;
                const nextYear = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
                setSelectedMonth(nextMonth);
                setSelectedYear(nextYear);
              }} 
              style={{ paddingHorizontal: 10, paddingVertical: 10 }}
            >
              <Ionicons name="chevron-forward-outline" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Shift Filter Mode Pill Toggle for Modify Attendance Mode */}
        {mode === 'edit' && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            marginBottom: 10,
            gap: 8,
          }}>
            <TouchableOpacity
              onPress={() => setShiftFilterMode('current')}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: shiftFilterMode === 'current' ? COLORS.primary : (isDark ? '#1e293b' : '#fff'),
                borderWidth: 1,
                borderColor: shiftFilterMode === 'current' ? COLORS.primary : (isDark ? '#334155' : '#cbd5e1'),
                shadowColor: '#000',
                shadowOpacity: shiftFilterMode === 'current' ? 0.15 : 0.03,
                shadowRadius: 3,
                elevation: shiftFilterMode === 'current' ? 2 : 1,
              }}
            >
              <Ionicons name="time" size={15} color={shiftFilterMode === 'current' ? '#fff' : (isDark ? '#94a3b8' : '#64748b')} />
              <Text style={{
                fontSize: 12,
                fontWeight: '800',
                color: shiftFilterMode === 'current' ? '#fff' : (isDark ? '#cbd5e1' : '#334155'),
              }}>
                Current Shift (Active Now)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShiftFilterMode('all')}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: shiftFilterMode === 'all' ? COLORS.primary : (isDark ? '#1e293b' : '#fff'),
                borderWidth: 1,
                borderColor: shiftFilterMode === 'all' ? COLORS.primary : (isDark ? '#334155' : '#cbd5e1'),
                shadowColor: '#000',
                shadowOpacity: shiftFilterMode === 'all' ? 0.15 : 0.03,
                shadowRadius: 3,
                elevation: shiftFilterMode === 'all' ? 2 : 1,
              }}
            >
              <Ionicons name="layers-outline" size={15} color={shiftFilterMode === 'all' ? '#fff' : (isDark ? '#94a3b8' : '#64748b')} />
              <Text style={{
                fontSize: 12,
                fontWeight: '800',
                color: shiftFilterMode === 'all' ? '#fff' : (isDark ? '#cbd5e1' : '#334155'),
              }}>
                All Shifts
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ðŸ§¹ Clean Mode Control Panel Banner */}
        {mode === 'delete' && (
          <View style={{
            marginHorizontal: 12,
            marginBottom: 10,
            padding: 14,
            borderRadius: 14,
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            borderWidth: 1,
            borderColor: isDark ? '#334155' : '#e2e8f0',
            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 2,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="sparkles" size={18} color={COLORS.primary} />
                <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#ffffff' : '#0f172a' }}>
                  Voucher & Attendance Clean Engine
                </Text>
              </View>
              <View style={{ backgroundColor: '#10b98120', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#10b981' }}>Capping Active</Text>
              </View>
            </View>

            <Text style={{ fontSize: 11, color: '#64748b', marginBottom: 12, lineHeight: 16 }}>
              Merges fragmented crash logs (capped at lead shift hours), splits shared shifts into 2 half-duties, and normalizes P, W, L, A pay days.
            </Text>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <View style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#f8fafc', padding: 8, borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.primary }}>{reconciliationStats.fragmentedGroups}</Text>
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748b' }}>DUPLICATE GROUPS</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#f8fafc', padding: 8, borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#f59e0b' }}>{reconciliationStats.sharedSlots}</Text>
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748b' }}>SHARED SLOTS</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#f8fafc', padding: 8, borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#10b981' }}>{reconciliationStats.totalLogs}</Text>
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748b' }}>TOTAL LOGS</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleRunCleanAndReconcile}
              disabled={cleaning}
              style={{
                height: 44,
                backgroundColor: COLORS.primary,
                borderRadius: 10,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {cleaning ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="trash-bin-outline" size={16} color="#ffffff" />
                  <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 13 }}>
                    Execute Auto-Clean & Reconcile
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
            <LoadingTimerSpinner label="Fetching monthly attendance records..." />
          </View>
        ) : (
          mode === 'backup' ? (
            /* Backup Mode Screen */
            <View style={{ flex: 1, padding: 16, alignItems: 'stretch' }}>
              <View style={{
                backgroundColor: isDark ? '#1e293b' : '#fff',
                padding: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: isDark ? '#334155' : '#e2e8f0',
                marginBottom: 20,
                alignItems: 'center',
              }}>
                <Ionicons name="cloud-download-outline" size={48} color={COLORS.primary} style={{ marginBottom: 12 }} />
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: isDark ? '#fff' : '#0f172a', textAlign: 'center' }}>
                  Export Monthly Attendance JSON
                </Text>
                <Text style={{ fontSize: 12, color: '#64748b', marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
                  Generate and share a complete JSON backup file of all attendance records for {MONTHS[selectedMonth]} {selectedYear}.
                </Text>

                <View style={{
                  flexDirection: 'row',
                  marginTop: 16,
                  backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                  padding: 12,
                  borderRadius: 12,
                  width: '100%',
                  justifyContent: 'space-around',
                }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.primary }}>
                      {logs.length}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#64748b', fontWeight: 'bold', marginTop: 2 }}>
                      RECORDS
                    </Text>
                  </View>
                  <View style={{ height: '100%', width: 1, backgroundColor: isDark ? '#334155' : '#e2e8f0' }} />
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.primary }}>
                      {uniqueEmployees.length}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#64748b', fontWeight: 'bold', marginTop: 2 }}>
                      EMPLOYEES
                    </Text>
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                <TouchableOpacity
                  onPress={handleShareBackup}
                  disabled={logs.length === 0}
                  style={{
                    flex: 1,
                    height: 50,
                    backgroundColor: logs.length > 0 ? COLORS.primary : '#94a3b8',
                    borderRadius: 12,
                    justifyContent: 'center',
                    alignItems: 'center',
                    flexDirection: 'row',
                    shadowColor: '#000',
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 3,
                  }}
                >
                  <Ionicons name="share-social-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>
                    Share JSON File
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleWhatsAppShare}
                  disabled={logs.length === 0}
                  style={{
                    flex: 1,
                    height: 50,
                    backgroundColor: logs.length > 0 ? '#22c55e' : '#94a3b8',
                    borderRadius: 12,
                    justifyContent: 'center',
                    alignItems: 'center',
                    flexDirection: 'row',
                    shadowColor: '#000',
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 3,
                  }}
                >
                  <Ionicons name="logo-whatsapp" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>
                    WhatsApp Summary
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 13, fontWeight: 'bold', color: isDark ? '#cbd5e1' : '#475569', marginBottom: 8 }}>
                Data Preview ({logs.slice(0, 10).length} of {logs.length} records shown)
              </Text>

              <FlatList
                data={logs.slice(0, 50)}
                keyExtractor={(item, index) => `${String(item._id || item.id || 'log')}_${index}`}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 24 }}
                ListEmptyComponent={
                  <View style={{ alignItems: 'center', marginTop: 20 }}>
                    <Text style={{ color: '#94a3b8', fontSize: 12 }}>No records to preview for this month.</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const empName = item.employeeId?.name || item.markedByUserName || 'Worker';
                  const dateStr = item.date ? new Date(item.date).toLocaleDateString('en-IN') : '';
                  return (
                    <View style={{
                      backgroundColor: isDark ? '#1e293b' : '#fff',
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                      marginBottom: 6,
                      borderWidth: 1,
                      borderColor: isDark ? '#334155' : '#e2e8f0',
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: isDark ? '#fff' : '#0f172a' }} numberOfLines={1}>
                          {empName}
                        </Text>
                        <Text style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                          Site: {resolveSiteName(item)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.primary }}>
                        {dateStr}
                      </Text>
                    </View>
                  );
                }}
              />
            </View>
          ) : (
            <FlatList
              data={groupedSitewise}
              keyExtractor={(item) => item.siteId}
              extraData={{ expandedSites, expandedShifts, expandedWorkers, shiftFilterMode, siteShiftOverrides }}
              contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', marginTop: 40 }}>
                  <Ionicons name="business-outline" size={48} color="#94a3b8" />
                  <Text style={{ marginTop: 8, color: '#94a3b8', fontWeight: 'bold' }}>No sites with active duties this month.</Text>
                </View>
              }
              renderItem={({ item: site }) => {
                const isSiteExpanded = expandedSites[site.siteId] ?? false;
                return (
                  <View style={{
                    backgroundColor: isDark ? '#1e293b' : '#fff',
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: isDark ? '#334155' : '#e2e8f0',
                    marginBottom: 12,
                    overflow: 'hidden',
                  }}>
                    {/* Site Header Toggle */}
                    <TouchableOpacity
                      onPress={() => {
                        const nextExpanded = !isSiteExpanded;
                        setExpandedSites(prev => ({ ...prev, [site.siteId]: nextExpanded }));
                        if (nextExpanded && site.shifts) {
                          site.shifts.forEach((s: any) => {
                            (s.workers || []).forEach((w: any) => {
                              if (w._id && (!w.logs || w.logs.length <= 1)) {
                                fetchWorkerLogs(w._id);
                              }
                            });
                          });
                        }
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 14,
                        backgroundColor: isSiteExpanded ? (isDark ? '#0f172a' : '#f8fafc') : 'transparent',
                        borderBottomWidth: isSiteExpanded ? 1 : 0,
                        borderBottomColor: isDark ? '#334155' : '#e2e8f0',
                      }}
                    >
                      <View style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        backgroundColor: COLORS.primary + '15',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginRight: 10,
                      }}>
                        <Ionicons name="business" size={20} color={COLORS.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#fff' : '#0f172a' }}>
                            {site.siteName}
                          </Text>
                          {site.isMultiShift && (
                            <View style={{
                              backgroundColor: COLORS.primary + '18',
                              paddingHorizontal: 6,
                              paddingVertical: 1.5,
                              borderRadius: 4,
                            }}>
                              <Text style={{ fontSize: 10, fontWeight: '900', color: COLORS.primary }}>
                                {site.allShifts.length} Shifts Configured
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Shift subtitle with current active shift indicator */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                          {shiftFilterMode === 'current' && site.currentShift ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                              <View style={{
                                backgroundColor: '#10b98120',
                                paddingHorizontal: 6,
                                paddingVertical: 1.5,
                                borderRadius: 4,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 3,
                              }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' }} />
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#059669' }}>
                                  Active: {site.currentShift.shiftCode} ({site.currentShift.shiftName})
                                </Text>
                              </View>
                              <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '600' }}>
                                • {site.currentShift.workers.length} Worker{site.currentShift.workers.length !== 1 ? 's' : ''}
                                {site.currentShift.workerSlots > 0 ? ` (Req: ${site.currentShift.workerSlots})` : ''}
                              </Text>
                            </View>
                          ) : (
                            <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '600' }}>
                              {site.totalWorkers} Worker{site.totalWorkers !== 1 ? 's' : ''} across {site.allShifts.length} Shift{site.allShifts.length !== 1 ? 's' : ''}
                              {site.totalRequiredSlots > 0 ? ` • Total Req: ${site.totalRequiredSlots}` : ''}
                            </Text>
                          )}
                        </View>

                        {/* Shift & Worker Audit Strip strictly based on daily present count */}
                        {site.isMultiShift && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: '#94a3b8' }}>
                              Audit:
                            </Text>
                            {site.allShifts.map((sh: any) => {
                              const isExc = sh.workerSlots > 0 && sh.maxDailyOnDuty > sh.workerSlots;
                              const isShort = sh.workerSlots > 0 && sh.maxDailyOnDuty === 0;
                              const isUnder = sh.workerSlots > 0 && sh.maxDailyOnDuty > 0 && sh.maxDailyOnDuty < sh.workerSlots;
                              const isOpt = sh.workerSlots > 0 && sh.maxDailyOnDuty === sh.workerSlots;
                              const tagBg = isOpt ? '#10b98115' : isExc ? '#ef444415' : (isShort || isUnder) ? '#f59e0b15' : (isDark ? '#334155' : '#e2e8f0');
                              const tagColor = isOpt ? '#059669' : isExc ? '#dc2626' : (isShort || isUnder) ? '#d97706' : '#64748b';
                              return (
                                <View
                                  key={sh.shiftCode}
                                  style={{
                                    backgroundColor: tagBg,
                                    paddingHorizontal: 5,
                                    paddingVertical: 1,
                                    borderRadius: 4,
                                    borderWidth: 0.5,
                                    borderColor: tagColor + '40',
                                  }}
                                >
                                  <Text style={{ fontSize: 9, fontWeight: '800', color: tagColor }}>
                                    {sh.shiftCode}: {sh.maxDailyOnDuty}/{sh.workerSlots || '-'} daily {isExc ? '⚠️ Excess' : isShort ? '⚠️ Unfilled' : isUnder ? '⚠️ Under' : '✓ OK'}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                      <Ionicons
                        name={isSiteExpanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color="#94a3b8"
                      />
                    </TouchableOpacity>

                    {/* Shifts List (Level 2) */}
                    {isSiteExpanded && (
                      <View style={{ backgroundColor: isDark ? '#1e293b' : '#f8fafc' }}>
                        {/* Site Shift Switcher Bar when site has multiple shifts */}
                        {site.isMultiShift && (
                          <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
                            borderBottomWidth: 1,
                            borderBottomColor: isDark ? '#334155' : '#e2e8f0',
                            gap: 6,
                            flexWrap: 'wrap',
                          }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#94a3b8' : '#64748b', marginRight: 2 }}>
                              Filter Shift:
                            </Text>
                            
                            <TouchableOpacity
                              onPress={() => setSiteShiftOverrides(prev => ({ ...prev, [site.siteId]: 'CURRENT' }))}
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 6,
                                backgroundColor: (!siteShiftOverrides[site.siteId] || siteShiftOverrides[site.siteId] === 'CURRENT')
                                  ? COLORS.primary
                                  : (isDark ? '#1e293b' : '#ffffff'),
                                borderWidth: 1,
                                borderColor: (!siteShiftOverrides[site.siteId] || siteShiftOverrides[site.siteId] === 'CURRENT')
                                  ? COLORS.primary
                                  : (isDark ? '#334155' : '#cbd5e1'),
                              }}
                            >
                              <Text style={{
                                fontSize: 10,
                                fontWeight: '800',
                                color: (!siteShiftOverrides[site.siteId] || siteShiftOverrides[site.siteId] === 'CURRENT') ? '#fff' : (isDark ? '#cbd5e1' : '#475569'),
                              }}>
                                🕒 Active Now ({site.currentShift?.shiftCode || 'Current'})
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => setSiteShiftOverrides(prev => ({ ...prev, [site.siteId]: 'ALL' }))}
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 6,
                                backgroundColor: siteShiftOverrides[site.siteId] === 'ALL'
                                  ? COLORS.primary
                                  : (isDark ? '#1e293b' : '#ffffff'),
                                borderWidth: 1,
                                borderColor: siteShiftOverrides[site.siteId] === 'ALL'
                                  ? COLORS.primary
                                  : (isDark ? '#334155' : '#cbd5e1'),
                              }}
                            >
                              <Text style={{
                                fontSize: 10,
                                fontWeight: '800',
                                color: siteShiftOverrides[site.siteId] === 'ALL' ? '#fff' : (isDark ? '#cbd5e1' : '#475569'),
                              }}>
                                All Shifts ({site.allShifts.length})
                              </Text>
                            </TouchableOpacity>

                            {site.allShifts.map((s: any) => {
                              const isSelected = siteShiftOverrides[site.siteId] === s.shiftCode;
                              return (
                                <TouchableOpacity
                                  key={s.shiftCode}
                                  onPress={() => setSiteShiftOverrides(prev => ({ ...prev, [site.siteId]: s.shiftCode }))}
                                  style={{
                                    paddingHorizontal: 8,
                                    paddingVertical: 3,
                                    borderRadius: 6,
                                    backgroundColor: isSelected
                                      ? COLORS.primary
                                      : (isDark ? '#1e293b' : '#ffffff'),
                                    borderWidth: 1,
                                    borderColor: isSelected
                                      ? COLORS.primary
                                      : (isDark ? '#334155' : '#cbd5e1'),
                                  }}
                                >
                                  <Text style={{
                                    fontSize: 10,
                                    fontWeight: '800',
                                    color: isSelected ? '#fff' : (isDark ? '#cbd5e1' : '#475569'),
                                  }}>
                                    {s.shiftCode} ({s.maxDailyOnDuty}/{s.workerSlots || '-'} daily • {s.workers.length} worker{s.workers.length !== 1 ? 's' : ''})
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}

                        {site.shifts.map((shiftGroup: any) => {
                          const shiftKey = `${site.siteId}_${shiftGroup.shiftCode}`;
                          const isShiftExpanded = expandedShifts[shiftKey] ?? (shiftGroup.workers.length > 0);
                          return (
                            <View key={shiftKey} style={{ borderTopWidth: 1, borderTopColor: isDark ? '#334155' : '#e2e8f0' }}>
                              {/* Shift Header Toggle */}
                              <TouchableOpacity
                                onPress={() => {
                                  const nextShiftExp = !isShiftExpanded;
                                  setExpandedShifts(prev => ({ ...prev, [shiftKey]: nextShiftExp }));
                                  if (nextShiftExp) {
                                    (shiftGroup.workers || []).forEach((w: any) => {
                                      if (w._id && (!w.logs || w.logs.length <= 1)) {
                                        fetchWorkerLogs(w._id);
                                      }
                                    });
                                  }
                                }}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  padding: 12,
                                  paddingLeft: 20,
                                  backgroundColor: shiftGroup.isExcess
                                    ? (isDark ? '#450a0a40' : '#fef2f2')
                                    : (isDark ? '#0f172a' : '#f1f5f9'),
                                  borderLeftWidth: shiftGroup.isExcess ? 4 : 0,
                                  borderLeftColor: '#ef4444',
                                }}
                              >
                                <View style={{ flex: 1 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <Text style={{ fontSize: 13, fontWeight: '800', color: shiftGroup.isExcess ? '#dc2626' : (isDark ? '#cbd5e1' : '#334155') }}>
                                      {shiftGroup.shiftName || getShiftDisplayName(shiftGroup.shiftCode)}
                                    </Text>
                                    <View style={{
                                      backgroundColor: COLORS.primary + '15',
                                      paddingHorizontal: 6,
                                      paddingVertical: 1.5,
                                      borderRadius: 4,
                                    }}>
                                      <Text style={{ fontSize: 10, fontWeight: '900', color: COLORS.primary }}>
                                        {shiftGroup.shiftCode}
                                      </Text>
                                    </View>
                                    {shiftGroup.startTime ? (
                                      <Text style={{ fontSize: 10, color: '#64748b', fontWeight: '600' }}>
                                        ({shiftGroup.startTime}, {shiftGroup.durationHrs || 8}h)
                                      </Text>
                                    ) : null}

                                    {/* Active Now Pill */}
                                    {shiftGroup.isCurrent && (
                                      <View style={{
                                        backgroundColor: '#10b98125',
                                        paddingHorizontal: 6,
                                        paddingVertical: 1.5,
                                        borderRadius: 4,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 3,
                                      }}>
                                        <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#10b981' }} />
                                        <Text style={{ fontSize: 9, fontWeight: '900', color: '#059669' }}>
                                          ACTIVE NOW
                                        </Text>
                                      </View>
                                    )}

                                    {/* Shift Audit Badge strictly based on Daily Present Count */}
                                    {shiftGroup.workerSlots > 0 && (
                                      <View style={{
                                        backgroundColor: shiftGroup.maxDailyOnDuty > shiftGroup.workerSlots
                                          ? '#ef444418'
                                          : shiftGroup.maxDailyOnDuty === shiftGroup.workerSlots
                                          ? '#10b98118'
                                          : '#f59e0b18',
                                        paddingHorizontal: 6,
                                        paddingVertical: 1.5,
                                        borderRadius: 4,
                                        borderWidth: 0.5,
                                        borderColor: shiftGroup.maxDailyOnDuty > shiftGroup.workerSlots
                                          ? '#ef444450'
                                          : shiftGroup.maxDailyOnDuty === shiftGroup.workerSlots
                                          ? '#10b98150'
                                          : '#f59e0b50',
                                      }}>
                                        <Text style={{
                                          fontSize: 9,
                                          fontWeight: '900',
                                          color: shiftGroup.maxDailyOnDuty > shiftGroup.workerSlots
                                            ? '#dc2626'
                                            : shiftGroup.maxDailyOnDuty === shiftGroup.workerSlots
                                            ? '#059669'
                                            : '#d97706',
                                        }}>
                                          {shiftGroup.maxDailyOnDuty > shiftGroup.workerSlots
                                            ? `⚠️ EXCESS (${shiftGroup.maxDailyOnDuty}/${shiftGroup.workerSlots} daily)`
                                            : shiftGroup.maxDailyOnDuty === shiftGroup.workerSlots
                                            ? `✓ BALANCED (${shiftGroup.maxDailyOnDuty}/${shiftGroup.workerSlots} daily)`
                                            : `⚠️ SHORTAGE (${shiftGroup.maxDailyOnDuty}/${shiftGroup.workerSlots} daily)`}
                                        </Text>
                                      </View>
                                    )}
                                  </View>

                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                                    <Text style={{ fontSize: 11, color: '#64748b' }}>
                                      {shiftGroup.workers.length} Worker{shiftGroup.workers.length !== 1 ? 's' : ''}
                                    </Text>

                                    {shiftGroup.workerSlots > 0 && (
                                      <Text style={{ fontSize: 11, fontWeight: '700', color: shiftGroup.isExcess ? '#dc2626' : '#64748b' }}>
                                        • Daily Req: {shiftGroup.workerSlots}
                                      </Text>
                                    )}

                                    {shiftGroup.exemptDays && shiftGroup.exemptDays.length > 0 && (
                                      <View style={{
                                        backgroundColor: isDark ? '#1e3a8a30' : '#eff6ff',
                                        paddingHorizontal: 6,
                                        paddingVertical: 1,
                                        borderRadius: 4,
                                        borderWidth: 0.5,
                                        borderColor: '#3b82f6',
                                      }}>
                                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#2563eb' }}>
                                          Off: {shiftGroup.exemptDays.join(', ')}
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                </View>

                                {/* Highlight warning badge if excess workers on any single day */}
                                {shiftGroup.isExcess && (
                                  <View style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    backgroundColor: '#dc2626',
                                    paddingHorizontal: 8,
                                    paddingVertical: 3,
                                    borderRadius: 6,
                                    marginRight: 8,
                                    gap: 4,
                                  }}>
                                    <Ionicons name="alert-circle" size={12} color="#fff" />
                                    <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>
                                      EXCESS ({shiftGroup.maxDailyOnDuty}/{shiftGroup.workerSlots})
                                    </Text>
                                  </View>
                                )}

                                {/* Add Worker to Shift Icon Button */}
                                <TouchableOpacity
                                  onPress={(e) => {
                                    e.stopPropagation?.();
                                    setAddWorkerContext({ siteId: site.siteId, siteName: site.siteName, shiftCode: shiftGroup.shiftCode });
                                    setAddWorkerSearch('');
                                    setAddWorkerModalVisible(true);
                                  }}
                                  style={{
                                    width: 30,
                                    height: 30,
                                    borderRadius: 15,
                                    backgroundColor: COLORS.primary + '20',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    marginRight: 8,
                                  }}
                                >
                                  <Ionicons name="add" size={18} color={COLORS.primary} />
                                </TouchableOpacity>

                                <Ionicons
                                  name={isShiftExpanded ? 'chevron-up' : 'chevron-down'}
                                  size={18}
                                  color="#94a3b8"
                                />
                              </TouchableOpacity>

                              {/* Workers List (Level 3) */}
                              {isShiftExpanded && (
                                <View style={{ padding: 10, paddingLeft: 20, gap: 10 }}>
                                  {shiftGroup.workers.length === 0 ? (
                                    <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                                      <Text style={{ color: '#94a3b8', fontSize: 12 }}>No workers logged in this shift. Tap + above to add.</Text>
                                    </View>
                                  ) : (
                                    shiftGroup.workers.map((worker: any) => {
                                    const workerKey = `${shiftKey}_${worker._id}`;
                                    const isWorkerExpanded = expandedWorkers[workerKey] ?? false;
                                    return (
                                      <View
                                        key={workerKey}
                                        style={{
                                          backgroundColor: isDark ? '#0f172a' : '#fff',
                                          borderRadius: 12,
                                          borderWidth: 1,
                                          borderColor: isDark ? '#1e293b' : '#e2e8f0',
                                          overflow: 'hidden',
                                        }}
                                      >
                                        {/* Worker Header Toggle */}
                                        <TouchableOpacity
                                          onPress={() => {
                                            const nextState = !isWorkerExpanded;
                                            setExpandedWorkers(prev => ({ ...prev, [workerKey]: nextState }));
                                            if (nextState) {
                                              fetchWorkerLogs(worker._id);
                                            }
                                          }}
                                          style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            padding: 12,
                                          }}
                                        >
                                          <View style={{
                                            width: 38,
                                            height: 38,
                                            borderRadius: 19,
                                            backgroundColor: '#e2e8f0',
                                            marginRight: 10,
                                            overflow: 'hidden',
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                          }}>
                                            {worker.photo ? (
                                              <Image source={{ uri: worker.photo }} style={{ width: '100%', height: '100%' }} />
                                            ) : (
                                              <Ionicons name="person" size={18} color="#94a3b8" style={{ alignSelf: 'center', marginTop: 8 }} />
                                            )}
                                          </View>
                                          <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#fff' : '#1e293b' }}>
                                              {worker.name}
                                            </Text>
                                            <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                                              EFN#: {worker.enrollment_no || 'N/A'} • {worker.role}
                                            </Text>
                                            </View>
                                            <Ionicons
                                              name={isWorkerExpanded ? 'chevron-up' : 'chevron-down'}
                                              size={18}
                                              color="#94a3b8"
                                            />
                                          </TouchableOpacity>

                                          {/* Monthly Worker Duty Card */}
                                          {isWorkerExpanded && (
                                            <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                                              {renderMonthCalendar(worker, site.siteId, site.siteName, shiftGroup.shiftCode)}
                                            </View>
                                          )}
                                        </View>
                                      );
                                    }))}
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                }}
              />
            ))}

            {/* Day Action Modal */}
            {dayActionModal && (
            <Modal
              visible={!!dayActionModal}
              transparent
              animationType="fade"
              onRequestClose={() => setDayActionModal(null)}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                }}
              >
                <TouchableOpacity
                  activeOpacity={1}
                  style={{
                    width: '100%',
                    maxWidth: 480,
                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    padding: 20,
                    paddingBottom: 28,
                    borderTopWidth: 1,
                    borderColor: isDark ? '#334155' : '#e2e8f0',
                  }}
                >
                  {/* Drag Indicator */}
                  <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isDark ? '#475569' : '#cbd5e1', alignSelf: 'center', marginBottom: 16 }} />

                  {/* Worker & Date Header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                    <View style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: COLORS.primary + '15',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginRight: 12,
                    }}>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: COLORS.primary }}>
                        {dayActionModal.day}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: isDark ? '#fff' : '#0f172a' }}>
                        {dayActionModal.worker.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {dayActionModal.siteName} • Shift {dayActionModal.shiftCode} ({MONTHS[selectedMonth]} {dayActionModal.day}, {selectedYear})
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setDayActionModal(null)} style={{ padding: 4 }}>
                      <Ionicons name="close-circle" size={24} color={isDark ? '#94a3b8' : '#64748b'} />
                    </TouchableOpacity>
                  </View>

                  {/* Current Status Banner */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    marginBottom: 16,
                  }}>
                    <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>Current Status: </Text>
                    <Text style={{
                      fontSize: 12,
                      fontWeight: '800',
                      color: dayActionModal.logForDay
                        ? (dayActionModal.logForDay.status === 'Weekly Off' ? '#2563eb' : dayActionModal.logForDay.status === 'Paid Leave' ? '#d97706' : '#15803d')
                        : '#ef4444'
                    }}>
                      {dayActionModal.logForDay
                        ? `${dayActionModal.logForDay.status || 'Present'}${dayActionModal.logForDay.dutyLevel === 0.5 ? ' (Half Day)' : ''}`
                        : 'Absent (Not Logged)'}
                    </Text>
                  </View>

                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 0.5, marginBottom: 10 }}>
                    QUICK STATUS ACTIONS
                  </Text>

                  {/* 2-column Grid of Action Pills */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    {[
                      { label: 'Present (P)', code: 'P', status: 'Present', level: 1, color: '#16a34a', bg: '#dcfce7' },
                      { label: 'Half Day (P½)', code: 'P½', status: 'Present', level: 0.5, color: '#059669', bg: '#ecfdf5' },
                      { label: 'Weekly Off (W)', code: 'W', status: 'Weekly Off', level: 1, color: '#2563eb', bg: '#eff6ff' },
                      { label: 'Paid Leave (L)', code: 'L', status: 'Paid Leave', level: 1, color: '#d97706', bg: '#fef3c7' },
                      { label: 'Absent (A)', code: 'A', status: 'Absent', level: 0, color: '#ef4444', bg: '#fee2e2' },
                      { label: 'No Reliever (NR)', code: 'NR', status: 'NR', level: 0, color: '#7c3aed', bg: '#f3e8ff' },
                    ].map((item) => (
                      <TouchableOpacity
                        key={item.label}
                        onPress={async () => {
                          const target = dayActionModal;
                          setDayActionModal(null);
                          const effectiveHeaders = await getEffectiveHeaders();
                          applyStatus(
                            item.status,
                            item.level,
                            target.worker,
                            target.day,
                            target.siteId,
                            target.siteName,
                            target.shiftCode,
                            target.logForDay,
                            target.targetDate,
                            effectiveHeaders
                          );
                        }}
                        style={{
                          width: '48.5%',
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: 12,
                          backgroundColor: isDark ? '#0f172a' : item.bg,
                          borderWidth: 1.5,
                          borderColor: item.color,
                          gap: 8,
                        }}
                      >
                        <View style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          backgroundColor: item.color,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}>
                          <Text style={{ fontSize: 11, fontWeight: '900', color: '#fff' }}>{item.code}</Text>
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#fff' : '#0f172a', flex: 1 }}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                {/* Custom Edit / Delete Option if Log Exists */}
                {dayActionModal.logForDay && (
                  <View style={{ gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        const log = dayActionModal.logForDay;
                        setDayActionModal(null);
                        startEdit(log);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: isDark ? '#334155' : '#f1f5f9',
                        borderWidth: 1,
                        borderColor: isDark ? '#475569' : '#cbd5e1',
                        gap: 8,
                      }}
                    >
                      <Ionicons name="create-outline" size={18} color={COLORS.primary} />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary }}>
                        Edit Custom Timings & Daily Rate
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        const log = dayActionModal.logForDay;
                        setDayActionModal(null);
                        deleteLog(log._id || log.id);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: isDark ? '#450a0a35' : '#fee2e2',
                        borderWidth: 1,
                        borderColor: '#fca5a5',
                        gap: 8,
                      }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#dc2626" />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#dc2626' }}>
                        Delete Attendance Record (Day {dayActionModal.day})
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </Modal>
        )}

        {editingLog && (
          <Modal visible={!!editingLog} transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', maxWidth: 420 }}>
                <View style={{ backgroundColor: isDark ? '#1e293b' : '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: isDark ? '#fff' : '#0f172a', marginBottom: 16 }}>
                    Edit Attendance: {editingLog.employeeId?.name || editingLog.markedByUserName || 'Worker'}
                  </Text>
                  
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b', marginBottom: 6 }}>Status</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {[
                      { key: 'Present', label: 'PRESENT (P)' },
                      { key: 'Half Day', label: 'HALF DAY (P½)' },
                      { key: 'Weekly Off', label: 'WEEKLY OFF (W)' },
                      { key: 'Paid Leave', label: 'LEAVE (L)' },
                      { key: 'Absent', label: 'ABSENT (A)' },
                      { key: 'NR', label: 'NO RELIEVER (NR)' },
                    ].map(st => (
                      <TouchableOpacity 
                        key={st.key} 
                        onPress={() => setEditStatus(st.key)}
                        style={{
                          paddingHorizontal: 10,
                          height: 36,
                          borderRadius: 8,
                          backgroundColor: editStatus === st.key ? COLORS.primary : (isDark ? '#334155' : '#f1f5f9'),
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: editStatus === st.key ? '#fff' : '#64748b' }}>
                          {st.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b', marginBottom: 6 }}>Duty Start (YYYY-MM-DD HH:MM)</Text>
                  <TextInput
                    style={{ height: 44, backgroundColor: isDark ? '#0f172a' : '#f8fafc', color: isDark ? '#fff' : '#000', borderRadius: 8, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: isDark ? '#334155' : '#e2e8f0' }}
                    value={editStart}
                    onChangeText={setEditStart}
                  />

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b', marginBottom: 6 }}>Duty End (YYYY-MM-DD HH:MM)</Text>
                  <TextInput
                    style={{ height: 44, backgroundColor: isDark ? '#0f172a' : '#f8fafc', color: isDark ? '#fff' : '#000', borderRadius: 8, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: isDark ? '#334155' : '#e2e8f0' }}
                    value={editEnd}
                    placeholder="Leave empty if ON duty"
                    placeholderTextColor="#64748b"
                    onChangeText={setEditEnd}
                  />

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b', marginBottom: 6 }}>Daily Rate (₹)</Text>
                  <TextInput
                    style={{ height: 44, backgroundColor: isDark ? '#0f172a' : '#f8fafc', color: isDark ? '#fff' : '#000', borderRadius: 8, paddingHorizontal: 12, marginBottom: 16, borderWidth: 1, borderColor: isDark ? '#334155' : '#e2e8f0' }}
                    keyboardType="numeric"
                    value={editRate}
                    onChangeText={setEditRate}
                  />

                  {/* Delete Button inside Edit Modal */}
                  <TouchableOpacity
                    onPress={() => deleteLog(editingLog._id || editingLog.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 42,
                      backgroundColor: isDark ? '#450a0a35' : '#fee2e2',
                      borderRadius: 8,
                      marginBottom: 14,
                      borderWidth: 1,
                      borderColor: '#fca5a5',
                      gap: 6,
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#dc2626" />
                    <Text style={{ fontWeight: 'bold', color: '#dc2626', fontSize: 13 }}>Delete This Attendance Record</Text>
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={() => setEditingLog(null)} style={{ flex: 1, height: 44, backgroundColor: isDark ? '#334155' : '#f1f5f9', borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={{ fontWeight: 'bold', color: '#64748b' }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={saveEdit} style={{ flex: 1, height: 44, backgroundColor: COLORS.primary, borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={{ fontWeight: 'bold', color: '#fff' }}>Save Changes</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </View>
          </Modal>
        )}
        {/* Add Worker Modal */}
        <Modal
          visible={addWorkerModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setAddWorkerModalVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{
              backgroundColor: isDark ? '#1e293b' : '#fff',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              height: '80%',
              padding: 20,
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: isDark ? '#fff' : '#0f172a' }} numberOfLines={1}>
                    Add Worker to Shift {addWorkerContext?.shiftCode}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }} numberOfLines={1}>
                    Site: {addWorkerContext?.siteName}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setAddWorkerModalVisible(false)} style={{ padding: 4 }}>
                  <Ionicons name="close" size={24} color={isDark ? '#94a3b8' : '#64748b'} />
                </TouchableOpacity>
              </View>

              <TextInput
                placeholder="Search worker by name, EFN, or phone..."
                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                value={addWorkerSearch}
                onChangeText={setAddWorkerSearch}
                style={{
                  height: 44,
                  backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  color: isDark ? '#fff' : '#000',
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: isDark ? '#334155' : '#e2e8f0',
                }}
              />

              <FlatList
                data={allEmployees.filter((item) => {
                  if (!addWorkerSearch) return true;
                  const q = addWorkerSearch.toLowerCase();
                  return (
                    (item.name && item.name.toLowerCase().includes(q)) ||
                    (item.enrollment_no && String(item.enrollment_no).toLowerCase().includes(q)) ||
                    (item.mobile && String(item.mobile).includes(q))
                  );
                })}
                keyExtractor={(item) => String(item._id || item.id || Math.random())}
                contentContainerStyle={{ paddingBottom: 24 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? '#334155' : '#f1f5f9',
                    }}
                    onPress={() => {
                      if (addWorkerContext) {
                        const empId = String(item._id || item.id);
                        const already = manualWorkers.some(
                          (mw) =>
                            mw.siteId === addWorkerContext.siteId &&
                            mw.shiftCode === addWorkerContext.shiftCode &&
                            String(mw.workerData._id || mw.workerData.id) === empId
                        );
                        if (!already) {
                          setManualWorkers((prev) => [
                            ...prev,
                            {
                              siteId: addWorkerContext.siteId,
                              siteName: addWorkerContext.siteName,
                              shiftCode: addWorkerContext.shiftCode,
                              workerData: item,
                            },
                          ]);
                          setExpandedSites((prev) => ({ ...prev, [addWorkerContext.siteId]: true }));
                          setExpandedShifts((prev) => ({
                            ...prev,
                            [`${addWorkerContext.siteId}_${addWorkerContext.shiftCode}`]: true,
                          }));
                          appService.showToast(`Added ${item.name}`, 'Success');
                        } else {
                          appService.showToast(`${item.name} is already added.`, 'Info');
                        }
                      }
                    }}
                  >
                    <View style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: isDark ? '#334155' : '#f1f5f9',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginRight: 10,
                      overflow: 'hidden',
                    }}>
                      {item.photo ? (
                        <Image source={{ uri: item.photo }} style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <Ionicons name="person" size={18} color="#94a3b8" />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#fff' : '#0f172a' }}>
                        {item.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748b' }}>
                        {item.role || 'Worker'} • {item.mobile || 'No mobile'}
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={24} color={COLORS.primary} />
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>
    </SafeAreaView>
  </Modal>
  );
};
// 4. PenaltyRegisterModal Component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface PenaltyRegisterModalProps {
  visible: boolean;
  onClose: () => void;
  token: string;
  user: any;
}

const PenaltyRegisterModal: React.FC<PenaltyRegisterModalProps> = ({ visible, onClose, token, user }) => {
  const isDark = useColorScheme() === "dark";
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [violations, setViolations] = useState<any[]>([]);

  const fetchAndCompileRegister = async () => {
    setLoading(true);
    try {
      const startOfMonth = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0);
      const endOfMonth = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
      const res = await appService.httpClient.get('service/hr/attendance', {
        params: {
          from_date: startOfMonth.toISOString(),
          to_date: endOfMonth.toISOString(),
        },
        headers: { Authorization: `Bearer ${token}` }
      });
      const logs = res.data?.data || res.data || [];

      const penaltyLogs = logs.filter((log: any) => {
        const rem = (log.remarks || '').toLowerCase();
        const force = (log.forcedOffReason || '').toLowerCase();
        const early = (log.emergencyReason || '').toLowerCase();
        return rem.includes('late') || rem.includes('early') || force || early;
      }).map((log: any) => {
        const name = log.employeeId?.name || log.markedByUserName || 'Worker';
        const dateStr = log.date ? new Date(log.date).toLocaleDateString('en-IN') : '';
        const rem = log.remarks || '';
        const force = log.forcedOffReason || '';
        const early = log.emergencyReason || '';
        
        let violationType = 'Late Arrival';
        let fine = 100;
        let details = rem || 'Late Coming';

        if (force || early || rem.toLowerCase().includes('early')) {
          violationType = 'Early Departure';
          fine = 200;
          details = force || early || rem || 'Early Off-Duty';
        }

        return {
          id: log._id,
          name,
          role: log.role || 'Worker',
          date: dateStr,
          site: log.site_name || 'Site visit',
          type: violationType,
          details,
          fine,
        };
      });

      setViolations(penaltyLogs);
    } catch (e) {
      console.warn("Failed to compile penalty logs", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchAndCompileRegister();
    }
  }, [visible, selectedMonth, selectedYear]);

  const handlePrint = async () => {
    const reportDate = `${MONTHS[selectedMonth]} ${selectedYear}`;
    const corporateName = user?.corporateName || "Our Company";
    const logoUrl = user?.CorpProfileImage || "https://img.icons8.com/?size=100&id=E6RfmLvxU30R&format=png&color=000000";

    const rowsHtml = violations.map(row => `
      <tr>
        <td>${row.date}</td>
        <td style="font-weight: bold; color: #1e293b;">${row.name}</td>
        <td>${row.site}</td>
        <td style="color: ${row.type === 'Late Arrival' ? '#d97706' : '#dc2626'}; font-weight: bold;">${row.type}</td>
        <td>${row.details}</td>
        <td style="text-align: right; font-weight: bold; color: #dc2626;">â‚¹${row.fine.toLocaleString()}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; color: #1e293b; line-height: 1.4; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #ef4444; padding-bottom: 15px; margin-bottom: 25px; }
            .logo { width: 50px; height: 50px; border-radius: 10px; object-fit: contain; }
            .company-info { text-align: right; flex: 1; }
            .company-name { font-size: 20px; font-weight: 800; color: #ef4444; margin-bottom: 2px; }
            .ledger-title { font-size: 26px; font-weight: 900; color: #334155; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background: #f1f5f9; color: #475569; text-align: left; padding: 12px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }
            td { padding: 10px 8px; border-bottom: 1px solid #f1f5f9; font-size: 12px; vertical-align: middle; }
            .footer { text-align: center; margin-top: 40px; font-size: 10px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div style="flex: 2;">
              <div class="ledger-title">Penalty & Deduction Register</div>
              <div style="font-size: 12px; color: #64748b; font-weight: 500;">Month: ${reportDate}</div>
            </div>
            <div class="company-info">
              <img src="${logoUrl}" class="logo" />
              <div class="company-name">${corporateName}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Staff Name</th>
                <th>Site/Project</th>
                <th>Violation Type</th>
                <th>Details / Reason</th>
                <th style="text-align: right;">Fine Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="footer">
            This is a computer-generated statement and does not require a physical signature.
            <br/>Â© ${new Date().getFullYear()} ${corporateName}. All rights reserved.
          </div>
        </body>
      </html>
    `;
    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Penalty_Register_${selectedMonth + 1}_${selectedYear}`,
        UTI: 'com.adobe.pdf',
      });
    } catch (e: any) {
      Alert.alert('Print Error', e.message || 'Failed to print penalty register.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#f8fafc' }}>
        <View style={{ height: 60, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', marginLeft: 8 }}>Penalty Register</Text>
        </View>

        <View style={{ padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity 
            onPress={() => {
              const nextMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
              const nextYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
              setSelectedMonth(nextMonth);
              setSelectedYear(nextYear);
            }} 
            style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: isDark ? '#1e293b' : '#fff', borderWidth: 1, borderColor: isDark ? '#334155' : '#e2e8f0', justifyContent: 'center', alignItems: 'center' }}
          >
            <Ionicons name="chevron-back-outline" size={20} color={COLORS.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1, height: 44, backgroundColor: isDark ? '#1e293b' : '#fff', borderRadius: 8, borderWidth: 1, borderColor: isDark ? '#334155' : '#e2e8f0', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: isDark ? '#fff' : '#000' }}>
              {MONTHS[selectedMonth]} {selectedYear}
            </Text>
          </View>
          <TouchableOpacity 
            onPress={() => {
              const nextMonth = selectedMonth === 11 ? 0 : selectedMonth + 1;
              const nextYear = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
              setSelectedMonth(nextMonth);
              setSelectedYear(nextYear);
            }} 
            style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: isDark ? '#1e293b' : '#fff', borderWidth: 1, borderColor: isDark ? '#334155' : '#e2e8f0', justifyContent: 'center', alignItems: 'center' }}
          >
            <Ionicons name="chevron-forward-outline" size={20} color={COLORS.primary} />
          </TouchableOpacity>

          <TouchableOpacity onPress={handlePrint} style={{ height: 44, backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', flexDirection: 'row' }}>
            <Ionicons name="print-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Share PDF</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={violations}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item }) => (
              <View style={{
                backgroundColor: isDark ? '#1e293b' : '#fff',
                padding: 12,
                borderRadius: 12,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: isDark ? '#334155' : '#e2e8f0',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: isDark ? '#fff' : '#0f172a' }}>{item.name}</Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{item.date} â€¢ {item.site}</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Details: {item.details}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: item.type === 'Late Arrival' ? '#d97706' : '#dc2626' }}>{item.type}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#dc2626', marginTop: 2 }}>- â‚¹{item.fine}</Text>
                </View>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ProjectGalleryModal Component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface ProjectGalleryModalProps {
  visible: boolean;
  onClose: () => void;
  clients: any[];
}

const ProjectGalleryModal: React.FC<ProjectGalleryModalProps> = ({ visible, onClose, clients: defaultClients }) => {
  const isDark = useColorScheme() === 'dark';
  const [search, setSearch] = useState('');
  const [galleryClients, setGalleryClients] = useState<any[]>(defaultClients);
  const [loading, setLoading] = useState(false);

  // Lightbox state
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      appService.getSession().then((session) => {
        appService.httpClient.get('/service/leads/project-gallery', { 
          headers: { Authorization: `Bearer ${session?.token}` } 
        })
        .then(res => {
          if (res.data?.success) {
            setGalleryClients(res.data.data);
          }
        })
        .catch(err => console.warn('Failed to fetch gallery:', err))
        .finally(() => setLoading(false));
      });
    } else {
      setGalleryClients(defaultClients); // reset when closed
    }
  }, [visible, defaultClients]);

  // â”€â”€ URL resolver (exact backup logic) â”€â”€
  const resolveUrl = (url: string) => {
    const base = appService.httpClient.defaults.baseURL?.replace(/\/api\/?$/, '') || 'https://leadmanager-backend-production.up.railway.app';
    return url?.startsWith('http') ? url : `${base}/${url?.startsWith('/') ? url.slice(1) : url}`;
  };

  // â”€â”€ Media resolution per project (exact backup logic) â”€â”€
  const projects = useMemo(() => {
    return galleryClients.map((c: any) => {
      const folderMedia: string[] = c.folderGallery || [];
      const activityMedia: string[] = (c.activity || [])
        .filter((a: any) =>
          a.metadata?.media_url || a.metadata?.selfie_url ||
          a.metadata?.site_image || a.metadata?.progress_image
        )
        .map((a: any) =>
          a.metadata.media_url || a.metadata.selfie_url ||
          a.metadata.site_image || a.metadata.progress_image
        )
        .reverse();
      const mediaUrls = folderMedia.length > 0 ? folderMedia : activityMedia;
      return { ...c, mediaUrls };
    }).filter((c: any) => c.mediaUrls.length > 0);
  }, [galleryClients]);

  // â”€â”€ Flat list of ALL images across all projects for lightbox navigation â”€â”€
  const allImages = useMemo(() => {
    const imgs: Array<{ url: string; project: any; localIdx: number }> = [];
    projects.forEach((p: any) => {
      p.mediaUrls.forEach((url: string, i: number) => {
        imgs.push({ url: resolveUrl(url), project: p, localIdx: i });
      });
    });
    return imgs;
  }, [projects]);

  // â”€â”€ Filtered projects for gallery list â”€â”€
  const filtered = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter((p: any) =>
      (p.sender_name || '').toLowerCase().includes(q) ||
      (p.product_name || '').toLowerCase().includes(q) ||
      (p.lead_no || '').toString().includes(q)
    );
  }, [projects, search]);

  // â”€â”€ Filtered flat images (for counter display) â”€â”€
  const filteredImages = useMemo(() => {
    const imgs: Array<{ url: string; project: any; localIdx: number }> = [];
    filtered.forEach((p: any) => {
      p.mediaUrls.forEach((url: string, i: number) => {
        imgs.push({ url: resolveUrl(url), project: p, localIdx: i });
      });
    });
    return imgs;
  }, [filtered]);

  const totalImages = filteredImages.length;

  // â”€â”€ Open lightbox at global index â”€â”€
  const openLightbox = (globalIdx: number) => {
    setLightboxIndex(globalIdx);
    setLightboxVisible(true);
  };

  // â”€â”€ Share Gallery (exact backup handleShareGallery) â”€â”€
  const handleShareGallery = (item: any) => {
    const mediaUrls: string[] = item.mediaUrls || [];
    if (mediaUrls.length === 0) {
      Alert.alert('No Images', 'There are no project images to share.');
      return;
    }
    let message = `*ðŸ“¸ Project Gallery - #${item.lead_no}*\n`;
    message += `*Lead:* ${item.sender_name}\n`;
    message += `*Product:* ${item.product_name || 'N/A'}\n\n`;
    mediaUrls.forEach((url: string, i: number) => {
      message += `${i + 1}. ${resolveUrl(url)}\n\n`;
    });
    Alert.alert('Share Gallery', 'Share images via WhatsApp to:', [
      { text: 'Current Mobile', onPress: () => Linking.openURL(`whatsapp://send?phone=91${item.sender_mobile}&text=${encodeURIComponent(message)}`) },
      { text: 'Other Contact',  onPress: () => Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}`) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const cur = lightboxIndex;
  const total = allImages.length;
  const curImage = allImages[cur];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#f8fafc' }}>

        {/* â”€â”€ Header â”€â”€ */}
        <View style={{ backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: 0.3 }}>Project Gallery</Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>
              {totalImages} photo{totalImages !== 1 ? 's' : ''} Â· {filtered.length} project{filtered.length !== 1 ? 's' : ''}
            </Text>
          </View>
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="images-outline" size={22} color="rgba(255,255,255,0.8)" />
          )}
        </View>

        {/* â”€â”€ Search â”€â”€ */}
        <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: isDark ? '#1e293b' : '#fff',
            borderRadius: 12, paddingHorizontal: 12,
            borderWidth: 1, borderColor: isDark ? '#334155' : '#e2e8f0',
            height: 42,
          }}>
            <Ionicons name="search" size={15} color="#94a3b8" style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Search project, client, productâ€¦"
              placeholderTextColor="#94a3b8"
              style={{ flex: 1, color: isDark ? '#fff' : '#0f172a', fontSize: 13, fontWeight: '600' }}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={17} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* â”€â”€ Gallery list per project â”€â”€ */}
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 70 }}>
              <Ionicons name="camera-outline" size={60} color="#94a3b8" />
              <Text style={{ marginTop: 14, color: '#94a3b8', fontWeight: '800', fontSize: 15 }}>No photos found</Text>
              <Text style={{ marginTop: 5, color: '#cbd5e1', fontSize: 12, textAlign: 'center', paddingHorizontal: 30 }}>
                Photos are uploaded via GeoTag (Site Visit) or Work Progress
              </Text>
            </View>
          ) : (() => {
            // Build a running global index offset per project
            let globalOffset = 0;
            return filtered.map((project: any) => {
              const projectOffset = globalOffset;
              globalOffset += project.mediaUrls.length;
              return (
                <View key={project._id} style={{ marginBottom: 18 }}>

                  {/* Project section header */}
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 14, paddingVertical: 10,
                    backgroundColor: isDark ? '#1e293b' : '#fff',
                    borderTopWidth: 1, borderBottomWidth: 1,
                    borderColor: isDark ? '#334155' : '#e2e8f0',
                    marginBottom: 2,
                  }}>
                    <View style={{ flex: 1 }}>
                      {/* Client name + lead no â€” bold & clear */}
                      <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#f1f5f9' : '#0f172a', letterSpacing: 0.2 }}>
                        {project.sender_name}
                        {project.lead_no ? <Text style={{ color: COLORS.primary }}>{` #${project.lead_no}`}</Text> : ''}
                      </Text>
                      {/* Product name */}
                      <Text style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', marginTop: 2, fontWeight: '600' }}>
                        {project.product_name || 'No product specified'}
                      </Text>
                      {/* Image count */}
                      <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                        {project.mediaUrls.length} photo{project.mediaUrls.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    {/* Status badge */}
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <View style={{
                        backgroundColor: COLORS.primary + '22', borderRadius: 10,
                        paddingHorizontal: 9, paddingVertical: 3,
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {project.status || 'Active'}
                        </Text>
                      </View>
                      {/* Share button */}
                      <TouchableOpacity
                        onPress={() => handleShareGallery(project)}
                        style={{ padding: 6, backgroundColor: '#fff7ed', borderRadius: 8 }}
                      >
                        <Ionicons name="share-social" size={16} color="#ea580c" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Thumbnail grid â€” horizontal scroll with X/N counter */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 12, paddingVertical: 10 }}>
                    {project.mediaUrls.map((url: string, idx: number) => {
                      const globalIdx = projectOffset + idx;
                      const full = resolveUrl(url);
                      const counterLabel = `${idx + 1}/${project.mediaUrls.length}`;
                      return (
                        <TouchableOpacity
                          key={project._id + idx}
                          activeOpacity={0.82}
                          onPress={() => openLightbox(globalIdx)}
                          style={{ marginRight: 10, borderRadius: 12, overflow: 'hidden' }}
                        >
                          <Image
                            source={{ uri: full }}
                            style={{ width: 120, height: 120, backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }}
                            resizeMode="cover"
                          />
                          {/* X/N counter badge â€” top-left */}
                          <View style={{
                            position: 'absolute', top: 6, left: 6,
                            backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 8,
                            paddingHorizontal: 7, paddingVertical: 2,
                          }}>
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{counterLabel}</Text>
                          </View>
                          {/* Expand icon â€” bottom-right */}
                          <View style={{
                            position: 'absolute', bottom: 6, right: 6,
                            backgroundColor: 'rgba(0,0,0,0.50)', borderRadius: 8, padding: 3,
                          }}>
                            <Ionicons name="expand-outline" size={13} color="#fff" />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            });
          })()}
        </ScrollView>

        {/* â”€â”€ Full-Screen Lightbox with prev/next navigation â”€â”€ */}
        <Modal
          visible={lightboxVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLightboxVisible(false)}
          statusBarTranslucent
        >
          <View style={{ flex: 1, backgroundColor: '#000' }}>

            {/* Top bar: close + X/N counter */}
            <View style={{
              position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingTop: 52, paddingHorizontal: 18, paddingBottom: 12,
              backgroundColor: 'rgba(0,0,0,0.55)',
            }}>
              <TouchableOpacity
                onPress={() => setLightboxVisible(false)}
                style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20 }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>

              {/* X/N counter â€” centre */}
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>
                  {cur + 1} / {total}
                </Text>
                {curImage && (
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>
                    {curImage.localIdx + 1}/{curImage.project.mediaUrls.length} in project
                  </Text>
                )}
              </View>

              {/* Share current image's project */}
              <TouchableOpacity
                onPress={() => curImage && handleShareGallery(curImage.project)}
                style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20 }}
              >
                <Ionicons name="share-social" size={20} color="#ea580c" />
              </TouchableOpacity>
            </View>

            {/* Image */}
            {curImage && (
              <Image
                source={{ uri: curImage.url }}
                style={{ flex: 1, width: '100%' }}
                resizeMode="contain"
              />
            )}

            {/* Bottom: project info text */}
            {curImage && (
              <View style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
                backgroundColor: 'rgba(0,0,0,0.65)',
                paddingBottom: 36, paddingTop: 14, paddingHorizontal: 20,
              }}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 }}>
                  {curImage.project.sender_name}
                  {curImage.project.lead_no ? <Text style={{ color: '#60a5fa' }}>{` #${curImage.project.lead_no}`}</Text> : ''}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 3, fontWeight: '600' }}>
                  {curImage.project.product_name || 'No product'} Â· {curImage.project.status || 'Active'}
                </Text>
              </View>
            )}

            {/* Prev button */}
            {cur > 0 && (
              <TouchableOpacity
                onPress={() => setLightboxIndex(i => i - 1)}
                style={{
                  position: 'absolute', left: 12, top: '50%',
                  transform: [{ translateY: -24 }],
                  zIndex: 30, padding: 10,
                  backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 28,
                }}
              >
                <Ionicons name="chevron-back" size={28} color="#fff" />
              </TouchableOpacity>
            )}

            {/* Next button */}
            {cur < total - 1 && (
              <TouchableOpacity
                onPress={() => setLightboxIndex(i => i + 1)}
                style={{
                  position: 'absolute', right: 12, top: '50%',
                  transform: [{ translateY: -24 }],
                  zIndex: 30, padding: 10,
                  backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 28,
                }}
              >
                <Ionicons name="chevron-forward" size={28} color="#fff" />
              </TouchableOpacity>
            )}

          </View>
        </Modal>

      </SafeAreaView>
    </Modal>
  );
};

export default ProjectDashboard;