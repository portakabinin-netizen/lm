import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  FlatList,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/styles/stylesIndex';
import { appService } from '@/UtilServices/appHelper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

interface Props {
  visible: boolean;
  onClose: () => void;
  leads: any[];
  token: string;
  user: any;
}

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

export const SitewiseAttendanceRegisterModal: React.FC<Props> = ({
  visible,
  onClose,
  leads,
  token,
  user,
}) => {
  const insets = useSafeAreaInsets();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const [selectedLeadId, setSelectedLeadId] = useState<string>('__all__');
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [loading, setLoading] = useState<boolean>(false);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);

  // Selection modal visibilities
  const [siteModalVisible, setSiteModalVisible] = useState(false);
  const [monthYearModalVisible, setMonthYearModalVisible] = useState(false);

  // Single month-year selection key state and list of months from logs
  const [selectedMonthYearKey, setSelectedMonthYearKey] = useState<string>(`${currentMonth}_${currentYear}`);
  const [availableMonthYears, setAvailableMonthYears] = useState<Array<{ month: number; year: number; label: string; key: string }>>([]);

  // Filter accepted/active leads (sites)
  const activeSites = useMemo(() => {
    return leads.filter((l) => l.status === 'Accepted' || l.status === 'Engaged' || l.status === 'Tax Invoice');
  }, [leads]);

  // Selector Options lists
  const siteOptions = useMemo(() => {
    const opts = [{ label: 'All Sites', value: '__all__' }];
    activeSites.forEach((site) => {
      opts.push({
        label: site.sender_name || 'Unnamed Site',
        value: String(site._id),
      });
    });
    return opts;
  }, [activeSites]);

  const selectedMonthYearLabel = useMemo(() => {
    return `${MONTHS[selectedMonth]} ${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  const monthYearOptions = useMemo(() => {
    return availableMonthYears.map((item) => ({
      label: item.label,
      value: item.key,
    }));
  }, [availableMonthYears]);

  // Fetch available months from marked attendance logs (last 1 year to future 2 months)
  const fetchAvailableMonths = async () => {
    if (!token) return;
    try {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      oneYearAgo.setDate(1);
      oneYearAgo.setHours(0, 0, 0, 0);

      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 2);
      nextMonth.setDate(0);
      nextMonth.setHours(23, 59, 59, 999);

      const res = await appService.httpClient.get('service/hr/attendance', {
        params: {
          from_date: oneYearAgo.toISOString(),
          to_date: nextMonth.toISOString(),
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data?.success) {
        const logs = res.data.data || [];
        const uniqueKeys = new Set<string>();
        const list: Array<{ month: number; year: number; label: string; key: string }> = [];

        // Always include current month as a default
        const now = new Date();
        const curMonth = now.getMonth();
        const curYear = now.getFullYear();
        const curKey = `${curMonth}_${curYear}`;
        uniqueKeys.add(curKey);
        list.push({
          month: curMonth,
          year: curYear,
          label: `${MONTHS[curMonth]} ${curYear}`,
          key: curKey,
        });

        // Scan actual attendance logs for other months with marked attendance
        logs.forEach((log: any) => {
          const logDate = new Date(log.date || log.dutyStart);
          const m = logDate.getMonth();
          const y = logDate.getFullYear();
          const key = `${m}_${y}`;
          if (!uniqueKeys.has(key)) {
            uniqueKeys.add(key);
            list.push({
              month: m,
              year: y,
              label: `${MONTHS[m]} ${y}`,
              key: key,
            });
          }
        });

        // Sort descending (newest first)
        list.sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.month - a.month;
        });

        setAvailableMonthYears(list);

        // Keep current selection valid or reset to latest
        if (!selectedMonthYearKey || !uniqueKeys.has(selectedMonthYearKey)) {
          setSelectedMonthYearKey(curKey);
          setSelectedMonth(curMonth);
          setSelectedYear(curYear);
        }
      }
    } catch (err) {
      console.error('[Fetch Available Months] Error:', err);
    }
  };

  // Run fetchAvailableMonths when modal becomes visible
  useEffect(() => {
    if (visible && token) {
      fetchAvailableMonths();
    }
  }, [visible, token]);

  // Set default selected site on mount
  useEffect(() => {
    if (activeSites.length > 0 && !selectedLeadId) {
      setSelectedLeadId('__all__');
    }
  }, [activeSites, selectedLeadId]);

  // Sync data for the selected calendar month
  const syncAttendanceForMonth = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const startOfMonth = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0);
      const endOfMonth = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);

      const res = await appService.httpClient.get('service/hr/attendance', {
        params: {
          from_date: startOfMonth.toISOString(),
          to_date: endOfMonth.toISOString(),
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data?.success) {
        setAttendanceLogs(res.data.data || []);
      } else {
        appService.showToast(res.data?.message || 'Failed to fetch attendance logs', 'Error');
      }
    } catch (err: any) {
      console.error('[Sync Register] Error:', err);
      appService.showToast(err.response?.data?.message || err.message || 'Error syncing data', 'Error');
    } finally {
      setLoading(false);
    }
  };

  // Run sync when selected month, year, or modal becomes visible
  useEffect(() => {
    if (visible && token) {
      syncAttendanceForMonth();
    }
  }, [visible, selectedMonth, selectedYear, token]);

  // Get number of days in selected month
  const daysCount = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedMonth, selectedYear]);

  // Group logs by site, and then by worker
  const groupedBySite = useMemo(() => {
    const monthLogs = attendanceLogs.filter((log) => {
      const d = new Date(log.date || log.dutyStart);
      const isCorrectMonth = d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
      const hoursWorked = Number(log.hoursWorked) || 0;
      return isCorrectMonth && hoursWorked >= 4;
    });

    const siteMap = new Map<string, { siteId: string; siteName: string; logs: any[] }>();

    monthLogs.forEach((log) => {
      const siteId = String(log.leadId?._id || log.leadId || '__no_site__');
      if (selectedLeadId !== '__all__' && siteId !== selectedLeadId) return;

      const siteName = log.site_name || log.leadId?.sender_name || 'HQ / Remote';
      if (!siteMap.has(siteId)) {
        siteMap.set(siteId, { siteId, siteName, logs: [] });
      }
      siteMap.get(siteId)!.logs.push(log);
    });

    const result: Array<{
      siteId: string;
      siteName: string;
      workers: Array<{
        workerId: string;
        name: string;
        enrollmentNo: string;
        shiftCode: string;
        rate: number;
        due: number;
        dailyAttendance: Record<number, { present: boolean; shiftCode?: string; dailyEarn?: number; isDoubleDuty?: boolean }>;
      }>;
    }> = [];

    siteMap.forEach((group) => {
      const workerMap = new Map<
        string,
        {
          workerId: string;
          name: string;
          enrollmentNo: string;
          shiftCode: string;
          rate: number;
          due: number;
          dailyAttendance: Record<number, { present: boolean; shiftCode?: string; dailyEarn?: number; isDoubleDuty?: boolean }>;
        }
      >();

      group.logs.forEach((log) => {
        let rawEmpId = '';
        if (log.employeeId && typeof log.employeeId === 'object') {
          rawEmpId = String(log.employeeId._id || log.employeeId.id || '');
        } else {
          rawEmpId = String(log.employeeId || '');
        }
        if (rawEmpId === '[object Object]') rawEmpId = '';

        const empName = log.employeeId?.name || log.employee_name || 'Unknown Worker';
        const normalizedName = empName.toLowerCase().trim();
        
        let targetKey = rawEmpId || normalizedName;

        // Merge duplicate accounts of the same person based on normalized name
        for (const [key, w] of workerMap.entries()) {
          if (w.name.toLowerCase().trim() === normalizedName || (rawEmpId && key === rawEmpId)) {
            targetKey = key;
            break;
          }
        }

        if (!targetKey) return;

        const enrollmentNo = log.employeeId?.enrollment_no || '';
        const shiftCode = log.shiftCode || log.employeeId?.selectedShift || 'G';
        const rate = log.rate || log.dailyRate || log.employeeId?.employmentHistory?.find((h: any) => h.active)?.daily_rate || 0;
        const dailyEarn = log.dailyEarn || 0;

        if (!workerMap.has(targetKey)) {
          workerMap.set(targetKey, {
            workerId: rawEmpId || targetKey,
            name: empName,
            enrollmentNo,
            shiftCode,
            rate,
            due: 0,
            dailyAttendance: {},
          });
        }

        const record = workerMap.get(targetKey)!;
        if (rate > 0 && record.rate === 0) record.rate = rate; // keep positive rate

        const logDate = new Date(log.date || log.dutyStart);
        const day = logDate.getDate();

        const isPresent = log.status !== 'Absent' && log.status !== 'Leave';
        if (isPresent) {
          const logShiftCode = log.shiftCode || record.shiftCode;
          if (record.dailyAttendance[day]) {
            if (record.dailyAttendance[day].shiftCode !== logShiftCode) {
              record.dailyAttendance[day].isDoubleDuty = true;
            }
          } else {
            record.dailyAttendance[day] = {
              present: true,
              shiftCode: logShiftCode,
              dailyEarn,
              isDoubleDuty: false,
            };
          }
          record.due += dailyEarn;
        }
      });

      const sortedWorkers = Array.from(workerMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );

      // Calculate due strictly as totalPresent * rate to match the register columns
      sortedWorkers.forEach((w) => {
        let totalPresent = 0;
        Object.keys(w.dailyAttendance).forEach((dayKey) => {
          const dayNum = Number(dayKey);
          const att = w.dailyAttendance[dayNum];
          if (att && att.present) {
            totalPresent += att.isDoubleDuty ? 2 : 1;
          }
        });
        w.due = totalPresent * w.rate;
      });

      result.push({
        siteId: group.siteId,
        siteName: group.siteName,
        workers: sortedWorkers,
      });
    });

    return result.sort((a, b) => a.siteName.localeCompare(b.siteName));
  }, [attendanceLogs, selectedLeadId, selectedMonth, selectedYear]);

  // Compute total unique workers showing in the grid
  const totalWorkersCount = useMemo(() => {
    return groupedBySite.reduce((acc, curr) => acc + curr.workers.length, 0);
  }, [groupedBySite]);

  // Print attendance register as landscape PDF
  const handlePrint = async () => {
    if (!selectedLeadId) {
      appService.showToast('Please select a site first', 'Error');
      return;
    }

    const clientName =
      selectedLeadId === '__all__'
        ? 'All Sites'
        : (leads.find((l) => String(l._id) === selectedLeadId)?.sender_name || 'Project Site');
    const monthHeading = `${MONTHS[selectedMonth].toUpperCase()} ${selectedYear}`;
    const corporateName = user?.corporateName || 'Corporate Account';

    // Generate day headers for print (1 to daysCount)
    let dayHeadersHtml = '';
    for (let d = 1; d <= daysCount; d++) {
      dayHeadersHtml += `<th style="width: 2.2%; font-size: 8px;">${d}</th>`;
    }

    // Generate rows with Site Block divider header rows for All Sites
    let rowsHtml = '';
    groupedBySite.forEach((group) => {
      if (selectedLeadId === '__all__') {
        rowsHtml += `
          <tr style="background-color: #f1f5f9; page-break-inside: avoid;">
            <td colspan="${daysCount + 6}" style="text-align: left; font-weight: 800; padding: 6px 8px; font-size: 8.5px; border: 0.5px solid #475569;">
              🏢 Site: ${group.siteName} · ${group.workers.length} Workers
            </td>
          </tr>
        `;
      }

      group.workers.forEach((w, idx) => {
        let daysCellsHtml = '';
        let totalPresent = 0;

        for (let d = 1; d <= daysCount; d++) {
          const att = w.dailyAttendance[d];
          if (att && att.present) {
            if (att.isDoubleDuty) {
              totalPresent += 2;
              daysCellsHtml += `<td class="double-duty-cell">PP-</td>`;
            } else {
              totalPresent++;
              daysCellsHtml += `<td class="present-cell">P</td>`;
            }
          } else {
            daysCellsHtml += `<td class="absent-cell">-</td>`;
          }
        }

        rowsHtml += `
          <tr style="page-break-inside: avoid;">
            <td style="font-size: 8px;">${idx + 1}</td>
            <td class="name-col" style="font-size: 8px;">
              ${w.name} ${w.enrollmentNo ? `(${w.enrollmentNo})` : ''}
            </td>
            <td style="font-size: 8px; font-weight: bold;">${w.shiftCode}</td>
            ${daysCellsHtml}
            <td class="total-col" style="font-size: 8px; font-weight: bold;">${totalPresent}</td>
            <td style="font-size: 8px; font-weight: bold;">₹${w.rate.toFixed(0)}</td>
            <td class="total-col" style="font-size: 8px; font-weight: bold; color: #16a34a;">₹${w.due.toFixed(0)}</td>
          </tr>
        `;
      });
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Attendance Register - ${clientName}</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            color: #1e293b;
          }
          .container {
            width: 100%;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 5px;
          }
          th, td {
            border: 0.5px solid #475569;
            padding: 3px 1px;
            text-align: center;
            font-size: 7.5px;
          }
          th {
            background-color: #f1f5f9;
            font-weight: 800;
            color: #1e293b;
            text-transform: uppercase;
          }
          .name-col {
            text-align: left;
            padding-left: 4px;
            font-weight: 700;
            white-space: nowrap;
            max-width: 130px;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .present-cell {
            color: #16a34a;
            font-weight: 800;
            background-color: #f0fdf4;
          }
          .double-duty-cell {
            color: #0284c7;
            font-weight: 800;
            background-color: #e0f2fe;
          }
          .absent-cell {
            color: #cbd5e1;
          }
          .total-col {
            font-weight: 800;
            background-color: #f8fafc;
            color: #0f172a;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <table>
            <thead>
              <!-- Corporate header repeating once per print page -->
              <tr>
                <th colspan="${daysCount + 6}" style="background-color: white; border: none; font-size: 16px; font-weight: 800; text-transform: uppercase; padding-bottom: 4px; text-align: center; color: #0f172a;">
                  ${corporateName}
                </th>
              </tr>
              <tr>
                <th colspan="${daysCount + 6}" style="background-color: white; border: none; padding-bottom: 8px;">
                  <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; border-bottom: 1.5px solid #0f172a; padding-bottom: 4px; color: #334155;">
                    <div>Client/Site: ${clientName}</div>
                    <div>Month: ${monthHeading}</div>
                  </div>
                </th>
              </tr>
              <tr>
                <th style="width: 3%;">S.No</th>
                <th class="name-col" style="width: 16%;">Worker Name</th>
                <th style="width: 4%;">Shift</th>
                ${dayHeadersHtml}
                <th style="width: 5%;">Total</th>
                <th style="width: 5%;">Rate</th>
                <th style="width: 6%;">Due</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });

      if (Platform.OS === 'ios') {
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      } else {
        await Print.printAsync({ uri });
      }
    } catch (error) {
      console.error('[Print Register] Failed:', error);
      appService.showToast('Failed to generate print view', 'Error');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* padding set to safe area insets to keep header and content between top and bottom system menus */}
      <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.container}>
          {/* Header styled as other screens in the app */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.title}>Attendance Register</Text>
              <Text style={styles.subtitle}>Sitewise Monthly Tracker</Text>
            </View>
            <TouchableOpacity
              onPress={handlePrint}
              style={styles.printBtn}
              activeOpacity={0.7}
              disabled={loading || totalWorkersCount === 0}
            >
              <Ionicons name="print" size={20} color="#fff" />
              <Text style={styles.printBtnText}>Print</Text>
            </TouchableOpacity>
          </View>

          {/* Selectors Area (Sites Picker full width, month/year/sync compact side-by-side to save space) */}
          <View style={styles.selectorsCard}>
            <View style={styles.pickerContainer}>
              <TouchableOpacity
                style={styles.dropdownBtn}
                onPress={() => setSiteModalVisible(true)}
                activeOpacity={0.7}
              >
                <View style={styles.dropdownBtnContent}>
                  <Ionicons name="business" size={16} color={COLORS.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.dropdownBtnText} numberOfLines={1}>
                    {selectedLeadId === '__all__'
                      ? 'All Sites'
                      : (activeSites.find((s) => String(s._id) === selectedLeadId)?.sender_name || 'Select Site')}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={14} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.monthYearRow}>
              {/* Single Month-Year Selector */}
              <TouchableOpacity
                style={[styles.dropdownBtn, { flex: 1 }]}
                onPress={() => setMonthYearModalVisible(true)}
                activeOpacity={0.7}
              >
                <View style={styles.dropdownBtnContent}>
                  <Ionicons name="calendar" size={16} color={COLORS.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.dropdownBtnText} numberOfLines={1}>
                    {selectedMonthYearLabel}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={14} color="#64748b" />
              </TouchableOpacity>

              {/* Compact Icon-only Sync Button */}
              <TouchableOpacity
                onPress={syncAttendanceForMonth}
                style={styles.compactSyncIconBtn}
                disabled={loading}
                activeOpacity={0.7}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="sync" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Grid Area - Wrapped in single vertical ScrollView to ensure aligned scrolling */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Syncing month data...</Text>
            </View>
          ) : totalWorkersCount === 0 ? (
            <View style={styles.center}>
              <Ionicons name="calendar-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>No attendance records found for this site & month.</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true}>
              <View style={styles.gridContainer}>
                {/* Left Side: Fixed Workers Column */}
                <View style={styles.fixedColumnContainer}>
                  {/* Header */}
                  <View style={styles.fixedHeaderCell}>
                    <Text style={styles.headerText}>Worker Name</Text>
                  </View>
                  {/* Data Rows, Grouped by Site */}
                  {groupedBySite.map((group) => (
                    <React.Fragment key={group.siteId}>
                      {/* Site Divider Header Row in Fixed Column */}
                      {selectedLeadId === '__all__' && (
                        <View style={styles.fixedSiteHeaderRow}>
                          <Text style={styles.siteHeaderText} numberOfLines={1}>
                            🏢 {group.siteName}
                          </Text>
                        </View>
                      )}

                      {/* Worker Names List */}
                      {group.workers.map((w, wIdx) => (
                        <View
                          key={w.workerId}
                          style={[styles.fixedDataCell, wIdx % 2 === 1 && styles.altRow]}
                        >
                          <Text style={styles.workerNameText} numberOfLines={1}>
                            {wIdx + 1}. {w.name} {w.enrollmentNo ? `(${w.enrollmentNo})` : ''}
                          </Text>
                          <Text style={styles.workerEnrollmentText} numberOfLines={1}>
                            {w.enrollmentNo || 'Not Enrolled'}
                          </Text>
                        </View>
                      ))}
                    </React.Fragment>
                  ))}
                </View>

                {/* Right Side: Horizontal Scrollable Grid */}
                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <View style={styles.scrollableContent}>
                    {/* Header Row */}
                    <View style={styles.scrollHeaderRow}>
                      <View style={styles.shiftHeaderCell}>
                        <Text style={styles.headerText}>Shift</Text>
                      </View>
                      {Array.from({ length: daysCount }).map((_, i) => (
                        <View key={i} style={styles.dayHeaderCell}>
                          <Text style={styles.headerText}>{i + 1}</Text>
                        </View>
                      ))}
                      <View style={styles.totalHeaderCell}>
                        <Text style={styles.headerText}>Total</Text>
                      </View>
                      <View style={styles.rateHeaderCell}>
                        <Text style={styles.headerText}>Rate</Text>
                      </View>
                      <View style={styles.dueHeaderCell}>
                        <Text style={styles.headerText}>Due</Text>
                      </View>
                    </View>

                    {/* Data Rows Grouped by Site */}
                    {groupedBySite.map((group) => (
                      <React.Fragment key={group.siteId}>
                        {/* Site Divider Header Row in Scrollable Grid */}
                        {selectedLeadId === '__all__' && (
                          <View
                            style={[
                              styles.scrollSiteHeaderRow,
                              { width: 228 + 32 * daysCount },
                            ]}
                          >
                            <Text style={styles.scrollSiteHeaderText}>
                              Site: {group.siteName} · {group.workers.length} Workers
                            </Text>
                          </View>
                        )}

                        {/* Worker Daily Grid */}
                        {group.workers.map((w, wIdx) => {
                          let totalPresent = 0;
                          return (
                            <View
                              key={w.workerId}
                              style={[styles.scrollDataRow, wIdx % 2 === 1 && styles.altRow]}
                            >
                              {/* Shift Code Badge */}
                              <View style={styles.shiftCell}>
                                <View style={styles.shiftBadge}>
                                  <Text style={styles.shiftBadgeText}>{w.shiftCode}</Text>
                                </View>
                              </View>

                              {/* Daily attendance markers */}
                              {Array.from({ length: daysCount }).map((_, i) => {
                                const day = i + 1;
                                const att = w.dailyAttendance[day];
                                const isPresent = att && att.present;
                                if (isPresent) {
                                  totalPresent += att.isDoubleDuty ? 2 : 1;
                                }

                                return (
                                  <View key={i} style={styles.dayCell}>
                                    {isPresent ? (
                                      <View style={[styles.presentBadge, att.isDoubleDuty && styles.doubleDutyBadge]}>
                                        <Text style={[styles.presentBadgeText, att.isDoubleDuty && styles.doubleDutyBadgeText]}>{att.isDoubleDuty ? 'PP-' : 'P'}</Text>
                                      </View>
                                    ) : (
                                      <Text style={styles.absentText}>-</Text>
                                    )}
                                  </View>
                                );
                              })}

                              {/* Total Present Days count */}
                              <View style={styles.totalCell}>
                                <Text style={styles.totalText}>{totalPresent}</Text>
                              </View>

                              {/* Daily Rate */}
                              <View style={styles.rateCell}>
                                <Text style={styles.rateText}>₹{w.rate.toFixed(0)}</Text>
                              </View>

                              {/* Total Due Amount */}
                              <View style={styles.dueCell}>
                                <Text style={styles.dueText}>₹{w.due.toFixed(0)}</Text>
                              </View>
                            </View>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </ScrollView>
          )}

          {/* Custom Selection Modals */}
          <DropdownSelectorModal
            visible={siteModalVisible}
            title="Select Project Site"
            options={siteOptions}
            selectedValue={selectedLeadId}
            onSelect={(val) => setSelectedLeadId(val)}
            onClose={() => setSiteModalVisible(false)}
            showSearch
            searchPlaceholder="Search project site..."
          />

          <DropdownSelectorModal
            visible={monthYearModalVisible}
            title="Select Month & Year"
            options={monthYearOptions}
            selectedValue={selectedMonthYearKey}
            onSelect={(val) => {
              setSelectedMonthYearKey(val);
              const [mStr, yStr] = val.split('_');
              setSelectedMonth(Number(mStr));
              setSelectedYear(Number(yStr));
            }}
            onClose={() => setMonthYearModalVisible(false)}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: COLORS.primary,
    height: 60,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
  },
  subtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '800',
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
    height: 40,
    justifyContent: 'center',
  },
  printBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  selectorsCard: {
    margin: 6,
    padding: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  monthYearRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  pickerContainer: {
    flexDirection: 'column',
  },
  pickerLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  pickerWrapper: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    height: 38,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  picker: {
    fontSize: 12,
    color: '#1e293b',
    backgroundColor: 'transparent',
    width: '100%',
    ...Platform.select({
      android: {
        height: 38,
      },
    }),
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  infoText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  infoHighlight: {
    fontWeight: '800',
    color: COLORS.primary,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  syncBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  previewHeader: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  previewCorpName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  previewMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  previewMetaText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    flex: 1,
  },
  previewMetaTextRight: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'right',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    fontWeight: '600',
  },
  gridContainer: {
    flexDirection: 'row',
    marginHorizontal: 8,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  fixedColumnContainer: {
    width: 110,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#cbd5e1',
    zIndex: 10,
  },
  fixedHeaderCell: {
    height: 40,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    paddingLeft: 8,
  },
  headerText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  fixedSiteHeaderRow: {
    height: 32,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  siteHeaderText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#334155',
    textTransform: 'uppercase',
  },
  fixedDataCell: {
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  workerNameText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e293b',
  },
  workerEnrollmentText: {
    fontSize: 8,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  altRow: {
    backgroundColor: '#f8fafc',
  },
  scrollableContent: {
    flexDirection: 'column',
  },
  scrollHeaderRow: {
    flexDirection: 'row',
    height: 40,
    backgroundColor: '#0f172a',
  },
  shiftHeaderCell: {
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#334155',
  },
  dayHeaderCell: {
    width: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#334155',
  },
  totalHeaderCell: {
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#334155',
    backgroundColor: '#1e293b',
  },
  rateHeaderCell: {
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#334155',
    backgroundColor: '#1e293b',
  },
  dueHeaderCell: {
    width: 70,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e293b',
  },
  scrollSiteHeaderRow: {
    height: 32,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    paddingLeft: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  scrollSiteHeaderText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#475569',
    textTransform: 'uppercase',
  },
  scrollDataRow: {
    flexDirection: 'row',
    height: 48,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  shiftCell: {
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#e2e8f0',
  },
  shiftBadge: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  shiftBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  dayCell: {
    width: 32,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#e2e8f0',
  },
  presentBadge: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  presentBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  doubleDutyBadge: {
    backgroundColor: '#0ea5e9',
  },
  doubleDutyBadgeText: {
    color: '#fff',
  },
  absentText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  totalCell: {
    width: 50,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  totalText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0f172a',
  },
  rateCell: {
    width: 60,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#e2e8f0',
  },
  rateText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  dueCell: {
    width: 70,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  dueText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#16a34a',
  },
  compactSyncBtn: {
    flex: 1.2,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 38,
  },
  compactSyncBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  dropdownBtn: {
    height: 36,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    width: '100%',
  },
  dropdownBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 4,
  },
  dropdownBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
  },
  compactSyncIconBtn: {
    width: 36,
    height: 36,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ── Reusable Dropdown Selector Modal Component ─────────────────────────────
interface SelectorOption {
  label: string;
  value: any;
  sublabel?: string;
}

interface DropdownSelectorModalProps {
  visible: boolean;
  title: string;
  options: SelectorOption[];
  selectedValue: any;
  onSelect: (value: any) => void;
  onClose: () => void;
  showSearch?: boolean;
  searchPlaceholder?: string;
}

const DropdownSelectorModal: React.FC<DropdownSelectorModalProps> = ({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
  showSearch = false,
  searchPlaceholder = 'Search...',
}) => {
  const insets = useSafeAreaInsets();
  const [searchText, setSearchText] = useState('');

  const filteredOptions = useMemo(() => {
    if (!searchText.trim()) return options;
    const q = searchText.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q))
    );
  }, [options, searchText]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[selectorStyles.modalOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={selectorStyles.modalContainer}>
          {/* Header */}
          <View style={selectorStyles.modalHeader}>
            <TouchableOpacity onPress={onClose} style={selectorStyles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={selectorStyles.modalTitle}>{title}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Search box */}
          {showSearch && (
            <View style={selectorStyles.searchContainer}>
              <Ionicons name="search" size={18} color="#94a3b8" style={{ marginRight: 8 }} />
              <TextInput
                style={selectorStyles.searchInput}
                placeholder={searchPlaceholder}
                placeholderTextColor="#94a3b8"
                value={searchText}
                onChangeText={setSearchText}
                autoFocus
              />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={() => setSearchText('')}>
                  <Ionicons name="close-circle" size={18} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Options List */}
          <FlatList
            data={filteredOptions}
            keyExtractor={(item) => String(item.value)}
            renderItem={({ item }) => {
              const isSelected = item.value === selectedValue;
              return (
                <TouchableOpacity
                  style={[
                    selectorStyles.optionItem,
                    isSelected && selectorStyles.optionItemSec,
                  ]}
                  onPress={() => {
                    onSelect(item.value);
                    onClose();
                    setSearchText('');
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        selectorStyles.optionLabel,
                        isSelected && selectorStyles.optionLabelSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {item.sublabel ? (
                      <Text style={selectorStyles.optionSublabel}>{item.sublabel}</Text>
                    ) : null}
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          />
        </View>
      </View>
    </Modal>
  );
};

const selectorStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  modalHeader: {
    height: 56,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    marginTop: 8,
  },
  optionItemSec: {
    borderColor: COLORS.primary,
    backgroundColor: '#eff6ff',
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  optionLabelSelected: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  optionSublabel: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
});
