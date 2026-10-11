import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { appService } from '@/UtilServices/appHelper';
import { COLORS } from '@/styles/stylesIndex';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Types ───────────────────────────────────────────────────────────────────
interface SiteAttendance {
  siteId: string;
  siteName: string;
  presentDays: number;
  totalHours: number;
  rate: number; // rate used for this site's logs
  earning: number; // sum of dailyEarn for this site
}

interface SheetRow {
  id: string;
  ledgerId: string | undefined;
  enrollmentNo: string;
  name: string;
  role: string;
  // multi-site breakdown
  sites: SiteAttendance[];
  // computed totals
  totalPresentDays: number;
  totalHours: number;
  consolidatedDues: number; // sum of all site earnings
  advance: number;
  penalty: number;
  articles: number;
  netDeduction: string; // editable field
}

interface SalaryRegisterModalProps {
  visible: boolean;
  onClose: () => void;
  token: string;
  user: any;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const isPresent = (log: any) => {
  const hrs = Number(log.hoursWorked) || 0;
  const notAbsent = log.status !== 'Absent' && log.status !== 'Leave';
  return notAbsent && hrs >= 4;
};

const getSiteId = (log: any): string =>
  typeof log.leadId === 'object'
    ? String(log.leadId?._id || log.leadId?.id || '__none__')
    : String(log.leadId || '__none__');

const getSiteName = (log: any, allLeads: any[]): string => {
  const sId = getSiteId(log);
  if (sId === '__none__') return log.site_name || 'HQ / Remote';
  const found = allLeads.find((l: any) => String(l._id || l.id) === sId);
  return (
    found?.displayName ||
    found?.sender_name ||
    found?.name ||
    (typeof log.leadId === 'object'
      ? log.leadId?.displayName || log.leadId?.sender_name
      : undefined) ||
    log.site_name ||
    'Site'
  );
};

// ── Component ─────────────────────────────────────────────────────────────────
const SalaryRegisterModal: React.FC<SalaryRegisterModalProps> = ({
  visible,
  onClose,
  token,
  user,
}) => {
  const isDark = useColorScheme() === 'dark';
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState<SheetRow[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [currentVoucherId, setCurrentVoucherId] = useState<string | null>(null);
  const [voucherDate, setVoucherDate] = useState<Date>(new Date());
  const [pdfLoading, setPdfLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const webviewRef = React.useRef<any>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewOrientation, setPreviewOrientation] = useState<any>(
    Print.Orientation.portrait
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Fetch & Compile ─────────────────────────────────────────────────────────
  const fetchAndCompileRegister = async () => {
    setLoading(true);
    try {
      const startOfMonth = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0);
      const endOfMonth = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);

      const [empRes, attRes, masterRes, vouchersRes, leadsRes] = await Promise.all([
        appService.httpClient.get('service/hr/employees', {
          params: { all: 'true' },
          headers: { Authorization: `Bearer ${token}` },
        }),
        appService.httpClient.get('service/hr/attendance', {
          params: { from_date: startOfMonth.toISOString(), to_date: endOfMonth.toISOString() },
          headers: { Authorization: `Bearer ${token}` },
        }),
        appService.httpClient
          .get('finance/master', { headers: { Authorization: `Bearer ${token}` } })
          .catch(() => ({ data: {} })),
        appService.httpClient
          .get('finance/vouchers', {
            params: { type: 'Journal' },
            headers: { Authorization: `Bearer ${token}` },
          })
          .catch(() => ({ data: { data: [] } })),
        appService.httpClient
          .get('service/leads/list', { headers: { Authorization: `Bearer ${token}` } })
          .catch(() => ({ data: { data: [] } })),
      ]);

      const employees: any[] = Array.isArray(empRes.data?.data)
        ? empRes.data.data
        : Array.isArray(empRes.data)
          ? empRes.data
          : [];
      const logs: any[] = Array.isArray(attRes.data?.data)
        ? attRes.data.data
        : Array.isArray(attRes.data)
          ? attRes.data
          : [];
      const master = masterRes.data?.data || masterRes.data || {};
      const vouchers: any[] = Array.isArray(vouchersRes.data?.data)
        ? vouchersRes.data.data
        : Array.isArray(vouchersRes.data)
          ? vouchersRes.data
          : [];
      const allLeads: any[] = Array.isArray(leadsRes.data?.data)
        ? leadsRes.data.data
        : Array.isArray(leadsRes.data)
          ? leadsRes.data
          : [];
      const ledgers: any[] = master.ledgers || [];

      console.log('[SalaryRegister] employees:', employees.length, '| logs:', logs.length);
      if (logs.length > 0) console.log('[SalaryRegister] sample log:', JSON.stringify(logs[0]));

      const narrationPrefix = `Salary dues after recovered of advance,pentalty and articals for the month ${MONTHS[selectedMonth]} ${selectedYear}`;
      const existingVoucher = vouchers.find((v: any) => v.narration?.includes(narrationPrefix));
      if (existingVoucher) {
        setCurrentVoucherId(existingVoucher._id || existingVoucher.id);
        if (existingVoucher.date) setVoucherDate(new Date(existingVoucher.date));
      } else {
        setCurrentVoucherId(null);
        setVoucherDate(new Date());
      }

      const compiled: SheetRow[] = [];

      for (const emp of employees) {
        const empId = String(emp._id || emp.id || '');
        if (!empId) continue;

        // Filter logs belonging to this employee
        const empLogs = logs.filter((log: any) => {
          const logEmpId =
            typeof log.employeeId === 'object'
              ? String(log.employeeId?._id || log.employeeId?.id || '')
              : String(log.employeeId || '');
          return logEmpId === empId;
        });

        if (empLogs.length === 0) continue;

        // Group by site using leadId (object_id)
        const siteMap = new Map<string, { siteName: string; logs: any[] }>();
        for (const log of empLogs) {
          const sId = getSiteId(log);
          const sName = getSiteName(log, allLeads);
          if (!siteMap.has(sId)) siteMap.set(sId, { siteName: sName, logs: [] });
          siteMap.get(sId)!.logs.push(log);
        }

        const baseRate = emp.rate || emp.dailyRate || emp.monthlyRate || 0;

        const sites: SiteAttendance[] = Array.from(siteMap.entries()).map(
          ([sId, { siteName, logs: sLogs }]) => {
            const presentLogs = sLogs.filter(isPresent);
            const presentDays = presentLogs.length;
            const totalHours = sLogs.reduce((a, l) => a + (Number(l.hoursWorked) || 0), 0);
            const rate =
              sLogs.find((l) => l.rate || l.dailyRate)?.rate ||
              sLogs.find((l) => l.rate || l.dailyRate)?.dailyRate ||
              baseRate;
            const earning = presentLogs.reduce(
              (a, l) => a + (l.dailyEarn || l.rate || baseRate || 0),
              0
            );
            return {
              siteId: sId,
              siteName,
              presentDays,
              totalHours: parseFloat(totalHours.toFixed(1)),
              rate,
              earning: Math.round(earning),
            };
          }
        );

        const totalPresentDays = sites.reduce((a, s) => a + s.presentDays, 0);
        const totalHours = sites.reduce((a, s) => a + s.totalHours, 0);
        const consolidatedDues = sites.reduce((a, s) => a + s.earning, 0);

        const staffLedger = ledgers.find(
          (l: any) => l.refType === 'Staff' && String(l.refId) === empId
        );
        const advance = staffLedger ? staffLedger.currentBalance || 0 : 0;

        let existingNetDeduction = 0;
        if (existingVoucher) {
          const staffEntry = existingVoucher.entries?.find(
            (e: any) => String(e.ledgerId) === String(staffLedger?._id)
          );
          if (staffEntry)
            existingNetDeduction = Math.round(consolidatedDues) - (staffEntry.credit || 0);
        }

        compiled.push({
          id: empId,
          ledgerId: staffLedger?._id,
          enrollmentNo: emp.enrollment_no || 'N/A',
          name: emp.name,
          role: emp.role || 'Worker',
          sites,
          totalPresentDays,
          totalHours: parseFloat(totalHours.toFixed(1)),
          consolidatedDues,
          advance,
          penalty: 0,
          articles: 0,
          netDeduction: existingNetDeduction > 0 ? String(existingNetDeduction) : '',
        });
      }

      setSheet(compiled);
    } catch (e) {
      console.warn('[SalaryRegister] fetch error:', e);
      Alert.alert('Error', 'Failed to load salary register data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchAndCompileRegister();
      setExpandedIds(new Set());
    }
  }, [visible, selectedMonth, selectedYear]);

  const handleUpdateDeduction = (id: string, val: string) => {
    setSheet((prev) => prev.map((row) => (row.id === id ? { ...row, netDeduction: val } : row)));
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});

