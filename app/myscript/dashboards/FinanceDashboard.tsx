import api_url from "@/backend/routes/base_url";
import { httpClient } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Toast from "react-native-toast-message";

// ─── Interfaces ───────────────────────────────────────────────────────────────
export interface EmployeeItem {
    _id: string;
    name: string;
    email?: string;
    mobile?: string;
    role?: string;
    active?: boolean;
    userActive?: boolean;
    monthly_rate?: number;
    daily_rate?: number;
    employeeType?: string;
    designation?: string;
}

export interface LedgerItem {
    _id: string;
    ledgerName: string;
    ledgerCode?: string;
    groupName?: string;
    openingBalance?: number;
    openingBalanceType?: "Dr" | "Cr";
    currentBalance?: number;
    currentBalanceType?: "Dr" | "Cr";
    category?: string;
}

interface Props {
    user: any;
}

// ─── Format Currency ─────────────────────────────────────────────────────────
const fmtCurrency = (val?: number) => {
    const num = Number(val) || 0;
    return `₹${Math.abs(num).toLocaleString("en-IN")}`;
};

export default function FinanceDashboard({ user }: Props) {
    const [activeTab, setActiveTab] = useState<"ledgers" | "employees">("ledgers");
    const [employees, setEmployees] = useState<EmployeeItem[]>([]);
    const [ledgers, setLedgers] = useState<LedgerItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState("");

    // Sub-filters
    const [ledgerFilter, setLedgerFilter] = useState<string>("ALL");
    const [empFilter, setEmpFilter] = useState<string>("ALL");

    // ─── Fetch Data ──────────────────────────────────────────────────────────
    const fetchFinanceData = useCallback(async (isRefresh = false) => {
        if (!user?.token) return;

        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        const token = user.token;
        const headers = { Authorization: `Bearer ${token}` };

        try {
            const sessionStr = await AsyncStorage.getItem("userSession");
            const session = sessionStr ? JSON.parse(sessionStr) : {};
            const corporateId = session.corporateId || user.corporateId;
            const params = corporateId ? { corporateId } : {};

            // 1. Fetch Employees
            const empPromise = httpClient
                ? httpClient.get("service/hr/employees", { headers, params }).catch(async () => {
                      return axios.get(`${api_url}service/hr/employees`, { headers, params });
                  })
                : axios.get(`${api_url}service/hr/employees`, { headers, params });

            // 2. Fetch Ledgers
            const ledgerPromise = httpClient
                ? httpClient.get("finance/ledgers", { headers, params }).catch(async () => {
                      return axios.get(`${api_url}finance/ledgers`, { headers, params });
                  })
                : axios.get(`${api_url}finance/ledgers`, { headers, params });

            const [empRes, ledgerRes] = await Promise.allSettled([empPromise, ledgerPromise]);

            if (empRes.status === "fulfilled") {
                const data = empRes.value.data?.data || empRes.value.data || [];
                setEmployees(Array.isArray(data) ? data : []);
            } else {
                console.warn("[FinanceDashboard] Failed to fetch employees:", empRes.reason?.message);
            }

            if (ledgerRes.status === "fulfilled") {
                const data = ledgerRes.value.data?.data || ledgerRes.value.data || [];
                setLedgers(Array.isArray(data) ? data : []);
            } else {
                console.warn("[FinanceDashboard] Failed to fetch ledgers:", ledgerRes.reason?.message);
            }

            if (empRes.status === "rejected" && ledgerRes.status === "rejected") {
                Toast.show({
                    type: "error",
                    text1: "Sync Failed",
                    text2: "Unable to reach finance services.",
                    position: "top",
                    topOffset: 80,
                });
            }
        } catch (err: any) {
            console.error("[FinanceDashboard] Unexpected fetch error:", err);
            Toast.show({
                type: "error",
                text1: "Data fetch failed",
                text2: err?.message || "Check network connection",
                position: "top",
                topOffset: 80,
            });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user?.token, user?.corporateId]);

    useEffect(() => {
        fetchFinanceData();
    }, [fetchFinanceData]);

    // ─── Filtered Data ───────────────────────────────────────────────────────
    const filteredLedgers = useMemo(() => {
        let list = ledgers;
        const q = search.trim().toLowerCase();

        if (q) {
            list = list.filter(
                (item) =>
                    item.ledgerName?.toLowerCase().includes(q) ||
                    item.ledgerCode?.toLowerCase().includes(q) ||
                    item.groupName?.toLowerCase().includes(q)
            );
        }

        if (ledgerFilter === "DEBTORS") {
            list = list.filter((item) => item.groupName?.toLowerCase().includes("debtor"));
        } else if (ledgerFilter === "CREDITORS") {
            list = list.filter((item) => item.groupName?.toLowerCase().includes("creditor"));
        } else if (ledgerFilter === "CASH_BANK") {
            list = list.filter(
                (item) =>
                    item.groupName?.toLowerCase().includes("cash") ||
                    item.groupName?.toLowerCase().includes("bank")
            );
        }

        return list;
    }, [ledgers, search, ledgerFilter]);

    const filteredEmployees = useMemo(() => {
        let list = employees;
        const q = search.trim().toLowerCase();

        if (q) {
            list = list.filter(
                (emp) =>
                    emp.name?.toLowerCase().includes(q) ||
                    emp.mobile?.toLowerCase().includes(q) ||
                    emp.email?.toLowerCase().includes(q) ||
                    emp.role?.toLowerCase().includes(q)
            );
        }

        if (empFilter === "ACTIVE") {
            list = list.filter((emp) => emp.active !== false && emp.userActive !== false);
        } else if (empFilter === "INACTIVE") {
            list = list.filter((emp) => emp.active === false || emp.userActive === false);
        }

        return list;
    }, [employees, search, empFilter]);

    // Summary calculations
    const activeStaffCount = useMemo(
        () => employees.filter((e) => e.active !== false && e.userActive !== false).length,
        [employees]
    );

    const totalLedgerBalance = useMemo(() => {
        return ledgers.reduce((acc, curr) => acc + (Number(curr.currentBalance) || 0), 0);
    }, [ledgers]);

    // ─── Render Ledger Item ──────────────────────────────────────────────────
    const renderLedgerItem = ({ item }: { item: LedgerItem }) => {
        const bal = item.currentBalance ?? item.openingBalance ?? 0;
        const isDebit = (item.currentBalanceType || item.openingBalanceType) === "Dr" || bal < 0;

        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={styles.iconBadgeLedger}>
                        <Ionicons name="book" size={20} color="#1E40AF" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                            {item.ledgerName}
                        </Text>
                        <Text style={styles.cardSubtitle}>
                            {item.groupName || "General Ledger"}
                            {item.ledgerCode ? ` • ${item.ledgerCode}` : ""}
                        </Text>
                    </View>
                    <View style={[styles.balancePill, isDebit ? styles.pillDebit : styles.pillCredit]}>
                        <Text style={[styles.balancePillText, isDebit ? styles.textDebit : styles.textCredit]}>
                            {isDebit ? "Dr" : "Cr"}
                        </Text>
                    </View>
                </View>

                <View style={styles.cardDivider} />

                <View style={styles.cardFooterRow}>
                    <View>
                        <Text style={styles.labelMuted}>Current Balance</Text>
                        <Text style={[styles.amountValue, isDebit ? styles.amountDebit : styles.amountCredit]}>
                            {fmtCurrency(bal)}
                        </Text>
                    </View>
                    {item.openingBalance !== undefined && (
                        <View style={{ alignItems: "flex-end" }}>
                            <Text style={styles.labelMuted}>Opening</Text>
                            <Text style={styles.subAmountValue}>
                                {fmtCurrency(item.openingBalance)}{" "}
                                <Text style={{ fontSize: 10 }}>({item.openingBalanceType || "Cr"})</Text>
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    // ─── Render Employee Item ────────────────────────────────────────────────
    const renderEmployeeItem = ({ item }: { item: EmployeeItem }) => {
        const isActive = item.active !== false && item.userActive !== false;
        const rate = item.monthly_rate || item.daily_rate;
        const rateLabel = item.monthly_rate ? "/month" : item.daily_rate ? "/day" : "";

        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={[styles.iconBadgeStaff, isActive ? styles.staffActive : styles.staffInactive]}>
                        <Ionicons name="person" size={20} color={isActive ? "#059669" : "#6B7280"} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <Text style={styles.cardTitle} numberOfLines={1}>
                                {item.name || "Unnamed Staff"}
                            </Text>
                            <View style={[styles.statusDot, isActive ? styles.dotActive : styles.dotInactive]} />
                        </View>
                        <Text style={styles.cardSubtitle}>
                            {item.designation || item.role || "Staff Member"}
                        </Text>
                    </View>
                    <View style={[styles.tagPill, isActive ? styles.tagActive : styles.tagInactive]}>
                        <Text style={[styles.tagText, isActive ? styles.tagTextActive : styles.tagTextInactive]}>
                            {isActive ? "Active" : "Inactive"}
                        </Text>
                    </View>
                </View>

                <View style={styles.cardDivider} />

                <View style={styles.employeeDetailsRow}>
                    {Boolean(item.mobile) && (
                        <View style={styles.contactItem}>
                            <Ionicons name="call-outline" size={14} color="#6B7280" />
                            <Text style={styles.contactText}>{item.mobile}</Text>
                        </View>
                    )}
                    {Boolean(item.email) && (
                        <View style={styles.contactItem}>
                            <Ionicons name="mail-outline" size={14} color="#6B7280" />
                            <Text style={styles.contactText} numberOfLines={1}>
                                {item.email}
                            </Text>
                        </View>
                    )}
                </View>

                {rate !== undefined && rate > 0 && (
                    <View style={styles.salaryRow}>
                        <Text style={styles.labelMuted}>Salary / Rate:</Text>
                        <Text style={styles.salaryAmount}>
                            {fmtCurrency(rate)}
                            <Text style={styles.salaryRateLabel}> {rateLabel}</Text>
                        </Text>
                    </View>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* ─── Top Stats Bar ────────────────────────────────────────────── */}
            <View style={styles.statsContainer}>
                <View style={styles.statBox}>
                    <View style={styles.statIconRow}>
                        <Ionicons name="wallet-outline" size={18} color="#2563EB" />
                        <Text style={styles.statLabel}>Ledgers</Text>
                    </View>
                    <Text style={styles.statValue}>{ledgers.length}</Text>
                    <Text style={styles.statSubText}>{fmtCurrency(totalLedgerBalance)} Net</Text>
                </View>

                <View style={styles.statBox}>
                    <View style={styles.statIconRow}>
                        <Ionicons name="people-outline" size={18} color="#059669" />
                        <Text style={styles.statLabel}>Employees</Text>
                    </View>
                    <Text style={styles.statValue}>{employees.length}</Text>
                    <Text style={styles.statSubText}>{activeStaffCount} active</Text>
                </View>
            </View>

            {/* ─── Segmented Switcher Tabs ─────────────────────────────────── */}
            <View style={styles.segmentedTabBar}>
                <TouchableOpacity
                    style={[styles.segmentBtn, activeTab === "ledgers" && styles.segmentBtnActive]}
                    onPress={() => setActiveTab("ledgers")}
                >
                    <Ionicons
                        name="book"
                        size={16}
                        color={activeTab === "ledgers" ? "#FFFFFF" : "#4B5563"}
                        style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.segmentText, activeTab === "ledgers" && styles.segmentTextActive]}>
                        Ledger Accounts ({ledgers.length})
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.segmentBtn, activeTab === "employees" && styles.segmentBtnActive]}
                    onPress={() => setActiveTab("employees")}
                >
                    <Ionicons
                        name="people"
                        size={16}
                        color={activeTab === "employees" ? "#FFFFFF" : "#4B5563"}
                        style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.segmentText, activeTab === "employees" && styles.segmentTextActive]}>
                        Employees ({employees.length})
                    </Text>
                </TouchableOpacity>
            </View>

            {/* ─── Search & Quick Filter ───────────────────────────────────── */}
            <View style={styles.searchSection}>
                <View style={styles.searchBar}>
                    <Ionicons name="search" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder={activeTab === "ledgers" ? "Search ledgers or groups..." : "Search staff by name or phone..."}
                        placeholderTextColor="#9CA3AF"
                        value={search}
                        onChangeText={setSearch}
                        autoCapitalize="none"
                        clearButtonMode="while-editing"
                    />
                    {Boolean(search) && (
                        <TouchableOpacity onPress={() => setSearch("")}>
                            <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Sub Filter Pills */}
                {activeTab === "ledgers" ? (
                    <View style={styles.filterPillsRow}>
                        {[
                            { key: "ALL", label: "All" },
                            { key: "DEBTORS", label: "Debtors" },
                            { key: "CREDITORS", label: "Creditors" },
                            { key: "CASH_BANK", label: "Cash & Bank" },
                        ].map((f) => (
                            <TouchableOpacity
                                key={f.key}
                                onPress={() => setLedgerFilter(f.key)}
                                style={[styles.chip, ledgerFilter === f.key && styles.chipActive]}
                            >
                                <Text style={[styles.chipText, ledgerFilter === f.key && styles.chipTextActive]}>
                                    {f.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                ) : (
                    <View style={styles.filterPillsRow}>
                        {[
                            { key: "ALL", label: "All" },
                            { key: "ACTIVE", label: "Active" },
                            { key: "INACTIVE", label: "Inactive" },
                        ].map((f) => (
                            <TouchableOpacity
                                key={f.key}
                                onPress={() => setEmpFilter(f.key)}
                                style={[styles.chip, empFilter === f.key && styles.chipActive]}
                            >
                                <Text style={[styles.chipText, empFilter === f.key && styles.chipTextActive]}>
                                    {f.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </View>

            {/* ─── List Area ──────────────────────────────────────────────── */}
            <View style={{ flex: 1 }}>
                {loading && !refreshing ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color="#2563EB" />
                        <Text style={styles.loadingText}>Loading finance data...</Text>
                    </View>
                ) : activeTab === "ledgers" ? (
                    <FlatList
                        data={filteredLedgers}
                        keyExtractor={(item) => item._id || Math.random().toString()}
                        renderItem={renderLedgerItem}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={() => fetchFinanceData(true)}
                                colors={["#2563EB"]}
                            />
                        }
                        ListEmptyComponent={
                            <View style={styles.centerContainer}>
                                <Ionicons name="wallet-outline" size={54} color="#D1D5DB" />
                                <Text style={styles.emptyTitle}>No Ledgers Found</Text>
                                <Text style={styles.emptySubtitle}>
                                    {search ? "Try adjusting your search criteria" : "No ledger accounts available"}
                                </Text>
                            </View>
                        }
                    />
                ) : (
                    <FlatList
                        data={filteredEmployees}
                        keyExtractor={(item) => item._id || Math.random().toString()}
                        renderItem={renderEmployeeItem}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={() => fetchFinanceData(true)}
                                colors={["#2563EB"]}
                            />
                        }
                        ListEmptyComponent={
                            <View style={styles.centerContainer}>
                                <Ionicons name="people-outline" size={54} color="#D1D5DB" />
                                <Text style={styles.emptyTitle}>No Employees Found</Text>
                                <Text style={styles.emptySubtitle}>
                                    {search ? "No staff match your search query" : "No employee records exist"}
                                </Text>
                            </View>
                        }
                    />
                )}
            </View>
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F3F4F6",
    },
    statsContainer: {
        flexDirection: "row",
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
        gap: 12,
    },
    statBox: {
        flex: 1,
        backgroundColor: "#FFFFFF",
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        ...Platform.select({
            ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
            android: { elevation: 1 },
        }),
    },
    statIconRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    statLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: "#6B7280",
        textTransform: "uppercase",
    },
    statValue: {
        fontSize: 22,
        fontWeight: "800",
        color: "#111827",
        marginTop: 4,
    },
    statSubText: {
        fontSize: 11,
        color: "#9CA3AF",
        marginTop: 2,
    },
    segmentedTabBar: {
        flexDirection: "row",
        backgroundColor: "#E5E7EB",
        marginHorizontal: 16,
        marginVertical: 8,
        borderRadius: 10,
        padding: 3,
    },
    segmentBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 10,
        borderRadius: 8,
    },
    segmentBtnActive: {
        backgroundColor: "#2563EB",
        ...Platform.select({
            ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
            android: { elevation: 2 },
        }),
    },
    segmentText: {
        fontSize: 13,
        fontWeight: "600",
        color: "#4B5563",
    },
    segmentTextActive: {
        color: "#FFFFFF",
        fontWeight: "700",
    },
    searchSection: {
        paddingHorizontal: 16,
        marginBottom: 8,
    },
    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFFFFF",
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === "ios" ? 10 : 6,
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: "#111827",
    },
    filterPillsRow: {
        flexDirection: "row",
        marginTop: 8,
        gap: 6,
    },
    chip: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        backgroundColor: "#E5E7EB",
    },
    chipActive: {
        backgroundColor: "#1E40AF",
    },
    chipText: {
        fontSize: 12,
        fontWeight: "600",
        color: "#4B5563",
    },
    chipTextActive: {
        color: "#FFFFFF",
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    card: {
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        ...Platform.select({
            ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2 },
            android: { elevation: 1 },
        }),
    },
    cardHeader: {
        flexDirection: "row",
        alignItems: "center",
    },
    iconBadgeLedger: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: "#DBEAFE",
        alignItems: "center",
        justifyContent: "center",
    },
    iconBadgeStaff: {
        width: 36,
        height: 36,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
    },
    staffActive: {
        backgroundColor: "#D1FAE5",
    },
    staffInactive: {
        backgroundColor: "#F3F4F6",
    },
    statusDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        marginLeft: 6,
    },
    dotActive: {
        backgroundColor: "#10B981",
    },
    dotInactive: {
        backgroundColor: "#9CA3AF",
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: "700",
        color: "#111827",
    },
    cardSubtitle: {
        fontSize: 12,
        color: "#6B7280",
        marginTop: 2,
    },
    balancePill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    pillDebit: {
        backgroundColor: "#FEE2E2",
    },
    pillCredit: {
        backgroundColor: "#D1FAE5",
    },
    balancePillText: {
        fontSize: 11,
        fontWeight: "800",
    },
    textDebit: {
        color: "#DC2626",
    },
    textCredit: {
        color: "#059669",
    },
    cardDivider: {
        height: 1,
        backgroundColor: "#F3F4F6",
        marginVertical: 10,
    },
    cardFooterRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
    },
    labelMuted: {
        fontSize: 11,
        fontWeight: "500",
        color: "#9CA3AF",
    },
    amountValue: {
        fontSize: 16,
        fontWeight: "800",
        marginTop: 2,
    },
    amountDebit: {
        color: "#DC2626",
    },
    amountCredit: {
        color: "#059669",
    },
    subAmountValue: {
        fontSize: 13,
        fontWeight: "600",
        color: "#4B5563",
        marginTop: 2,
    },
    tagPill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    tagActive: {
        backgroundColor: "#D1FAE5",
    },
    tagInactive: {
        backgroundColor: "#F3F4F6",
    },
    tagText: {
        fontSize: 11,
        fontWeight: "700",
    },
    tagTextActive: {
        color: "#059669",
    },
    tagTextInactive: {
        color: "#6B7280",
    },
    employeeDetailsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
    },
    contactItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    contactText: {
        fontSize: 12,
        color: "#4B5563",
    },
    salaryRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: "#F9FAFB",
    },
    salaryAmount: {
        fontSize: 13,
        fontWeight: "700",
        color: "#1E40AF",
    },
    salaryRateLabel: {
        fontSize: 11,
        fontWeight: "400",
        color: "#6B7280",
    },
    centerContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        minHeight: 250,
    },
    loadingText: {
        fontSize: 13,
        color: "#6B7280",
        marginTop: 10,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: "#374151",
        marginTop: 12,
    },
    emptySubtitle: {
        fontSize: 12,
        color: "#9CA3AF",
        marginTop: 4,
        textAlign: "center",
    },
});