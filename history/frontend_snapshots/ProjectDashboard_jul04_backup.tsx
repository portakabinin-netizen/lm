import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, useColorScheme, ActivityIndicator, Image, Modal, FlatList, TextInput, KeyboardAvoidingView, Platform, Linking } from 'react-native';
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

// Existing Modals
import { AttendanceModal } from '@/modal/AttendanceModal';
import { ExpenseModal } from '@/modal/ExpenseModal';
import { SiteVisitModal } from '@/modal/SiteVisitModal';
import { VoucherEntryModal } from '@/modal/VoucherEntryModal';
import { WorkProgressModal } from '@/modal/WorkProgressModal';
import { SitewiseAttendanceRegisterModal } from '@/modal/SitewiseAttendanceRegisterModal';
import { BillCollectionModal } from '@/modal/BillCollectionModal';
import { StaffFinanceModal } from '@/modal/StaffFinanceModal';

// Add/Edit Modals
import { AddEmployeeModal } from '@/modal/AddEmployeeModal';
import LeadModal from '@/modal/LeadModal';
import SalaryRegisterModal from '@/modal/SalaryRegisterModal';

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
            <div class="value">â‚¹${(emp.monthlyRate || 0).toLocaleString('en-IN')}</div>
          </div>
          <div class="field">
            <div class="label">Daily Rate</div>
            <div class="value">â‚¹${(emp.rate || emp.dailyRate || 0).toLocaleString('en-IN')}</div>
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
}

