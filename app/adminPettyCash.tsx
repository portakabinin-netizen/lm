import React, { useState, useEffect, useMemo } from "react";
import { 
    View, 
    Text, 
    StyleSheet, 
    FlatList, 
    TouchableOpacity, 
    ActivityIndicator, 
    TextInput, 
    Modal, 
    Platform, 
    ScrollView, 
    useColorScheme,
    Pressable,
    RefreshControl
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import DateTimePicker from "@react-native-community/datetimepicker";

import { AppHeader } from "@/components/AppHeader";
import { useUserContext } from "@/context/AuthContext";
import { appService } from "@/UtilServices/appHelper";
import { C, useTheme } from "@/hooks/Theme";

const STATEMENT_HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Petty Cash Statement - {{USER_NAME}}</title>
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #1e293b; background-color: #ffffff; }
        .header { border-bottom: 2px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { margin: 0; color: #1e3a8a; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
        .header p { margin: 5px 0 0; color: #64748b; font-size: 14px; }
        .header .meta { margin-top: 15px; font-weight: bold; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; }
        
        .summary-box { display: flex; justify-content: space-between; margin-bottom: 30px; background: #f0fdf4; padding: 20px; border-radius: 8px; border: 1px solid #bbf7d0; }
        .summary-item { text-align: center; flex: 1; }
        .summary-item label { display: block; font-size: 11px; color: #475569; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; font-weight: bold; }
        .summary-item span { font-size: 18px; font-weight: bold; color: #0f172a; }
        
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #f1f5f9; color: #475569; font-weight: bold; text-align: left; padding: 12px; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; }
        td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155; }
        
        .val-in { color: #166534; font-weight: bold; }
        .val-out { color: #991b1b; font-weight: bold; }
        .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; }
        .badge-in { background-color: #dcfce7; color: #166534; }
        .badge-out { background-color: #fee2e2; color: #991b1b; }
        .mono { font-family: monospace; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Petty Cash Statement</h1>
        <p>Double-Entry Cash Book Ledger Audit Log</p>
        <div class="meta">
            <strong>Account Holder:</strong> {{USER_NAME}} <br/>
            <strong>Ledger Name:</strong> {{LEDGER_NAME}} <br/>
            <strong>Date Range:</strong> {{DATE_RANGE}}
        </div>
    </div>

    <div class="summary-box">
        <div class="summary-item" style="border-right: 1px solid #bbf7d0;">
            <label>Total Cash Added (In)</label>
            <span class="val-in">₹{{TOTAL_DEBIT}}</span>
        </div>
        <div class="summary-item" style="border-right: 1px solid #bbf7d0;">
            <label>Total Cash Spent (Out)</label>
            <span class="val-out">₹{{TOTAL_CREDIT}}</span>
        </div>
        <div class="summary-item">
            <label>Closing Net Balance</label>
            <span style="color: #0f172a;">₹{{CLOSING_BALANCE}}</span>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Voucher No</th>
                <th>Type</th>
                <th>Description / Contra Ledger</th>
                <th>Inflow (Dr)</th>
                <th>Outflow (Cr)</th>
            </tr>
        </thead>
        <tbody>
            {{ROWS}}
        </tbody>
    </table>
</body>
</html>
`;

export function AdminPettyCashView({ hideHeader = false }: { hideHeader?: boolean }) {
    const router = useRouter();
    const { forceUserMode } = useLocalSearchParams<{ forceUserMode?: string }>();
    const { user } = useUserContext();
    const isDarkMode = useColorScheme() === "dark";
    const th = useTheme(isDarkMode);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [books, setBooks] = useState<any[]>([]);
    
    // Modal states
    const [selectedBook, setSelectedBook] = useState<any | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [txnsLoading, setTxnsLoading] = useState(false);
    const [txns, setTxns] = useState<any[]>([]);

    // Date range states
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    
    // Export state
    const [exporting, setExporting] = useState(false);

    // Date Picker state
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);

    // Secure Declaration states
    const [declareVoucherId, setDeclareVoucherId] = useState("");
    const [declareAction, setDeclareAction] = useState<'pay' | 'receive'>('receive');
    const [declareModalVisible, setDeclareModalVisible] = useState(false);
    const [declarePassword, setDeclarePassword] = useState("");
    const [declareLoading, setDeclareLoading] = useState(false);

    // Enforce Authorization (true = Admin/Finance view all, false = User view own register)
    const hasAccess = useMemo(() => {
        if (forceUserMode === 'true') return false;
        const role = user?.userRole as string;
        return role === "CorpAdmin" || role === "userAdmin" || role === "Finance";
    }, [user, forceUserMode]);

    const fetchBalances = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            const res = await appService.httpClient.get("finance/petty-cash/balances");
            if (res.data?.success) {
                const balancesList = res.data.data || [];
                setBooks(balancesList);

                // If non-admin user, resolve their own book immediately
                if (!hasAccess) {
                    const own = balancesList.find((b: any) => 
                        String(b.refId) === String(user?.userId) || 
                        String(b.refId) === String(user?._id)
                    );
                    if (own) {
                        setSelectedBook(own);
                        loadTransactions(own._id, "", "");
                    }
                }
            } else {
                appService.showToast(res.data?.message || "Failed to load balances", "Error");
            }
        } catch (err: any) {
            appService.showToast(err?.response?.data?.message || "Server connection failed", "Error");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchBalances();
    }, [hasAccess, user]);

    // Handle book click
    const handleViewTransactions = async (book: any) => {
        setSelectedBook(book);
        setTxns([]);
        setStartDate("");
        setEndDate("");
        setModalVisible(true);
        loadTransactions(book._id, "", "");
    };

    const loadTransactions = async (ledgerId: string, start: string, end: string) => {
        setTxnsLoading(true);
        try {
            const params: any = { ledgerId };
            if (start) params.startDate = start;
            if (end) params.endDate = end;

            const res = await appService.httpClient.get("finance/petty-cash/transactions", { params });
            if (res.data?.success) {
                setTxns(res.data.data || []);
            } else {
                appService.showToast(res.data?.message || "Failed to load transactions", "Error");
            }
        } catch (err: any) {
            appService.showToast(err?.response?.data?.message || "Failed to fetch statement", "Error");
        } finally {
            setTxnsLoading(false);
        }
    };

    const formatToDDMMYYYY = (dateStr: string) => {
        if (!dateStr) return "";
        const parts = dateStr.trim().split("-");
        if (parts.length === 3 && parts[0].length === 4) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr;
    };

    const parseToYYYYMMDD = (dateStr: string) => {
        if (!dateStr) return "";
        const parts = dateStr.trim().split("-");
        if (parts.length === 3 && parts[0].length === 2) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return dateStr;
    };

    const handleApplyDateFilter = () => {
        if (!selectedBook) return;
        loadTransactions(selectedBook._id, parseToYYYYMMDD(startDate), parseToYYYYMMDD(endDate));
    };

    const setPresetRange = (preset: "today" | "week" | "month" | "reset") => {
        const today = new Date();
        let startStr = "";
        let endStr = today.toISOString().split("T")[0];

        if (preset === "today") {
            startStr = endStr;
        } else if (preset === "week") {
            const weekAgo = new Date();
            weekAgo.setDate(today.getDate() - 7);
            startStr = weekAgo.toISOString().split("T")[0];
        } else if (preset === "month") {
            const monthAgo = new Date();
            monthAgo.setDate(today.getDate() - 30);
            startStr = monthAgo.toISOString().split("T")[0];
        } else {
            startStr = "";
            endStr = "";
        }

        setStartDate(formatToDDMMYYYY(startStr));
        setEndDate(formatToDDMMYYYY(endStr));
        if (selectedBook) {
            loadTransactions(selectedBook._id, startStr, endStr);
        }
    };

    // Open Secure declaration Dialog
    const handleOpenDeclaration = (voucherId: string, action: 'pay' | 'receive') => {
        setDeclareVoucherId(voucherId);
        setDeclareAction(action);
        setDeclarePassword("");
        setDeclareModalVisible(true);
    };

    const handleConfirmDeclaration = async () => {
        if (!declarePassword.trim()) {
            appService.showToast("Please enter your login password.", "Info");
            return;
        }

        setDeclareLoading(true);
        try {
            const res = await appService.httpClient.post("finance/contra/approve", {
                voucherId: declareVoucherId,
                action: declareAction,
                password: declarePassword
            });

            if (res.data?.success) {
                appService.showToast(res.data.message || "Declaration successfully signed!", "Success");
                setDeclareModalVisible(false);
                if (selectedBook) {
                    loadTransactions(selectedBook._id, parseToYYYYMMDD(startDate), parseToYYYYMMDD(endDate));
                }
                fetchBalances();
            } else {
                appService.showToast(res.data?.message || "Failed to sign declaration", "Error");
            }
        } catch (err: any) {
            appService.showToast(err?.response?.data?.message || "Invalid password verification.", "Error");
        } finally {
            setDeclareLoading(false);
        }
    };

    // Calculate Summary Stats
    const summaryStats = useMemo(() => {
        let totalVal = 0;
        let activeBooks = 0;
        let totalDebit = 0;
        let totalCredit = 0;

        books.forEach(b => {
            totalVal += b.balance || 0;
            if (b.transactionCount > 0) activeBooks++;
            totalDebit += b.totalDebit || 0;
            totalCredit += b.totalCredit || 0;
        });

        return {
            totalVault: totalVal,
            activeCount: books.length,
            totalDebit,
            totalCredit
        };
    }, [books]);

    // Search Filtering
    const filteredBooks = useMemo(() => {
        if (!searchQuery) return books;
        const q = searchQuery.toLowerCase();
        return books.filter(b => 
            b.name?.toLowerCase().includes(q) || 
            b.userName?.toLowerCase().includes(q)
        );
    }, [books, searchQuery]);

    // Generate PDF & Share Statement
    const handleGeneratePdf = async () => {
        if (!selectedBook) return;
        setExporting(true);

        try {
            const rowsHtml = txns.map(t => {
                const date = formatToDDMMYYYY(t.date.split("T")[0]);
                const dAmt = t.debit > 0 ? `₹${t.debit.toFixed(2)}` : "-";
                const cAmt = t.credit > 0 ? `₹${t.credit.toFixed(2)}` : "-";
                
                // Construct counter ledger info
                const contraLedgers = t.otherLegs?.map((l: any) => l.ledgerName + (l.enrollmentNo ? ` (${l.enrollmentNo})` : "")).join(", ") || "General Entries";
                const contraHtml = `<strong>${t.narration}</strong>${t.isPending ? ' <span style="color:#d97706; font-size:10px; font-weight:bold;">(PENDING DECLARATION)</span>' : ''}<br/><span style="color:#64748b; font-size:11px;">Counterpart: ${contraLedgers}</span>`;

                return `
                    <tr>
                        <td>${date}</td>
                        <td class="mono">${t.voucherNo}</td>
                        <td><span class="badge ${t.type === "Dr" ? "badge-in" : "badge-out"}">${t.voucherType}</span></td>
                        <td>${contraHtml}</td>
                        <td class="${t.type === "Dr" ? "val-in" : ""}">${dAmt}</td>
                        <td class="${t.type === "Cr" ? "val-out" : ""}">${cAmt}</td>
                    </tr>
                `;
            }).join("");

            const dateRangeStr = (startDate || endDate) 
                ? `${startDate || "Beginning"} to ${endDate || "Today"}` 
                : "All Time Cumulative Statement";

            // Aggregate transaction totals in the current filter scope
            let currentDebit = 0;
            let currentCredit = 0;
            txns.forEach(t => {
                // If receiver has not approved, it's not counted in debit
                if (t.isPending) return;
                currentDebit += t.debit || 0;
                currentCredit += t.credit || 0;
            });
            const currentBal = selectedBook.openingBal + currentDebit - currentCredit;

            let html = STATEMENT_HTML_TEMPLATE
                .replace(/{{USER_NAME}}/g, selectedBook.userName + (selectedBook.enrollmentNo ? ` (${selectedBook.enrollmentNo})` : ""))
                .replace(/{{LEDGER_NAME}}/g, selectedBook.name)
                .replace("{{DATE_RANGE}}", dateRangeStr)
                .replace("{{TOTAL_DEBIT}}", currentDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 }))
                .replace("{{TOTAL_CREDIT}}", currentCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 }))
                .replace("{{CLOSING_BALANCE}}", currentBal.toLocaleString("en-IN", { minimumFractionDigits: 2 }))
                .replace("{{ROWS}}", rowsHtml || `<tr><td colspan="6" style="text-align:center; color:#64748b;">No transactions recorded in this period.</td></tr>`);

            const { uri } = await Print.printToFileAsync({ html, base64: false });
            await Sharing.shareAsync(uri, { 
                mimeType: "application/pdf", 
                dialogTitle: `Petty Cash Statement - ${selectedBook.userName}`, 
                UTI: "com.adobe.pdf" 
            });

        } catch (error: any) {
            appService.showToast("Failed to compile statement PDF: " + error.message, "Error");
        } finally {
            setExporting(false);
        }
    };

    // ─── ADMIN PANELS ────────────────────────────────────────────────────────
    const AdminMainContent = (
        loading ? (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={C.primary} />
                <Text style={[styles.loadingTxt, { color: th.txtSec }]}>Reconciling ledger folios...</Text>
            </View>
        ) : (
            <View style={{ flex: 1 }}>
                {/* Vault Analytics Dashboard Banner */}
                <View style={[styles.banner, { backgroundColor: th.card, borderBottomColor: th.border }]}>
                    <Text style={[styles.bannerTitle, { color: th.txt }]}>Total Vault Cash Reserve</Text>
                    <Text style={[styles.bannerBalance, { color: C.primary }]}>
                        ₹{summaryStats.totalVault.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </Text>
                    
                    <View style={styles.statGrid}>
                        <View style={styles.statCell}>
                            <Text style={styles.statLabel}>Active Books</Text>
                            <Text style={[styles.statVal, { color: th.txt }]}>{summaryStats.activeCount}</Text>
                        </View>
                        <View style={[styles.statCell, { borderLeftWidth: 1, borderLeftColor: th.border }]}>
                            <Text style={styles.statLabel}>Total Inflows</Text>
                            <Text style={[styles.statVal, { color: C.success }]}>
                                ₹{summaryStats.totalDebit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </Text>
                        </View>
                        <View style={[styles.statCell, { borderLeftWidth: 1, borderLeftColor: th.border }]}>
                            <Text style={styles.statLabel}>Total Outflows</Text>
                            <Text style={[styles.statVal, { color: C.danger }]}>
                                ₹{summaryStats.totalCredit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Search and Filters */}
                <View style={[styles.searchSection, { backgroundColor: th.card, borderBottomColor: th.border }]}>
                    <View style={[styles.searchBar, { backgroundColor: th.inputBg, borderColor: th.border }]}>
                        <Ionicons name="search" size={18} color={th.txtSec} />
                        <TextInput 
                            style={[styles.searchInput, { color: th.txt }]}
                            placeholder="Search account holder or ledger..."
                            placeholderTextColor={th.txtSec}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery("")}>
                                <Ionicons name="close-circle" size={18} color={th.txtSec} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Petty Cash List */}
                <FlatList 
                    data={filteredBooks}
                    keyExtractor={item => item._id}
                    contentContainerStyle={styles.listPadding}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => fetchBalances(true)} colors={[C.primary]} tintColor={C.primary} />
                    }
                    renderItem={({ item }) => (
                        <TouchableOpacity 
                            style={[styles.bookCard, { backgroundColor: th.card, borderColor: th.border }]}
                            onPress={() => handleViewTransactions(item)}
                            activeOpacity={0.7}
                        >
                            <View style={{ flex: 1 }}>
                                <View style={styles.cardHeader}>
                                    <Text style={[styles.cardTitle, { color: th.txt }]}>{item.userName}{item.enrollmentNo ? ` (${item.enrollmentNo})` : ""}</Text>
                                    <View style={[styles.badge, { backgroundColor: th.isDark ? "#312e81" : "#e0e7ff" }]}>
                                        <Text style={[styles.badgeText, { color: C.accent }]}>{item.transactionCount} Txns</Text>
                                    </View>
                                </View>
                                <Text style={[styles.cardSub, { color: th.txtSec }]}>{item.name}</Text>
                                
                                <View style={styles.cardFlowGrid}>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                        <Ionicons name="arrow-down" size={12} color={C.success} />
                                        <Text style={[styles.flowVal, { color: th.txtSec }]}>
                                            ₹{item.totalDebit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                        <Ionicons name="arrow-up" size={12} color={C.danger} />
                                        <Text style={[styles.flowVal, { color: th.txtSec }]}>
                                            ₹{item.totalCredit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            <View style={{ alignItems: "flex-end", justifyContent: "center", marginLeft: 16 }}>
                                <Text style={[styles.cardBalance, { color: item.balance >= 0 ? C.primary : C.danger }]}>
                                    ₹{item.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </Text>
                                <Ionicons name="chevron-forward" size={20} color={th.txtSec} style={{ marginTop: 6 }} />
                            </View>
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        <View style={styles.emptyView}>
                            <Ionicons name="wallet" size={60} color={th.border} />
                            <Text style={[styles.emptyTxt, { color: th.txtSec }]}>No petty cash registers found.</Text>
                        </View>
                    }
                />
            </View>
        )
    );

    // ─── OPERATIONAL USER PANELS ─────────────────────────────────────────────
    const UserMainContent = (
        loading ? (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={C.primary} />
                <Text style={[styles.loadingTxt, { color: th.txtSec }]}>Opening Petty Cash Passbook...</Text>
            </View>
        ) : !selectedBook ? (
            <View style={styles.center}>
                <Ionicons name="wallet-outline" size={80} color={th.border} />
                <Text style={[styles.errorTitle, { color: th.txt, marginTop: 12 }]}>No Passbook Assigned</Text>
                <Text style={[styles.errorSubtitle, { color: th.txtSec }]}>
                    You do not have a Petty Cash book linked to your profile. Please contact your Corporate Administrator.
                </Text>
            </View>
        ) : (
            <View style={{ flex: 1 }}>
                {/* Personal Ledger Vault Banner */}
                <View style={[styles.banner, { backgroundColor: th.card, borderBottomColor: th.border, padding: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                            <Text style={{ color: th.txtSec, fontSize: 11, fontWeight: 'bold', marginRight: 6 }}>
                                CASH IN HAND
                            </Text>
                            <Text style={{ color: selectedBook.balance >= 0 ? C.success : C.danger, fontSize: 16, fontWeight: 'bold' }}>
                                ₹{selectedBook.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </Text>
                        </View>
                        <View style={{ flexDirection: "row", marginTop: 4 }}>
                            <Text style={{ color: th.txtSec, fontSize: 10, marginRight: 8 }}>Op: ₹{selectedBook.openingBal}</Text>
                            <Text style={{ color: C.success, fontSize: 10, marginRight: 8 }}>In: +₹{selectedBook.totalDebit}</Text>
                            <Text style={{ color: C.danger, fontSize: 10 }}>Out: -₹{selectedBook.totalCredit}</Text>
                        </View>
                    </View>
                    <TouchableOpacity 
                        style={[{ backgroundColor: C.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }]}
                        onPress={handleGeneratePdf}
                        disabled={exporting || txnsLoading || txns.length === 0}
                        activeOpacity={0.8}
                    >
                        {exporting ? <ActivityIndicator size="small" color="#fff" /> : (
                            <>
                              <Ionicons name="document-text" size={12} color="#fff" style={{ marginRight: 4 }} />
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>PDF / Print</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Audit date filter */}
                <View style={[styles.filterPanel, { backgroundColor: th.card, borderBottomColor: th.border, paddingVertical: 8, paddingHorizontal: 8 }]}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <Text style={[styles.panelTitle, { color: th.txt, marginBottom: 0, fontSize: 12, fontWeight: 'bold' }]}>Transaction Filter</Text>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity style={{ backgroundColor: th.border, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4 }} onPress={() => setPresetRange("today")}>
                                <Text style={{ color: th.txt, fontSize: 10 }}>Today</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={{ backgroundColor: th.border, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4 }} onPress={() => setPresetRange("week")}>
                                <Text style={{ color: th.txt, fontSize: 10 }}>7D</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={{ backgroundColor: th.border, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4 }} onPress={() => setPresetRange("month")}>
                                <Text style={{ color: th.txt, fontSize: 10 }}>30D</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    
                    <View style={{ flexDirection: "row", alignItems: 'center', gap: 6 }}>
                        <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowStartPicker(true)}>
                            <TextInput 
                                style={[styles.dateInput, { backgroundColor: th.inputBg, color: th.txt, borderColor: th.border, height: 38, fontSize: 12, paddingHorizontal: 6, paddingVertical: 0 }]}
                                placeholder="From Date"
                                placeholderTextColor={th.txtSec}
                                value={startDate}
                                editable={false}
                                pointerEvents="none"
                            />
                        </TouchableOpacity>
                        <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowEndPicker(true)}>
                            <TextInput 
                                style={[styles.dateInput, { backgroundColor: th.inputBg, color: th.txt, borderColor: th.border, height: 38, fontSize: 12, paddingHorizontal: 6, paddingVertical: 0 }]}
                                placeholder="To Date"
                                placeholderTextColor={th.txtSec}
                                value={endDate}
                                editable={false}
                                pointerEvents="none"
                            />
                        </TouchableOpacity>
                        <TouchableOpacity style={{ paddingHorizontal: 8, paddingVertical: 8, backgroundColor: C.primary + "15", borderRadius: 4 }} onPress={() => setPresetRange("reset")}>
                            <Text style={{ color: C.primary, fontSize: 11, fontWeight: 'bold' }}>Reset</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ paddingHorizontal: 10, paddingVertical: 8, backgroundColor: C.primary, borderRadius: 4 }} onPress={handleApplyDateFilter}>
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>Apply</Text>
                        </TouchableOpacity>
                    </View>

                    {showStartPicker && (
                        <DateTimePicker
                            value={startDate ? new Date(startDate) : new Date()}
                            mode="date"
                            display="default"
                            onChange={(event: any, selectedDate?: Date) => {
                                setShowStartPicker(Platform.OS === 'ios');
                                if (selectedDate) setStartDate(selectedDate.toISOString().split('T')[0]);
                            }}
                        />
                    )}
                    {showEndPicker && (
                        <DateTimePicker
                            value={endDate ? new Date(endDate) : new Date()}
                            mode="date"
                            display="default"
                            onChange={(event: any, selectedDate?: Date) => {
                                setShowEndPicker(Platform.OS === 'ios');
                                if (selectedDate) setEndDate(selectedDate.toISOString().split('T')[0]);
                            }}
                        />
                    )}
                </View>

                {/* Audit Statement transactions List */}
                {txnsLoading ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color={C.primary} />
                        <Text style={[styles.loadingTxt, { color: th.txtSec }]}>Retrieving passbook history...</Text>
                    </View>
                ) : (
                    <FlatList 
                        data={txns}
                        keyExtractor={item => item._id}
                        contentContainerStyle={styles.listPadding}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={() => fetchBalances(true)} colors={[C.primary]} tintColor={C.primary} />
                        }
                        renderItem={({ item }) => (
                            <View style={[styles.txnCard, { backgroundColor: th.card, borderColor: th.border }]}>
                                <View style={styles.txnTop}>
                                    <View>
                                        <Text style={[styles.txnDate, { color: th.txt }]}>
                                            {formatToDDMMYYYY(item.date.split("T")[0])}
                                        </Text>
                                        <Text style={styles.txnVoucher}>{item.voucherNo} · {item.voucherType}</Text>
                                    </View>
                                    <View style={[
                                        styles.flowBadge, 
                                        { backgroundColor: item.isPending ? "#fef3c7" : (item.type === "Dr" ? C.success + "15" : C.danger + "15") }
                                    ]}>
                                        <Text style={[
                                            styles.flowBadgeTxt, 
                                            { color: item.isPending ? "#d97706" : (item.type === "Dr" ? C.success : C.danger) }
                                        ]}>
                                            {item.isPending ? "PENDING" : `${item.type === "Dr" ? "+" : "-"} ₹${item.amount.toFixed(2)}`}
                                        </Text>
                                    </View>
                                </View>

                                <Text style={[styles.txnNarration, { color: th.txt }]}>
                                    {item.narration}
                                </Text>
                                
                                <View style={[styles.contraBox, { backgroundColor: th.inputBg }]}>
                                    <Text style={[styles.contraTitle, { color: th.txtSec }]}>Transfer Partner Account:</Text>
                                    {item.otherLegs?.map((ol: any, idx: number) => (
                                        <Text key={idx} style={[styles.contraItem, { color: th.txt }]}>
                                            → {ol.ledgerName}{ol.enrollmentNo ? ` (${ol.enrollmentNo})` : ""} (₹{ol.amount})
                                        </Text>
                                    ))}
                                </View>

                                {/* Operational Action trigger for pending receipt */}
                                {item.isPending && (
                                    <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: th.isDark ? "#2d1e02" : "#fef3c7", borderWidth: 1, borderColor: '#f59e0b' }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                            <Ionicons name="warning" size={16} color="#d97706" />
                                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#d97706' }}>
                                                Pending My Confirmation
                                            </Text>
                                        </View>
                                        <Text style={{ fontSize: 12, color: th.txtSec, marginBottom: 12, lineHeight: 16 }}>
                                            You must confirm you have received this amount before it is considered part of your net petty cash balance.
                                        </Text>
                                        
                                        <TouchableOpacity 
                                            style={{ height: 38, borderRadius: 8, backgroundColor: '#d97706', justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6 }}
                                            onPress={() => handleOpenDeclaration(item._id, 'receive')}
                                        >
                                            <Ionicons name="shield-checkmark" size={16} color="#fff" />
                                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                                                Confirm Receipt (I Have Received)
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        )}
                        ListEmptyComponent={
                            <View style={styles.emptyView}>
                                <Ionicons name="receipt-outline" size={60} color={th.border} />
                                <Text style={[styles.emptyTxt, { color: th.txtSec }]}>
                                    No ledger activity logged yet.
                                </Text>
                            </View>
                        }
                    />
                )}
            </View>
        )
    );

    // ─── ADMIN STATEMENT MODAL ───────────────────────────────────────────────
    const ModalContent = (
        <Modal
            visible={modalVisible}
            animationType="slide"
            transparent={false}
            onRequestClose={() => setModalVisible(false)}
        >
            <SafeAreaView style={[styles.root, { backgroundColor: th.bg }]} edges={["top", "bottom", "left", "right"]}>
                <View style={[styles.modalHeader, { borderBottomColor: th.border }]}>
                    <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                        <Ionicons name="close" size={26} color={th.txt} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.modalTitle, { color: th.txt }]}>
                            {selectedBook?.userName}{selectedBook?.enrollmentNo ? ` (${selectedBook?.enrollmentNo})` : ""}'s Statement
                        </Text>
                        <Text style={[styles.modalSub, { color: th.txtSec }]}>
                            {selectedBook?.name}
                        </Text>
                    </View>
                    <TouchableOpacity 
                        style={[styles.pdfFloatBtn, { backgroundColor: C.primary }]}
                        onPress={handleGeneratePdf}
                        disabled={exporting || txnsLoading || txns.length === 0}
                        activeOpacity={0.8}
                    >
                        {exporting ? <ActivityIndicator size="small" color="#fff" /> : (
                            <Ionicons name="share-outline" size={20} color="#fff" />
                        )}
                    </TouchableOpacity>
                </View>

                {/* Date Filters */}
                <View style={[styles.filterPanel, { backgroundColor: th.card, borderBottomColor: th.border }]}>
                    <Text style={[styles.panelTitle, { color: th.txt }]}>Filter Audit Period</Text>
                    <View style={styles.dateRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.dateLabel, { color: th.txtSec }]}>Start Date (DD-MM-YYYY)</Text>
                            <TextInput 
                                style={[styles.dateInput, { backgroundColor: th.inputBg, color: th.txt, borderColor: th.border }]}
                                placeholder="01-05-2026"
                                placeholderTextColor={th.txtSec}
                                value={startDate}
                                onChangeText={setStartDate}
                            />
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={[styles.dateLabel, { color: th.txtSec }]}>End Date (DD-MM-YYYY)</Text>
                            <TextInput 
                                style={[styles.dateInput, { backgroundColor: th.inputBg, color: th.txt, borderColor: th.border }]}
                                placeholder="19-05-2026"
                                placeholderTextColor={th.txtSec}
                                value={endDate}
                                onChangeText={setEndDate}
                            />
                        </View>
                    </View>

                    {/* Presets */}
                    <View style={styles.presetRow}>
                        <TouchableOpacity style={[styles.presetBtn, { backgroundColor: th.border }]} onPress={() => setPresetRange("today")}>
                            <Text style={[styles.presetBtnTxt, { color: th.txt }]}>Today</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.presetBtn, { backgroundColor: th.border }]} onPress={() => setPresetRange("week")}>
                            <Text style={[styles.presetBtnTxt, { color: th.txt }]}>Last 7d</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.presetBtn, { backgroundColor: th.border }]} onPress={() => setPresetRange("month")}>
                            <Text style={[styles.presetBtnTxt, { color: th.txt }]}>Last 30d</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.presetBtn, { backgroundColor: C.primary + "15" }]} onPress={() => setPresetRange("reset")}>
                            <Text style={[styles.presetBtnTxt, { color: C.primary }]}>Reset</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity 
                        style={[styles.applyBtn, { backgroundColor: C.primary }]}
                        onPress={handleApplyDateFilter}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.applyBtnTxt}>Apply Filter</Text>
                    </TouchableOpacity>
                </View>

                {/* Transaction List */}
                {txnsLoading ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color={C.primary} />
                        <Text style={[styles.loadingTxt, { color: th.txtSec }]}>Processing transactions...</Text>
                    </View>
                ) : (
                    <FlatList 
                        data={txns}
                        keyExtractor={item => item._id}
                        contentContainerStyle={styles.modalListPadding}
                        renderItem={({ item }) => (
                            <View style={[styles.txnCard, { backgroundColor: th.card, borderColor: th.border }]}>
                                <View style={styles.txnTop}>
                                    <View>
                                        <Text style={[styles.txnDate, { color: th.txt }]}>
                                            {formatToDDMMYYYY(item.date.split("T")[0])}
                                        </Text>
                                        <Text style={styles.txnVoucher}>{item.voucherNo} · {item.voucherType}</Text>
                                    </View>
                                    <View style={[
                                        styles.flowBadge, 
                                        { backgroundColor: item.isPending ? "#fef3c7" : (item.type === "Dr" ? C.success + "15" : C.danger + "15") }
                                    ]}>
                                        <Text style={[
                                            styles.flowBadgeTxt, 
                                            { color: item.isPending ? "#d97706" : (item.type === "Dr" ? C.success : C.danger) }
                                        ]}>
                                            {item.isPending ? "PENDING" : `${item.type === "Dr" ? "+" : "-"} ₹${item.amount.toFixed(2)}`}
                                        </Text>
                                    </View>
                                </View>

                                <Text style={[styles.txnNarration, { color: th.txt }]}>
                                    {item.narration}
                                </Text>
                                
                                <View style={[styles.contraBox, { backgroundColor: th.inputBg }]}>
                                    <Text style={[styles.contraTitle, { color: th.txtSec }]}>Contra / Double-Entry Leg:</Text>
                                    {item.otherLegs?.map((ol: any, idx: number) => (
                                        <Text key={idx} style={[styles.contraItem, { color: th.txt }]}>
                                            → {ol.ledgerName}{ol.enrollmentNo ? ` (${ol.enrollmentNo})` : ""} (₹{ol.amount})
                                        </Text>
                                    ))}
                                </View>

                                {/* Admin Force Clear option */}
                                {item.isPending && (
                                    <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: th.isDark ? "#1e293b" : "#eff6ff", borderWidth: 1, borderColor: '#3b82f6' }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                            <Ionicons name="shield" size={16} color="#2563eb" />
                                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#2563eb' }}>
                                                Admin Control Action
                                            </Text>
                                        </View>
                                        <Text style={{ fontSize: 12, color: th.txtSec, marginBottom: 12, lineHeight: 16 }}>
                                            This transfer is pending confirmation by the receiver. You can force authorize the clearing declaration.
                                        </Text>
                                        
                                        <TouchableOpacity 
                                            style={{ height: 38, borderRadius: 8, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6 }}
                                            onPress={() => handleOpenDeclaration(item._id, 'receive')}
                                        >
                                            <Ionicons name="checkmark-done" size={16} color="#fff" />
                                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                                                Force Authorize Clearing
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        )}
                        ListEmptyComponent={
                            <View style={styles.emptyView}>
                                <Ionicons name="receipt-outline" size={60} color={th.border} />
                                <Text style={[styles.emptyTxt, { color: th.txtSec }]}>
                                    No transactions matching selected date scope.
                                </Text>
                            </View>
                        }
                    />
                )}
            </SafeAreaView>
        </Modal>
    );

    // ─── PASSWORD DECLARATION MODAL ─────────────────────────────────────────
    const DeclarationModal = (
        <Modal
            visible={declareModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setDeclareModalVisible(false)}
        >
            <View style={styles.modalOverlay}>
                <View style={[styles.dialogCard, { backgroundColor: th.card, borderColor: th.border }]}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <Text style={[styles.dialogTitle, { color: th.txt }]}>Secure Digital Signature</Text>
                        <TouchableOpacity onPress={() => setDeclareModalVisible(false)}>
                            <Ionicons name="close" size={24} color={th.txtSec} />
                        </TouchableOpacity>
                    </View>

                    <View style={{ padding: 12, borderRadius: 8, backgroundColor: th.isDark ? "#172554" : "#eff6ff", borderLeftWidth: 4, borderLeftColor: C.primary, marginBottom: 20 }}>
                        <Text style={{ fontSize: 12, color: th.isDark ? "#93c5fd" : "#1e40af", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>Legal Declaration Statement</Text>
                        <Text style={{ fontSize: 13, color: th.isDark ? "#bfdbfe" : "#1e3a8a", marginTop: 4, lineHeight: 18, fontWeight: "600" }}>
                            "I hereby declare that I have received the specified funds into my Petty Cash book register and authorize this ledger reconciliation."
                        </Text>
                    </View>

                    <Text style={{ fontSize: 12, color: th.txtSec, fontWeight: "700", marginBottom: 8, textTransform: "uppercase" }}>
                        Enter Account Password to Sign
                    </Text>
                    <TextInput 
                        style={[styles.dialogInput, { backgroundColor: th.inputBg, color: th.txt, borderColor: th.border }]}
                        secureTextEntry
                        placeholder="••••••••"
                        placeholderTextColor={th.txtSec}
                        value={declarePassword}
                        onChangeText={setDeclarePassword}
                    />

                    <View style={{ flexDirection: "row", gap: 12, marginTop: 24 }}>
                        <TouchableOpacity 
                            style={[styles.dialogBtn, { backgroundColor: th.border }]}
                            onPress={() => setDeclareModalVisible(false)}
                        >
                            <Text style={[styles.dialogBtnTxt, { color: th.txt }]}>Cancel</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            style={[styles.dialogBtn, { backgroundColor: C.primary }]}
                            onPress={handleConfirmDeclaration}
                            disabled={declareLoading}
                        >
                            {declareLoading ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={[styles.dialogBtnTxt, { color: "#fff" }]}>Authorize & Reconcile</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );

    if (hideHeader) {
        return (
            <View style={{ flex: 1, backgroundColor: th.bg }}>
                {hasAccess ? AdminMainContent : UserMainContent}
                {ModalContent}
                {DeclarationModal}
            </View>
        );
    }

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: th.bg }]} edges={["top", "left", "right"]}>
            <AppHeader 
                title={hasAccess ? "Petty Cash Books" : (user?.userDisplayName || "My Petty Cash")} 
                onBackPress={() => router.back()} 
                rightAction={() => (
                    <TouchableOpacity onPress={() => fetchBalances(true)} style={{ padding: 4 }}>
                        <Ionicons name="refresh" size={22} color="#fff" />
                    </TouchableOpacity>
                )} 
            />

            {hasAccess ? AdminMainContent : UserMainContent}
            {ModalContent}
            {DeclarationModal}
        </SafeAreaView>
    );
}

export default function AdminPettyCashScreen() {
    return <AdminPettyCashView hideHeader={false} />;
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
    loadingTxt: { marginTop: 12, fontSize: 14, fontWeight: "600" },
    errorTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
    errorSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 },
    backBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
    backBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
    
    // Overview Banner
    banner: { padding: 20, borderBottomWidth: 1, alignItems: "center" },
    bannerTitle: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
    bannerBalance: { fontSize: 32, fontWeight: "800", marginVertical: 8, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
    statGrid: { flexDirection: "row", marginTop: 16, width: "100%" },
    statCell: { flex: 1, alignItems: "center" },
    statLabel: { fontSize: 10, color: "#94a3b8", fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
    statVal: { fontSize: 13, fontWeight: "700" },

    // Search bar
    searchSection: { padding: 12, borderBottomWidth: 1 },
    searchBar: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
    searchInput: { flex: 1, marginLeft: 8, fontSize: 14 },

    // List
    listPadding: { padding: 16 },
    bookCard: { flexDirection: "row", padding: 16, borderWidth: 1, borderRadius: 16, marginBottom: 12 },
    cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    cardTitle: { fontSize: 16, fontWeight: "800" },
    cardSub: { fontSize: 12, marginTop: 2 },
    cardBalance: { fontSize: 16, fontWeight: "800", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
    cardFlowGrid: { flexDirection: "row", marginTop: 12, gap: 16 },
    flowVal: { fontSize: 11, fontWeight: "600" },

    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    badgeText: { fontSize: 10, fontWeight: "700" },

    emptyView: { flex: 1, height: 250, justifyContent: "center", alignItems: "center" },
    emptyTxt: { marginTop: 12, fontSize: 14, fontWeight: "500" },

    // Modal
    modalHeader: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1 },
    closeBtn: { padding: 4 },
    modalTitle: { fontSize: 18, fontWeight: "800" },
    modalSub: { fontSize: 12, marginTop: 1 },
    pdfFloatBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },

    filterPanel: { padding: 16, borderBottomWidth: 1 },
    panelTitle: { fontSize: 14, fontWeight: "700", marginBottom: 12 },
    dateRow: { flexDirection: "row" },
    dateLabel: { fontSize: 11, fontWeight: "600", marginBottom: 6 },
    dateInput: { height: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 13 },
    
    presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    presetBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
    presetBtnTxt: { fontSize: 11, fontWeight: "600" },
    
    applyBtn: { marginTop: 16, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center" },
    applyBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },

    modalListPadding: { padding: 16 },
    txnCard: { padding: 16, borderWidth: 1, borderRadius: 16, marginBottom: 12 },
    txnTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    txnDate: { fontSize: 14, fontWeight: "700" },
    txnVoucher: { fontSize: 11, color: "#64748b", marginTop: 2 },
    
    flowBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    flowBadgeTxt: { fontSize: 13, fontWeight: "800", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
    
    txnNarration: { fontSize: 13, marginTop: 10, lineHeight: 18 },
    
    contraBox: { marginTop: 12, padding: 10, borderRadius: 8 },
    contraTitle: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
    contraItem: { fontSize: 11, marginTop: 4, fontWeight: "600" },

    // Verification Dialog Overlay
    modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(15, 23, 42, 0.7)", padding: 20 },
    dialogCard: { width: "100%", maxWidth: 360, padding: 24, borderRadius: 24, borderWidth: 1 },
    dialogTitle: { fontSize: 18, fontWeight: "800" },
    dialogInput: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, marginTop: 4 },
    dialogBtn: { flex: 1, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center" },
    dialogBtnTxt: { fontWeight: "700", fontSize: 14 }
});
