/**
 * partyLedgers.tsx  —  Show Ledgers
 *
 * Loads ALL ledger accounts from finance/master (Sundry Debtors, Sundry Creditors,
 * Cash, Bank, Petty Cash, etc.) and generates a PDF ledger folio that is displayed
 * inline via the native PDF viewer (Print.printAsync), rather than exported/shared.
 */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
    useColorScheme, TextInput, FlatList, TouchableWithoutFeedback, Keyboard, Modal,
    KeyboardAvoidingView, Platform, ScrollView
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { WebView } from "react-native-webview";

import { AppHeader } from "@/components/AppHeader";
import { useUserContext } from "@/context/AuthContext";
import { styles as G, COLORS } from "@/styles/stylesIndex";
import { ledgerStyles as styles } from "@/styles/styleledger";
import { appService } from "@/UtilServices/appHelper";

/* ─── HTML Template ─────────────────────────────────────────────────────────── */
const PL_HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{LEDGER_NAME}} - Ledger Folio</title>
    <style>
        @page { size: A4; margin: 20mm; }
        @media print {
            body { padding: 0; }
            tr { page-break-inside: avoid; }
            thead { display: table-header-group; }
        }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
        .header { text-align: center; border-bottom: 2px solid #1a3c6b; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { margin: 0; color: #1a3c6b; font-size: 26px; text-transform: uppercase; letter-spacing: 1px; }
        .header p { margin: 5px 0 0; color: #666; font-size: 14px; }
        .header .meta { margin-top: 15px; font-weight: bold; background: #f8fafc; padding: 10px; border-radius: 6px; display: inline-block; }

        .summary-box { display: flex; justify-content: space-between; margin-bottom: 30px; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; }
        .summary-item { text-align: center; }
        .summary-item label { display: block; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; }
        .summary-item span { font-size: 20px; font-weight: bold; color: #0f172a; }

        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #f1f5f9; color: #475569; font-weight: bold; text-align: left; padding: 12px; border-bottom: 2px solid #cbd5e1; font-size: 13px; text-transform: uppercase; }
        td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #334155; }

        .val-pos { color: #166534; font-weight: bold; }
        .val-neg { color: #991b1b; font-weight: bold; }
        .net-tag { display: inline-block; padding: 4px 10px; background: #dcfce7; color: #166534; border-radius: 12px; font-size: 12px; font-weight: bold; }
        .net-tag-deficit { background: #fee2e2; color: #991b1b; }
        .no-data { text-align: center; padding: 40px; color: #94a3b8; font-size: 14px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{CORPORATE_NAME}}</h1>
        <p>User: {{ACTIVE_USER}}</p>
        <div class="meta">
            Ledger Folio of {{LEDGER_NAME}} <br/>
            <span style="font-weight: normal; font-size: 12px; color: #64748b;">Group: {{GROUP_NAME}} | Period: {{DATE}}</span>
        </div>
    </div>

    <div class="summary-box">
        <div class="summary-item">
            <label>Total Debit</label>
            <span>₹{{TOTAL_DR}}</span>
        </div>
        <div class="summary-item">
            <label>Total Credit</label>
            <span>₹{{TOTAL_CR}}</span>
        </div>
        <div class="summary-item">
            <label>Net Balance</label>
            <span>₹{{NET_BALANCE}} <span class="net-tag {{DEFICIT_CLASS}}">{{BALANCE_TYPE}}</span></span>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Account / Narration</th>
                <th>Vch Type</th>
                <th>Dr Amount</th>
                <th>Cr Amount</th>
                <th>Balance Amount</th>
            </tr>
        </thead>
        <tbody>
            {{ROWS}}
        </tbody>
    </table>
</body>
</html>
`;

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface LedgerAccount {
    _id: string;
    ledgerName: string;
    groupName?: string;
    ledgerGroupId?: string;
    currentBalance?: number;
    openingBalance?: number;
    openingBalanceType?: string;
    enrollmentNo?: string;
}

interface LedgerGroup {
    _id: string;
    groupName: string;
    nature: string;
}

const parseDDMMYYYYToDate = (str: string): Date | null => {
    const parts = str.split('-');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    if (day < 1 || day > 31 || month < 0 || month > 11 || year < 1000) return null;
    const d = new Date(year, month, day);
    if (d.getDate() !== day || d.getMonth() !== month || d.getFullYear() !== year) return null;
    return d;
};

/* ─── Local Styles for Tabular Ledger View ─── */
const localStyles = StyleSheet.create({
    tableHeaderRow: {
        flexDirection: "row",
        paddingVertical: 10,
        borderBottomWidth: 1.5,
        alignItems: "center"
    },
    tableHeaderCell: {
        fontSize: 11,
        fontWeight: "bold",
        paddingHorizontal: 4
    },
    tableRow: {
        flexDirection: "row",
        paddingVertical: 8,
        borderBottomWidth: 0.5,
        alignItems: "center"
    },
    tableRowCell: {
        fontSize: 11,
        paddingHorizontal: 4
    },
    particularsText: {
        fontSize: 11,
        fontWeight: "600"
    },
    narrationText: {
        fontSize: 9,
        fontStyle: "italic",
        marginTop: 2
    }
});

/* ─── Main Screen ───────────────────────────────────────────────────────────── */
export default function PartyLedgersScreen() {
    const router = useRouter();
    const { preselectOwnPettyCash } = useLocalSearchParams();
    const { user } = useUserContext();
    const isDark = useColorScheme() === "dark";
    const token = user?.token ?? "";

    /* ── Ledger Data ────────────────────────────────────────────────────── */
    const [ledgers, setLedgers] = useState<LedgerAccount[]>([]);
    const [groups, setGroups] = useState<LedgerGroup[]>([]);
    const [masterLoading, setMasterLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [selectedLedger, setSelectedLedger] = useState<LedgerAccount | null>(null);

    useEffect(() => {
        if (preselectOwnPettyCash === "true" && ledgers.length > 0) {
            const activeBook = ledgers.find((l: any) => 
                (l.groupName?.toLowerCase().includes("cash-in-hand") || l.groupName?.toLowerCase().includes("cash")) &&
                (
                  (l.refId && (String(l.refId) === String(user?.userId) || String(l.refId) === String(user?._id))) ||
                  l.ledgerName?.toLowerCase().includes(`petty cash - ${(user?.userDisplayName || "").toLowerCase()}`)
                )
            );
            if (activeBook) {
                setSelectedLedger(activeBook);
            }
        }
    }, [preselectOwnPettyCash, ledgers, user]);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);
    const [printOrientation, setPrintOrientation] = useState<string>(Print.Orientation.portrait);

    // Added states for statement transactions
    const [transactions, setTransactions] = useState<any[]>([]);
    const [txnsLoading, setTxnsLoading] = useState(false);

    /* ── Fetch ALL ledgers from finance/master ──────────────────────────── */
    const fetchMaster = useCallback(async () => {
        setMasterLoading(true);
        try {
            const res = await appService.httpClient.get("finance/master", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.data?.success) {
                const grps: LedgerGroup[] = res.data.data.groups || [];
                const ldgrs: LedgerAccount[] = res.data.data.ledgers || [];

                // Build a groupName lookup so each ledger shows its group
                const groupMap = new Map<string, string>(grps.map(g => [String(g._id), g.groupName]));
                const withGroup = ldgrs.map(l => ({
                    ...l,
                    groupName: groupMap.get(String(l.ledgerGroupId)) ?? l.groupName ?? "General",
                }));

                setGroups(grps);
                setLedgers(withGroup);
            }
        } catch (e: any) {
            appService.showToast(e?.response?.data?.message || "Failed to load ledgers", "Error");
        } finally {
            setMasterLoading(false);
        }
    }, [token]);

    useEffect(() => { fetchMaster(); }, [fetchMaster]);

    /* ── Load statements when a ledger is chosen ────────────────────────── */
    const loadLedgerTransactions = useCallback(async (ledgerId: string) => {
        setTxnsLoading(true);
        try {
            const res = await appService.httpClient.get(
                `finance/vouchers/ledger/${ledgerId}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setTransactions(Array.isArray(res.data?.data) ? res.data.data : []);
        } catch (e: any) {
            appService.showToast(e?.response?.data?.message || "Failed to load transactions", "Error");
        } finally {
            setTxnsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (selectedLedger) {
            loadLedgerTransactions(selectedLedger._id);
        } else {
            setTransactions([]);
        }
    }, [selectedLedger, loadLedgerTransactions]);

    /* ── Filtered list ──────────────────────────────────────────────────── */
    const filteredLedgers: LedgerAccount[] = useMemo(() => {
        let list = ledgers;
        if (preselectOwnPettyCash === "true" && user?.userRole !== "CorpAdmin" && user?.userRole !== "userAdmin") {
            list = ledgers.filter(
                (l: any) =>
                    // Match own petty cash
                    (
                        (l.groupName?.toLowerCase().includes("cash-in-hand") || l.groupName?.toLowerCase().includes("cash")) &&
                        (
                          (l.refId && (String(l.refId) === String(user?.userId) || String(l.refId) === String(user?._id))) ||
                          l.ledgerName?.toLowerCase().includes(`petty cash - ${(user?.userDisplayName || "").toLowerCase()}`)
                        )
                    ) ||
                    // Match employee / team member ledgers
                    (
                        l.refType === "Staff" || l.refType === "RUL" || l.refType === "Employee" ||
                        l.ledgerName?.toLowerCase().includes("(salary)")
                    )
            );
        }
        if (!search.trim()) return list;
        const q = search.toLowerCase();
        return list.filter(
            l =>
                l.ledgerName?.toLowerCase().includes(q) ||
                l.groupName?.toLowerCase().includes(q)
        );
    }, [ledgers, search, preselectOwnPettyCash, user]);

    const pettyCashLedgers = useMemo(() => {
        return ledgers.filter(
            (l: any) =>
                (l.groupName?.toLowerCase().includes("cash-in-hand") || l.groupName?.toLowerCase().includes("cash")) &&
                (l.ledgerName?.toLowerCase().includes("petty cash") || l.groupName?.toLowerCase().includes("cash-in-hand"))
        );
    }, [ledgers]);

    /* ── Helper to determine unvalidated/pending validation status ─── */
    const isVoucherUnvalidated = useCallback((v: any) => {
        // If explicitly validated, it is valid
        if (v.validationStatus === "Validated" || v.isValidated === true) return false;
        // Only entries explicitly marked Unvalidated or isValidated === false require counter validation
        return (
            v.validationStatus === "Unvalidated" ||
            v.validationStatus === "Pending" ||
            v.isValidated === false ||
            v.isCounterValidated === false
        );
    }, []);

    /* ── Compute Opening Balance for selected period ─── */
    const periodOpeningBalance = useMemo(() => {
        if (!selectedLedger) return 0;
        const initialOpening = selectedLedger.openingBalanceType === "Cr"
            ? -(selectedLedger.openingBalance || 0)
            : (selectedLedger.openingBalance || 0);

        const startVal = startDate.trim();
        if (!startVal) return initialOpening;

        const sDate = parseDDMMYYYYToDate(startVal);
        if (!sDate) return initialOpening;

        // Sum up all transactions before sDate (excluding unvalidated entries)
        let sum = initialOpening;
        transactions.forEach((v) => {
            if (isVoucherUnvalidated(v)) return; // Do NOT consider unvalidated entry in balance calculation
            const date = new Date(v.date || v.createdAt);
            if (date.getTime() < sDate.getTime()) {
                const entry = (v.entries ?? []).find(
                    (e: any) => String(e.ledgerId) === String(selectedLedger._id)
                ) ?? {};
                const dr = Number(entry.debit ?? 0);
                const cr = Number(entry.credit ?? 0);
                sum += (dr - cr);
            }
        });
        return sum;
    }, [transactions, selectedLedger, startDate, isVoucherUnvalidated]);

    /* ── Compute Filtered/Sorted Statement Transactions with running bal ─── */
    const processedTransactions = useMemo(() => {
        if (!selectedLedger) return [];
        let list = [...transactions];
        const startVal = startDate.trim();
        const endVal = endDate.trim();

        if (startVal) {
            const sDate = parseDDMMYYYYToDate(startVal);
            if (sDate) {
                list = list.filter(v => new Date(v.date || v.createdAt).getTime() >= sDate.getTime());
            }
        }

        if (endVal) {
            const eDate = parseDDMMYYYYToDate(endVal);
            if (eDate) {
                eDate.setHours(23, 59, 59, 999);
                list = list.filter(v => new Date(v.date || v.createdAt).getTime() <= eDate.getTime());
            }
        }

        // Sort chronologically
        list.sort((a, b) => {
            const dateA = new Date(a.date || a.createdAt || 0).getTime();
            const dateB = new Date(b.date || b.createdAt || 0).getTime();
            return dateA - dateB;
        });

        // Compute running balances starting from periodOpeningBalance
        let running = periodOpeningBalance;
        return list.map((v) => {
            const unval = isVoucherUnvalidated(v);
            const entry = (v.entries ?? []).find(
                (e: any) => String(e.ledgerId) === String(selectedLedger._id)
            ) ?? {};
            const dr = Number(entry.debit ?? 0);
            const cr = Number(entry.credit ?? 0);

            // Unvalidated entries are NOT considered in balance calculation!
            if (!unval) {
                running = running + dr - cr;
            }

            let oppositeLedgerName = "";
            if (dr > 0) {
                const credits = (v.entries ?? []).filter((e: any) => Number(e.credit ?? 0) > 0);
                oppositeLedgerName = credits.map((e: any) => (e.ledgerName || "—") + (e.enrollmentNo ? ` (${e.enrollmentNo})` : "")).join(", ");
            } else if (cr > 0) {
                const debits = (v.entries ?? []).filter((e: any) => Number(e.debit ?? 0) > 0);
                oppositeLedgerName = debits.map((e: any) => (e.ledgerName || "—") + (e.enrollmentNo ? ` (${e.enrollmentNo})` : "")).join(", ");
            }

            // Check if backdated (entry date and voucher date do not match)
            const vDate = new Date(v.date || v.createdAt);
            const entryDate = v.entryDate || v.createdAt ? new Date(v.entryDate || v.createdAt) : null;
            const isBackdated = v.isBackdated || (entryDate && vDate.toDateString() !== entryDate.toDateString());

            return {
                ...v,
                dr,
                cr,
                isUnvalidated: unval,
                isBackdated,
                oppositeLedgerName,
                runningBalance: running
            };
        });
    }, [transactions, selectedLedger, startDate, endDate, periodOpeningBalance, isVoucherUnvalidated]);

    const totalDr = useMemo(() => processedTransactions.filter(t => !t.isUnvalidated).reduce((s, t) => s + t.dr, 0), [processedTransactions]);
    const totalCr = useMemo(() => processedTransactions.filter(t => !t.isUnvalidated).reduce((s, t) => s + t.cr, 0), [processedTransactions]);
    const unvalidatedCount = useMemo(() => processedTransactions.filter(t => t.isUnvalidated).length, [processedTransactions]);
    const periodClosingBalance = periodOpeningBalance + totalDr - totalCr;

    /* ── Fetch voucher lines for selected ledger, then show PDF inline ─── */
    const generateAndShowPdf = async () => {
        if (!selectedLedger) return;
        setIsGenerating(true);
        try {
            const startVal = startDate.trim();
            const endVal = endDate.trim();
            const dateRangeStr = (startVal || endVal)
                ? `${startVal || "Beginning"} to ${endVal || "Today"}`
                : "All Time Cumulative";

            // Opening Balance Row HTML
            const opBalStr = periodOpeningBalance >= 0 ? "Dr" : "Cr";
            const opBalAbs = Math.abs(periodOpeningBalance);
            const opRowHtml = `
                <tr style="background-color: #f8fafc; font-weight: bold; border-bottom: 2px solid #cbd5e1;">
                    <td>${startVal || "—"}</td>
                    <td>
                        <strong>Opening Balance</strong>
                    </td>
                    <td>—</td>
                    <td class="${periodOpeningBalance >= 0 ? 'val-pos' : ''}">${periodOpeningBalance >= 0 ? `₹${opBalAbs.toLocaleString("en-IN")}` : "—"}</td>
                    <td class="${periodOpeningBalance < 0 ? 'val-neg' : ''}">${periodOpeningBalance < 0 ? `₹${opBalAbs.toLocaleString("en-IN")}` : "—"}</td>
                    <td style="color:${periodOpeningBalance >= 0 ? '#166534' : '#991b1b'};font-weight:700;">₹${opBalAbs.toLocaleString("en-IN")} ${opBalStr}</td>
                </tr>
            `;

            // Txn Rows HTML
            const txnRowsHtml = processedTransactions.map((t: any) => {
                const date = t.date ?? t.createdAt;
                const dateStr = date
                    ? new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                    : "—";
                const narration = t.narration ?? "—";
                const voucherNo = t.voucherNumber ?? t.voucher_number ?? t.voucherType ?? "";
                const balColor = t.runningBalance >= 0 ? "#166534" : "#991b1b";
                const isUnval = t.isUnvalidated;
                const rowBg = isUnval ? "background-color: #fffbeb;" : "";
                const badgeHtml = isUnval 
                    ? `<span style="background:#fef3c7;color:#b45309;padding:2px 5px;border-radius:3px;font-size:10px;font-weight:700;">⚠️ UNVALIDATED</span> ${t.isBackdated ? '<span style="background:#ede9fe;color:#6d28d9;padding:2px 5px;border-radius:3px;font-size:10px;font-weight:700;">⏳ BACKDATED</span>' : ''}`
                    : "";
                const balCell = isUnval
                    ? `<span style="color:#d97706;font-size:11px;font-weight:700;font-style:italic;">Excluded (Pending Val)</span>`
                    : `₹${Math.abs(t.runningBalance).toLocaleString("en-IN")} ${t.runningBalance >= 0 ? "Dr" : "Cr"}`;
                return `
                    <tr style="${rowBg}">
                        <td>${dateStr}</td>
                        <td>
                            ${t.oppositeLedgerName ? `<span style="color:#0f172a;font-weight:600;font-size:13px;">${t.oppositeLedgerName}</span>` : "—"}
                            ${badgeHtml ? `<br/>${badgeHtml}` : ""}
                            ${narration !== "—" ? `<br/><span style="color:#64748b;font-size:12px;font-style:italic;">"${narration}"</span>` : ""}
                        </td>
                        <td>${voucherNo}</td>
                        <td class="${t.dr > 0 ? 'val-neg' : ''}">${t.dr > 0 ? `₹${t.dr.toLocaleString("en-IN")}` : "—"}</td>
                        <td class="${t.cr > 0 ? 'val-pos' : ''}">${t.cr > 0 ? `₹${t.cr.toLocaleString("en-IN")}` : "—"}</td>
                        <td style="color:${balColor};font-weight:700;">${balCell}</td>
                    </tr>`;
            }).join("");

            // Closing Balance Row HTML
            const clBalStr = periodClosingBalance >= 0 ? "Dr" : "Cr";
            const clBalAbs = Math.abs(periodClosingBalance);
            const clRowHtml = `
                <tr style="background-color: #f8fafc; font-weight: bold; border-top: 2px solid #cbd5e1;">
                    <td>${endVal || "—"}</td>
                    <td>
                        <strong>Closing Balance</strong>
                    </td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td style="color:${periodClosingBalance >= 0 ? '#166534' : '#991b1b'};font-weight:700;">₹${clBalAbs.toLocaleString("en-IN")} ${clBalStr}</td>
                </tr>
            `;

            const rowsHtml = opRowHtml + (txnRowsHtml || `<tr><td colspan="6" class="no-data">No transactions found for this period.</td></tr>`) + clRowHtml;

            const activeUserName = user?.userDisplayName || user?.name || "Active User";
            const corporateName = user?.corporateName || "Corporate Account";
            const html = PL_HTML_TEMPLATE
                .replace("{{CORPORATE_NAME}}", corporateName)
                .replace("{{ACTIVE_USER}}", activeUserName)
                .replace(/{{LEDGER_NAME}}/g, selectedLedger.ledgerName + (selectedLedger.enrollmentNo ? ` (${selectedLedger.enrollmentNo})` : ""))
                .replace("{{GROUP_NAME}}", selectedLedger.groupName ?? "General")
                .replace("{{DATE}}", dateRangeStr)
                .replace("{{TOTAL_DR}}", totalDr.toLocaleString("en-IN"))
                .replace("{{TOTAL_CR}}", totalCr.toLocaleString("en-IN"))
                .replace("{{NET_BALANCE}}", Math.abs(periodClosingBalance).toLocaleString("en-IN"))
                .replace("{{DEFICIT_CLASS}}", periodClosingBalance >= 0 ? "" : "net-tag-deficit")
                .replace("{{BALANCE_TYPE}}", periodClosingBalance >= 0 ? "Debit Balance" : "Credit Balance")
                .replace("{{ROWS}}", rowsHtml);

            // ✅ Show custom full-screen HTML preview modal instead of immediate native spooler
            setPreviewHtml(html);

        } catch (error: any) {
            appService.showToast(error?.response?.data?.message || error?.message || "Error Generating PDF", "Error");
        } finally {
            setIsGenerating(false);
        }
    };

    /* ── Theme ──────────────────────────────────────────────────────────── */
    const bg = isDark ? COLORS.bgDark : COLORS.bgLight;
    const cardBg = isDark ? COLORS.cardDark : COLORS.cardLight;
    const border = isDark ? COLORS.borderDark : COLORS.border;
    const txtPri = isDark ? "#e8e8e8" : "#1a1a1a";
    const txtSec = isDark ? "#999" : "#666";
    const inputBg = isDark ? "#1a2535" : "#f8fafc";

    /* ── Group badge color helper ────────────────────────────────────────── */
    const groupBadgeColor = (groupName?: string): string => {
        const g = (groupName ?? "").toLowerCase();
        if (g.includes("debtor")) return "#1d4ed8";
        if (g.includes("creditor")) return "#ea580c";
        if (g.includes("cash") || g.includes("petty")) return "#16a34a";
        if (g.includes("bank")) return "#0891b2";
        if (g.includes("capital") || g.includes("equity")) return "#7c3aed";
        if (g.includes("sale") || g.includes("income") || g.includes("revenue")) return "#059669";
        if (g.includes("purchase") || g.includes("expense")) return "#dc2626";
        return "#64748b";
    };

    /* ── Render On-Screen Table Rows ─── */
    const formatDateCompact = (dateInput: any) => {
        if (!dateInput) return "—";
        const d = new Date(dateInput);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = String(d.getFullYear()).slice(-2);
        return `${day}-${month}-${year}`;
    };

    const renderOpeningBalanceRow = () => {
        const opBalStr = periodOpeningBalance >= 0 ? "Dr" : "Cr";
        const opBalAbs = Math.abs(periodOpeningBalance);
        return (
            <View style={[{ flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: border, backgroundColor: isDark ? "#131c2a" : "#f8fafc" }]}>
                <Text style={[localStyles.tableRowCell, { flex: 1.3, fontWeight: "700", color: txtPri }]} adjustsFontSizeToFit numberOfLines={1}>{startDate.trim() || "—"}</Text>
                <Text style={[localStyles.tableRowCell, { flex: 2.8, fontWeight: "700", color: txtPri }]}>Opening Balance</Text>
                <Text style={[localStyles.tableRowCell, { flex: 1.5, color: txtSec }]}>—</Text>
                <Text style={[localStyles.tableRowCell, { flex: 1.4, textAlign: "right", fontWeight: "700", color: periodOpeningBalance >= 0 ? COLORS.success : txtSec }]} adjustsFontSizeToFit numberOfLines={1}>
                    {periodOpeningBalance >= 0 ? `₹${opBalAbs.toLocaleString("en-IN")}` : "—"}
                </Text>
                <Text style={[localStyles.tableRowCell, { flex: 1.4, textAlign: "right", fontWeight: "700", color: periodOpeningBalance < 0 ? COLORS.danger : txtSec }]} adjustsFontSizeToFit numberOfLines={1}>
                    {periodOpeningBalance < 0 ? `₹${opBalAbs.toLocaleString("en-IN")}` : "—"}
                </Text>
                <Text style={[localStyles.tableRowCell, { flex: 2.2, textAlign: "right", fontWeight: "700", color: periodOpeningBalance >= 0 ? "#166534" : "#991b1b" }]} adjustsFontSizeToFit numberOfLines={1}>
                    {`₹${opBalAbs.toLocaleString("en-IN")} ${opBalStr}`}
                </Text>
            </View>
        );
    };

    const renderTransactionRow = ({ item }: { item: any }) => {
        const date = item.date ?? item.createdAt;
        const dateStr = formatDateCompact(date);
        const voucherNo = item.voucherNumber ?? item.voucher_number ?? item.voucherType ?? "";
        const isUnval = item.isUnvalidated;

        const handleRowPress = () => {
            if (!isUnval) return;
            Alert.alert(
                "Counter-Validate Voucher",
                `Voucher "${voucherNo}" is currently UNVALIDATED and excluded from balance calculations.\n\nWould you like to counter-validate this entry now? Once validated, amounts will be merged into the running balance and deletion will be locked.`,
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Validate & Lock",
                        onPress: async () => {
                            try {
                                const res = await appService.httpClient.post(`finance/vouchers/${item._id}/validate`, { corporateId });
                                if (res.data?.success) {
                                    appService.showToast("Voucher counter-validated & balance updated", "Success");
                                    fetchMaster();
                                }
                            } catch (err: any) {
                                Alert.alert("Validation Failed", err?.response?.data?.message || err?.message || "Failed to validate voucher");
                            }
                        }
                    }
                ]
            );
        };

        return (
            <TouchableOpacity
                activeOpacity={isUnval ? 0.7 : 1}
                onPress={handleRowPress}
                style={[
                    localStyles.tableRow,
                    {
                        borderBottomColor: border,
                        backgroundColor: isUnval
                            ? (isDark ? '#2a1a05' : '#FFFBEB')
                            : 'transparent',
                        borderLeftWidth: isUnval ? 3.5 : 0,
                        borderLeftColor: '#F59E0B',
                    }
                ]}
            >
                <View style={{ flex: 1.3 }}>
                    <Text style={[localStyles.tableRowCell, { color: isUnval ? '#B45309' : txtPri }]} adjustsFontSizeToFit numberOfLines={1}>{dateStr}</Text>
                    {item.isBackdated && (
                        <Text style={{ fontSize: 8.5, color: '#7C3AED', fontWeight: '800', marginTop: 1 }}>
                            Backdated
                        </Text>
                    )}
                </View>
                <View style={{ flex: 2.8, paddingHorizontal: 4 }}>
                    {item.oppositeLedgerName ? (
                        <Text style={[localStyles.particularsText, { color: isUnval ? '#92400E' : txtPri, fontWeight: isUnval ? '700' : '600' }]} numberOfLines={2}>
                            {item.oppositeLedgerName}
                        </Text>
                    ) : null}
                    {isUnval && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 2 }}>
                            <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, borderWidth: 0.5, borderColor: '#F59E0B' }}>
                                <Text style={{ fontSize: 9, fontWeight: '800', color: '#B45309' }}>⚠️ UNVALIDATED</Text>
                            </View>
                            {item.isBackdated && (
                                <View style={{ backgroundColor: '#EDE9FE', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, borderWidth: 0.5, borderColor: '#8B5CF6' }}>
                                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#6D28D9' }}>⏳ BACKDATED</Text>
                                </View>
                            )}
                        </View>
                    )}
                    {item.narration && item.narration !== "—" ? (
                        <Text style={[localStyles.narrationText, { color: txtSec, marginTop: 2 }]} numberOfLines={2}>
                            "{item.narration}"
                        </Text>
                    ) : null}
                </View>
                <Text style={[localStyles.tableRowCell, { flex: 1.5, color: isUnval ? '#B45309' : txtPri }]} numberOfLines={2}>{voucherNo}</Text>
                <Text style={[localStyles.tableRowCell, { flex: 1.4, textAlign: "right", color: item.dr > 0 ? (isUnval ? '#F97316' : COLORS.danger) : txtSec }]} adjustsFontSizeToFit numberOfLines={1}>
                    {item.dr > 0 ? `₹${item.dr.toLocaleString("en-IN")}` : "—"}
                </Text>
                <Text style={[localStyles.tableRowCell, { flex: 1.4, textAlign: "right", color: item.cr > 0 ? (isUnval ? '#F59E0B' : COLORS.success) : txtSec }]} adjustsFontSizeToFit numberOfLines={1}>
                    {item.cr > 0 ? `₹${item.cr.toLocaleString("en-IN")}` : "—"}
                </Text>
                <View style={{ flex: 2.2, alignItems: 'flex-end', justifyContent: 'center' }}>
                    {isUnval ? (
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#D97706', fontStyle: 'italic' }}>
                                Excluded
                            </Text>
                            <Text style={{ fontSize: 8.5, color: '#B45309' }}>
                                (Pending Val)
                            </Text>
                        </View>
                    ) : (
                        <Text style={[localStyles.tableRowCell, { textAlign: "right", fontWeight: "600", color: item.runningBalance >= 0 ? "#166534" : "#991b1b" }]} adjustsFontSizeToFit numberOfLines={1}>
                            ₹{Math.abs(item.runningBalance).toLocaleString("en-IN")} {item.runningBalance >= 0 ? "Dr" : "Cr"}
                        </Text>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    const renderClosingBalanceRow = () => {
        const clBalStr = periodClosingBalance >= 0 ? "Dr" : "Cr";
        const clBalAbs = Math.abs(periodClosingBalance);
        return (
            <View style={{ borderTopWidth: 1.5, borderTopColor: border }}>
                {/* Closing Balance Row */}
                <View style={[{ flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: border, backgroundColor: isDark ? "#131c2a" : "#f8fafc" }]}>
                    <Text style={[localStyles.tableRowCell, { flex: 1.3, fontWeight: "700", color: txtPri }]} adjustsFontSizeToFit numberOfLines={1}>{endDate.trim() || "—"}</Text>
                    <Text style={[localStyles.tableRowCell, { flex: 2.8, fontWeight: "700", color: txtPri }]}>Closing Balance</Text>
                    <Text style={[localStyles.tableRowCell, { flex: 1.5, color: txtSec }]}>—</Text>
                    <Text style={[localStyles.tableRowCell, { flex: 1.4, textAlign: "right" }]}>—</Text>
                    <Text style={[localStyles.tableRowCell, { flex: 1.4, textAlign: "right" }]}>—</Text>
                    <Text style={[localStyles.tableRowCell, { flex: 2.2, textAlign: "right", fontWeight: "700", color: periodClosingBalance >= 0 ? "#166534" : "#991b1b" }]} adjustsFontSizeToFit numberOfLines={1}>
                        {`₹${clBalAbs.toLocaleString("en-IN")} ${clBalStr}`}
                    </Text>
                </View>

                {/* Totals Row */}
                <View style={[{ flexDirection: "row", paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: border, backgroundColor: isDark ? "#1e293b" : "#f1f5f9" }]}>
                    <Text style={[localStyles.tableRowCell, { flex: 1.3 }]}>—</Text>
                    <Text style={[localStyles.tableRowCell, { flex: 2.8, fontWeight: "700", color: txtPri }]}>Current Period Totals</Text>
                    <Text style={[localStyles.tableRowCell, { flex: 1.5 }]}>—</Text>
                    <Text style={[localStyles.tableRowCell, { flex: 1.4, textAlign: "right", fontWeight: "700", color: COLORS.danger }]} adjustsFontSizeToFit numberOfLines={1}>
                        ₹{totalDr.toLocaleString("en-IN")}
                    </Text>
                    <Text style={[localStyles.tableRowCell, { flex: 1.4, textAlign: "right", fontWeight: "700", color: COLORS.success }]} adjustsFontSizeToFit numberOfLines={1}>
                        ₹{totalCr.toLocaleString("en-IN")}
                    </Text>
                    <Text style={[localStyles.tableRowCell, { flex: 2.2, textAlign: "right" }]}>—</Text>
                </View>
            </View>
        );
    };

    /* ── Render Statement Detail View ───────────────────────────────────── */
    const renderLedgerStatement = () => {
        if (!selectedLedger) return null;

        return (
            <View style={{ flex: 1 }}>
                {/* Header Info */}
                <View style={{ padding: 16, backgroundColor: cardBg, borderBottomWidth: 1, borderBottomColor: border }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        {!(preselectOwnPettyCash === "true" && user?.userRole !== "CorpAdmin" && user?.userRole !== "userAdmin") ? (
                            <TouchableOpacity 
                                onPress={() => setSelectedLedger(null)}
                                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                            >
                                <Ionicons name="arrow-back" size={20} color={COLORS.primary} />
                                <Text style={{ fontSize: 14, color: COLORS.primary, fontWeight: "700" }}>Back to list</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={{ width: 10 }} />
                        )}
                        <Text style={{ fontSize: 12, color: txtSec, fontWeight: "700" }}>Group: {selectedLedger.groupName}</Text>
                    </View>
                    <Text style={{ fontSize: 18, fontWeight: "800", color: txtPri, marginTop: 8 }}>
                        {selectedLedger.ledgerName}{selectedLedger.enrollmentNo ? ` (${selectedLedger.enrollmentNo})` : ""}
                    </Text>
                </View>

                {/* Date range pickers */}
                <View style={{ padding: 16, backgroundColor: cardBg, borderBottomWidth: 1, borderBottomColor: border }}>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: txtSec, fontWeight: "700", marginBottom: 4 }}>From Date (DD-MM-YYYY)</Text>
                            <TextInput
                                style={{
                                    backgroundColor: inputBg,
                                    color: txtPri,
                                    borderColor: border,
                                    borderWidth: 1,
                                    borderRadius: 8,
                                    paddingHorizontal: 10,
                                    height: 40,
                                    fontSize: 13
                                }}
                                placeholder="01-04-2026"
                                placeholderTextColor={txtSec}
                                value={startDate}
                                onChangeText={setStartDate}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: txtSec, fontWeight: "700", marginBottom: 4 }}>To Date (DD-MM-YYYY)</Text>
                            <TextInput
                                style={{
                                    backgroundColor: inputBg,
                                    color: txtPri,
                                    borderColor: border,
                                    borderWidth: 1,
                                    borderRadius: 8,
                                    paddingHorizontal: 10,
                                    height: 40,
                                    fontSize: 13
                                }}
                                placeholder="31-03-2027"
                                placeholderTextColor={txtSec}
                                value={endDate}
                                onChangeText={setEndDate}
                            />
                        </View>
                    </View>
                </View>

                {/* Summary Stats Box */}
                <View style={{ flexDirection: "row", padding: 12, backgroundColor: cardBg, borderBottomWidth: 1, borderBottomColor: border, justifyContent: "space-between" }}>
                    <View style={{ alignItems: "center", flex: 1 }}>
                        <Text style={{ fontSize: 10, color: txtSec, textTransform: "uppercase" }}>Total Debit</Text>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: COLORS.danger, marginTop: 4 }}>
                            ₹{totalDr.toLocaleString("en-IN")}
                        </Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: border }} />
                    <View style={{ alignItems: "center", flex: 1 }}>
                        <Text style={{ fontSize: 10, color: txtSec, textTransform: "uppercase" }}>Total Credit</Text>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: COLORS.success, marginTop: 4 }}>
                            ₹{totalCr.toLocaleString("en-IN")}
                        </Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: border }} />
                    <View style={{ alignItems: "center", flex: 1 }}>
                        <Text style={{ fontSize: 10, color: txtSec, textTransform: "uppercase" }}>Closing Balance</Text>
                        <Text style={{ fontSize: 20, fontWeight: "900", color: periodClosingBalance >= 0 ? COLORS.success : COLORS.danger, marginTop: 4 }}>
                            {periodClosingBalance > 0 ? "+" : (periodClosingBalance < 0 ? "-" : "")} ₹{Math.abs(periodClosingBalance).toLocaleString("en-IN")}
                        </Text>
                    </View>
                </View>

                {unvalidatedCount > 0 && (
                    <View style={{ backgroundColor: isDark ? '#2a1a05' : '#FEF3C7', paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: isDark ? '#451a03' : '#FDE68A' }}>
                        <Ionicons name="alert-circle" size={16} color="#D97706" />
                        <Text style={{ fontSize: 11.5, color: isDark ? '#FBBF24' : '#92400E', fontWeight: '700', marginLeft: 6, flex: 1 }}>
                            {unvalidatedCount} unvalidated / counter-validation pending entry(s) highlighted in orange and excluded from balance calculation.
                        </Text>
                    </View>
                )}

                {/* Fixed Device Width Table View */}
                {txnsLoading ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                        <Text style={{ color: txtSec, marginTop: 10, fontSize: 12 }}>Loading statements…</Text>
                    </View>
                ) : (
                    <View style={{ flex: 1 }}>
                        {/* Table Header Row */}
                        <View style={[localStyles.tableHeaderRow, { backgroundColor: isDark ? "#1e293b" : "#f1f5f9", borderBottomColor: border }]}>
                            <Text style={[localStyles.tableHeaderCell, { flex: 1.3, color: txtPri }]}>Date</Text>
                            <Text style={[localStyles.tableHeaderCell, { flex: 2.8, color: txtPri }]}>Account/narration</Text>
                            <Text style={[localStyles.tableHeaderCell, { flex: 1.5, color: txtPri }]}>Vch Type</Text>
                            <Text style={[localStyles.tableHeaderCell, { flex: 1.4, color: txtPri, textAlign: "right" }]}>Dr Amount</Text>
                            <Text style={[localStyles.tableHeaderCell, { flex: 1.4, color: txtPri, textAlign: "right" }]}>Cr Amount</Text>
                            <Text style={[localStyles.tableHeaderCell, { flex: 2.2, color: txtPri, textAlign: "right" }]}>Balance Amount</Text>
                        </View>

                        {/* Rows */}
                        <FlatList
                            data={processedTransactions}
                            keyExtractor={(item, index) => item._id || String(index)}
                            contentContainerStyle={{ paddingBottom: 150 }}
                            ListHeaderComponent={renderOpeningBalanceRow}
                            ListFooterComponent={renderClosingBalanceRow}
                            renderItem={renderTransactionRow}
                            ListEmptyComponent={
                                <View style={styles.center}>
                                    <Ionicons name="receipt-outline" size={48} color={border} />
                                    <Text style={{ color: txtSec, marginTop: 12, textAlign: "center" }}>
                                        No transactions recorded for this period.
                                    </Text>
                                </View>
                            }
                        />
                    </View>
                )}

                {/* Sticky Action Footer */}
                <View style={[styles.footer, { backgroundColor: cardBg, borderTopColor: border }]}>
                    <TouchableOpacity
                        style={[styles.pdfBtn, isGenerating && G.opacity07]}
                        onPress={generateAndShowPdf}
                        disabled={isGenerating}
                        activeOpacity={0.8}
                    >
                        {isGenerating ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Ionicons name="document-text" size={20} color="#fff" />
                                <Text style={styles.pdfBtnTxt}>Show PDF Report</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    /* ── Render ─────────────────────────────────────────────────────────── */
    return (
        <SafeAreaView style={[styles.root, { backgroundColor: bg }]} edges={["top", "left", "right"]}>
            <AppHeader
                title="Show Ledgers"
                onBackPress={() => router.back()}
                rightAction={() => (
                    <TouchableOpacity onPress={fetchMaster} style={{ padding: 4 }}>
                        <Ionicons name="refresh" size={22} color="#fff" />
                    </TouchableOpacity>
                )}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >

            {selectedLedger ? renderLedgerStatement() : (
                <>
                    {/* Search bar */}
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                        <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: border, backgroundColor: cardBg }}>
                            <Text style={{ fontSize: 13, color: txtPri, fontWeight: "700", marginBottom: 8 }}>
                                All Ledger Accounts
                            </Text>
                            <View style={[styles.searchBox, { backgroundColor: inputBg, borderColor: border }]}>
                                <Ionicons name="search" size={18} color={txtSec} />
                                <TextInput
                                    style={[styles.searchInput, { color: txtPri }]}
                                    placeholder="Search by name or group…"
                                    placeholderTextColor={txtSec}
                                    value={search}
                                    onChangeText={setSearch}
                                />
                                {search.length > 0 && (
                                    <TouchableOpacity onPress={() => setSearch("")}>
                                        <Ionicons name="close-circle" size={18} color={txtSec} />
                                    </TouchableOpacity>
                                )}
                            </View>
                            {!masterLoading && (
                                <Text style={{ fontSize: 11, color: txtSec, marginTop: 6 }}>
                                    {filteredLedgers.length} ledger{filteredLedgers.length !== 1 ? "s" : ""} found
                                </Text>
                            )}
                        </View>
                    </TouchableWithoutFeedback>

                    {/* Ledger list */}
                    {masterLoading ? (
                        <View style={styles.center}>
                            <ActivityIndicator size="large" color={COLORS.primary} />
                            <Text style={{ color: txtSec, marginTop: 10, fontSize: 12 }}>Loading all ledgers…</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={filteredLedgers}
                            keyExtractor={(item: any) => item._id}
                            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
                            ListHeaderComponent={
                                pettyCashLedgers.length > 0 ? (
                                    <View style={{ marginBottom: 16 }}>
                                        <Text style={{ fontSize: 13, color: txtPri, fontWeight: "700", marginBottom: 8 }}>
                                            Petty Cash Books (Cash-in-hand)
                                        </Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
                                            {pettyCashLedgers.map((item) => {
                                                const bal = item.currentBalance !== undefined && item.currentBalance !== null
                                                    ? item.currentBalance
                                                    : (item.openingBalanceType === "Cr" ? -(item.openingBalance || 0) : (item.openingBalance || 0));
                                                
                                                const isDr = bal >= 0;
                                                const formattedBal = `₹${Math.abs(bal).toLocaleString("en-IN")} ${isDr ? "Dr" : "Cr"}`;

                                                return (
                                                    <TouchableOpacity
                                                        key={`petty-cash-btn-${item._id}`}
                                                        style={{
                                                            paddingHorizontal: 14,
                                                            paddingVertical: 10,
                                                            borderRadius: 12,
                                                            borderWidth: 1,
                                                            borderColor: isDr ? COLORS.primary : COLORS.danger,
                                                            backgroundColor: cardBg,
                                                            minWidth: 130,
                                                            alignItems: 'center',
                                                            shadowColor: "#000",
                                                            shadowOffset: { width: 0, height: 1 },
                                                            shadowOpacity: 0.1,
                                                            shadowRadius: 1,
                                                            elevation: 1,
                                                        }}
                                                        onPress={() => {
                                                            setSelectedLedger(item);
                                                            setStartDate("");
                                                            setEndDate("");
                                                        }}
                                                    >
                                                        <Ionicons name="wallet-outline" size={20} color={isDr ? COLORS.primary : COLORS.danger} style={{ marginBottom: 4 }} />
                                                        <Text style={{ fontSize: 12, fontWeight: "700", color: txtPri, textAlign: 'center' }} numberOfLines={1}>
                                                            {item.ledgerName.replace("Petty Cash - ", "")}{item.enrollmentNo ? ` (${item.enrollmentNo})` : ""}
                                                        </Text>
                                                        <Text style={{ fontSize: 11, fontWeight: "800", color: isDr ? COLORS.primary : COLORS.danger, marginTop: 4 }}>
                                                            {formattedBal}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </ScrollView>
                                    </View>
                                ) : null
                            }
                            renderItem={({ item }: { item: any }) => {
                                const isSelected = (selectedLedger as any)?._id === item._id;
                                const badgeColor = groupBadgeColor(item.groupName);
                                const bal = item.currentBalance !== undefined && item.currentBalance !== null
                                    ? item.currentBalance
                                    : (item.openingBalanceType === "Cr" ? -(item.openingBalance || 0) : (item.openingBalance || 0));

                                return (
                                    <TouchableOpacity
                                        style={[
                                            styles.ledgerCard,
                                            {
                                                backgroundColor: cardBg,
                                                borderColor: isSelected ? COLORS.primary : border,
                                                borderWidth: isSelected ? 2 : 1,
                                            },
                                        ]}
                                        onPress={() => {
                                            setSelectedLedger(isSelected ? null : item);
                                            setStartDate("");
                                            setEndDate("");
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        {/* Left accent */}
                                        <View style={[styles.ledgerAccent, { backgroundColor: badgeColor }]} />

                                        <View style={{ flex: 1, paddingLeft: 12 }}>
                                            <Text style={{ fontSize: 15, fontWeight: "700", color: txtPri }} numberOfLines={1}>
                                                {item.ledgerName}{item.enrollmentNo ? ` (${item.enrollmentNo})` : ""}
                                            </Text>
                                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 8 }}>
                                                <View style={[styles.groupBadge, { backgroundColor: badgeColor + "20", borderColor: badgeColor + "60" }]}>
                                                    <Text style={[styles.groupBadgeTxt, { color: badgeColor }]}>{item.groupName ?? "General"}</Text>
                                                </View>
                                                {bal !== undefined && (
                                                    <Text style={{ fontSize: 11, color: txtSec }}>
                                                        Bal: <Text style={{ fontWeight: "700", color: (bal ?? 0) >= 0 ? COLORS.primary : COLORS.danger }}>
                                                            ₹{Math.abs(bal ?? 0).toLocaleString("en-IN")} {(bal ?? 0) >= 0 ? "Dr" : "Cr"}
                                                        </Text>
                                                    </Text>
                                                )}
                                            </View>
                                        </View>

                                        <View style={[styles.radioCircle, { borderColor: isSelected ? COLORS.primary : txtSec }]}>
                                            {isSelected && <View style={styles.radioInner} />}
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                            ListEmptyComponent={
                                <View style={styles.center}>
                                    <Ionicons name="layers-outline" size={52} color={border} />
                                    <Text style={{ color: txtSec, marginTop: 12, textAlign: "center" }}>
                                        {search ? `No ledgers match "${search}"` : "No ledger accounts found.\nSet up ledgers in Ledger Master first."}
                                    </Text>
                                </View>
                            }
                        />
                    )}
                </>
            )}

            {/* 🖨️ Custom Full-Screen Print Preview Modal */}
            <Modal visible={!!previewHtml} animationType="slide" onRequestClose={() => setPreviewHtml(null)}>
                <SafeAreaView style={[styles.modalSafe, { backgroundColor: bg }]} edges={["top", "bottom"]}>
                    {/* Header Action Bar */}
                    <View style={[styles.modalHeader, { backgroundColor: cardBg, borderBottomColor: border }]}>
                        <TouchableOpacity onPress={() => setPreviewHtml(null)} style={styles.modalCancelBtn}>
                            <Text style={styles.modalCancelTxt}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => setPrintOrientation(prev => prev === Print.Orientation.portrait ? Print.Orientation.landscape : Print.Orientation.portrait)}
                            style={styles.modalOrientBtn}
                        >
                            <Ionicons name={printOrientation === Print.Orientation.landscape ? "document-text" : "document-text-outline"} size={18} color={txtPri} />
                            <Text style={[styles.modalOrientTxt, { color: txtPri }]}>
                                {printOrientation === Print.Orientation.portrait ? "Portrait" : "Landscape"}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => {
                                if (previewHtml) {
                                    // Actually invoke Android/iOS System Print Dialog
                                    Print.printAsync({ html: previewHtml, orientation: printOrientation as any });
                                }
                            }}
                            style={styles.modalPrintBtn}
                        >
                            <Text style={styles.modalPrintTxt}>Select Printer</Text>
                        </TouchableOpacity>
                    </View>

                    {/* WebView Scrollable Preview */}
                    {previewHtml && (
                        <WebView
                            originWhitelist={['*']}
                            source={{ html: previewHtml }}
                            style={styles.webview}
                            showsVerticalScrollIndicator={true}
                        />
                    )}
                </SafeAreaView>
            </Modal>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

