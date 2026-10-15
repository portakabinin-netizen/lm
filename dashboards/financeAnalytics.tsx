import { COLORS, mkShadow } from "@/styles/stylesIndex";
import React, { useState, useMemo } from "react";
import {
    ScrollView,
    Text,
    TouchableOpacity,
    View,
    ActivityIndicator,
    Alert,
    TextInput
} from "react-native";
import { useFinanceAnalytics } from "@/hooks/financeAnalytics";
import { usePayments, Transaction, TXN_META } from "@/hooks/usePayments";
import { Ionicons } from "@expo/vector-icons";

// ─── Color palettes ───────────────────────────────────────────────────────────
const FINANCE_COLORS = ["#1D9E75", "#378ADD", "#E24B4A", "#BA7517", "#7F77DD", "#D4537E", "#639922"];

const TRANSACTION_TYPE_COLORS: Record<string, string> = {
    Income:   "#1D9E75",
    Expense:  "#E24B4A",
    Transfer: "#378ADD",
    Refund:   "#BA7517",
};

const RECEIPT_TYPE_COLORS: Record<string, string> = {
    OpsReceipt: "#1D9E75",   // Operational — green
    CapReceipt: "#378ADD",   // Capital — blue
};

const PAYMENT_TYPE_COLORS: Record<string, string> = {
    OpsPayment: "#E24B4A",   // Operational — red
    CapPayment: "#BA7517",   // Capital — amber
};

const FINANCE_TABS = ["Overview", "Receipts", "Payments", "Transactions"] as const;
type FinanceTab     = typeof FINANCE_TABS[number];

// ─────────────────────────────────────────────────────────────────────────────
const fmt = (v: number) => {
    if (v === undefined || v === null || typeof v !== 'number') return "₹0";
    return v >= 10000000 ? `₹${(v / 10000000).toFixed(2)}Cr`
    : v >= 100000 ? `₹${(v / 100000).toFixed(2)}L`
    : v >= 1000   ? `₹${(v / 1000).toFixed(1)}k`
    : `₹${v.toLocaleString("en-IN")}`;
};