  // ── Post Voucher ────────────────────────────────────────────────────────────
  const handlePostVoucher = async () => {
    try {
      const masterRes = await appService.httpClient.get('finance/master', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ledgers = masterRes.data?.data?.ledgers || [];
      const salaryLedger = ledgers.find(
        (l: any) =>
          l.ledgerName?.toLowerCase().includes('salary') &&
          (l.ledgerName?.toLowerCase().includes('wages') ||
            l.ledgerName?.toLowerCase().includes('expense'))
      );
      const salaryLedgerId = salaryLedger?._id || 'salary_wages';

      let totalNetPay = 0;
      const entries: any[] = [];

      for (const row of sheet) {
        if (!row.ledgerId) continue;
        const netD = parseFloat(row.netDeduction) || 0;
        const netPay = row.consolidatedDues - netD;
        if (netPay <= 0) continue;
        totalNetPay += netPay;
        entries.push({
          ledgerId: row.ledgerId,
          ledgerName: row.name,
          accountType: 'Staff',
          debit: 0,
          credit: netPay,
        });
      }

      if (entries.length === 0) {
        Alert.alert('Nothing to post', 'No staff has positive net pay dues.');
        return;
      }

      entries.unshift({
        ledgerId: salaryLedgerId,
        ledgerName: salaryLedger?.ledgerName || 'Salary & Wages',
        accountType: 'Category',
        debit: totalNetPay,
        credit: 0,
      });

      const narration = `Salary dues after recovered of advance,pentalty and articals for the month ${MONTHS[selectedMonth]} ${selectedYear}`;
      const payload = { voucherType: 'Journal', date: voucherDate, narration, entries };

      if (currentVoucherId) {
        await appService.httpClient.put(`finance/vouchers/${currentVoucherId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await appService.httpClient.post('finance/vouchers', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      Alert.alert('Success', 'Salary Register posted successfully!');
      fetchAndCompileRegister();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to post voucher.');
    }
  };

  const buildSalaryRegisterHtml = () => {
    const reportDate = `${MONTHS[selectedMonth]} ${selectedYear}`;
    const corporateName = user?.corporateName || 'Our Company';
    const logoUrl =
      user?.CorpProfileImage ||
      user?.corporateLogo ||
      'https://img.icons8.com/?size=100&id=E6RfmLvxU30R&format=png&color=000000';

    const rowsHtml = sheet
      .map((row, index) => {
        const netD = parseFloat(row.netDeduction) || 0;
        const totalDed = (row.advance > 0 ? row.advance : 0) + row.penalty + row.articles;
        const balAdvance = totalDed - netD;
        const netPay = row.consolidatedDues - netD;

        // If multiple sites, render one row per site. Show Sr/Name/totals only on first site row.
        if (row.sites.length > 1) {
          return row.sites
            .map((s, si) => {
              if (si === 0) {
                return `
        <tr>
          <td style="text-align:center;">${index + 1}</td>
          <td style="font-weight:bold;color:#1e293b;">${row.name}<br/><span style="font-size:9px;color:#64748b;">${row.role} · ${row.enrollmentNo}</span></td>
          <td>${s.siteName}</td>
          <td style="text-align:center;">${s.presentDays}d / ${s.totalHours}h</td>
          <td style="text-align:right;">₹${s.rate.toLocaleString()}</td>
          <td style="text-align:right;font-weight:bold;">₹${row.consolidatedDues.toLocaleString()}</td>
          <td style="text-align:right;color:#ef4444;">₹${(row.advance > 0 ? row.advance : 0).toLocaleString()}</td>
          <td style="text-align:right;">₹${row.penalty.toLocaleString()}</td>
          <td style="text-align:right;">₹${row.articles.toLocaleString()}</td>
          <td style="text-align:right;font-weight:bold;">₹${totalDed.toLocaleString()}</td>
          <td style="text-align:right;color:#8b5cf6;">₹${netD.toLocaleString()}</td>
          <td style="text-align:right;font-weight:bold;">₹${balAdvance.toLocaleString()}</td>
          <td style="text-align:right;font-weight:bold;color:#10b981;">₹${netPay.toLocaleString()}</td>
        </tr>`;
              }
              // subsequent site rows: empty Sr/Name, then site-specific columns, then blank fillers for totals
              return `
        <tr>
          <td></td>
          <td></td>
          <td style="padding-left:16px;color:#64748b;">↳ ${s.siteName}</td>
          <td style="text-align:center;color:#64748b;">${s.presentDays}d / ${s.totalHours}h</td>
          <td style="text-align:right;color:#64748b;">₹${s.rate.toLocaleString()}</td>
          <td style="text-align:right;color:#10b981;">₹${s.earning.toLocaleString()}</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>`;
            })
            .join('');
        }

        // single-site rows
        return `
        <tr>
          <td style="text-align:center;">${index + 1}</td>
          <td style="font-weight:bold;color:#1e293b;">${row.name}<br/><span style="font-size:9px;color:#64748b;">${row.role} · ${row.enrollmentNo}</span></td>
          <td>${row.sites.length === 1 ? row.sites[0].siteName : `${row.sites.length} sites`}</td>
          <td style="text-align:center;">${row.totalPresentDays} / ${row.totalHours}h</td>
          <td style="text-align:right;">${row.sites.length === 1 ? '₹' + row.sites[0].rate.toLocaleString() : '—'}</td>
          <td style="text-align:right;font-weight:bold;">₹${row.consolidatedDues.toLocaleString()}</td>
          <td style="text-align:right;color:#ef4444;">₹${(row.advance > 0 ? row.advance : 0).toLocaleString()}</td>
          <td style="text-align:right;">₹${row.penalty.toLocaleString()}</td>
          <td style="text-align:right;">₹${row.articles.toLocaleString()}</td>
          <td style="text-align:right;font-weight:bold;">₹${totalDed.toLocaleString()}</td>
          <td style="text-align:right;color:#8b5cf6;">₹${netD.toLocaleString()}</td>
          <td style="text-align:right;font-weight:bold;">₹${balAdvance.toLocaleString()}</td>
          <td style="text-align:right;font-weight:bold;color:#10b981;">₹${netPay.toLocaleString()}</td>
        </tr>
      `;
      })
      .join('');

    const totals = sheet.reduce(
      (a, r) => ({
        days: a.days + r.totalPresentDays,
        dues: a.dues + r.consolidatedDues,
        adv: a.adv + (r.advance > 0 ? r.advance : 0),
        net: a.net + (r.consolidatedDues - (parseFloat(r.netDeduction) || 0)),
      }),
      { days: 0, dues: 0, adv: 0, net: 0 }
    );

    return `<!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
      <style>
        @page { size: A4 landscape; margin: 10mm }
        html,body{height:100%;}
        body{font-family:Helvetica,Arial,sans-serif;padding:12px;color:#1e293b;line-height:1.3;-webkit-print-color-adjust:exact}
        .export-root{transform-origin:top left;}
        /* try to scale content to fit one page when printed */
        .fit-page{transform:scale(0.9);}
        .header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #4f46e5;padding-bottom:15px;margin-bottom:25px}
        .logo{width:50px;height:50px;border-radius:10px;object-fit:contain}
        table{width:100%;border-collapse:collapse;margin-bottom:30px;font-size:11px}
        th{background:#f1f5f9;color:#475569;text-align:center;padding:10px 5px;font-size:10px;text-transform:uppercase;border-bottom:2px solid #e2e8f0}
        td{padding:7px 5px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
        tfoot td{font-weight:bold;border-top:2px solid #e2e8f0;background:#f8fafc}
      </style></head><body>
      <div class="header">
        <div>
          <div style="font-size:24px;font-weight:900;color:#334155">Salary Register</div>
          <div style="font-size:12px;color:#64748b">Month: ${reportDate} &nbsp;|&nbsp; Voucher: ${currentVoucherId || 'Draft'}</div>
        </div>
        <div style="text-align:right">
          <img src="${logoUrl}" class="logo"/>
          <div style="font-size:16px;font-weight:800;color:#4f46e5">${corporateName}</div>
        </div>
      </div>
      <div id="export-root" class="export-root fit-page">
      <table>
        <thead><tr>
          <th>Sr</th><th>Name</th><th>Site</th><th>Days/Hrs</th><th>Rate</th>
          <th>Consol. Dues</th><th>Advance</th><th>Penalty</th><th>Articles</th>
          <th>Total Ded.</th><th>Net Ded.</th><th>Bal. Adv.</th><th>Net Pay</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr>
          <td colspan="3" style="text-align:right">TOTAL</td>
          <td style="text-align:center">${totals.days}d</td>
          <td></td>
          <td style="text-align:right">₹${totals.dues.toLocaleString()}</td>
          <td style="text-align:right;color:#ef4444">₹${totals.adv.toLocaleString()}</td>
          <td colspan="5"></td>
          <td style="text-align:right;color:#10b981">₹${totals.net.toLocaleString()}</td>
        </tr></tfoot>
      </table>
      </div>
      <script>
        // helper to capture the page as image when requested via window.postMessage
        (function(){
          window.addEventListener('message', function(e){
            if (!e.data) return;
            if (e.data === 'captureImage') {
              // load html2canvas dynamically
              if (window.html2canvas) {
                window.html2canvas(document.getElementById('export-root')).then(function(canvas){
                  window.ReactNativeWebView.postMessage(canvas.toDataURL('image/png'));
                });
              } else {
                var s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                s.onload = function(){
                  window.html2canvas(document.getElementById('export-root')).then(function(canvas){
                    window.ReactNativeWebView.postMessage(canvas.toDataURL('image/png'));
                  });
                };
                document.head.appendChild(s);
              }
            }
          });
        })();
      </script>
    </body></html>`;
  };

  const handlePrint = async () => {
    if (pdfLoading) return;
    if (sheet.length === 0) {
      Alert.alert('No data', 'There is no salary register data to export.');
      return;
    }

    setPdfLoading(true);
    try {
      const html = buildSalaryRegisterHtml();
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      if (Platform.OS !== 'web') {
        await Share.share(
          {
            url: uri,
            title: `Salary Register ${MONTHS[selectedMonth]} ${selectedYear}`,
            message: `Salary Register ${MONTHS[selectedMonth]} ${selectedYear}`,
          },
          {
            dialogTitle: `Share Salary Register PDF`,
          }
        );
      } else {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Salary_Register_${MONTHS[selectedMonth]}_${selectedYear}`,
          UTI: 'com.adobe.pdf',
        });
      }
    } catch (e: any) {
      Alert.alert('Share Error', e.message || 'Failed to generate PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePreview = () => {
    if (sheet.length === 0) {
      Alert.alert('No data', 'There is no salary register data to preview.');
      return;
    }
    setPreviewHtml(buildSalaryRegisterHtml());
  };

  const handlePreviewPrint = async () => {
    if (!previewHtml) return;
    try {
      await Print.printAsync({ html: previewHtml, orientation: previewOrientation as any });
    } catch (e: any) {
      Alert.alert('Print Error', e.message || 'Failed to print preview.');
    }
  };

  const togglePreviewOrientation = () => {
    setPreviewOrientation((prev: any) =>
      prev === Print.Orientation.portrait ? Print.Orientation.landscape : Print.Orientation.portrait
    );
  };

  // ── Styles helpers ──────────────────────────────────────────────────────────
  const bg = isDark ? '#0f172a' : '#f8fafc';
  const card = isDark ? '#1e293b' : '#fff';
  const sub = isDark ? '#334155' : '#f1f5f9';
  const txt = isDark ? '#fff' : '#0f172a';
  const muted = isDark ? '#94a3b8' : '#64748b';

  // ── Column definitions (single source of truth) ────────────────────────────
  const COL = {
    sr: 40,
    name: 130,
    site: 130,
    days: 70,
    rate: 80,
    dues: 90,
    adv: 80,
    penalty: 70,
    articles: 70,
    totalDed: 80,
    netDed: 90,
    balAdv: 80,
    netPay: 90,
  };

  const BORDER = isDark ? '#334155' : '#d1d5db';
  const HEADER_BG = isDark ? '#1e3a5f' : '#1e40af';
  const ROW_BG = isDark ? '#1e293b' : '#ffffff';
  const ALT_BG = isDark ? '#172033' : '#f8fafc';
  const SUB_BG = isDark ? '#0d2d1a' : '#f0fdf4';
  const SUM_BG = isDark ? '#1a2e1a' : '#dcfce7';

  // Cell component – full Excel grid: left + right border on every cell
  const Cell = ({
    w,
    children,
    style: sty,
    center,
    right,
  }: {
    w: number;
    children: React.ReactNode;
    style?: any;
    center?: boolean;
    right?: boolean;
  }) => (
    <View
      style={[
        {
          width: w,
          borderLeftWidth: 1,
          borderLeftColor: BORDER,
          borderRightWidth: 1,
          borderRightColor: BORDER,
          paddingHorizontal: 5,
          paddingVertical: 7,
          justifyContent: 'center',
        },
        sty,
      ]}
    >
      <View style={{ alignItems: right ? 'flex-end' : center ? 'center' : 'flex-start' }}>
        {children}
      </View>
    </View>
  );

  // ── Table Header ────────────────────────────────────────────────────────────
  const TableHeader = () => {
    const hTxt = { fontWeight: 'bold' as const, fontSize: 10, color: '#ffffff' };
    return (
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: HEADER_BG,
          borderTopWidth: 1,
          borderTopColor: BORDER,
          borderBottomWidth: 2,
          borderBottomColor: '#93c5fd',
        }}
      >
        <Cell w={COL.sr} center>
          <Text style={hTxt}>Sr{'\n'}No</Text>
        </Cell>
        <Cell w={COL.name}>
          <Text style={hTxt}>Name / Role</Text>
        </Cell>
        <Cell w={COL.site}>
          <Text style={hTxt}>Site</Text>
        </Cell>
        <Cell w={COL.days} center>
          <Text style={hTxt}>Days{'\n'}/ Hrs</Text>
        </Cell>
        <Cell w={COL.rate} right>
          <Text style={hTxt}>Pay{'\n'}Rate</Text>
        </Cell>
        <Cell w={COL.dues} right>
          <Text style={{ ...hTxt, color: '#86efac' }}>Consol.{'\n'}Dues</Text>
        </Cell>
        <Cell w={COL.adv} right>
          <Text style={{ ...hTxt, color: '#fca5a5' }}>Advance{'\n'}(Dr Bal)</Text>
        </Cell>
        <Cell w={COL.penalty} right>
          <Text style={hTxt}>Penalty</Text>
        </Cell>
        <Cell w={COL.articles} right>
          <Text style={hTxt}>Articles</Text>
        </Cell>
        <Cell w={COL.totalDed} right>
          <Text style={hTxt}>Total{'\n'}Dedn.</Text>
        </Cell>
        <Cell w={COL.netDed} center>
          <Text style={{ ...hTxt, color: '#c4b5fd' }}>Net{'\n'}Deduction</Text>
        </Cell>
        <Cell w={COL.balAdv} right>
          <Text style={hTxt}>Bal.{'\n'}Advance</Text>
        </Cell>
        <Cell w={COL.netPay} right>
          <Text style={{ ...hTxt, color: '#86efac' }}>Net Pay{'\n'}Dues</Text>
        </Cell>
      </View>
    );
  };

  // ── Render Item ─────────────────────────────────────────────────────────────
  const renderItem = ({ item, index }: { item: SheetRow; index: number }) => {
    const activeNetDeduction =
      editingId === item.id ? (editingValues[item.id] ?? item.netDeduction) : item.netDeduction;
    const netD = parseFloat(activeNetDeduction) || 0;
    const totalDed = (item.advance > 0 ? item.advance : 0) + item.penalty + item.articles;
    const balAdvance = totalDed - netD;
    const netPay = item.consolidatedDues - netD;
    const expanded = expandedIds.has(item.id);
    const multiSite = item.sites.length > 1;
    const rowBg = index % 2 === 0 ? ROW_BG : ALT_BG;

    // ── Single-site: one flat row ────────────────────────────────────────────
    if (!multiSite) {
      const s = item.sites[0] || {
        siteName: '—',
        presentDays: 0,
        totalHours: 0,
        rate: 0,
        earning: 0,
      };
      return (
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: rowBg,
            borderBottomWidth: 1,
            borderBottomColor: BORDER,
          }}
        >
          <Cell w={COL.sr} center>
            <Text style={{ fontSize: 11, color: muted }}>{index + 1}</Text>
          </Cell>
          <Cell w={COL.name}>
            <Text style={{ fontWeight: 'bold', fontSize: 12, color: txt }} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={{ fontSize: 10, color: muted }}>{item.role}</Text>
            <Text style={{ fontSize: 10, color: muted }}>#{item.enrollmentNo}</Text>
          </Cell>
          <Cell w={COL.site}>
            <Text style={{ fontSize: 11, color: isDark ? '#cbd5e1' : '#334155' }} numberOfLines={2}>
              {s.siteName}
            </Text>
          </Cell>
          <Cell w={COL.days} center>
            <Text style={{ fontSize: 11, fontWeight: '600', color: txt }}>{s.presentDays}d</Text>
            <Text style={{ fontSize: 10, color: muted }}>{s.totalHours}h</Text>
          </Cell>
          <Cell w={COL.rate} right>
            <Text style={{ fontSize: 11, color: txt }}>₹{s.rate.toLocaleString()}</Text>
          </Cell>
          <Cell w={COL.dues} right>
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#10b981' }}>
              ₹{item.consolidatedDues.toLocaleString()}
            </Text>
          </Cell>
          <Cell w={COL.adv} right>
            <Text style={{ fontSize: 11, color: '#ef4444' }}>
              ₹{(item.advance > 0 ? item.advance : 0).toLocaleString()}
            </Text>
          </Cell>
          <Cell w={COL.penalty} right>
            <Text style={{ fontSize: 11, color: txt }}>₹{item.penalty.toLocaleString()}</Text>
          </Cell>
          <Cell w={COL.articles} right>
            <Text style={{ fontSize: 11, color: txt }}>₹{item.articles.toLocaleString()}</Text>
          </Cell>
          <Cell w={COL.totalDed} right>
            <Text style={{ fontSize: 11, fontWeight: 'bold', color: txt }}>
              ₹{totalDed.toLocaleString()}
            </Text>
          </Cell>
          <Cell w={COL.netDed} center>
            <Text style={{ fontSize: 10, color: muted }}>—</Text>
          </Cell>
          <Cell w={COL.balAdv} right>
            <Text
              style={{
                fontSize: 11,
                fontWeight: 'bold',
                color: balAdvance > 0 ? '#ef4444' : muted,
              }}
            >
              ₹{balAdvance.toLocaleString()}
            </Text>
          </Cell>
          <Cell w={COL.netPay} right>
            <Text
              style={{
                fontSize: 12,
                fontWeight: 'bold',
                color: netPay >= 0 ? '#10b981' : '#ef4444',
              }}
            >
              ₹{netPay.toLocaleString()}
            </Text>
          </Cell>
        </View>
      );
    }

    // ── Multi-site: merged name cell + site rows + summary row ───────────────
    // We simulate Excel-merge by using absolute positioning on the name column
    // and rendering site rows + one summary row side by side.
    const siteRowH = 44; // height per site row
    const summaryRowH = 40;
    const totalBlockH = item.sites.length * siteRowH + summaryRowH;

    return (
      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 2,
          borderBottomColor: isDark ? '#1e40af' : '#93c5fd',
          backgroundColor: rowBg,
        }}
      >
        {/* ── MERGED: Sr + Name (spans all site rows + summary row) ── */}
        <View
          style={{
            width: COL.sr + COL.name,
            borderLeftWidth: 1,
            borderLeftColor: BORDER,
            borderRightWidth: 1,
            borderRightColor: BORDER,
            height: totalBlockH,
            justifyContent: 'flex-start',
            paddingTop: 8,
          }}
        >
          <View style={{ flexDirection: 'row', paddingHorizontal: 2 }}>
            <View style={{ width: COL.sr, alignItems: 'center', paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, color: muted }}>{index + 1}</Text>
            </View>
            <View style={{ width: COL.name, paddingLeft: 6, paddingVertical: 4 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 12, color: txt }} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={{ fontSize: 10, color: muted }}>{item.role}</Text>
              <Text style={{ fontSize: 10, color: muted }}>#{item.enrollmentNo}</Text>

              <TouchableOpacity
                onPress={() => toggleExpand(item.id)}
                style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center' }}
              >
                <Ionicons
                  name={expanded ? 'chevron-up-circle' : 'chevron-down-circle'}
                  size={14}
                  color={COLORS.primary}
                />
                <Text style={{ fontSize: 10, color: COLORS.primary, marginLeft: 3 }}>
                  {expanded ? 'Collapse' : `${item.sites.length} Sites`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── RIGHT SIDE: site rows + summary ── */}
        <View style={{ flex: 1 }}>
          {/* Site breakdown rows (always visible for multi-site) */}
          {item.sites.map((s, si) => (
            <View
              key={s.siteId + si}
              style={{
                flexDirection: 'row',
                height: siteRowH,
                borderBottomWidth: 1,
                borderBottomColor: BORDER,
                backgroundColor: si % 2 === 0 ? SUB_BG : isDark ? '#102518' : '#f7fef9',
                alignItems: 'center',
              }}
            >
              {/* Site name – first Cell, its left border closes the merged-name column */}
              <Cell w={COL.site}>
                <Text
                  style={{ fontSize: 11, fontWeight: '600', color: isDark ? '#86efac' : '#15803d' }}
                  numberOfLines={2}
                >
                  ↳ {s.siteName}
                </Text>
              </Cell>
              {/* Days */}
              <Cell w={COL.days} center>
                <Text style={{ fontSize: 11, fontWeight: '600', color: txt }}>
                  {s.presentDays}d
                </Text>
                <Text style={{ fontSize: 10, color: muted }}>{s.totalHours}h</Text>
              </Cell>
              {/* Rate */}
              <Cell w={COL.rate} right>
                <Text style={{ fontSize: 11, color: txt }}>₹{s.rate.toLocaleString()}</Text>
              </Cell>
              {/* Site Earning */}
              <Cell w={COL.dues} right>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#10b981' }}>
                  ₹{s.earning.toLocaleString()}
                </Text>
              </Cell>
              {/* Remaining columns – blank in site rows */}
              <Cell w={COL.adv} right>
                <Text style={{ fontSize: 10, color: muted }}>—</Text>
              </Cell>
              <Cell w={COL.penalty} right>
                <Text style={{ fontSize: 10, color: muted }}>—</Text>
              </Cell>
              <Cell w={COL.articles} right>
                <Text style={{ fontSize: 10, color: muted }}>—</Text>
              </Cell>
              <Cell w={COL.totalDed} right>
                <Text style={{ fontSize: 10, color: muted }}>—</Text>
              </Cell>
              <Cell w={COL.netDed} center>
                <Text style={{ fontSize: 10, color: muted }}>—</Text>
              </Cell>
              <Cell w={COL.balAdv} right>
                <Text style={{ fontSize: 10, color: muted }}>—</Text>
              </Cell>
              <Cell w={COL.netPay} right>
                <Text style={{ fontSize: 10, color: muted }}>—</Text>
              </Cell>
            </View>
          ))}

          {/* Summary / Totals Row */}
          <View
            style={{
              flexDirection: 'row',
              height: summaryRowH,
              backgroundColor: SUM_BG,
              borderTopWidth: 1,
              borderTopColor: isDark ? '#14532d' : '#86efac',
              alignItems: 'center',
            }}
          >
            <Cell w={COL.site} style={{ borderLeftWidth: 0 }}>
              <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#10b981' }}>
                ∑ Consolidated
              </Text>
            </Cell>
            <Cell w={COL.days} center>
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: txt }}>
                {item.totalPresentDays}d
              </Text>
              <Text style={{ fontSize: 10, color: muted }}>{item.totalHours}h</Text>
            </Cell>
            <Cell w={COL.rate} right>
              <Text style={{ fontSize: 10, color: muted }}>—</Text>
            </Cell>
            <Cell w={COL.dues} right>
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#10b981' }}>
                ₹{item.consolidatedDues.toLocaleString()}
              </Text>
            </Cell>
            <Cell w={COL.adv} right>
              <Text style={{ fontSize: 11, color: '#ef4444' }}>
                ₹{(item.advance > 0 ? item.advance : 0).toLocaleString()}
              </Text>
            </Cell>
            <Cell w={COL.penalty} right>
              <Text style={{ fontSize: 11, color: txt }}>₹{item.penalty.toLocaleString()}</Text>
            </Cell>
            <Cell w={COL.articles} right>
              <Text style={{ fontSize: 11, color: txt }}>₹{item.articles.toLocaleString()}</Text>
            </Cell>
            <Cell w={COL.totalDed} right>
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: txt }}>
                ₹{totalDed.toLocaleString()}
              </Text>
            </Cell>
            <Cell w={COL.netDed} center>
              <TextInput
                style={{
                  width: COL.netDed - 12,
                  backgroundColor: isDark ? '#0f172a' : '#fff',
                  borderWidth: 1,
                  borderColor: isDark ? '#475569' : '#93c5fd',
                  borderRadius: 3,
                  paddingVertical: 2,
                  paddingHorizontal: 6,
                  fontSize: 11,
                  color: txt,
                  textAlign: 'right',
                }}
                placeholder="0"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={
                  editingId === item.id
                    ? (editingValues[item.id] ?? item.netDeduction)
                    : item.netDeduction
                }
                editable={true}
                returnKeyType="done"
                selectTextOnFocus={true}
                onFocus={() => {
                  setEditingId(item.id);
                  setEditingValues((p) => ({ ...p, [item.id]: item.netDeduction }));
                }}
                onBlur={() => {
                  const val = editingValues[item.id] ?? item.netDeduction;
                  handleUpdateDeduction(item.id, val);
                  setEditingId(null);
                  setEditingValues((p) => {
                    const next = { ...p };
                    delete next[item.id];
                    return next;
                  });
                }}
                onChangeText={(v) => {
                  const cleaned = v.replace(/[^0-9.]/g, '');
                  setEditingValues((p) => ({ ...p, [item.id]: cleaned }));
                }}
              />
            </Cell>
            <Cell w={COL.balAdv} right>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: 'bold',
                  color: balAdvance > 0 ? '#ef4444' : muted,
                }}
              >
                ₹{balAdvance.toLocaleString()}
              </Text>
            </Cell>
            <Cell w={COL.netPay} right>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: 'bold',
                  color: netPay >= 0 ? '#10b981' : '#ef4444',
                }}
              >
                ₹{netPay.toLocaleString()}
              </Text>
            </Cell>
          </View>
        </View>
      </View>
    );
  };

  // ── Footer totals ────────────────────────────────────────────────────────────
  const totalConsolidated = sheet.reduce((a, r) => a + r.consolidatedDues, 0);
  const totalNetPay = sheet.reduce(
    (a, r) => a + (r.consolidatedDues - (parseFloat(r.netDeduction) || 0)),
    0
  );
  const totalAdvance = sheet.reduce((a, r) => a + (r.advance > 0 ? r.advance : 0), 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
        {/* Header Bar */}
        <View
          style={{
            height: 60,
            backgroundColor: COLORS.primary,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
          }}
        >
          <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', marginLeft: 8, flex: 1 }}>
            Salary Register
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
            {sheet.length} workers
          </Text>
        </View>

        {/* Controls Row */}
        <View
          style={{
            padding: 10,
            flexDirection: 'row',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
            backgroundColor: isDark ? '#1e293b' : '#fff',
            borderBottomWidth: 1,
            borderColor: isDark ? '#334155' : '#e2e8f0',
          }}
        >
          {/* Month Prev */}
          <TouchableOpacity
            onPress={() => {
              setSelectedMonth((m) => {
                if (m === 0) {
                  setSelectedYear((y) => y - 1);
                  return 11;
                }
                return m - 1;
              });
            }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: isDark ? '#334155' : '#f1f5f9',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Ionicons name="chevron-back-outline" size={18} color={COLORS.primary} />
          </TouchableOpacity>

          <View
            style={{
              height: 36,
              paddingHorizontal: 14,
              backgroundColor: isDark ? '#334155' : '#f1f5f9',
              borderRadius: 8,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: 'bold', color: txt }}>
              {MONTHS[selectedMonth]} {selectedYear}
            </Text>
          </View>

          {/* Month Next */}
          <TouchableOpacity
            onPress={() => {
              setSelectedMonth((m) => {
                if (m === 11) {
                  setSelectedYear((y) => y + 1);
                  return 0;
                }
                return m + 1;
              });
            }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: isDark ? '#334155' : '#f1f5f9',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Ionicons name="chevron-forward-outline" size={18} color={COLORS.primary} />
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          {Platform.OS === 'web' && (
            <input
              type="date"
              value={voucherDate.toISOString().split('T')[0]}
              onChange={(e) => setVoucherDate(new Date(e.target.value))}
              style={{ padding: 8, borderRadius: 8, border: '1px solid #ccc', fontSize: 12 }}
            />
          )}

          <TouchableOpacity
            onPress={handlePostVoucher}
            style={{
              height: 36,
              backgroundColor: currentVoucherId ? '#f59e0b' : '#10b981',
              borderRadius: 8,
              paddingHorizontal: 14,
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'row',
            }}
          >
            <Ionicons name="save-outline" size={16} color="#fff" style={{ marginRight: 5 }} />
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>
              {currentVoucherId ? 'Update' : 'Save & Post'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handlePreview}
            style={{
              height: 36,
              backgroundColor: '#2563eb',
              borderRadius: 8,
              paddingHorizontal: 14,
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'row',
            }}
          >
            <Ionicons name="eye-outline" size={16} color="#fff" style={{ marginRight: 5 }} />
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>Preview</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handlePrint}
            disabled={pdfLoading}
            style={{
              height: 36,
              backgroundColor: pdfLoading ? '#7c3aed' : COLORS.primary,
              borderRadius: 8,
              paddingHorizontal: 14,
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'row',
              opacity: pdfLoading ? 0.7 : 1,
            }}
          >
            <Ionicons
              name={pdfLoading ? 'hourglass-outline' : 'print-outline'}
              size={16}
              color="#fff"
              style={{ marginRight: 5 }}
            />
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>
              {pdfLoading ? 'Generating…' : 'Share PDF'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Summary Strip */}
        {!loading && sheet.length > 0 && (
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: isDark ? '#0f2d1a' : '#f0fdf4',
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderColor: isDark ? '#14532d' : '#bbf7d0',
              gap: 20,
            }}
          >
            <View>
              <Text style={{ fontSize: 10, color: '#10b981', fontWeight: 'bold' }}>
                CONSOLIDATED DUES
              </Text>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#10b981' }}>
                ₹{totalConsolidated.toLocaleString()}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 10, color: '#ef4444', fontWeight: 'bold' }}>
                TOTAL ADVANCE
              </Text>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#ef4444' }}>
                ₹{totalAdvance.toLocaleString()}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 10, color: COLORS.primary, fontWeight: 'bold' }}>
                NET PAY DUES
              </Text>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.primary }}>
                ₹{totalNetPay.toLocaleString()}
              </Text>
            </View>
          </View>
        )}

        {/* Content */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={{ marginTop: 12, color: muted, fontSize: 13 }}>
              Compiling salary register…
            </Text>
          </View>
        ) : sheet.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="document-text-outline" size={56} color={muted} />
            <Text style={{ marginTop: 12, color: muted, fontSize: 15, fontWeight: 'bold' }}>
              No attendance data found
            </Text>
            <Text style={{ marginTop: 4, color: muted, fontSize: 12 }}>
              for {MONTHS[selectedMonth]} {selectedYear}
            </Text>
          </View>
        ) : (
          <ScrollView horizontal style={{ flex: 1 }}>
            <View style={{ flex: 1 }}>
              <TableHeader />
              <FlatList
                data={sheet}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                initialNumToRender={20}
                windowSize={10}
              />
            </View>
          </ScrollView>
        )}

        <Modal
          visible={!!previewHtml}
          animationType="slide"
          onRequestClose={() => setPreviewHtml(null)}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 14,
                backgroundColor: COLORS.primary,
              }}
            >
              <TouchableOpacity onPress={() => setPreviewHtml(null)} style={{ padding: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => {
                    try {
                      webviewRef.current?.postMessage('captureImage');
                    } catch (e) {
                      webviewRef.current?.injectJavaScript(
                        `(function(){window.postMessage && window.postMessage('captureImage', '*');})();true;`
                      );
                    }
                  }}
                  style={{ padding: 8 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Save Image</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={togglePreviewOrientation} style={{ padding: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {previewOrientation === Print.Orientation.portrait ? 'Portrait' : 'Landscape'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handlePreviewPrint} style={{ padding: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Print</Text>
                </TouchableOpacity>
              </View>
            </View>

            {previewHtml ? (
              <WebView
                ref={webviewRef}
                originWhitelist={['*']}
                source={{ html: previewHtml }}
                style={{ flex: 1 }}
                showsVerticalScrollIndicator
                onMessage={(ev) => {
                  const d = ev.nativeEvent.data;
                  if (d && typeof d === 'string' && d.indexOf('data:image') === 0) {
                    setPreviewImage(d);
                  }
                }}
              />
            ) : null}

            <Modal visible={!!previewImage} onRequestClose={() => setPreviewImage(null)}>
              <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12 }}
                >
                  <TouchableOpacity onPress={() => setPreviewImage(null)} style={{ padding: 8 }}>
                    <Text style={{ color: COLORS.primary, fontWeight: '700' }}>Close</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 12 }}>
                  {previewImage ? (
                    <Image
                      source={{ uri: previewImage }}
                      style={{ width: 900, maxWidth: '100%', height: 1200, resizeMode: 'contain' }}
                    />
                  ) : null}
                </ScrollView>
              </SafeAreaView>
            </Modal>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
};

export default SalaryRegisterModal;