const ProjectDashboard: React.FC<Props> = ({ token, userId, corporateId, corpAdminId, dbName: propDbName, name, userProfileImage: propUserProfileImage }) => {
  const isDark = useColorScheme() === "dark";
  const router = useRouter();
  const { user } = useUserContext();
  const dbName = propDbName || user?.dbName || '';
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState(name || '');
  const [userProfileImage, setUserProfileImage] = useState<string | undefined>(propUserProfileImage);
  
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
    if (name) setUserName(name);
    if (propUserProfileImage) setUserProfileImage(propUserProfileImage);
  }, [name, propUserProfileImage]);

  useEffect(() => {
    appService.getSession().then((session) => {
      if (session) {
        if (!name) setUserName(session.userDisplayName || session.displayName || session.name || session.employeeName || 'User');
        if (!propUserProfileImage) setUserProfileImage(session.photo || session.userProfileImage || session.employeeImage || session.photo_url || session.profileimage || session.profileImage || '');
      }
    });
    fetchData();
    const intervalId = setInterval(() => {
      fetchData(true);
    }, 30000); // auto refresh every 30s
    return () => clearInterval(intervalId);
  }, []);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [empRes, activeRes, clientRes] = await Promise.all([
        appService.httpClient.get('/service/hr/employees', { params: { all: 'true' }, headers: { Authorization: `Bearer ${token}` } }),
        appService.httpClient.get('/service/hr/attendance/active-staff', { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { success: true, data: [] } })),
        appService.httpClient.get('/service/leads/project-active', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (empRes.data?.success) setWorkers(empRes.data.data || []);
      if (activeRes.data?.success) setActiveStaff(activeRes.data.data || []);
      if (clientRes.data?.success) setClients(clientRes.data.data || []);
    } catch (e) {
      console.warn("Failed to fetch data", e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleAdd = useCallback((type: 'Worker' | 'Client') => {
    setSelectedItem(null);
    setModalType("add");
    if (type === 'Worker') setAddEmpVisible(true);
    else setAddLeadVisible(true);
  }, []);

  const subTabStyle = () => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: isDark ? '#1e293b' : '#f0fdf4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 8,
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
      
      {/* 2-Tier Dashboard Menu */}
      <View style={{ backgroundColor: isDark ? '#1e293b' : '#000000', borderBottomWidth: 1, borderColor: isDark ? '#334155' : '#e2e8f0', paddingBottom: activeMainMenu ? 3 : 0 }}>
        {/* Tier 1: Main Menu */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4, borderBottomWidth: activeMainMenu ? 0.5 : 0, borderColor: isDark ? '#475569' : '#f1f5f9' }}>
          {[
            { id: 'staff', label: 'Staff', icon: 'people' },
            { id: 'operation', label: 'Attendance', icon: 'calendar' },
            { id: 'finance', label: 'Voucher', icon: 'cash' },
            { id: 'report', label: 'Report', icon: 'document-text' },
            { id: 'service', label: 'Services', icon: 'apps' }
          ].map(menu => {
            const isActive = activeMainMenu === menu.id;
            const itemColor = isActive ? '#16a34a' : '#dc2626';
            return (
              <TouchableOpacity 
                key={menu.id} 
                onPress={() => setActiveMainMenu(prev => prev === menu.id ? null : menu.id as any)}
                style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  paddingHorizontal: 10, 
                  paddingVertical: 4, 
                  borderRadius: 16, 
                  backgroundColor: isActive ? (isDark ? 'rgba(22, 163, 74, 0.2)' : '#f0fdf4') : 'transparent' 
                }}
              >
                <Ionicons 
                  name={menu.icon as any} 
                  size={14} 
                  color={itemColor} 
                  style={{ marginRight: 4 }} 
                />
                <Text style={{ 
                  color: itemColor, 
                  fontWeight: 'bold', 
                  fontSize: 12 
                }}>
                  {menu.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tier 2: Sub-Menu */}
        {activeMainMenu && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 4 }}>
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

            {activeMainMenu === 'finance' && (
              <>
                <TouchableOpacity onPress={() => setBillCollectionVisible(true)} style={subTabStyle()}>
                  <Ionicons name="receipt" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Client Receipt</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setVoucherMode('payment'); setVoucherVisible(true); }} style={subTabStyle()}>
                  <Ionicons name="card" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Vendor Payment</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setStaffFinanceVisible(true)} style={subTabStyle()}>
                  <Ionicons name="wallet" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Staff Payment</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setExpenseVisible(true)} style={subTabStyle()}>
                  <Ionicons name="cart" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Expenses</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setVoucherMode('contra'); setVoucherVisible(true); }} style={subTabStyle()}>
                  <Ionicons name="swap-horizontal" size={11} color={isDark ? '#cbd5e1' : '#16a34a'} style={{ marginRight: 4 }} />
                  <Text style={subTabTextStyle()}>Cash Transfer</Text>
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
                  onPress={() => Alert.alert('ClientMeet', 'ClientMeet service report coming soon.')}
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
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={{ marginTop: 10, color: '#94a3b8' }}>Loading Map...</Text>
          </View>
        ) : (
          <LiveTracker 
            activeStaff={activeStaff} 
            leads={clients} 
            employees={workers} 
            name={userName}
            profileImage={userProfileImage}
            onRefresh={() => fetchData(true)}
          />
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
      <WorkProgressModal visible={workProgressVisible} lead={selectedItem} leads={clients} onClose={() => setWorkProgressVisible(false)} onComplete={fetchData} />
      <AttendanceModal visible={attendanceVisible} onClose={() => setAttendanceVisible(false)} onComplete={() => {}} leads={clients} />
      <ExpenseModal visible={expenseVisible} lead={selectedItem} onClose={() => setExpenseVisible(false)} onComplete={fetchData} />
      <VoucherEntryModal visible={voucherVisible} onClose={() => setVoucherVisible(false)} token={token} mode={voucherMode} />
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

    </SafeAreaView>
  );
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 1. StaffListModal Component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
            {mode === 'print' && 'Print/Share Enrollment'}
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
                {item.photo || item.photo_url ? (
                  <Image source={{ uri: item.photo || item.photo_url }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Ionicons name="person" size={24} color="#cbd5e1" />
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: isDark ? '#fff' : '#0f172a' }}>
                  {item.name} {item.enrollment_no ? `(EFN# ${item.enrollment_no})` : ''}
                </Text>
                <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  {item.role || 'Worker'} â€¢ {item.mobile}
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 2. AttendanceLogModal Component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface AttendanceLogModalProps {
  visible: boolean;
  onClose: () => void;
  token: string;
  clients: any[];
  mode: 'edit' | 'delete' | 'backup';
}

const AttendanceLogModal: React.FC<AttendanceLogModalProps> = ({ visible, onClose, token, clients, mode }) => {
  const isDark = useColorScheme() === "dark";
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

  // New states for manual workers
  const [manualWorkers, setManualWorkers] = useState<Array<{ siteId: string; siteName: string; shiftCode: string; workerData: any }>>([]);
  const [addWorkerModalVisible, setAddWorkerModalVisible] = useState(false);
  const [addWorkerContext, setAddWorkerContext] = useState<{siteId: string, siteName: string, shiftCode: string} | null>(null);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [addWorkerSearch, setAddWorkerSearch] = useState('');

  const fetchLogs = async () => {
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
      let fetchedLogs = [];
      if (res.data?.success) {
        fetchedLogs = res.data.data || [];
      } else if (Array.isArray(res.data)) {
        fetchedLogs = res.data;
      }
      setLogs(fetchedLogs);
    } catch (e) {
      console.warn("Failed to fetch logs", e);
    } finally {
      setLoading(false);
    }
  };

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
        employeeName: l.employeeId?.name || l.markedByUserName || 'Worker',
        enrollment_no: l.employeeId?.enrollment_no || 'N/A',
        role: l.role || l.employeeId?.role || 'Worker',
        siteName: l.site_name || 'N/A',
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
      let msg = `*ðŸ“Š Attendance Summary - ${MONTHS[selectedMonth]} ${selectedYear}*\n\n`;
      msg += `*Total Records:* ${logs.length}\n`;
      msg += `*Unique Workers:* ${uniqueEmployees.length}\n\n`;
      msg += `*Recent Records Preview:*\n`;
      
      logs.slice(0, 15).forEach((l: any, i: number) => {
        const empName = l.employeeId?.name || l.markedByUserName || 'Worker';
        const dateStr = l.date ? new Date(l.date).toLocaleDateString('en-IN') : '';
        msg += `${i + 1}. ${empName} - ${l.site_name || 'Site'} (${dateStr})\n`;
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

  const fetchAllEmployees = async () => {
    try {
      const res = await appService.httpClient.get('service/hr/employees', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.success) {
        setAllEmployees(res.data.data || []);
      } else if (Array.isArray(res.data)) {
        setAllEmployees(res.data);
      }
    } catch (e) {
      console.warn("Failed to fetch employees", e);
    }
  };

  useEffect(() => {
    if (visible) {
      setExpandedSites({});
      setExpandedWorkers({});
      setManualWorkers([]);
      fetchLogs();
      fetchAllEmployees();
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
          name: emp?.name || l.markedByUserName || 'Worker',
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

  // Group logs by site and shift, and then by worker
  const groupedSitewise = useMemo(() => {
    // Top-level map is by siteId
    const siteMap = new Map<string, {
      siteId: string;
      siteName: string;
      shifts: Map<string, { shiftCode: string; workers: Map<string, any> }>;
    }>();
    
    const defaultSiteId = 'hq_remote';
    
    const addWorkerToMap = (siteId: string, siteName: string, shiftCode: string, emp: any, log: any = null) => {
      if (!siteMap.has(siteId)) {
        siteMap.set(siteId, { siteId, siteName, shifts: new Map() });
      }
      
      const siteGroup = siteMap.get(siteId)!;
      if (!siteGroup.shifts.has(shiftCode)) {
        siteGroup.shifts.set(shiftCode, { shiftCode, workers: new Map() });
      }

      const shiftGroup = siteGroup.shifts.get(shiftCode)!;
      const rawEmpId = String(emp._id || emp.id || '');
      
      if (!shiftGroup.workers.has(rawEmpId)) {
        shiftGroup.workers.set(rawEmpId, {
          _id: rawEmpId,
          name: emp.name || (log && log.markedByUserName) || 'Worker',
          role: (log && log.role) || emp.role || 'Worker',
          enrollment_no: emp.enrollment_no || '',
          photo: emp.photo || emp.photo_url || '',
          rate: (log && (log.rate || log.dailyRate)) || emp.employmentHistory?.find((h: any) => h.active)?.daily_rate || 0,
          logs: [],
        });
      }
      
      if (log) {
        shiftGroup.workers.get(rawEmpId)!.logs.push(log);
      }
    };

    logs.forEach((log) => {
      let rawEmpId = '';
      if (log.employeeId && typeof log.employeeId === 'object') {
        rawEmpId = String(log.employeeId._id || log.employeeId.id || '');
      } else {
        rawEmpId = String(log.employeeId || '');
      }
      if (!rawEmpId || rawEmpId === '[object Object]') return;

      const siteId = String(log.leadId?._id || log.leadId || defaultSiteId);
      const siteName = log.site_name || log.leadId?.sender_name || 'HQ / Remote';
      const shiftCode = log.shiftCode || 'G';
      
      const emp = typeof log.employeeId === 'object' ? log.employeeId : { _id: rawEmpId };
      addWorkerToMap(siteId, siteName, shiftCode, emp, log);
    });

    manualWorkers.forEach((mw) => {
      addWorkerToMap(mw.siteId, mw.siteName, mw.shiftCode, mw.workerData, null);
    });

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
          const matchesSiteOrShift = siteGroup.siteName.toLowerCase().includes(q) || shiftGroup.shiftCode.toLowerCase().includes(q);
          if (!matchesSiteOrShift) {
            displayWorkers = workersList.filter(w => 
              w.name.toLowerCase().includes(q) || 
              (w.enrollment_no && String(w.enrollment_no).toLowerCase().includes(q))
            );
          }
        }

        if (displayWorkers.length > 0 || (search && (siteGroup.siteName.toLowerCase().includes(search.toLowerCase()) || shiftGroup.shiftCode.toLowerCase().includes(search.toLowerCase())))) {
          displayShifts.push({
            shiftCode: shiftGroup.shiftCode,
            workers: displayWorkers,
          });
          totalSiteWorkers += displayWorkers.length;
        }
      });

      if (displayShifts.length > 0) {
        displayShifts.sort((a, b) => a.shiftCode.localeCompare(b.shiftCode));
        result.push({
          siteId: siteGroup.siteId,
          siteName: siteGroup.siteName,
          totalWorkers: totalSiteWorkers,
          shifts: displayShifts,
        });
      }
    });

    return result.sort((a, b) => a.siteName.localeCompare(b.siteName));
  }, [logs, search, manualWorkers]);

  const handleToggleDay = async (worker: any, day: number, siteId: string, siteName: string, shiftCode: string) => {
    const targetDate = new Date(selectedYear, selectedMonth, day, 12, 0, 0);
    const logForDay = worker.logs.find((l: any) => {
      const d = new Date(l.date || l.dutyStart);
      return d.getDate() === day;
    });

    if (logForDay) {
      Alert.alert(
        "Edit Attendance",
        `Attendance for ${worker.name} on ${day}/${selectedMonth + 1}/${selectedYear} at site "${siteName}"`,
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Demark / Absent (A)", 
            style: "destructive",
            onPress: async () => {
              try {
                setLoading(true);
                await appService.httpClient.delete(`service/hr/attendance/${logForDay._id}`, {
                  headers: { Authorization: `Bearer ${token}` }
                });
                appService.showToast('Attendance marked Absent', 'Success');
                fetchLogs();
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to update attendance');
                setLoading(false);
              }
            }
          },
          {
            text: "Edit Details",
            onPress: () => {
              startEdit(logForDay);
            }
          }
        ]
      );
    } else {
      Alert.alert(
        "Mark Present",
        `Mark ${worker.name} Present on ${day}/${selectedMonth + 1}/${selectedYear} at site "${siteName}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Confirm",
            onPress: async () => {
              try {
                setLoading(true);
                const rate = worker.rate || 0;
                const startISO = new Date(selectedYear, selectedMonth, day, 9, 0, 0).toISOString();
                const endISO = new Date(selectedYear, selectedMonth, day, 17, 0, 0).toISOString();
                
                const payload = {
                  employeeId: worker._id,
                  employeeType: 'Employees',
                  leadId: siteId === 'hq_remote' ? null : siteId,
                  status: 'Present',
                  dutyLevel: 1,
                  rate: rate,
                  dailyRate: rate,
                  date: targetDate.toISOString(),
                  dutyStart: startISO,
                  dutyEndScheduled: endISO,
                  dutyEnd: endISO,
                  hoursWorked: 8,
                  shiftCode: shiftCode || 'G',
                  site_name: siteName,
                };
                
                await appService.httpClient.post('service/hr/attendance', payload, {
                  headers: { Authorization: `Bearer ${token}` }
                });
                
                appService.showToast('Attendance marked Present', 'Success');
                fetchLogs();
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to create attendance log');
                setLoading(false);
              }
            }
          }
        ]
      );
    }
  };

  const startEdit = (log: any) => {
    setEditingLog(log);
    setEditStatus(log.status || 'Present');
    setEditStart(log.dutyStart ? new Date(log.dutyStart).toISOString().slice(0, 16).replace('T', ' ') : '');
    setEditEnd(log.dutyEnd ? new Date(log.dutyEnd).toISOString().slice(0, 16).replace('T', ' ') : '');
    setEditRate(String(log.rate || log.dailyRate || 0));
  };

  const saveEdit = async () => {
    if (!editingLog) return;
    try {
      const payload: any = {
        status: editStatus,
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
        `service/hr/attendance/${editingLog._id}`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      appService.showToast('Attendance updated successfully', 'Success');
      setEditingLog(null);
      fetchLogs();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update attendance.');
    }
  };

  const renderMonthCalendar = (worker: any, siteId: string, siteName: string, shiftCode: string) => {
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const logForDay = worker.logs.find((l: any) => {
        const logDate = new Date(l.date || l.dutyStart);
        return logDate.getDate() === d;
      });
      const isPresent = logForDay && logForDay.status !== 'Absent' && logForDay.status !== 'Leave';
      
      days.push(
        <TouchableOpacity
          key={d}
          onPress={() => handleToggleDay(worker, d, siteId, siteName, shiftCode)}
          style={{
            width: '12.5%',
            aspectRatio: 1,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: isPresent ? '#22c55e' : (isDark ? '#475569' : '#cbd5e1'),
            backgroundColor: isPresent ? '#f0fdf4' : (isDark ? '#1e293b' : '#f8fafc'),
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
          <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#94a3b8' : '#64748b' }}>{d}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1, gap: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: isPresent ? '#15803d' : '#ef4444' }}>
              {isPresent ? 'P' : 'A'}
            </Text>
            <Ionicons name="pencil" size={8} color={isPresent ? '#15803d' : '#ef4444'} style={{ opacity: 0.7 }} />
          </View>
        </TouchableOpacity>
      );
    }
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8, backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderRadius: 12, marginTop: 10 }}>
        {days}
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
            {mode === 'edit' ? 'Edit Attendance' : mode === 'delete' ? 'Delete Attendance' : 'Backup Attendance (JSON)'}
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

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
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
                keyExtractor={(item) => item._id}
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
                          Site: {item.site_name || 'No Site'}
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
                      onPress={() => setExpandedSites(isSiteExpanded ? {} : { [site.siteId]: true })}
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
                        <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#fff' : '#0f172a' }}>
                          {site.siteName}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '600', marginTop: 1 }}>
                          {site.totalWorkers} Worker{site.totalWorkers !== 1 ? 's' : ''} across {site.shifts.length} Shift{site.shifts.length !== 1 ? 's' : ''}
                        </Text>
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
                        {site.shifts.map((shiftGroup: any) => {
                          const shiftKey = `${site.siteId}_${shiftGroup.shiftCode}`;
                          const isShiftExpanded = expandedShifts[shiftKey] ?? false;
                          return (
                            <View key={shiftKey} style={{ borderTopWidth: 1, borderTopColor: isDark ? '#334155' : '#e2e8f0' }}>
                              {/* Shift Header Toggle */}
                              <TouchableOpacity
                                onPress={() => setExpandedShifts(prev => ({ ...prev, [shiftKey]: !isShiftExpanded }))}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  padding: 12,
                                  paddingLeft: 20,
                                  backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
                                }}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#cbd5e1' : '#334155' }}>
                                    Shift: {shiftGroup.shiftCode}
                                  </Text>
                                  <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                                    {shiftGroup.workers.length} Worker{shiftGroup.workers.length !== 1 ? 's' : ''}
                                  </Text>
                                </View>

                                {/* Add Worker to Shift Icon Button */}
                                <TouchableOpacity
                                  onPress={(e) => {
                                    e.stopPropagation(); // Don't collapse the shift
                                    setAddWorkerContext({ siteId: site.siteId, siteName: site.siteName, shiftCode: shiftGroup.shiftCode });
                                    setAddWorkerSearch('');
                                    setAddWorkerModalVisible(true);
                                  }}
                                  style={{
                                    width: 32, height: 32, borderRadius: 16,
                                    backgroundColor: COLORS.primary + '20',
                                    justifyContent: 'center', alignItems: 'center',
                                    marginRight: 12,
                                  }}
                                >
                                  <Ionicons name="add" size={20} color={COLORS.primary} />
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
                                  {shiftGroup.workers.map((worker: any) => {
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
                                          onPress={() => setExpandedWorkers(prev => ({ ...prev, [workerKey]: !isWorkerExpanded }))}
                                          style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            padding: 12,
                                          }}
                                        >
                                          <View style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: 18,
                                            backgroundColor: '#e2e8f0',
                                            marginRight: 10,
                                            overflow: 'hidden',
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
                                              EFN#: {worker.enrollment_no || 'N/A'} â€¢ {worker.role}
                                            </Text>
                                          </View>
                                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <View style={{
                                              backgroundColor: COLORS.primary + '10',
                                              paddingHorizontal: 8,
                                              paddingVertical: 3,
                                              borderRadius: 6,
                                            }}>
                                              <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.primary }}>
                                                {worker.logs.length} logged
                                              </Text>
                                            </View>
                                            <Ionicons
                                              name={isWorkerExpanded ? 'chevron-up' : 'chevron-down'}
                                              size={16}
                                              color="#94a3b8"
                                            />
                                          </View>
                                        </TouchableOpacity>

                                        {/* Worker Full Month Calendar Grid */}
                                        {isWorkerExpanded && (
                                          <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: isDark ? '#1e293b' : '#f1f5f9' }}>
                                            <Text style={{ fontSize: 11, fontWeight: '900', color: '#64748b', letterSpacing: 0.5, marginBottom: 8 }}>
                                              MONTHLY ATTENDANCE CALENDAR (TAP TO TOGGLE/EDIT)
                                            </Text>
                                            {renderMonthCalendar(worker, site.siteId, site.siteName, shiftGroup.shiftCode)}
                                          </View>
                                        )}
                                      </View>
                                    );
                                  })}
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
          )
        )}

        {editingLog && (
          <Modal visible={!!editingLog} transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', maxWidth: 400 }}>
                <View style={{ backgroundColor: isDark ? '#1e293b' : '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: isDark ? '#fff' : '#0f172a', marginBottom: 16 }}>
                    Edit Attendance: {editingLog.employeeId?.name || editingLog.markedByUserName || 'Worker'}
                  </Text>
                  
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b', marginBottom: 6 }}>Status</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                    {['Present', 'Absent', 'Leave'].map(st => (
                      <TouchableOpacity 
                        key={st} 
                        onPress={() => setEditStatus(st)}
                        style={{ flex: 1, height: 38, borderRadius: 8, backgroundColor: editStatus === st ? COLORS.primary : (isDark ? '#334155' : '#f1f5f9'), justifyContent: 'center', alignItems: 'center' }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: editStatus === st ? '#fff' : '#64748b' }}>{st.toUpperCase()}</Text>
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

                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b', marginBottom: 6 }}>Daily Rate (â‚¹)</Text>
                  <TextInput
                    style={{ height: 44, backgroundColor: isDark ? '#0f172a' : '#f8fafc', color: isDark ? '#fff' : '#000', borderRadius: 8, paddingHorizontal: 12, marginBottom: 20, borderWidth: 1, borderColor: isDark ? '#334155' : '#e2e8f0' }}
                    keyboardType="numeric"
                    value={editRate}
                    onChangeText={setEditRate}
                  />

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
        <Modal visible={addWorkerModalVisible} animationType="slide" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: isDark ? '#1e293b' : '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '80%', padding: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: isDark ? '#fff' : '#0f172a' }}>
                  Add Worker to {addWorkerContext?.shiftCode}
                </Text>
                <TouchableOpacity onPress={() => setAddWorkerModalVisible(false)}>
                  <Ionicons name="close" size={24} color={isDark ? '#94a3b8' : '#64748b'} />
                </TouchableOpacity>
              </View>

              <TextInput
                placeholder="Search worker by name or EFN..."
                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                value={addWorkerSearch}
                onChangeText={setAddWorkerSearch}
                style={{
                  height: 44,
                  backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  color: isDark ? '#fff' : '#000',
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: isDark ? '#334155' : '#e2e8f0',
                }}
              />

              <FlatList
                data={allEmployees.filter(e => {
                  if (!addWorkerSearch) return true;
                  const q = addWorkerSearch.toLowerCase();
                  return (e.name && e.name.toLowerCase().includes(q)) || (e.enrollment_no && String(e.enrollment_no).toLowerCase().includes(q));
                })}
                keyExtractor={item => item._id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{
                      padding: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? '#334155' : '#f1f5f9',
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                    onPress={() => {
                      if (addWorkerContext) {
                        const isDuplicate = manualWorkers.some(mw => 
                          mw.siteId === addWorkerContext.siteId && 
                          mw.shiftCode === addWorkerContext.shiftCode && 
                          mw.workerData._id === item._id
                        );
                        if (!isDuplicate) {
                          setManualWorkers(prev => [...prev, {
                            siteId: addWorkerContext.siteId,
                            siteName: addWorkerContext.siteName,
                            shiftCode: addWorkerContext.shiftCode,
                            workerData: item,
                          }]);
                          appService.showToast(`Added ${item.name}`, 'Success');
                        } else {
                          appService.showToast(`${item.name} is already added.`, 'Info');
                        }
                      }
                      setAddWorkerModalVisible(false);
                    }}
                  >
                    <View style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: '#e2e8f0',
                      marginRight: 10,
                      justifyContent: 'center',
                      alignItems: 'center',
                      overflow: 'hidden'
                    }}>
                      {item.photo || item.photo_url ? (
                        <Image source={{ uri: item.photo || item.photo_url }} style={{ width: '100%', height: '100%' }} />
                      ) : (
                        <Ionicons name="person" size={18} color="#94a3b8" />
                      )}
                    </View>
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: 'bold', color: isDark ? '#fff' : '#0f172a' }}>{item.name}</Text>
                      <Text style={{ fontSize: 11, color: '#64748b' }}>EFN: {item.enrollment_no || 'N/A'}</Text>
                    </View>
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