function TxnCard({ txn, theme, onDelete }: { txn: Transaction; theme: any; onDelete: (id: string) => void }) {
    const { txtPri, txtSec, border, cardBg } = theme;
    const meta     = TXN_META[txn.txn_type];
    const isOut    = txn.direction === "PAYMENT";
    const amtColor = isOut ? COLORS.danger : COLORS.success;

    const handleDelete = () => {
        Alert.alert("Delete Transaction", `Delete ${txn.txn_number}?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => onDelete(txn._id) },
        ]);
    };

    return (
        <View style={{ backgroundColor: cardBg, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: border, ...mkShadow(4) }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: (meta?.color ?? COLORS.primary) + "20", justifyContent: "center", alignItems: "center" }}>
                        <Ionicons name={(meta?.icon ?? "cash-outline") as any} size={18} color={meta?.color ?? COLORS.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: txtPri }}>{meta?.label ?? txn.txn_type}</Text>
                        <Text style={{ fontSize: 10, color: txtSec }}>{txn.txn_number} • {txn.payment_mode}</Text>
                    </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: amtColor }}>{isOut ? "-" : "+"}{fmt(txn.amount)}</Text>
                    <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2, backgroundColor: txn.status === "Cleared" ? COLORS.success + "20" : COLORS.warning + "20" }}>
                        <Text style={{ fontSize: 9, fontWeight: "700", color: txn.status === "Cleared" ? COLORS.success : COLORS.warning }}>{txn.status}</Text>
                    </View>
                </View>
            </View>

            {/* Lead badge */}
            {txn.ref_lead_id && (
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: COLORS.primary + "12", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6, gap: 5 }}>
                    <Ionicons name="link-outline" size={12} color={COLORS.primary} />
                    <Text style={{ fontSize: 10, fontWeight: "700", color: COLORS.primary, flex: 1 }} numberOfLines={1}>
                        {`Lead #${txn.lead_no ?? ""} – ${txn.lead_name ?? ""}`}{txn.project_name ? ` (${txn.project_name})` : ""}
                    </Text>
                </View>
            )}

            {/* Staff badge */}
            {txn.staff_ref_id && (
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: COLORS.accent + "12", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6, gap: 5 }}>
                    <Ionicons name={txn.staff_type === "transporter" ? "car-outline" : "person-outline"} size={12} color={COLORS.accent} />
                    <Text style={{ fontSize: 10, fontWeight: "700", color: COLORS.accent, flex: 1 }} numberOfLines={1}>
                        {txn.staff_name ?? ""}{txn.staff_role ? ` · ${txn.staff_role}` : ""}
                    </Text>
                    <Text style={{ fontSize: 9, color: COLORS.accent, opacity: 0.8 }}>
                        {txn.staff_type === "transporter" ? "Transporter" : "Employee"}
                    </Text>
                </View>
            )}

            {/* Contact / Party Ledger badge */}
            {(txn as any).contact_ref_id && (
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#8B5CF620", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6, gap: 5 }}>
                    <Ionicons name="person-circle-outline" size={12} color="#8B5CF6" />
                    <Text style={{ fontSize: 10, fontWeight: "700", color: "#8B5CF6", flex: 1 }} numberOfLines={1}>
                        {(txn as any).contact_name}
                    </Text>
                    <Text style={{ fontSize: 9, color: "#8B5CF6", opacity: 0.8 }}>{(txn as any).contact_mobile} · {(txn as any).contact_type}</Text>
                </View>
            )}

            {/* Details */}
            {txn.party_name && !txn.lead_name && !txn.staff_name && !(txn as any).contact_name && (
                <Text style={{ fontSize: 11, color: txtSec, marginBottom: 3 }}><Text style={{ fontWeight: "600" }}>Party: </Text>{txn.party_name}</Text>
            )}
            {txn.description && <Text style={{ fontSize: 11, color: txtSec, marginBottom: 3 }}>{txn.description}</Text>}
            {txn.ref_invoice_no && (
                <Text style={{ fontSize: 10, color: txtSec }}><Text style={{ fontWeight: "600" }}>Ref: </Text>{txn.ref_invoice_no}</Text>
            )}

            {/* Footer */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: border }}>
                <Text style={{ fontSize: 10, color: txtSec }}>
                    {new Date(txn.txn_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </Text>
                <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

interface FinanceAnalyticsProps {
    isDark:      boolean;
    token:       string;
    dbName?:     string;
}

const FinanceAnalytics = ({ isDark, token, dbName }: FinanceAnalyticsProps) => {

    const { data: dynamicData, loading, error, refresh } = useFinanceAnalytics(token);
    const [activeTab, setActiveTab] = useState<string>("Overview");

    const {
        transactions,
        loading: txnsLoading,
        deleteTransaction,
        fetchTransactions,
        fetchSummary
    } = usePayments(token, dbName);

    const [searchQuery, setSearchQuery] = useState("");

    // ── Colours ───────────────────────────────────────────────────────────
    const bg      = isDark ? COLORS.bgDark     : COLORS.bgLight;
    const cardBg  = isDark ? COLORS.cardDark   : COLORS.cardLight;
    const border  = isDark ? COLORS.borderDark : COLORS.border;
    const txtPri  = isDark ? "#e8e8e8"         : "#1a1a1a";
    const txtSec  = isDark ? "#999"            : "#666";
    const trackBg = isDark ? "#2a2a2a"         : "#f0f0f0";
    const inputBg = isDark ? "#1a2535"         : "#f8fafc";

    const theme = useMemo(
        () => ({ isDark, bg, cardBg, border, txtPri, txtSec, trackBg, inputBg }),
        [isDark, bg, cardBg, border, txtPri, txtSec, trackBg, inputBg]
    );

    const formatCurrency = (v: number) => {
        if (v === undefined || v === null || typeof v !== 'number') return "₹0";
        return v >= 10000000 ? `₹${(v / 10000000).toFixed(2)}Cr`
        : v >= 100000 ? `₹${(v / 100000).toFixed(2)}L`
        : v >= 1000 ? `₹${(v / 1000).toFixed(1)}k`
        : `₹${v}`;
    };

    // ── Shared sub-components ────────

    const BarChart = ({
        items, colorArr,
    }: {
        items:     { label: string; value: number }[];
        colorArr:  string[];
    }) => {
        const max = Math.max(...items.map(i => i.value), 1);
        return (
            <View>
                {items.map((item, idx) => {
                    const color = colorArr[idx % colorArr.length];
                    const pct   = item.value / max;
                    return (
                        <View
                            key={item.label}
                            style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 10 }}
                        >
                            <Text style={{ width: 100, fontSize: 11, color: txtSec, textAlign: "right" }} numberOfLines={1}>
                                {item.label}
                            </Text>
                            <View style={{ flex: 1, height: 10, backgroundColor: trackBg, borderRadius: 5, overflow: "hidden" }}>
                                <View style={{
                                    width: `${Math.round(pct * 100)}%` as any,
                                    height: "100%",
                                    backgroundColor: color,
                                    borderRadius: 5,
                                }} />
                            </View>
                            <Text style={{ width: 60, fontSize: 11, color: txtPri, fontWeight: "500", textAlign: "right" }}>
                                {formatCurrency(item.value)}
                            </Text>
                        </View>
                    );
                })}
            </View>
        );
    };

    const MetricCard = ({
        label, value, sub, color,
    }: {
        label: string; value: string | number; sub: string; color?: string;
    }) => (
        <View style={{
            flex: 1,
            backgroundColor: isDark ? "#1e1e1e" : "#f5f5f5",
            borderRadius: 12,
            padding: 14,
            borderWidth: 0.5,
            borderColor: border,
        }}>
            <Text style={{ fontSize: 10, color: txtSec, fontWeight: "600", letterSpacing: 0.8, marginBottom: 6 }}>
                {label.toUpperCase()}
            </Text>
            <Text style={{ fontSize: 22, fontWeight: "700", color: color ?? txtPri }}>
                {value}
            </Text>
            <Text style={{ fontSize: 11, color: txtSec, marginTop: 4 }}>{sub}</Text>
        </View>
    );

    const SectionCard = ({ children, style }: { children: React.ReactNode; style?: any }) => (
        <View style={[{
            backgroundColor: cardBg,
            borderRadius: 16,
            borderWidth: 0.5,
            borderColor: border,
            padding: 16,
            marginBottom: 12,
        }, style]}>
            {children}
        </View>
    );

    const SectionTitle = ({ label }: { label: string }) => (
        <Text style={{ fontSize: 11, fontWeight: "700", color: txtSec, letterSpacing: 1, marginBottom: 16 }}>
            {label.toUpperCase()}
        </Text>
    );

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: bg }}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={{ marginTop: 12, color: txtSec }}>Fetching financial data...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: bg, padding: 20 }}>
                <Text style={{ color: "#E24B4A", textAlign: "center", marginBottom: 12 }}>{error}</Text>
                <TouchableOpacity onPress={refresh} style={{ backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}>
                    <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: bg }}>
            {/* ── FINANCE SUB-TABS ─────────────────────────────────────── */}
            <View style={{
                flexDirection: "row",
                backgroundColor: cardBg,
                borderBottomWidth: 0.5,
                borderBottomColor: border,
            }}>
                {FINANCE_TABS.map(tab => {
                    const isActive = activeTab === tab;
                    return (
                        <TouchableOpacity
                            key={tab}
                            onPress={() => setActiveTab(tab)}
                            activeOpacity={0.75}
                            style={{
                                flex: 1,
                                paddingVertical: 14,
                                alignItems: "center",
                                borderBottomWidth: isActive ? 3 : 0,
                                borderBottomColor: isActive ? COLORS.primary : "transparent",
                            }}
                        >
                            <Text style={{
                                fontSize: 12,
                                fontWeight: isActive ? "700" : "500",
                                color: isActive ? COLORS.primary : txtSec,
                            }}>
                                {tab}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
            >
                {activeTab === "Overview" && (
                    <>
                        <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                            <MetricCard
                                label="Invoiced Total"
                                value={formatCurrency(dynamicData.invoiceAmount)}
                                sub="Confirmed Sales"
                                color="#1D9E75"
                            />
                            <MetricCard
                                label="Quotation Pipeline"
                                value={formatCurrency(dynamicData.quotationAmount)}
                                sub="Pending conversion"
                                color="#378ADD"
                            />
                        </View>

                        <SectionCard>
                            <SectionTitle label="Sales: Quotations v/s Tax Invoices" />
                            <BarChart
                                items={dynamicData.quoteVsInvoice}
                                colorArr={["#378ADD", "#1D9E75"]}
                            />
                        </SectionCard>

                        <SectionCard>
                            <SectionTitle label="Purchases: PO v/s Invoices Received" />
                            <BarChart
                                items={dynamicData.poVsInvoiceReceived}
                                colorArr={["#BA7517", "#7F77DD"]}
                            />
                        </SectionCard>

                        <SectionCard>
                            <SectionTitle label="Pending Dues: Bills v/s Invoices" />
                            <BarChart
                                items={dynamicData.pendingComparison}
                                colorArr={["#E24B4A", "#BA7517"]}
                            />
                            <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
                                <Text style={{ fontSize: 11, color: txtSec }}>
                                    Collect: {formatCurrency(dynamicData.pendingInvoices)}
                                </Text>
                                <Text style={{ fontSize: 11, color: txtSec }}>
                                    Pay: {formatCurrency(dynamicData.pendingBills)}
                                </Text>
                            </View>
                        </SectionCard>
                        
                        <TouchableOpacity 
                            onPress={() => { refresh(); fetchTransactions(); fetchSummary(); }}
                            style={{ alignSelf: "center", marginTop: 20 }}
                        >
                            <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: "600" }}>
                                Tap to Refresh Data
                            </Text>
                        </TouchableOpacity>
                    </>
                )}

                {activeTab !== "Overview" && (
                    <View style={{ flex: 1 }}>
                        {/* Search bar */}
                        <View style={{
                            flexDirection: "row",
                            alignItems: "center",
                            backgroundColor: inputBg,
                            borderWidth: 1,
                            borderColor: border,
                            borderRadius: 10,
                            paddingHorizontal: 12,
                            height: 44,
                            marginBottom: 12,
                        }}>
                            <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={{ marginRight: 4 }} />
                            <TextInput
                                style={{ flex: 1, fontSize: 13, color: txtPri }}
                                placeholder="Search by txn#, party, description, ref#..."
                                placeholderTextColor={COLORS.textMuted}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                keyboardType="default"
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                                </TouchableOpacity>
                            )}
                        </View>

                        {txnsLoading ? (
                            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 20 }} />
                        ) : (
                            (() => {
                                // Filter by direction
                                let filtered = transactions;
                                if (activeTab === "Payments") {
                                    filtered = transactions.filter(t => t.direction === "PAYMENT");
                                } else if (activeTab === "Receipts") {
                                    filtered = transactions.filter(t => t.direction === "RECEIPT");
                                }

                                // Filter by search query
                                const q = searchQuery.trim().toLowerCase();
                                if (q) {
                                    filtered = filtered.filter(t => 
                                        t.txn_number?.toLowerCase().includes(q) ||
                                        t.party_name?.toLowerCase().includes(q) ||
                                        t.description?.toLowerCase().includes(q) ||
                                        t.ref_invoice_no?.toLowerCase().includes(q) ||
                                        String(t.amount).includes(q)
                                    );
                                }

                                if (filtered.length === 0) {
                                    return (
                                        <View style={{ alignItems: "center", marginTop: 40, opacity: 0.5 }}>
                                            <Ionicons name="receipt-outline" size={48} color={COLORS.textMuted} />
                                            <Text style={{ color: COLORS.textMuted, marginTop: 10, fontSize: 13 }}>
                                                {searchQuery ? "No matching records found" : `No ${activeTab.toLowerCase()} records found`}
                                            </Text>
                                        </View>
                                    );
                                }

                                return filtered.map(txn => (
                                    <TxnCard
                                        key={txn._id}
                                        txn={txn}
                                        theme={theme}
                                        onDelete={deleteTransaction}
                                    />
                                ));
                            })()
                        )}
                    </View>
                )}
            </ScrollView>
        </View>
    );
};

export default FinanceAnalytics;