import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  useColorScheme,
  Alert,
  Platform,
  TextInput,
  Image,
} from 'react-native';
import FastImage from '@/components/FastImageCompat';
import { Ionicons } from '@expo/vector-icons';

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/styles/stylesIndex';
import { appService } from '@/UtilServices/appHelper';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface ProcessModalProps {
  visible: boolean;
  onClose: () => void;
  token: string;
}

export const ProcessModal: React.FC<ProcessModalProps> = ({ visible, onClose, token }) => {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  const [logs, setLogs] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);

  const [expandedEmployees, setExpandedEmployees] = useState<Record<string, boolean>>({});
  const [advances, setAdvances] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      setExpandedEmployees({});
      fetchData();
    }
  }, [visible, selectedMonth, selectedYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const startOfMonth = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0);
      const endOfMonth = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
      
      const [empRes, attRes, leadsRes] = await Promise.all([
        appService.httpClient.get('service/hr/employees?all=true', {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: [] })),
        appService.httpClient.get('service/hr/attendance', {
          params: { from_date: startOfMonth.toISOString(), to_date: endOfMonth.toISOString() },
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: [] })),
        appService.httpClient.get('service/leads/list', { 
          headers: { Authorization: `Bearer ${token}` } 
        }).catch(() => ({ data: { data: [] } })),
      ]);

      const fetchedEmployees = Array.isArray(empRes.data?.data) ? empRes.data.data : (Array.isArray(empRes.data) ? empRes.data : []);
      let fetchedLogs = [];
      if (attRes.data?.success) {
        fetchedLogs = attRes.data.data || [];
      } else if (Array.isArray(attRes.data)) {
        fetchedLogs = attRes.data;
      }
      const fetchedLeads = Array.isArray(leadsRes.data?.data) ? leadsRes.data.data : (Array.isArray(leadsRes.data) ? leadsRes.data : []);

      setEmployees(fetchedEmployees);
      setLogs(fetchedLogs);
      setLeads(fetchedLeads);
    } catch (e) {
      console.warn('Failed to fetch process data', e);
      Alert.alert('Error', 'Failed to fetch data.');
    } finally {
      setLoading(false);
    }
  };

  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedMonth, selectedYear]);

  // Group logs by Employee, then Site, then Shift
  const groupedData = useMemo(() => {
    const empMap = new Map<string, { empId: string; name: string; efn: string; photo: string; fullEmp: any; sites: Map<string, any> }>();

    logs.forEach((log) => {
      if (log.isPaid) return;

      // Find employee info
      let rawEmpId = '';
      if (log.employeeId && typeof log.employeeId === 'object') {
        rawEmpId = String(log.employeeId._id || log.employeeId.id || '');
      } else {
        rawEmpId = String(log.employeeId || '');
      }
      if (!rawEmpId || rawEmpId === '[object Object]') return;

      const empObj = typeof log.employeeId === 'object' ? log.employeeId : { _id: rawEmpId };
      const fullEmp = employees.find(e => String(e._id || e.id) === rawEmpId);
      const role = String(fullEmp?.role || empObj.role || log.role || '').toLowerCase();
      
      if (role === 'corpadmin' || role === 'useradmin') return;

      const name = fullEmp?.name || empObj.name || log.markedByUserName || 'Worker';
      const efn = fullEmp?.enrollment_no || empObj.enrollment_no || '';
      const photo = fullEmp?.photo_url || fullEmp?.photo || fullEmp?.userProfileImage || fullEmp?.employeeImage || empObj?.photo_url || empObj?.photo || empObj?.userProfileImage || empObj?.employeeImage || '';

      if (!empMap.has(rawEmpId)) {
        empMap.set(rawEmpId, { empId: rawEmpId, name, efn, photo, fullEmp, sites: new Map() });
      }

      const empRecord = empMap.get(rawEmpId)!;

      const siteId = String(log.leadId?._id || log.leadId || 'hq_remote');
      const siteName = log.site_name || log.leadId?.sender_name || 'HQ / Remote';
      const shiftCode = log.shiftCode || 'G';

      const siteKey = `${siteId}_${shiftCode}`;

      if (!empRecord.sites.has(siteKey)) {
        empRecord.sites.set(siteKey, {
          siteId,
          siteName,
          shiftCode,
          logs: [],
          logIds: [],
        });
      }

      const siteData = empRecord.sites.get(siteKey)!;
      siteData.logs.push(log);
      siteData.logIds.push(log._id);
    });

    // Now calculate
    const result: any[] = [];

    empMap.forEach((empData) => {
      const displaySites: any[] = [];
      let totalDues = 0;

      empData.sites.forEach((siteData) => {
        // Calculate P count for this site/shift
        let pCount = 0;
        
        const dailyAttendance: Record<number, { present: boolean; statusChar?: string; weight?: number; shiftCode?: string; isDoubleDuty?: boolean }> = {};

        const lead = leads.find(l => String(l._id || l.id) === siteData.siteId);
        const shiftDetail = lead?.siteShifts?.find((s: any) => s.shiftCode === siteData.shiftCode);
        const shiftExemptDays: string[] = (shiftDetail?.exemptDays && Array.isArray(shiftDetail.exemptDays))
          ? shiftDetail.exemptDays
          : [];

        siteData.logs.forEach((log: any) => {
          const st = (log.status || 'Present').toLowerCase();
          const isHalf = log.dutyLevel === 0.5 || log.dutyCount === 0.5;
          const dateStr = log.date || log.dutyStart;
          if (dateStr) {
            const day = new Date(dateStr).getDate();
            if (!isNaN(day)) {
              const logShiftCode = log.shiftCode || siteData.shiftCode;
              let weight = 1;
              let statusChar = 'P';
              if (st === 'weekly off' || st === 'w') {
                statusChar = 'W';
                weight = 1;
              } else if (st === 'leave' || st === 'paid leave' || st === 'l') {
                statusChar = 'L';
                weight = 1;
              } else if (st === 'absent' || st === 'a') {
                statusChar = 'A';
                weight = 0;
              } else {
                statusChar = isHalf ? 'P½' : 'P';
                weight = isHalf ? 0.5 : 1;
              }

              if (statusChar !== 'A') {
                if (dailyAttendance[day]) {
                  if (dailyAttendance[day].shiftCode !== logShiftCode) {
                    dailyAttendance[day].isDoubleDuty = true;
                    dailyAttendance[day].weight = (dailyAttendance[day].weight || 1) + weight;
                  }
                } else {
                  dailyAttendance[day] = {
                    present: true,
                    statusChar,
                    weight,
                    shiftCode: logShiftCode,
                    isDoubleDuty: false,
                  };
                }
              }
            }
          }
        });

        // Add unworked scheduled exempt days as Weekly Off (W)
        for (let d = 1; d <= daysInMonth; d++) {
          if (!dailyAttendance[d]) {
            const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(selectedYear, selectedMonth, d).getDay()];
            if (shiftExemptDays.includes(dayName)) {
              dailyAttendance[d] = {
                present: true,
                statusChar: 'W',
                weight: 1,
                shiftCode: siteData.shiftCode,
                isDoubleDuty: false,
              };
            }
          }
        }

        Object.keys(dailyAttendance).forEach((dayKey) => {
          const att = dailyAttendance[Number(dayKey)];
          if (att && att.present) {
            pCount += att.weight !== undefined ? att.weight : (att.isDoubleDuty ? 2 : 1);
          }
        });

        // Get salary rate from leads
        let salaryRate = 0;
        if (lead && lead.siteShifts && Array.isArray(lead.siteShifts)) {
          const shiftDetail = lead.siteShifts.find((s: any) => s.shiftCode === siteData.shiftCode);
          if (shiftDetail) {
            salaryRate = Number(shiftDetail.salaryRate) || 0;
          }
        }
        
        // fallback if not found in leads: get monthly rate from employee database profile
        if (salaryRate === 0) {
          const fe = empData.fullEmp || {};
          const ae = (fe.employmentHistory || []).find((e: any) => e.active) || (fe.employmentHistory || []).slice(-1)[0] || null;
          const fallbackBaseRate = Number(ae?.monthly_rate) || Number(fe.monthly_rate) || Number(fe.monthlyRate) || Number(ae?.rate) || Number(fe.rate) || Number(ae?.daily_rate) || Number(fe.daily_rate) || Number(fe.dailyRate) || 0;
          salaryRate = Number(ae?.monthly_rate) || Number(fe.monthly_rate) || Number(fe.monthlyRate) || fallbackBaseRate;
        }

        const earning = (pCount * salaryRate) / daysInMonth;

        displaySites.push({
          siteId: siteData.siteId,
          siteName: siteData.siteName,
          shiftCode: siteData.shiftCode,
          pCount,
          salaryRate,
          earning,
        });

        totalDues += earning;
      });

      if (displaySites.length > 0) {
        result.push({
          empId: empData.empId,
          name: empData.name,
          efn: empData.efn,
          photo: empData.photo,
          totalDues,
          sites: displaySites.sort((a, b) => a.siteName.localeCompare(b.siteName)),
        });
      }
    });

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [logs, leads, daysInMonth]);

  const toggleEmployee = (empId: string) => {
    setExpandedEmployees((prev) => ({
      ...prev,
      [empId]: !prev[empId],
    }));
  };

  const handlePrint = async () => {
    if (pdfLoading) return;
    if (groupedData.length === 0) {
      Alert.alert('No data', 'There is no data to share.');
      return;
    }
    setPdfLoading(true);
    try {
      let rowsHtml = '';
      groupedData.forEach((emp, index) => {
        if (emp.sites.length > 1) {
          emp.sites.forEach((site: any, si: number) => {
            if (si === 0) {
              rowsHtml += `
                <tr>
                  <td rowspan="${emp.sites.length}">${index + 1}</td>
                  <td rowspan="${emp.sites.length}">${emp.name}</td>
                  <td rowspan="${emp.sites.length}">${emp.efn}</td>
                  <td>${site.siteName}</td>
                  <td>${site.pCount}</td>
                  <td>₹${site.salaryRate}</td>
                  <td rowspan="${emp.sites.length}">₹${Math.round(emp.totalDues).toLocaleString()}</td>
                </tr>
              `;
            } else {
              rowsHtml += `
                <tr>
                  <td>${site.siteName}</td>
                  <td>${site.pCount}</td>
                  <td>₹${site.salaryRate}</td>
                </tr>
              `;
            }
          });
        } else {
          const site = emp.sites[0];
          rowsHtml += `
            <tr>
              <td>${index + 1}</td>
              <td>${emp.name}</td>
              <td>${emp.efn}</td>
              <td>${site ? site.siteName : ''}</td>
              <td>${site ? site.pCount : 0}</td>
              <td>₹${site ? site.salaryRate : 0}</td>
              <td>₹${Math.round(emp.totalDues).toLocaleString()}</td>
            </tr>
          `;
        }
      });

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
            <style>
              body { font-family: Helvetica, Arial, sans-serif; padding: 20px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; }
            </style>
          </head>
          <body>
            <h2>Processed Salary - ${MONTHS[selectedMonth]} ${selectedYear}</h2>
            <table>
              <thead>
                <tr>
                  <th>Sr</th>
                  <th>Name</th>
                  <th>EFN</th>
                  <th>Site Name</th>
                  <th>Days Present</th>
                  <th>Pay Rate</th>
                  <th>Compound Dues</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </body>
        </html>
      `;
      await Print.printAsync({ html });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to generate PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePrintVoucher = async () => {
    const selectedEmployeeIds = Object.keys(expandedEmployees).filter(id => expandedEmployees[id]);
    if (selectedEmployeeIds.length === 0) return;
    
    try {
      let vouchersHtml = '';
      let allLogIds: string[] = [];
      
      selectedEmployeeIds.forEach((workerId, index) => {
        const worker = groupedData.find(w => w.empId === workerId);
        if (!worker) return;

        const advanceVal = parseFloat(advances[workerId]) || 0;
        const totalDues = worker.totalDues;
        const netPayable = totalDues - advanceVal;

        let rowsHtml = '';
        worker.sites.forEach((site: any) => {
          rowsHtml += `
            <tr>
              <td>${site.siteName}</td>
              <td>${site.shiftCode}</td>
              <td class="text-center">${site.pCount}</td>
              <td class="text-right">Rs. ${site.salaryRate}</td>
              <td class="text-right">Rs. ${Math.round(site.earning).toLocaleString()}</td>
            </tr>
          `;
        });

        allLogIds.push(...worker.sites.flatMap((s: any) => s.logIds || []));

        if (index > 0) {
          vouchersHtml += `<div style="page-break-before: always;"></div>`;
        }

        vouchersHtml += `
            <div class="page-container">
              <div class="voucher-box">
                <div class="header">PAYMENT VOUCHER</div>
              <div class="row">
                <div><span class="label">Date:</span> ${new Date().toLocaleDateString()}</div>
                <div><span class="label">Voucher No:</span> ________</div>
              </div>
              
              <table class="table">
                <thead>
                  <tr>
                    <th>Particulars</th>
                    <th class="text-right">Debit (Rs.)</th>
                    <th class="text-right">Credit (Rs.)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>${worker.name} A/c</strong><br/><small><em>(Salary Due)</em></small></td>
                    <td class="text-right">${Math.round(totalDues).toLocaleString()}</td>
                    <td class="text-right"></td>
                  </tr>
                  <tr>
                    <td>To <strong>Advance A/c</strong><br/><small><em>(Advance Deduction)</em></small></td>
                    <td class="text-right"></td>
                    <td class="text-right">${Math.round(advanceVal).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td>To <strong>Petty Cash Book</strong><br/><small><em>(Net Payable)</em></small></td>
                    <td class="text-right"></td>
                    <td class="text-right">${Math.round(netPayable).toLocaleString()}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <th class="text-right">Total</th>
                    <th class="text-right">${Math.round(totalDues).toLocaleString()}</th>
                    <th class="text-right">${Math.round(totalDues).toLocaleString()}</th>
                  </tr>
                </tfoot>
              </table>

              <div style="margin-top: 20px;">
                <span class="label">Narration:</span> Cash paid towards salary for the month of ${MONTHS[selectedMonth]} ${selectedYear}.
              </div>
              
              <table class="table" style="margin-top: 30px;">
                <thead>
                  <tr>
                    <th>Site / Project</th>
                    <th>Shift</th>
                    <th class="text-center">Days Present</th>
                    <th class="text-right">Rate</th>
                    <th class="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>

              <div class="signatures">
                <div class="sign-line">Prepared By</div>
                <div class="sign-line">Authorized Signatory</div>
                <div class="sign-line">Receiver's Signature</div>
              </div>
              </div>
            </div>
        `;
      });

      if (!vouchersHtml) return;

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
            <style>
              @page {
                size: A4 portrait;
                margin: 5mm;
              }
              body { font-family: Helvetica, Arial, sans-serif; padding: 0; margin: 0; font-size: 14px; box-sizing: border-box; }
              .page-container {
                height: 143.5mm; /* Half A4 (148.5) minus margin (5mm) */
                width: 100%;
                box-sizing: border-box;
                padding: 5px;
              }
              .voucher-box { border: 2px solid #000; padding: 15px; width: 100%; height: 100%; box-sizing: border-box; position: relative; }
              .header { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 15px; text-decoration: underline; }
              .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
              .label { font-weight: bold; }
              .table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              .table th, .table td { border: 1px solid #000; padding: 6px; text-align: left; font-size: 13px; }
              .table th { background-color: #f2f2f2; }
              .text-right { text-align: right !important; }
              .text-center { text-align: center !important; }
              .signatures { display: flex; justify-content: space-between; position: absolute; bottom: 15px; left: 15px; right: 15px; }
              .sign-line { border-top: 1px solid #000; width: 150px; text-align: center; padding-top: 5px; font-size: 13px; }
            </style>
          </head>
          <body>
            ${vouchersHtml}
          </body>
        </html>
      `;
      
      await Print.printAsync({ html });
      
      if (allLogIds.length > 0) {
        await appService.httpClient.post('service/hr/attendance/mark-paid', { logIds: allLogIds }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        fetchData();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to print voucher or mark as paid.');
    }
  };

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return groupedData;
    const lowerQuery = searchQuery.toLowerCase();
    return groupedData.filter(
      (emp) =>
        emp.name.toLowerCase().includes(lowerQuery) ||
        (emp.efn && emp.efn.toLowerCase().includes(lowerQuery))
    );
  }, [groupedData, searchQuery]);

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#f8fafc', paddingTop: insets.top, paddingBottom: insets.bottom }}>
        {/* Header styled like SitewiseAttendanceRegisterModal */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, backgroundColor: COLORS.primary, height: 60, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <TouchableOpacity onPress={onClose} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginRight: 16 }} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff' }}>Process Salary</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>Monthly Payroll</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={handlePrint}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 6 }}
            activeOpacity={0.7}
            disabled={loading || groupedData.length === 0}
          >
            {pdfLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="print" size={20} color="#fff" />}
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>Print</Text>
          </TouchableOpacity>
        </View>

        {/* Month Selector */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: isDark ? '#1e293b' : '#fff' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
            <TouchableOpacity
              onPress={() => {
                if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
                else { setSelectedMonth(m => m - 1); }
              }}
              style={{ padding: 8 }}
            >
              <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
            </TouchableOpacity>
            <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? '#fff' : '#0f172a', width: 140, textAlign: 'center' }}>
              {MONTHS[selectedMonth]} {selectedYear}
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
                else { setSelectedMonth(m => m + 1); }
              }}
              style={{ padding: 8 }}
            >
              <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
          
          {Object.values(expandedEmployees).filter(Boolean).length >= 1 && (
            <TouchableOpacity
              onPress={handlePrintVoucher}
              style={{ position: 'absolute', right: 16, backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}
            >
              <Ionicons name="print-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Print Voucher</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Search Box */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 12, backgroundColor: isDark ? '#1e293b' : '#fff', borderBottomWidth: 1, borderBottomColor: isDark ? '#334155' : '#e2e8f0' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderRadius: 8, paddingHorizontal: 12, height: 40 }}>
            <Ionicons name="search" size={18} color="#94a3b8" style={{ marginRight: 8 }} />
            <TextInput
              style={{ flex: 1, color: isDark ? '#fff' : '#0f172a', fontSize: 14 }}
              placeholder="Search employee or EFN..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Content */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={{ marginTop: 12, color: '#64748b' }}>Loading records...</Text>
          </View>
        ) : groupedData.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="document-text-outline" size={48} color="#94a3b8" />
            <Text style={{ marginTop: 8, color: '#94a3b8', fontWeight: 'bold' }}>No records found.</Text>
          </View>
        ) : (
          <FlatList
            data={filteredData}
            keyExtractor={(item) => item.empId}
            contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
            renderItem={({ item: emp, index }) => {
              const isExpanded = expandedEmployees[emp.empId] ?? false;
              return (
                <View style={{ backgroundColor: isDark ? '#1e293b' : '#fff', borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#334155' : '#e2e8f0', marginBottom: 12, overflow: 'hidden' }}>
                  {/* Tier 1: Employee Header */}
                  <TouchableOpacity
                    onPress={() => toggleEmployee(emp.empId)}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: isExpanded ? (isDark ? '#0f172a' : '#f8fafc') : 'transparent', borderBottomWidth: isExpanded ? 1 : 0, borderBottomColor: isDark ? '#334155' : '#e2e8f0' }}
                  >
                    <View style={{ borderWidth: 2, borderColor: isExpanded ? '#22c55e' : '#ef4444', borderRadius: 25, padding: 2, marginRight: 12, overflow: 'hidden' }}>
                      <FastImage
                        source={emp.photo}
                        style={{ width: 46, height: 46, borderRadius: 23 }}
                        fallbackLabel={emp.name || 'W'}
                        fallbackColor={COLORS.primary + '30'}
                        fallbackTextStyle={{ color: COLORS.primary, fontWeight: 'bold', fontSize: 16 }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: isDark ? '#fff' : '#0f172a' }}>{index + 1}. {emp.name}</Text>
                      <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 2 }}>{emp.efn ? `EFN: ${emp.efn} | ` : ''}Dues: ₹{Math.round(emp.totalDues).toLocaleString()}</Text>
                    </View>
                    
                    {isExpanded && (
                      <TextInput
                         placeholder="Adv."
                         placeholderTextColor="#94a3b8"
                         keyboardType="numeric"
                         maxLength={4}
                         value={advances[emp.empId] || ''}
                         onChangeText={(val) => setAdvances(prev => ({...prev, [emp.empId]: val}))}
                         style={{ borderWidth: 1, borderColor: '#22c55e', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, width: 60, marginRight: 12, color: isDark ? '#fff' : '#0f172a', fontSize: 13, backgroundColor: isDark ? '#1e293b' : '#fff', textAlign: 'center' }}
                      />
                    )}

                    <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#94a3b8" />
                  </TouchableOpacity>

                  {/* Tier 2: Site/Shift Breakdown */}
                  {isExpanded && (
                    <View style={{ backgroundColor: isDark ? '#1e293b' : '#f8fafc', paddingHorizontal: 12, paddingVertical: 8 }}>
                      {emp.sites.map((site: any, idx: number) => {
                        const siteKey = `${site.siteId}_${site.shiftCode}`;
                        return (
                          <View key={siteKey} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: idx < emp.sites.length - 1 ? 1 : 0, borderBottomColor: isDark ? '#334155' : '#e2e8f0' }}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#cbd5e1' : '#334155' }}>{site.siteName}</Text>
                              <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Shift: {site.shiftCode}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ fontSize: 13, fontWeight: 'bold', color: COLORS.primary }}>₹{Math.round(site.earning).toLocaleString()}</Text>
                              <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{site.pCount} P × ₹{site.salaryRate}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}


      </View>
    </Modal>
  );
};

export default ProcessModal;
