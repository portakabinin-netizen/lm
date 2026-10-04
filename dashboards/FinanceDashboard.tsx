// @/dashboards/FinanceDashboard.tsx
// Finance Dashboard — lead + staff linked payments/receipts.
// KEYBOARD FIX: All sub-components (F, BarChart, etc.) are defined at MODULE
// level, NOT inside their parent render functions, to prevent React from
// treating them as new component types on every render (which unmounts inputs).

import { COLORS, FOOTER_HEIGHT, mkShadow } from "@/styles/stylesIndex";
import {
    ContactPickerItem, EmployeePickerItem, LEAD_REQUIRED_TYPES, LeadPickerItem,
    PAYMENT_TYPES, RECEIPT_TYPES, StaffPickerData, TXN_META,
    Transaction, TransporterPickerItem, TxnType, usePayments
} from "@/hooks/usePayments";
import { useAttendance } from "@/hooks/useAttendance";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View, useColorScheme, Share } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { appService } from "@/UtilServices/appHelper";

import { AdminPettyCashView } from "../app/adminPettyCash";

// ─── Finance sub-tabs ─────────────────────────────────────────────────────────
const FIN_TABS = [
    { key: "overview",       label: "Overview",       icon: "pie-chart-outline"         },
    { key: "payments",       label: "Payments",       icon: "arrow-up-circle-outline"   },
    { key: "receipts",       label: "Receipts",       icon: "arrow-down-circle-outline" },
    { key: "transactions",   label: "All Txns",       icon: "list-outline"              },
    { key: "petty_cash",     label: "Petty Cash",     icon: "wallet-outline"            },
    { key: "worker_salary",  label: "Worker Salary",  icon: "people-outline"            },
    { key: "client_billing", label: "Client Billing",  icon: "document-text-outline"     },
] as const;
type FinTab = typeof FIN_TABS[number]["key"];

const PAYMENT_MODES = ["Cash", "UPI", "NEFT", "RTGS", "IMPS", "Cheque", "Credit Card", "Debit Card", "Other"] as const;

interface Props {
    token: string; userId: string; name: string; dbName: string;
}

// ─── Currency formatter ───────────────────────────────────────────────────────
export const fmt = (v: number) => {
    const num = Number(v) || 0;
    return num >= 10000000 ? `₹${(num / 10000000).toFixed(2)}Cr`
    : num >= 100000 ? `₹${(num / 100000).toFixed(2)}L`
    : num >= 1000   ? `₹${(num / 1000).toFixed(1)}k`
    : `₹${num.toLocaleString("en-IN")}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE-LEVEL SUB-COMPONENTS
// Declaring these here (NOT inside any other component) is critical —
// keeping them at module scope means React always sees the SAME component
// type, preventing unmount/remount and keyboard dismissal on every keystroke.
// ─────────────────────────────────────────────────────────────────────────────

/** Labelled form field wrapper — module-level to prevent re-mounting */
function FieldRow({ label, txtSec, children }: { label: string; txtSec: string; children: React.ReactNode }) {
    return (
        <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: txtSec, marginBottom: 5, letterSpacing: 0.5 }}>
                {label.toUpperCase()}
            </Text>
            {children}
        </View>
    );
}

/** Horizontal bar chart — module-level */
function BarChart({ items, colorArr, txtSec, txtPri, trackBg }: {
    items: { label: string; value: number }[];
    colorArr: string[]; txtSec: string; txtPri: string; trackBg: string;
}) {
    const max = Math.max(...items.map(i => i.value), 1);
    return (
        <View>
            {items.map((item, idx) => {
                const color = colorArr[idx % colorArr.length];
                const pct   = item.value / max;
                return (
                    <View key={item.label} style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 }}>
                        <Text style={{ width: 110, fontSize: 10, color: txtSec, textAlign: "right" }} numberOfLines={1}>{item.label}</Text>
                        <View style={{ flex: 1, height: 8, backgroundColor: trackBg, borderRadius: 4, overflow: "hidden" }}>
                            <View style={{ width: `${Math.round(pct * 100)}%` as any, height: "100%", backgroundColor: color, borderRadius: 4 }} />
                        </View>
                        <Text style={{ width: 56, fontSize: 10, color: txtPri, fontWeight: "600", textAlign: "right" }}>{fmt(item.value)}</Text>
                    </View>
                );
            })}
        </View>
    );
}

function MetricCard({ label, value, sub, color, isDark, border, txtSec }: {
    label: string; value: string; sub: string; color: string;
    isDark: boolean; border: string; txtSec: string;
}) {
    return (
        <View style={{ flex: 1, backgroundColor: isDark ? "#1e1e1e" : "#f5f5f5", borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: border }}>
            <Text style={{ fontSize: 10, color: txtSec, fontWeight: "600", letterSpacing: 0.8, marginBottom: 6 }}>{label.toUpperCase()}</Text>
            <Text style={{ fontSize: 20, fontWeight: "800", color }}>{value}</Text>
            <Text style={{ fontSize: 11, color: txtSec, marginTop: 4 }}>{sub}</Text>
        </View>
    );
}

function SectionCard({ children, cardBg, border }: { children: React.ReactNode; cardBg: string; border: string }) {
    return (
        <View style={{ backgroundColor: cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: border, padding: 16, marginBottom: 12 }}>
            {children}
        </View>
    );
}

function SectionTitle({ label, txtSec }: { label: string; txtSec: string }) {
    return <Text style={{ fontSize: 10, fontWeight: "700", color: txtSec, letterSpacing: 1, marginBottom: 14 }}>{label.toUpperCase()}</Text>;
}

function FABBtn({ color, icon, onPress }: { color: string; icon: string; onPress: () => void }) {
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.85}
            style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: color, justifyContent: "center", alignItems: "center", ...mkShadow(12) }}>
            <Ionicons name={icon as any} size={28} color="#fff" />
        </TouchableOpacity>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// RECENT TRANSACTION ROW (module-level)
// ─────────────────────────────────────────────────────────────────────────────
function RecentRow({ txn, txtPri, txtSec, border }: { txn: Transaction; txtPri: string; txtSec: string; border: string }) {
    const meta  = TXN_META[txn.txn_type];
    const isOut = txn.direction === "PAYMENT";
    const displayName = txn.lead_name || txn.staff_name || txn.party_name || meta?.label;
    return (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: border }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: (meta?.color ?? COLORS.primary) + "20", justifyContent: "center", alignItems: "center" }}>
                    <Ionicons name={(meta?.icon ?? "cash-outline") as any} size={14} color={meta?.color ?? COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: txtPri }} numberOfLines={1}>{displayName}</Text>
                    <Text style={{ fontSize: 9, color: txtSec }}>{txn.txn_number}</Text>
                </View>
            </View>
            <Text style={{ fontSize: 13, fontWeight: "700", color: isOut ? COLORS.danger : COLORS.success }}>
                {isOut ? "-" : "+"}{fmt(txn.amount)}
            </Text>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION CARD (module-level)
// ─────────────────────────────────────────────────────────────────────────────
function TxnCard({ txn, theme, onDelete }: { txn: Transaction; theme: any; onDelete: (id: string) => void }) {
    const { txtPri, txtSec, cardBg, border } = theme;
    const meta     = TXN_META[txn.txn_type];
    const isOut    = txn.direction === "PAYMENT";
    const amtColor = isOut ? COLORS.danger : COLORS.success;

    const handleDelete = useCallback(() => {
        Alert.alert("Delete Transaction", `Delete ${txn.txn_number}?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => onDelete(txn._id) },
        ]);
    }, [txn._id, txn.txn_number, onDelete]);

    return (
        <View style={{ backgroundColor: cardBg, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: border, ...mkShadow(4) }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: meta?.color + "20", justifyContent: "center", alignItems: "center" }}>
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

// ─────────────────────────────────────────────────────────────────────────────
// LEAD PICKER (module-level, searchable)
// ─────────────────────────────────────────────────────────────────────────────
function LeadPicker({ leads, selected, onSelect, loading, border, txtPri, txtSec, cardBg, inputBg }: {
    leads: LeadPickerItem[]; selected: LeadPickerItem | null;
    onSelect: (l: LeadPickerItem) => void; loading: boolean;
    border: string; txtPri: string; txtSec: string; cardBg: string; inputBg: string;
}) {
    const [search, setSearch] = useState("");
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return leads;
        return leads.filter(l =>
            l.sender_name?.toLowerCase().includes(q) ||
            l.product_name?.toLowerCase().includes(q) ||
            String(l.lead_no).includes(q) ||
            l.sender_mobile?.includes(q)
        );
    }, [leads, search]);

    return (
        <View>
            {selected && (
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: COLORS.primary + "15", borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: COLORS.primary + "40" }}>
                    <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: COLORS.primary }} numberOfLines={1}>#{selected.lead_no} — {selected.sender_name}</Text>
                        <Text style={{ fontSize: 10, color: COLORS.primary, opacity: 0.8 }}>{selected.product_name}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: COLORS.success, fontWeight: "700" }}>✓ Selected</Text>
                </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: inputBg, borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 10, height: 40, marginBottom: 6 }}>
                <Ionicons name="search-outline" size={14} color={COLORS.textMuted} />
                <TextInput
                    style={{ flex: 1, marginLeft: 6, fontSize: 13, color: txtPri }}
                    placeholder="Search lead by name, mobile, product…"
                    placeholderTextColor={COLORS.textMuted}
                    value={search}
                    onChangeText={setSearch}
                />
            </View>
            {loading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 8 }} />}
            <ScrollView style={{ maxHeight: 190 }} nestedScrollEnabled keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
                {filtered.length === 0 && !loading && (
                    <Text style={{ color: COLORS.textMuted, textAlign: "center", marginVertical: 12, fontSize: 12 }}>No active leads found.</Text>
                )}
                {filtered.map(lead => {
                    const isSel = selected?._id === lead._id;
                    return (
                        <TouchableOpacity key={lead._id} onPress={() => onSelect(lead)} activeOpacity={0.75}
                            style={{ padding: 10, borderRadius: 10, marginBottom: 6, borderWidth: 1.5, borderColor: isSel ? COLORS.primary : border, backgroundColor: isSel ? COLORS.primary + "10" : cardBg }}>
                            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 12, fontWeight: "700", color: isSel ? COLORS.primary : txtPri }} numberOfLines={1}>#{lead.lead_no} — {lead.sender_name}</Text>
                                    <Text style={{ fontSize: 10, color: txtSec, marginTop: 2 }} numberOfLines={1}>{lead.product_name} • {lead.sender_mobile}</Text>
                                </View>
                                <View style={{ alignItems: "flex-end", gap: 2 }}>
                                    <Text style={{ fontSize: 9, color: COLORS.success, fontWeight: "700", backgroundColor: COLORS.success + "15", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>{lead.status}</Text>
                                    {(lead.totalPaid > 0 || lead.totalReceived > 0) && (
                                        <Text style={{ fontSize: 9, color: txtSec }}>Cost: {fmt(lead.totalPaid)} | Recv: {fmt(lead.totalReceived)}</Text>
                                    )}
                                </View>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF PICKER (module-level, for employees + transporters)
// ─────────────────────────────────────────────────────────────────────────────
type AnyStaff = (EmployeePickerItem | TransporterPickerItem) & { _type: "employee" | "transporter" };

function StaffPicker({ staffData, staffType, selected, onSelect, loading, border, txtPri, txtSec, cardBg, inputBg }: {
    staffData: StaffPickerData;
    staffType: "employee" | "transporter";
    selected: AnyStaff | null;
    onSelect: (s: AnyStaff) => void;
    loading: boolean;
    border: string; txtPri: string; txtSec: string; cardBg: string; inputBg: string;
}) {
    const [search, setSearch] = useState("");
    const list: AnyStaff[] = useMemo(() => {
        const src = staffType === "employee" ? staffData.employees : staffData.transporters;
        return src.map(s => ({ ...s, _type: staffType }));
    }, [staffData, staffType]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter(s =>
            s.name?.toLowerCase().includes(q) ||
            s.mobile?.includes(q) ||
            (staffType === "employee" ? (s as EmployeePickerItem).role?.toLowerCase().includes(q)
                : (s as TransporterPickerItem).vehicle_no?.toLowerCase().includes(q))
        );
    }, [list, search, staffType]);

    const accentColor = staffType === "employee" ? COLORS.accent : "#7F77DD";

    return (
        <View>
            {selected && (
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: accentColor + "15", borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: accentColor + "40" }}>
                    <Ionicons name={staffType === "transporter" ? "car" : "person"} size={18} color={accentColor} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: accentColor }}>
                            {selected.name}{selected._type === "employee" && (selected as any).enrollment_no ? ` (${(selected as any).enrollment_no})` : ""}
                        </Text>
                        <Text style={{ fontSize: 10, color: accentColor, opacity: 0.8 }}>
                            {staffType === "employee"
                                ? (selected as EmployeePickerItem).role
                                : `${(selected as TransporterPickerItem).vehicle_type} · ${(selected as TransporterPickerItem).vehicle_no ?? ""}`}
                        </Text>
                    </View>
                    <Text style={{ fontSize: 10, color: COLORS.success, fontWeight: "700" }}>✓ Selected</Text>
                </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: inputBg, borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 10, height: 40, marginBottom: 6 }}>
                <Ionicons name="search-outline" size={14} color={COLORS.textMuted} />
                <TextInput
                    style={{ flex: 1, marginLeft: 6, fontSize: 13, color: txtPri }}
                    placeholder={staffType === "employee" ? "Search by name, role…" : "Search by name, vehicle no…"}
                    placeholderTextColor={COLORS.textMuted}
                    value={search}
                    onChangeText={setSearch}
                />
            </View>
            {loading && <ActivityIndicator size="small" color={accentColor} style={{ marginVertical: 8 }} />}
            {list.length === 0 && !loading && (
                <Text style={{ color: COLORS.textMuted, textAlign: "center", marginVertical: 8, fontSize: 12 }}>
                    No {staffType === "employee" ? "employees" : "transporters"} found. Add them first in Settings.
                </Text>
            )}
            <ScrollView style={{ maxHeight: 190 }} nestedScrollEnabled keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
                {filtered.map(s => {
                    const isSel = selected?._id === s._id;
                    const sub = staffType === "employee"
                        ? `${(s as EmployeePickerItem).role} · ${(s as EmployeePickerItem).pay_type}`
                        : `${(s as TransporterPickerItem).vehicle_type} · ${(s as TransporterPickerItem).vehicle_no ?? ""}`;
                    const rate = staffType === "employee"
                        ? ((s as EmployeePickerItem).daily_rate ? `₹${(s as EmployeePickerItem).daily_rate}/day` : "")
                        : ((s as TransporterPickerItem).rate_per_trip ? `₹${(s as TransporterPickerItem).rate_per_trip}/trip` : "");
                    return (
                        <TouchableOpacity key={s._id} onPress={() => onSelect(s)} activeOpacity={0.75}
                            style={{ padding: 10, borderRadius: 10, marginBottom: 6, borderWidth: 1.5, borderColor: isSel ? accentColor : border, backgroundColor: isSel ? accentColor + "10" : cardBg }}>
                            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 12, fontWeight: "700", color: isSel ? accentColor : txtPri }}>
                                        {s.name}{s._type === "employee" && (s as any).enrollment_no ? ` (${(s as any).enrollment_no})` : ""}
                                    </Text>
                                    <Text style={{ fontSize: 10, color: txtSec, marginTop: 2 }}>{sub}{s.mobile ? ` · ${s.mobile}` : ""}</Text>
                                </View>
                                {rate && <Text style={{ fontSize: 11, fontWeight: "700", color: accentColor }}>{rate}</Text>}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW PANEL (module-level)
// ─────────────────────────────────────────────────────────────────────────────
function OverviewPanel({ 
    theme, 
    summary, 
    onPayment, 
    onReceipt, 
    onRefresh,
    onDownloadTemplate,
    onUploadVouchers,
    downloading,
    uploading
}: {
    theme: any; 
    summary: any;
    onPayment: () => void; 
    onReceipt: () => void; 
    onRefresh: () => void;
    onDownloadTemplate: () => void;
    onUploadVouchers: () => void;
    downloading: boolean;
    uploading: boolean;
}) {
    const { isDark, cardBg, border, txtPri, txtSec, trackBg } = theme;
    const net = summary?.netBalance ?? 0;
    const netColor = net >= 0 ? COLORS.success : COLORS.danger;

    const PAY_COLORS = ["#E24B4A", "#BA7517", "#7F77DD", "#D4537E", "#639922", "#94A3B8"];
    const REC_COLORS = ["#1D9E75", "#378ADD", "#BA7517", "#7F77DD", "#10B981"];

    return (
        <>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                <MetricCard isDark={isDark} border={border} txtSec={txtSec}
                    label="Total Paid Out" value={fmt(summary?.totalPayments ?? 0)} sub="All payments" color={COLORS.danger} />
                <MetricCard isDark={isDark} border={border} txtSec={txtSec}
                    label="Total Received" value={fmt(summary?.totalReceipts ?? 0)} sub="All receipts" color={COLORS.success} />
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                <MetricCard isDark={isDark} border={border} txtSec={txtSec}
                    label="Pending Salary" value={fmt(summary?.pendingSalary ?? 0)} sub="Staff payables" color="#f59e0b" />
                <MetricCard isDark={isDark} border={border} txtSec={txtSec}
                    label="Pending Bills" value={fmt(summary?.pendingBillsCollections ?? 0)} sub="Sundry debtors" color="#3b82f6" />
            </View>

            <View style={{ backgroundColor: cardBg, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: border, alignItems: "center" }}>
                <Text style={{ fontSize: 11, color: txtSec, fontWeight: "600", letterSpacing: 0.8 }}>CASH BALANCE (IN - OUT)</Text>
                <Text style={{ fontSize: 30, fontWeight: "800", color: netColor, marginTop: 4 }}>{fmt(Math.abs(net))}</Text>
                <Text style={{ fontSize: 12, color: txtSec, marginTop: 2 }}>{net >= 0 ? "↑ Surplus" : "↓ Deficit"}</Text>
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                <TouchableOpacity onPress={onPayment} activeOpacity={0.8}
                    style={{ flex: 1, backgroundColor: COLORS.danger + "18", borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 1, borderColor: COLORS.danger + "40" }}>
                    <Ionicons name="arrow-up-circle-outline" size={26} color={COLORS.danger} />
                    <Text style={{ color: COLORS.danger, fontWeight: "700", fontSize: 12, marginTop: 6 }}>Record Payment</Text>
                    <Text style={{ color: txtSec, fontSize: 9, marginTop: 2 }}>Vendor • Labour • Freight</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onReceipt} activeOpacity={0.8}
                    style={{ flex: 1, backgroundColor: COLORS.success + "18", borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 1, borderColor: COLORS.success + "40" }}>
                    <Ionicons name="arrow-down-circle-outline" size={26} color={COLORS.success} />
                    <Text style={{ color: COLORS.success, fontWeight: "700", fontSize: 12, marginTop: 6 }}>Record Receipt</Text>
                    <Text style={{ color: txtSec, fontSize: 9, marginTop: 2 }}>Invoice • Advance • Scrap</Text>
                </TouchableOpacity>
            </View>

            <SectionCard cardBg={cardBg} border={border}>
                <SectionTitle label="Bulk Voucher Import" txtSec={txtSec} />
                <Text style={{ fontSize: 12, color: txtSec, marginBottom: 16, lineHeight: 18 }}>
                    Quickly upload multiple Sales and Salary Payable vouchers using our Excel template.
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity 
                        onPress={onDownloadTemplate} 
                        disabled={downloading}
                        style={{ 
                            flex: 1, 
                            flexDirection: "row",
                            alignItems: "center", 
                            justifyContent: "center",
                            backgroundColor: isDark ? "#1f2937" : "#f3f4f6", 
                            borderRadius: 10, 
                            paddingVertical: 12, 
                            borderWidth: 1, 
                            borderColor: border,
                            gap: 6
                        }}
                    >
                        {downloading ? (
                            <ActivityIndicator size="small" color={COLORS.primary} />
                        ) : (
                            <>
                                <Ionicons name="download-outline" size={16} color={COLORS.primary} />
                                <Text style={{ color: txtPri, fontWeight: "600", fontSize: 12 }}>Template</Text>
                            </>
                        )}
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                        onPress={onUploadVouchers} 
                        disabled={uploading}
                        style={{ 
                            flex: 1, 
                            flexDirection: "row",
                            alignItems: "center", 
                            justifyContent: "center",
                            backgroundColor: COLORS.primary, 
                            borderRadius: 10, 
                            paddingVertical: 12, 
                            gap: 6
                        }}
                    >
                        {uploading ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>Upload Excel</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </SectionCard>

            {/* TRADING & P&L WIDGET */}
            {summary && (summary.sales > 0 || summary.purchases > 0 || summary.indirectExpenses > 0) && (
                <View style={{ backgroundColor: cardBg, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: border }}>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 6 }}>
                        <Ionicons name="stats-chart" size={16} color={COLORS.primary} />
                        <Text style={{ fontSize: 12, color: txtPri, fontWeight: "800", letterSpacing: 0.5 }}>TRADING & P&L ACCOUNT (FY)</Text>
                    </View>
                    
                    {/* TRADING A/C */}
                    <Text style={{ fontSize: 10, fontWeight: "700", color: txtSec, marginBottom: 8, letterSpacing: 0.8 }}>TRADING A/C (OPERATIONAL)</Text>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: txtSec }}>Sales</Text>
                        <Text style={{ fontSize: 12, color: txtPri }}>{fmt(summary.sales)}</Text>
                    </View>
                    {(summary.directIncome > 0) && (
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                            <Text style={{ fontSize: 12, color: txtSec }}>Direct Income</Text>
                            <Text style={{ fontSize: 12, color: txtPri }}>{fmt(summary.directIncome)}</Text>
                        </View>
                    )}
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: txtSec }}>Purchases</Text>
                        <Text style={{ fontSize: 12, color: txtPri }}>-{fmt(summary.purchases)}</Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                        <Text style={{ fontSize: 12, color: txtSec }}>Direct Expenses</Text>
                        <Text style={{ fontSize: 12, color: txtPri }}>-{fmt(summary.directExpenses)}</Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12, borderTopWidth: 1, borderTopColor: border, paddingTop: 8 }}>
                        <Text style={{ fontSize: 12, color: txtPri, fontWeight: "700" }}>Gross Profit</Text>
                        <Text style={{ fontSize: 13, color: summary.grossMargin >= 0 ? COLORS.success : COLORS.danger, fontWeight: "700" }}>
                            {summary.grossMargin >= 0 ? "+" : ""}{fmt(summary.grossMargin)}
                        </Text>
                    </View>

                    {/* PROFIT & LOSS A/C */}
                    <Text style={{ fontSize: 10, fontWeight: "700", color: txtSec, marginBottom: 8, letterSpacing: 0.8, marginTop: 4 }}>PROFIT & LOSS A/C</Text>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: txtSec }}>Gross Profit b/d</Text>
                        <Text style={{ fontSize: 12, color: txtPri }}>{fmt(summary.grossMargin)}</Text>
                    </View>
                    {(summary.indirectIncome > 0) && (
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                            <Text style={{ fontSize: 12, color: txtSec }}>Indirect / Other Income</Text>
                            <Text style={{ fontSize: 12, color: txtPri }}>+{fmt(summary.indirectIncome)}</Text>
                        </View>
                    )}
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
                        <Text style={{ fontSize: 12, color: txtSec }}>Indirect Expenses</Text>
                        <Text style={{ fontSize: 12, color: txtPri }}>-{fmt(summary.indirectExpenses)}</Text>
                    </View>

                    <View style={{ height: 1, backgroundColor: border, marginBottom: 12 }} />
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ fontSize: 14, color: txtPri, fontWeight: "800" }}>Net Profit</Text>
                        <View style={{ backgroundColor: summary.netProfit >= 0 ? COLORS.success + "15" : COLORS.danger + "15", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                            <Text style={{ fontSize: 16, color: summary.netProfit >= 0 ? COLORS.success : COLORS.danger, fontWeight: "900" }}>
                                {summary.netProfit >= 0 ? "+" : ""}{fmt(summary.netProfit)}
                            </Text>
                        </View>
                    </View>
                </View>
            )}

            {(summary?.leadLinkedPayments > 0 || summary?.leadLinkedReceipts > 0) && (
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                    <View style={{ flex: 1, backgroundColor: COLORS.danger + "10", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.danger + "30" }}>
                        <Text style={{ fontSize: 9, fontWeight: "700", color: COLORS.danger, letterSpacing: 0.8 }}>PROJECT COSTS</Text>
                        <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.danger, marginTop: 4 }}>{fmt(summary?.leadLinkedPayments ?? 0)}</Text>
                        <Text style={{ fontSize: 10, color: txtSec, marginTop: 2 }}>Material + Labour</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: COLORS.success + "10", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.success + "30" }}>
                        <Text style={{ fontSize: 9, fontWeight: "700", color: COLORS.success, letterSpacing: 0.8 }}>CLIENT RECEIPTS</Text>
                        <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.success, marginTop: 4 }}>{fmt(summary?.leadLinkedReceipts ?? 0)}</Text>
                        <Text style={{ fontSize: 10, color: txtSec, marginTop: 2 }}>Invoice + Advance</Text>
                    </View>
                </View>
            )}

            {(summary?.paymentBreakdown?.length ?? 0) > 0 && (
                <SectionCard cardBg={cardBg} border={border}>
                    <SectionTitle label="Payment Breakdown" txtSec={txtSec} />
                    <BarChart items={summary.paymentBreakdown} colorArr={PAY_COLORS} txtSec={txtSec} txtPri={txtPri} trackBg={trackBg} />
                </SectionCard>
            )}
            {(summary?.receiptBreakdown?.length ?? 0) > 0 && (
                <SectionCard cardBg={cardBg} border={border}>
                    <SectionTitle label="Receipt Breakdown" txtSec={txtSec} />
                    <BarChart items={summary.receiptBreakdown} colorArr={REC_COLORS} txtSec={txtSec} txtPri={txtPri} trackBg={trackBg} />
                </SectionCard>
            )}
            {(summary?.recentTransactions?.length ?? 0) > 0 && (
                <SectionCard cardBg={cardBg} border={border}>
                    <SectionTitle label="Recent Activity" txtSec={txtSec} />
                    {summary.recentTransactions.slice(0, 5).map((t: Transaction) => (
                        <RecentRow key={t._id} txn={t} txtPri={txtPri} txtSec={txtSec} border={border} />
                    ))}
                </SectionCard>
            )}
            {(!summary || (summary.totalPayments === 0 && summary.totalReceipts === 0)) && (
                <View style={{ alignItems: "center", marginTop: 50, opacity: 0.4 }}>
                    <Ionicons name="wallet-outline" size={56} color={COLORS.textMuted} />
                    <Text style={{ color: COLORS.textMuted, marginTop: 14, fontSize: 14 }}>No financial data yet</Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 4, textAlign: "center" }}>Tap "Record Payment" or "Record Receipt" to start</Text>
                </View>
            )}
            <TouchableOpacity onPress={onRefresh} style={{ alignSelf: "center", marginTop: 16, padding: 10 }}>
                <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: "600" }}>↻ Refresh Data</Text>
            </TouchableOpacity>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKER SALARY PANEL (module-level)
// ─────────────────────────────────────────────────────────────────────────────
interface WorkerSalaryPanelProps {
    theme: any;
    attendanceList: any[];
    vouchersList: any[];
    masterData: { groups: any[]; ledgers: any[] };
    onDownloadTemplate: () => void;
    onUploadVouchers: () => void;
    downloading: boolean;
    uploading: boolean;
    onDownloadAttendanceTemplate: () => void;
    onUploadAttendance: () => void;
    downloadingAtt: boolean;
    uploadingAtt: boolean;
    onDownloadSalaryDuesTemplate: () => void;
    onUploadSalaryDues: () => void;
    downloadingSalary: boolean;
    uploadingSalary: boolean;
}

const WS_SUB_TABS = [
    { key: "overview_shifts", label: "Shifts & Earn", icon: "time-outline" },
    { key: "dues_paid", label: "Dues & Vouchers", icon: "cash-outline" },
    { key: "site_costs", label: "Site Costs", icon: "business-outline" },
    { key: "uploads", label: "Excel Uploads", icon: "cloud-upload-outline" }
] as const;

function WorkerSalaryPanel({
    theme,
    attendanceList,
    vouchersList,
    masterData,
    onDownloadTemplate,
    onUploadVouchers,
    downloading,
    uploading,
    onDownloadAttendanceTemplate,
    onUploadAttendance,
    downloadingAtt,
    uploadingAtt,
    onDownloadSalaryDuesTemplate,
    onUploadSalaryDues,
    downloadingSalary,
    uploadingSalary
}: WorkerSalaryPanelProps) {
    const { isDark, cardBg, border, txtPri, txtSec } = theme;
    const [wsTab, setWsTab] = useState<typeof WS_SUB_TABS[number]["key"]>("overview_shifts");

    // 1. Resolve employee ledgers (Account Payables)
    const employeeLedgers = useMemo(() => {
        return (masterData?.ledgers || []).filter(
            (l: any) => l.groupName === "Account Payables"
        );
    }, [masterData]);

    const employeeLedgerIds = useMemo(() => employeeLedgers.map((l: any) => String(l._id)), [employeeLedgers]);
    const employeeLedgerMap = useMemo(() => new Map(employeeLedgers.map((l: any) => [String(l._id), l])), [employeeLedgers]);

    // 2. Resolve accrued and paid dues from double-entry vouchers
    const duesMap = useMemo(() => {
        const dMap = new Map<string, { accrued: number; paid: number }>();
        employeeLedgerIds.forEach(id => {
            dMap.set(id, { accrued: 0, paid: 0 });
        });

        (vouchersList || []).forEach((v: any) => {
            (v.entries || []).forEach((entry: any) => {
                const ledgerIdStr = String(entry.ledgerId);
                if (employeeLedgerMap.has(ledgerIdStr)) {
                    const record = dMap.get(ledgerIdStr) || { accrued: 0, paid: 0 };
                    record.accrued += entry.credit || 0;
                    record.paid += entry.debit || 0;
                    dMap.set(ledgerIdStr, record);
                }
            });
        });
        return dMap;
    }, [vouchersList, employeeLedgerIds, employeeLedgerMap]);

    // 3. Resolve attendance earnings per worker
    const attMap = useMemo(() => {
        const aMap = new Map<string, { shifts: number; earned: number }>();
        (attendanceList || []).forEach((att: any) => {
            const empName = att.employeeId?.name || att.employeeId?.userDisplayName || att.markedByUserName || "Unknown";
            const key = empName.trim().toLowerCase();
            const record = aMap.get(key) || { shifts: 0, earned: 0 };
            record.shifts += att.dutyCount || 1;
            record.earned += att.dailyEarn || 0;
            aMap.set(key, record);
        });
        return aMap;
    }, [attendanceList]);

    // 4. Consolidate list for worker salary ledger table
    const consolidatedList = useMemo(() => {
        return employeeLedgers.map((l: any) => {
            const key = l.ledgerName.trim().toLowerCase();
            const attRecord = attMap.get(key) || { shifts: 0, earned: 0 };
            const vRecord = duesMap.get(String(l._id)) || { accrued: 0, paid: 0 };
            return {
                ledgerId: l._id,
                name: l.ledgerName,
                shifts: attRecord.shifts,
                attendanceEarn: attRecord.earned,
                accrued: vRecord.accrued,
                paid: vRecord.paid,
                net: vRecord.accrued - vRecord.paid
            };
        });
    }, [employeeLedgers, attMap, duesMap]);

    // 5. Total Metrics
    const totalAccrued = useMemo(() => consolidatedList.reduce((sum, item) => sum + item.accrued, 0), [consolidatedList]);
    const totalPaid = useMemo(() => consolidatedList.reduce((sum, item) => sum + item.paid, 0), [consolidatedList]);
    const totalOutstanding = useMemo(() => consolidatedList.reduce((sum, item) => sum + item.net, 0), [consolidatedList]);

    // 6. Group attendance by site
    const siteMetrics = useMemo(() => {
        const sMap = new Map<string, { shifts: number; hours: number; cost: number }>();
        (attendanceList || []).forEach((att: any) => {
            const site = att.site_name || "General/Other";
            const record = sMap.get(site) || { shifts: 0, hours: 0, cost: 0 };
            record.shifts += att.dutyCount || 1;
            record.hours += att.hoursWorked || 0;
            record.cost += att.dailyEarn || 0;
            sMap.set(site, record);
        });
        return Array.from(sMap.entries()).map(([site, record]) => ({
            site,
            ...record
        }));
    }, [attendanceList]);

    // 7. Salary Vouchers
    const salaryVouchers = useMemo(() => {
        return (vouchersList || []).filter((v: any) => {
            const matchesType = v.voucherType === "Journal" || v.voucherType === "Payment";
            if (!matchesType) return false;
            return (v.entries || []).some((e: any) => employeeLedgerMap.has(String(e.ledgerId)));
        }).slice(0, 10);
    }, [vouchersList, employeeLedgerMap]);

    return (
        <View>
            {/* Sub Tabs Bar */}
            <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={{ marginBottom: 14 }} 
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
            >
                {WS_SUB_TABS.map(tab => {
                    const isAct = wsTab === tab.key;
                    return (
                        <TouchableOpacity 
                            key={tab.key} 
                            onPress={() => setWsTab(tab.key)} 
                            activeOpacity={0.8}
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                borderRadius: 20,
                                backgroundColor: isAct ? COLORS.primary : (isDark ? "#1e1e1e" : "#f1f5f9"),
                                borderWidth: 1,
                                borderColor: isAct ? COLORS.primary : border
                            }}
                        >
                            <Ionicons name={tab.icon as any} size={14} color={isAct ? "#fff" : txtSec} />
                            <Text style={{ fontSize: 11, fontWeight: "700", color: isAct ? "#fff" : txtPri }}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* Sub-tab 1: Shifts & Earn */}
            {wsTab === "overview_shifts" && (
                <>
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                        <MetricCard isDark={isDark} border={border} txtSec={txtSec}
                            label="Accrued Salary" value={fmt(totalAccrued)} sub="Booked liabilities" color="#f59e0b" />
                        <MetricCard isDark={isDark} border={border} txtSec={txtSec}
                            label="Salary Paid" value={fmt(totalPaid)} sub="Paid out dues" color={COLORS.success} />
                    </View>
                    <View style={{ backgroundColor: cardBg, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: border, alignItems: "center" }}>
                        <Text style={{ fontSize: 11, color: txtSec, fontWeight: "600", letterSpacing: 0.8 }}>NET OUTSTANDING DUES</Text>
                        <Text style={{ fontSize: 26, fontWeight: "800", color: totalOutstanding >= 0 ? "#f59e0b" : COLORS.success, marginTop: 4 }}>{fmt(totalOutstanding)}</Text>
                        <Text style={{ fontSize: 11, color: txtSec, marginTop: 2 }}>{totalOutstanding >= 0 ? "Outstanding Payables" : "Settled/Prepaid"}</Text>
                    </View>

                    <SectionCard cardBg={cardBg} border={border}>
                        <SectionTitle label="Worker Attendance Sessions" txtSec={txtSec} />
                        {attendanceList.length === 0 ? (
                            <Text style={{ fontSize: 12, color: txtSec, textAlign: "center", marginVertical: 10 }}>No attendance logs found.</Text>
                        ) : (
                            attendanceList.slice(0, 10).map((att: any) => {
                                const name = att.employeeId?.name || att.employeeId?.userDisplayName || att.markedByUserName || "Worker";
                                const dateStr = att.date ? new Date(att.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "N/A";
                                return (
                                    <View key={att._id} style={{ paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: border }}>
                                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                                            <Text style={{ fontSize: 12, fontWeight: "700", color: txtPri }}>{name}</Text>
                                            <Text style={{ fontSize: 12, fontWeight: "800", color: COLORS.primary }}>{fmt(att.dailyEarn)}</Text>
                                        </View>
                                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                            <Text style={{ fontSize: 10, color: txtSec }}>{dateStr} • {att.site_name || "General"} • {att.hoursWorked} hrs</Text>
                                            <View style={{ borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, backgroundColor: att.isPosted ? COLORS.success + "15" : "#64748b15" }}>
                                                <Text style={{ fontSize: 8, fontWeight: "700", color: att.isPosted ? COLORS.success : "#64748b" }}>
                                                    {att.isPosted ? "POSTED" : "UNPOSTED"}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </SectionCard>
                </>
            )}

            {/* Sub-tab 2: Dues & Vouchers */}
            {wsTab === "dues_paid" && (
                <>
                    <SectionCard cardBg={cardBg} border={border}>
                        <SectionTitle label="Consolidated Worker Ledger (Dues vs Paid)" txtSec={txtSec} />
                        {consolidatedList.length === 0 ? (
                            <Text style={{ fontSize: 12, color: txtSec, textAlign: "center", marginVertical: 10 }}>No workers accounts configured.</Text>
                        ) : (
                            <View>
                                <View style={{ flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: border, justifyContent: "space-between" }}>
                                    <Text style={{ flex: 1.5, fontSize: 10, fontWeight: "700", color: txtPri }}>NAME</Text>
                                    <Text style={{ flex: 1, fontSize: 10, fontWeight: "700", color: txtPri, textAlign: "right" }}>LOGGED EARN</Text>
                                    <Text style={{ flex: 1, fontSize: 10, fontWeight: "700", color: txtPri, textAlign: "right" }}>BOOKED DUE</Text>
                                    <Text style={{ flex: 1, fontSize: 10, fontWeight: "700", color: txtPri, textAlign: "right" }}>PAID OUT</Text>
                                    <Text style={{ flex: 1, fontSize: 10, fontWeight: "700", color: txtPri, textAlign: "right" }}>BAL DUE</Text>
                                </View>
                                {consolidatedList.map((item) => (
                                    <View key={String(item.ledgerId)} style={{ flexDirection: "row", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: border, justifyContent: "space-between", alignItems: "center" }}>
                                        <Text style={{ flex: 1.5, fontSize: 11, fontWeight: "600", color: txtPri }} numberOfLines={1}>{item.name}</Text>
                                        <Text style={{ flex: 1, fontSize: 11, color: txtSec, textAlign: "right" }}>{fmt(item.attendanceEarn)}</Text>
                                        <Text style={{ flex: 1, fontSize: 11, color: txtSec, textAlign: "right" }}>{fmt(item.accrued)}</Text>
                                        <Text style={{ flex: 1, fontSize: 11, color: txtSec, textAlign: "right" }}>{fmt(item.paid)}</Text>
                                        <Text style={{ flex: 1, fontSize: 11, fontWeight: "700", color: item.net > 0 ? "#f59e0b" : COLORS.success, textAlign: "right" }}>{fmt(item.net)}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </SectionCard>

                    <SectionCard cardBg={cardBg} border={border}>
                        <SectionTitle label="Salary Vouchers (Journal & Payments)" txtSec={txtSec} />
                        {salaryVouchers.length === 0 ? (
                            <Text style={{ fontSize: 12, color: txtSec, textAlign: "center", marginVertical: 10 }}>No salary vouchers found.</Text>
                        ) : (
                            salaryVouchers.map((v: any) => {
                                const dateStr = v.date ? new Date(v.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "N/A";
                                const attEntry = v.entries.find((e: any) => employeeLedgerMap.has(String(e.ledgerId)));
                                const amount = attEntry ? (attEntry.debit || attEntry.credit) : 0;
                                return (
                                    <View key={v._id} style={{ paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: border }}>
                                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                                            <Text style={{ fontSize: 12, fontWeight: "700", color: txtPri }}>{v.voucherNo || v.voucherNumber}</Text>
                                            <Text style={{ fontSize: 12, fontWeight: "800", color: v.voucherType === "Payment" ? COLORS.danger : COLORS.success }}>
                                                {v.voucherType === "Payment" ? "-" : "+"}{fmt(amount)}
                                            </Text>
                                        </View>
                                        <Text style={{ fontSize: 10, color: txtSec }}>{dateStr} • {v.voucherType} • {v.narration}</Text>
                                    </View>
                                );
                            })
                        )}
                    </SectionCard>
                </>
            )}

            {/* Sub-tab 3: Site Costs */}
            {wsTab === "site_costs" && (
                <SectionCard cardBg={cardBg} border={border}>
                    <SectionTitle label="Worker Attendance Sitewise (Site Metrics)" txtSec={txtSec} />
                    {siteMetrics.length === 0 ? (
                        <Text style={{ fontSize: 12, color: txtSec, textAlign: "center", marginVertical: 10 }}>No site metrics available.</Text>
                    ) : (
                        siteMetrics.map((item) => (
                            <View key={item.site} style={{ flexDirection: "row", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: border, justifyContent: "space-between", alignItems: "center" }}>
                                <View style={{ flex: 1.5 }}>
                                    <Text style={{ fontSize: 12, fontWeight: "700", color: txtPri }}>{item.site}</Text>
                                    <Text style={{ fontSize: 10, color: txtSec }}>{item.shifts} shifts • {item.hours.toFixed(1)} hrs</Text>
                                </View>
                                <Text style={{ fontSize: 13, fontWeight: "800", color: COLORS.primary }}>{fmt(item.cost)}</Text>
                            </View>
                        ))
                    )}
                </SectionCard>
            )}

            {/* Sub-tab 4: Excel Uploads */}
            {wsTab === "uploads" && (
                <>
                    {/* Card 1: Attendance Excel Upload */}
                    <SectionCard cardBg={cardBg} border={border}>
                        <SectionTitle label="Bulk Upload: Worker Attendance Sessions" txtSec={txtSec} />
                        <Text style={{ fontSize: 12, color: txtSec, marginBottom: 16, lineHeight: 18 }}>
                            Import worker daily shifts and attendance logs using our specialized attendance Excel template.
                        </Text>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                            <TouchableOpacity 
                                onPress={onDownloadAttendanceTemplate} 
                                disabled={downloadingAtt}
                                style={{ 
                                    flex: 1, 
                                    flexDirection: "row",
                                    alignItems: "center", 
                                    justifyContent: "center",
                                    backgroundColor: isDark ? "#1f2937" : "#f3f4f6", 
                                    borderRadius: 10, 
                                    paddingVertical: 12, 
                                    borderWidth: 1, 
                                    borderColor: border,
                                    gap: 6
                                }}
                            >
                                {downloadingAtt ? (
                                    <ActivityIndicator size="small" color={COLORS.primary} />
                                ) : (
                                    <>
                                        <Ionicons name="download-outline" size={16} color={COLORS.primary} />
                                        <Text style={{ color: txtPri, fontWeight: "600", fontSize: 12 }}>Template</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                            
                            <TouchableOpacity 
                                onPress={onUploadAttendance} 
                                disabled={uploadingAtt}
                                style={{ 
                                    flex: 1, 
                                    flexDirection: "row",
                                    alignItems: "center", 
                                    justifyContent: "center",
                                    backgroundColor: COLORS.primary, 
                                    borderRadius: 10, 
                                    paddingVertical: 12, 
                                    gap: 6
                                }}
                            >
                                {uploadingAtt ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                                        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>Upload Attendance</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </SectionCard>

                    {/* Card 2: Voucher Uploads for Worker Salary & Uniform Issues */}
                    <SectionCard cardBg={cardBg} border={border}>
                        <SectionTitle label="Bulk Upload: Worker Salary & Uniform Issues" txtSec={txtSec} />
                        <Text style={{ fontSize: 12, color: txtSec, marginBottom: 16, lineHeight: 18 }}>
                            Import worker salary dues (Journal) and uniform/equipment bulk issue vouchers using our standard Excel template.
                        </Text>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                            <TouchableOpacity 
                                onPress={onDownloadTemplate} 
                                disabled={downloading}
                                style={{ 
                                    flex: 1, 
                                    flexDirection: "row",
                                    alignItems: "center", 
                                    justifyContent: "center",
                                    backgroundColor: isDark ? "#1f2937" : "#f3f4f6", 
                                    borderRadius: 10, 
                                    paddingVertical: 12, 
                                    borderWidth: 1, 
                                    borderColor: border,
                                    gap: 6
                                }}
                            >
                                {downloading ? (
                                    <ActivityIndicator size="small" color={COLORS.primary} />
                                ) : (
                                    <>
                                        <Ionicons name="download-outline" size={16} color={COLORS.primary} />
                                        <Text style={{ color: txtPri, fontWeight: "600", fontSize: 12 }}>Template</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                            
                            <TouchableOpacity 
                                onPress={onUploadVouchers} 
                                disabled={uploading}
                                style={{ 
                                    flex: 1, 
                                    flexDirection: "row",
                                    alignItems: "center", 
                                    justifyContent: "center",
                                    backgroundColor: COLORS.primary, 
                                    borderRadius: 10, 
                                    paddingVertical: 12, 
                                    gap: 6
                                }}
                            >
                                {uploading ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                                        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>Upload Excel</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </SectionCard>

                    {/* Card 3: Salary Dues Upload By Enrollment Number */}
                    <SectionCard cardBg={cardBg} border={border}>
                        <SectionTitle label="Bulk Upload: Salary Dues by Enrollment Number" txtSec={txtSec} />
                        <Text style={{ fontSize: 12, color: txtSec, marginBottom: 16, lineHeight: 18 }}>
                            Upload salary dues using Employee Enrollment Form Number. This directly matches the enrollment number and creates a Salary & Wages expense voucher.
                        </Text>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                            <TouchableOpacity 
                                onPress={onDownloadSalaryDuesTemplate} 
                                disabled={downloadingSalary}
                                style={{ 
                                    flex: 1, 
                                    flexDirection: "row",
                                    alignItems: "center", 
                                    justifyContent: "center",
                                    backgroundColor: isDark ? "#1f2937" : "#f3f4f6", 
                                    borderRadius: 10, 
                                    paddingVertical: 12, 
                                    borderWidth: 1, 
                                    borderColor: border,
                                    gap: 6
                                }}
                            >
                                {downloadingSalary ? (
                                    <ActivityIndicator size="small" color={COLORS.primary} />
                                ) : (
                                    <>
                                        <Ionicons name="download-outline" size={16} color={COLORS.primary} />
                                        <Text style={{ color: txtPri, fontWeight: "600", fontSize: 12 }}>Template</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                            
                            <TouchableOpacity 
                                onPress={onUploadSalaryDues} 
                                disabled={uploadingSalary}
                                style={{ 
                                    flex: 1, 
                                    flexDirection: "row",
                                    alignItems: "center", 
                                    justifyContent: "center",
                                    backgroundColor: COLORS.primary, 
                                    borderRadius: 10, 
                                    paddingVertical: 12, 
                                    gap: 6
                                }}
                            >
                                {uploadingSalary ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                                        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>Upload Excel</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </SectionCard>
                </>
            )}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT BILLING PANEL (module-level)
// ─────────────────────────────────────────────────────────────────────────────
interface ClientBillingPanelProps {
    theme: any;
    vouchersList: any[];
    attendanceList: any[];
    masterData: { groups: any[]; ledgers: any[] };
    onDownloadTemplate: () => void;
    onUploadVouchers: () => void;
    downloading: boolean;
    uploading: boolean;
}

const CB_SUB_TABS = [
    { key: "bills_issued", label: "Bills Issued", icon: "document-text-outline" },
    { key: "collections", label: "Collections", icon: "wallet-outline" },
    { key: "hours_worked", label: "Labor Logs", icon: "people-outline" },
    { key: "dues_paid", label: "Ledgers", icon: "calculator-outline" },
    { key: "uploads", label: "Excel Uploads", icon: "cloud-upload-outline" }
] as const;

function ClientBillingPanel({
    theme,
    vouchersList,
    attendanceList,
    masterData,
    onDownloadTemplate,
    onUploadVouchers,
    downloading,
    uploading
}: ClientBillingPanelProps) {
    const { isDark, cardBg, border, txtPri, txtSec } = theme;
    const [cbTab, setCbTab] = useState<typeof CB_SUB_TABS[number]["key"]>("bills_issued");

    // 1. Resolve client ledgers (Sundry Debtors)
    const clientLedgers = useMemo(() => {
        return (masterData?.ledgers || []).filter(
            (l: any) => l.groupName === "Sundry Debtors"
        );
    }, [masterData]);

    const clientLedgerIds = useMemo(() => clientLedgers.map((l: any) => String(l._id)), [clientLedgers]);
    const clientLedgerMap = useMemo(() => new Map(clientLedgers.map((l: any) => [String(l._id), l])), [clientLedgers]);

    // 2. Resolve billed and collected from double-entry vouchers
    const clientTxnMap = useMemo(() => {
        const cMap = new Map<string, { billed: number; collected: number }>();
        clientLedgerIds.forEach(id => {
            cMap.set(id, { billed: 0, collected: 0 });
        });

        (vouchersList || []).forEach((v: any) => {
            (v.entries || []).forEach((entry: any) => {
                const ledgerIdStr = String(entry.ledgerId);
                if (clientLedgerMap.has(ledgerIdStr)) {
                    const record = cMap.get(ledgerIdStr) || { billed: 0, collected: 0 };
                    record.billed += entry.debit || 0;
                    record.collected += entry.credit || 0;
                    cMap.set(ledgerIdStr, record);
                }
            });
        });
        return cMap;
    }, [vouchersList, clientLedgerIds, clientLedgerMap]);

    // 3. Consolidate client list
    const consolidatedClientList = useMemo(() => {
        return clientLedgers.map((l: any) => {
            const record = clientTxnMap.get(String(l._id)) || { billed: 0, collected: 0 };
            return {
                ledgerId: l._id,
                name: l.ledgerName,
                billed: record.billed,
                collected: record.collected,
                outstanding: record.billed - record.collected
            };
        });
    }, [clientLedgers, clientTxnMap]);

    // 4. Metrics
    const totalBilled = useMemo(() => consolidatedClientList.reduce((sum, item) => sum + item.billed, 0), [consolidatedClientList]);
    const totalCollected = useMemo(() => consolidatedClientList.reduce((sum, item) => sum + item.collected, 0), [consolidatedClientList]);
    const totalOutstanding = useMemo(() => consolidatedClientList.reduce((sum, item) => sum + item.outstanding, 0), [consolidatedClientList]);

    // 5. Bills Issued Vouchers
    const billsIssued = useMemo(() => {
        return (vouchersList || []).filter((v: any) => {
            return v.voucherType === "Sales" || 
                ((v.voucherType === "Journal" || v.voucherType === "Sales") && 
                 (v.entries || []).some((e: any) => clientLedgerMap.has(String(e.ledgerId)) && e.debit > 0));
        }).slice(0, 10);
    }, [vouchersList, clientLedgerMap]);

    // 6. Payments Received Vouchers
    const collectionsReceived = useMemo(() => {
        return (vouchersList || []).filter((v: any) => {
            return v.voucherType === "Receipt" || 
                ((v.voucherType === "Journal" || v.voucherType === "Receipt") && 
                 (v.entries || []).some((e: any) => clientLedgerMap.has(String(e.ledgerId)) && e.credit > 0));
        }).slice(0, 10);
    }, [vouchersList, clientLedgerMap]);

    // 7. Workers Worked for Client (Labor Logs)
    const laborList = useMemo(() => {
        const lMap = new Map<string, { site: string; worker: string; shifts: number; hours: number; cost: number }>();
        (attendanceList || []).forEach((att: any) => {
            const site = att.site_name || "General/Other";
            const worker = att.employeeId?.name || att.employeeId?.userDisplayName || att.markedByUserName || "Worker";
            const key = `${site}_${worker}`;
            const record = lMap.get(key) || { site, worker, shifts: 0, hours: 0, cost: 0 };
            record.shifts += att.dutyCount || 1;
            record.hours += att.hoursWorked || 0;
            record.cost += att.dailyEarn || 0;
            lMap.set(key, record);
        });
        return Array.from(lMap.values()).slice(0, 15);
    }, [attendanceList]);

    return (
        <View>
            {/* Sub Tabs Bar */}
            <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={{ marginBottom: 14 }} 
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
            >
                {CB_SUB_TABS.map(tab => {
                    const isAct = cbTab === tab.key;
                    return (
                        <TouchableOpacity 
                            key={tab.key} 
                            onPress={() => setCbTab(tab.key)} 
                            activeOpacity={0.8}
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                                borderRadius: 20,
                                backgroundColor: isAct ? COLORS.primary : (isDark ? "#1e1e1e" : "#f1f5f9"),
                                borderWidth: 1,
                                borderColor: isAct ? COLORS.primary : border
                            }}
                        >
                            <Ionicons name={tab.icon as any} size={14} color={isAct ? "#fff" : txtSec} />
                            <Text style={{ fontSize: 11, fontWeight: "700", color: isAct ? "#fff" : txtPri }}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* Sub-tab 1: Bills Issued */}
            {cbTab === "bills_issued" && (
                <>
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                        <MetricCard isDark={isDark} border={border} txtSec={txtSec}
                            label="Total Billed" value={fmt(totalBilled)} sub="Bills issued" color="#3b82f6" />
                        <MetricCard isDark={isDark} border={border} txtSec={txtSec}
                            label="Payments Received" value={fmt(totalCollected)} sub="Client collections" color={COLORS.success} />
                    </View>
                    <View style={{ backgroundColor: cardBg, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: border, alignItems: "center" }}>
                        <Text style={{ fontSize: 11, color: txtSec, fontWeight: "600", letterSpacing: 0.8 }}>NET OUTSTANDING RECEIVABLES</Text>
                        <Text style={{ fontSize: 26, fontWeight: "800", color: totalOutstanding >= 0 ? "#3b82f6" : COLORS.success, marginTop: 4 }}>{fmt(totalOutstanding)}</Text>
                        <Text style={{ fontSize: 11, color: txtSec, marginTop: 2 }}>{totalOutstanding >= 0 ? "Outstanding Debtors" : "Overpaid/Prepaid"}</Text>
                    </View>

                    <SectionCard cardBg={cardBg} border={border}>
                        <SectionTitle label="Bills Issued (Sales Vouchers)" txtSec={txtSec} />
                        {billsIssued.length === 0 ? (
                            <Text style={{ fontSize: 12, color: txtSec, textAlign: "center", marginVertical: 10 }}>No bills issued vouchers found.</Text>
                        ) : (
                            billsIssued.map((v: any) => {
                                const dateStr = v.date ? new Date(v.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "N/A";
                                const attEntry = v.entries.find((e: any) => clientLedgerMap.has(String(e.ledgerId)));
                                const amount = attEntry ? (attEntry.debit || attEntry.credit) : 0;
                                return (
                                    <View key={v._id} style={{ paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: border }}>
                                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                                            <Text style={{ fontSize: 12, fontWeight: "700", color: txtPri }}>{v.voucherNo || v.voucherNumber}</Text>
                                            <Text style={{ fontSize: 12, fontWeight: "800", color: "#3b82f6" }}>{fmt(amount)}</Text>
                                        </View>
                                        <Text style={{ fontSize: 10, color: txtSec }}>{dateStr} • {v.voucherType} • {v.narration}</Text>
                                    </View>
                                );
                            })
                        )}
                    </SectionCard>
                </>
            )}

            {/* Sub-tab 2: Collections */}
            {cbTab === "collections" && (
                <SectionCard cardBg={cardBg} border={border}>
                    <SectionTitle label="Payments Received (Collections)" txtSec={txtSec} />
                    {collectionsReceived.length === 0 ? (
                        <Text style={{ fontSize: 12, color: txtSec, textAlign: "center", marginVertical: 10 }}>No payment receipts found.</Text>
                    ) : (
                        collectionsReceived.map((v: any) => {
                            const dateStr = v.date ? new Date(v.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "N/A";
                            const attEntry = v.entries.find((e: any) => clientLedgerMap.has(String(e.ledgerId)));
                            const amount = attEntry ? (attEntry.debit || attEntry.credit) : 0;
                            return (
                                <View key={v._id} style={{ paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: border }}>
                                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                                        <Text style={{ fontSize: 12, fontWeight: "700", color: txtPri }}>{v.voucherNo || v.voucherNumber}</Text>
                                        <Text style={{ fontSize: 12, fontWeight: "800", color: COLORS.success }}>{fmt(amount)}</Text>
                                    </View>
                                    <Text style={{ fontSize: 10, color: txtSec }}>{dateStr} • {v.voucherType} • {v.narration}</Text>
                                </View>
                            );
                        })
                    )}
                </SectionCard>
            )}

            {/* Sub-tab 3: Labor Logs */}
            {cbTab === "hours_worked" && (
                <SectionCard cardBg={cardBg} border={border}>
                    <SectionTitle label="Workers worked for Client (Labor Logs)" txtSec={txtSec} />
                    {laborList.length === 0 ? (
                        <Text style={{ fontSize: 12, color: txtSec, textAlign: "center", marginVertical: 10 }}>No labor logs available.</Text>
                    ) : (
                        laborList.map((item, idx) => (
                            <View key={`${item.site}_${item.worker}_${idx}`} style={{ paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: border }}>
                                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                                    <Text style={{ fontSize: 12, fontWeight: "700", color: txtPri }}>{item.worker}</Text>
                                    <Text style={{ fontSize: 12, fontWeight: "800", color: COLORS.primary }}>{fmt(item.cost)}</Text>
                                </View>
                                <Text style={{ fontSize: 10, color: txtSec }}>Site: {item.site} • {item.shifts} shifts • {item.hours.toFixed(1)} hrs</Text>
                            </View>
                        ))
                    )}
                </SectionCard>
            )}

            {/* Sub-tab 4: Ledgers */}
            {cbTab === "dues_paid" && (
                <SectionCard cardBg={cardBg} border={border}>
                    <SectionTitle label="Consolidated Client Billing Ledger" txtSec={txtSec} />
                    {consolidatedClientList.length === 0 ? (
                        <Text style={{ fontSize: 12, color: txtSec, textAlign: "center", marginVertical: 10 }}>No client accounts configured.</Text>
                    ) : (
                        <View>
                            <View style={{ flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: border, justifyContent: "space-between" }}>
                                <Text style={{ flex: 1.5, fontSize: 10, fontWeight: "700", color: txtPri }}>CLIENT NAME</Text>
                                <Text style={{ flex: 1, fontSize: 10, fontWeight: "700", color: txtPri, textAlign: "right" }}>BILLED (DR)</Text>
                                <Text style={{ flex: 1, fontSize: 10, fontWeight: "700", color: txtPri, textAlign: "right" }}>COLLECTED (CR)</Text>
                                <Text style={{ flex: 1, fontSize: 10, fontWeight: "700", color: txtPri, textAlign: "right" }}>OUTSTANDING</Text>
                            </View>
                            {consolidatedClientList.map((item) => (
                                <View key={String(item.ledgerId)} style={{ flexDirection: "row", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: border, justifyContent: "space-between", alignItems: "center" }}>
                                    <Text style={{ flex: 1.5, fontSize: 11, fontWeight: "600", color: txtPri }} numberOfLines={1}>{item.name}</Text>
                                    <Text style={{ flex: 1, fontSize: 11, color: txtSec, textAlign: "right" }}>{fmt(item.billed)}</Text>
                                    <Text style={{ flex: 1, fontSize: 11, color: txtSec, textAlign: "right" }}>{fmt(item.collected)}</Text>
                                    <Text style={{ flex: 1, fontSize: 11, fontWeight: "700", color: item.outstanding > 0 ? "#3b82f6" : COLORS.success, textAlign: "right" }}>{fmt(item.outstanding)}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </SectionCard>
            )}

            {/* Sub-tab 5: Excel Uploads */}
            {cbTab === "uploads" && (
                <SectionCard cardBg={cardBg} border={border}>
                    <SectionTitle label="Bulk Upload: Client Bills" txtSec={txtSec} />
                    <Text style={{ fontSize: 12, color: txtSec, marginBottom: 16, lineHeight: 18 }}>
                        Import client sales bills (Sales vouchers) using our Excel template.
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity 
                            onPress={onDownloadTemplate} 
                            disabled={downloading}
                            style={{ 
                                flex: 1, 
                                flexDirection: "row",
                                alignItems: "center", 
                                justifyContent: "center",
                                backgroundColor: isDark ? "#1f2937" : "#f3f4f6", 
                                borderRadius: 10, 
                                paddingVertical: 12, 
                                borderWidth: 1, 
                                borderColor: border,
                                gap: 6
                            }}
                        >
                            {downloading ? (
                                <ActivityIndicator size="small" color={COLORS.primary} />
                            ) : (
                                <>
                                    <Ionicons name="download-outline" size={16} color={COLORS.primary} />
                                    <Text style={{ color: txtPri, fontWeight: "600", fontSize: 12 }}>Template</Text>
                                </>
                            )}
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            onPress={onUploadVouchers} 
                            disabled={uploading}
                            style={{ 
                                flex: 1, 
                                flexDirection: "row",
                                alignItems: "center", 
                                justifyContent: "center",
                                backgroundColor: COLORS.primary, 
                                borderRadius: 10, 
                                paddingVertical: 12, 
                                gap: 6
                            }}
                        >
                            {uploading ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <>
                                    <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>Upload Excel</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </SectionCard>
            )}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION LIST (module-level)
// ─────────────────────────────────────────────────────────────────────────────
function TxnList({ txns, theme, emptyLabel, onDelete }: {
    txns: Transaction[]; theme: any; emptyLabel: string; onDelete: (id: string) => void;
}) {
    if (txns.length === 0) {
        return (
            <View style={{ alignItems: "center", marginTop: 60, opacity: 0.4 }}>
                <Ionicons name="receipt-outline" size={52} color={COLORS.textMuted} />
                <Text style={{ color: COLORS.textMuted, marginTop: 12, fontSize: 14 }}>{emptyLabel}</Text>
            </View>
        );
    }
    return (
        <>
            {txns.map((txn) => (
                <TxnCard key={txn._id} txn={txn} theme={theme} onDelete={onDelete} />
            ))}
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT PICKER  (module-level — friends, family, freelancers, money lenders)
// Lets the user search existing contacts by name/mobile OR add a new one inline.
// ─────────────────────────────────────────────────────────────────────────────
const CONTACT_TYPES = ["Friend", "Family", "Freelancer", "Money Lender", "Misc Vendor", "Other"] as const;

function ContactPicker({ contacts, selected, onSelect, onAddNew, loading, border, txtPri, txtSec, cardBg, inputBg }: {
    contacts: ContactPickerItem[];
    selected: ContactPickerItem | null;
    onSelect: (c: ContactPickerItem) => void;
    onAddNew: (name: string, mobile: string, type: string) => Promise<void>;
    loading: boolean;
    border: string; txtPri: string; txtSec: string; cardBg: string; inputBg: string;
}) {
    const [search,    setSearch]    = useState("");
    const [addMode,   setAddMode]   = useState(false);
    const [newName,   setNewName]   = useState("");
    const [newMobile, setNewMobile] = useState("");
    const [newType,   setNewType]   = useState<string>("Friend");
    const [saving,    setSaving]    = useState(false);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return contacts;
        return contacts.filter(c =>
            c.name?.toLowerCase().includes(q) ||
            c.mobile?.includes(q)
        );
    }, [contacts, search]);

    const handleAdd = async () => {
        if (!newName.trim()) { Alert.alert("Name required"); return; }
        if (!newMobile.trim() || newMobile.replace(/\D/g, '').length < 10) {
            Alert.alert("Valid 10-digit mobile required");
            return;
        }
        setSaving(true);
        try {
            await onAddNew(newName.trim(), newMobile.replace(/\D/g, '').slice(-10), newType);
            setAddMode(false);
            setSearch(newMobile.replace(/\D/g, '').slice(-10));
            setNewName(""); setNewMobile(""); setNewType("Friend");
        } catch (e: any) { Alert.alert("Error", e.message); }
        finally { setSaving(false); }
    };

    const accentColor = "#8B5CF6"; // purple for contacts

    return (
        <View>
            {/* Selected badge */}
            {selected && (
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: accentColor + "15", borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: accentColor + "40" }}>
                    <Ionicons name="person-circle-outline" size={20} color={accentColor} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: accentColor }}>{selected.name}</Text>
                        <Text style={{ fontSize: 10, color: accentColor, opacity: 0.8 }}>{selected.mobile} · {selected.type}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: COLORS.success, fontWeight: "700" }}>✓ Selected</Text>
                </View>
            )}

            {/* Search + Add New toggle */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: inputBg, borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 10, height: 40 }}>
                    <Ionicons name="search-outline" size={14} color={COLORS.textMuted} />
                    <TextInput
                        style={{ flex: 1, marginLeft: 6, fontSize: 13, color: txtPri }}
                        placeholder="Search by name or mobile…"
                        placeholderTextColor={COLORS.textMuted}
                        value={search}
                        onChangeText={setSearch}
                        keyboardType="default"
                    />
                </View>
                <TouchableOpacity onPress={() => setAddMode(v => !v)} activeOpacity={0.75}
                    style={{ backgroundColor: addMode ? COLORS.danger + "20" : accentColor + "18", borderRadius: 10, padding: 9, borderWidth: 1, borderColor: addMode ? COLORS.danger + "40" : accentColor + "40" }}>
                    <Ionicons name={addMode ? "close" : "person-add-outline"} size={18} color={addMode ? COLORS.danger : accentColor} />
                </TouchableOpacity>
            </View>

            {/* Add New Contact inline form */}
            {addMode && (
                <View style={{ backgroundColor: accentColor + "08", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: accentColor + "30", marginBottom: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: accentColor, marginBottom: 8, letterSpacing: 0.8 }}>NEW CONTACT</Text>
                    <TextInput
                        style={{ backgroundColor: inputBg, borderWidth: 1, borderColor: border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: txtPri, marginBottom: 8 }}
                        placeholder="Full name *"
                        placeholderTextColor={COLORS.textMuted}
                        value={newName}
                        onChangeText={setNewName}
                    />
                    <TextInput
                        style={{ backgroundColor: inputBg, borderWidth: 1, borderColor: border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: txtPri, marginBottom: 8 }}
                        placeholder="Mobile number * (10 digits)"
                        placeholderTextColor={COLORS.textMuted}
                        value={newMobile}
                        onChangeText={setNewMobile}
                        keyboardType="phone-pad"
                        maxLength={13}
                    />
                    {/* Contact type chips */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: "row", gap: 6 }}>
                            {CONTACT_TYPES.map(ct => {
                                const sel = newType === ct;
                                return (
                                    <TouchableOpacity key={ct} onPress={() => setNewType(ct)} activeOpacity={0.75}
                                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1.5, backgroundColor: sel ? accentColor + "20" : "transparent", borderColor: sel ? accentColor : border }}>
                                        <Text style={{ fontSize: 10, fontWeight: sel ? "700" : "500", color: sel ? accentColor : txtSec }}>{ct}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </ScrollView>
                    <TouchableOpacity onPress={handleAdd} disabled={saving} activeOpacity={0.85}
                        style={{ backgroundColor: accentColor, borderRadius: 8, paddingVertical: 10, alignItems: "center", opacity: saving ? 0.7 : 1 }}>
                        {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Save Contact & Select</Text>}
                    </TouchableOpacity>
                </View>
            )}

            {loading && <ActivityIndicator size="small" color={accentColor} style={{ marginVertical: 8 }} />}
            {contacts.length === 0 && !loading && !addMode && (
                <Text style={{ color: COLORS.textMuted, textAlign: "center", marginVertical: 8, fontSize: 12 }}>
                    No contacts yet. Tap + to add a friend, family member, or money lender.
                </Text>
            )}

            <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
                {filtered.map(c => {
                    const isSel = selected?._id === c._id;
                    return (
                        <TouchableOpacity key={c._id} onPress={() => onSelect(c)} activeOpacity={0.75}
                            style={{ padding: 10, borderRadius: 10, marginBottom: 6, borderWidth: 1.5, borderColor: isSel ? accentColor : border, backgroundColor: isSel ? accentColor + "10" : cardBg }}>
                            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 12, fontWeight: "700", color: isSel ? accentColor : txtPri }}>{c.name}</Text>
                                    <Text style={{ fontSize: 10, color: txtSec, marginTop: 2 }}>{c.mobile} · {c.type}</Text>
                                </View>
                                {isSel && <Ionicons name="checkmark-circle" size={18} color={accentColor} />}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD TRANSACTION MODAL (module-level)
// ─────────────────────────────────────────────────────────────────────────────
function AddTxnModal({ visible, direction, leads, leadsLoading, staff, staffLoading, onAddContact, theme, onClose, onSubmit }: {
    visible: boolean; direction: "PAYMENT" | "RECEIPT";
    leads: LeadPickerItem[]; leadsLoading: boolean;
    staff: StaffPickerData; staffLoading: boolean;
    onAddContact: (name: string, mobile: string, type: string) => Promise<void>;
    theme: any;
    onClose: () => void; onSubmit: (payload: any) => Promise<void>;
}) {
    const { cardBg, border, txtPri, txtSec, inputBg } = theme;

    const [txn_type,        setTxnType]        = useState<TxnType>("vendor_payment");
    const [amount,          setAmount]         = useState("");
    const [party_name,      setPartyName]      = useState("");
    const [description,     setDescription]    = useState("");
    const [ref_invoice,     setRefInvoice]     = useState("");
    const [payment_mode,    setPaymentMode]    = useState<string>("Cash");
    const [utr_ref,         setUtrRef]         = useState("");
    const [cheque_no,       setChequeNo]       = useState("");
    const [selectedLead,    setSelectedLead]   = useState<LeadPickerItem | null>(null);
    const [selectedStaff,   setSelectedStaff]  = useState<AnyStaff | null>(null);
    const [selectedContact, setSelectedContact] = useState<ContactPickerItem | null>(null);
    const [txn_date,        setTxnDate]        = useState<Date>(new Date());
    const [showDatePicker,  setShowDatePicker] = useState(false);
    const [submitting,      setSubmitting]     = useState(false);

    const types = direction === "PAYMENT" ? PAYMENT_TYPES : RECEIPT_TYPES;

    // Group types by Accounting Class for the dropdown
    const typesByClass = useMemo(() => {
        const groups: Record<string, TxnType[]> = {};
        types.forEach(t => {
            const cls = TXN_META[t].accountingClass;
            if (!groups[cls]) groups[cls] = [];
            groups[cls].push(t);
        });
        return Object.entries(groups);
    }, [types]);

    React.useEffect(() => {
        if (!visible) return;
        const first = types[0];
        setTxnType(first);
        setAmount(""); setPartyName(""); setDescription(""); setRefInvoice("");
        setPaymentMode("Cash"); setUtrRef(""); setChequeNo("");
        setSelectedLead(null); setSelectedStaff(null); setSelectedContact(null);
        setTxnDate(new Date());
    }, [direction, visible, types]);

    const handleTypeChange = useCallback((t: TxnType) => {
        setTxnType(t);
        setSelectedLead(null);
        setSelectedStaff(null);
        setSelectedContact(null);
    }, []);

    const meta           = TXN_META[txn_type];
    const needsLead      = LEAD_REQUIRED_TYPES.has(txn_type);
    const needsStaff     = meta?.requiresStaff ?? null;
    const needsContact   = meta?.requiresContact ?? false;
    const accent         = direction === "PAYMENT" ? COLORS.danger : COLORS.success;
    const dirLabel       = direction === "PAYMENT" ? "Record Payment" : "Record Receipt";

    const handleSubmit = async () => {
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) { Alert.alert("Validation", "Enter a valid amount"); return; }
        if (needsLead && !selectedLead) {
            Alert.alert("Select Lead / Project", `"${meta.label}" must be linked to a lead.`);
            return;
        }
        if (needsStaff && !selectedStaff) {
            Alert.alert("Select Staff", `"${meta.label}" must be linked to ${needsStaff === "employee" ? "an employee" : "a transporter"}.`);
            return;
        }
        if (needsContact && !selectedContact) {
            Alert.alert("Select Contact", `"${meta.label}" must be linked to a contact (friend/family/money lender). Add them using the + button.`);
            return;
        }
        setSubmitting(true);
        try {
            await onSubmit({
                txn_type, amount: amt,
                party_name:     party_name.trim() || selectedContact?.name || selectedStaff?.name || selectedLead?.sender_name || undefined,
                description:    description.trim() || undefined,
                ref_invoice_no: ref_invoice.trim() || undefined,
                payment_mode,
                utr_ref:   utr_ref.trim() || undefined,
                cheque_no: cheque_no.trim() || undefined,
                txn_date:  txn_date.toISOString(),
                // Lead link
                ref_lead_id:  selectedLead?._id,
                lead_no:      selectedLead?.lead_no,
                lead_name:    selectedLead?.sender_name,
                project_name: selectedLead?.product_name,
                // Staff link
                staff_ref_id: selectedStaff?._id,
                staff_type:   selectedStaff ? needsStaff ?? undefined : undefined,
                staff_name:   selectedStaff?.name,
                staff_role:   selectedStaff
                    ? (needsStaff === "employee"
                        ? (selectedStaff as EmployeePickerItem).role
                        : (selectedStaff as TransporterPickerItem).vehicle_type)
                    : undefined,
                // Contact link
                contact_ref_id: selectedContact?._id,
                contact_mobile: selectedContact?.mobile,
                contact_name:   selectedContact?.name,
                contact_type:   selectedContact?.type,
            });
        } finally { setSubmitting(false); }
    };

    const inputStyle = {
        backgroundColor: inputBg, borderWidth: 1, borderColor: border,
        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
        fontSize: 14, color: txtPri,
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
                    <View style={{ backgroundColor: cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, maxHeight: "94%", borderWidth: 0.5, borderColor: border }}>
                        {/* Handle bar */}
                        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.textMuted, alignSelf: "center", marginBottom: 14 }} />

                        {/* Title */}
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: accent + "20", justifyContent: "center", alignItems: "center" }}>
                                    <Ionicons name={direction === "PAYMENT" ? "arrow-up-circle" : "arrow-down-circle"} size={22} color={accent} />
                                </View>
                                <Text style={{ fontSize: 17, fontWeight: "800", color: txtPri }}>{dirLabel}</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Ionicons name="close-circle" size={26} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        </View>

                        {/* Scrollable content — keyboardShouldPersistTaps="always" ensures taps
                            on list items don't dismiss the keyboard when a TextInput has focus */}
                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">

                            {/* ── Transaction Date ── */}
                            <FieldRow label="Transaction Date *" txtSec={txtSec}>
                                <TouchableOpacity onPress={() => setShowDatePicker(true)} activeOpacity={0.7}
                                    style={{ flexDirection: "row", alignItems: "center", backgroundColor: inputBg, borderWidth: 1, borderColor: border, borderRadius: 8, paddingHorizontal: 10, height: 40, gap: 8 }}>
                                    <Ionicons name="calendar-outline" size={16} color={accent} />
                                    <Text style={{ fontSize: 13, color: txtPri }}>{txn_date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</Text>
                                    <Ionicons name="chevron-down" size={14} color={txtSec} style={{ marginLeft: "auto" }} />
                                </TouchableOpacity>
                                {showDatePicker && (
                                    <DateTimePicker
                                        value={txn_date}
                                        mode="date"
                                        display={Platform.OS === "ios" ? "inline" : "default"}
                                        onChange={(event, selectedDate) => {
                                            if (Platform.OS === "android") setShowDatePicker(false);
                                            if (selectedDate) setTxnDate(selectedDate);
                                        }}
                                        themeVariant={theme.isDark ? "dark" : "light"}
                                    />
                                )}
                            </FieldRow>

                            {/* ── Transaction Type ── */}
                            <FieldRow label="Transaction Type (Accounting Logic) *" txtSec={txtSec}>
                                <View style={{ backgroundColor: inputBg, borderWidth: 1, borderColor: border, borderRadius: 8, overflow: "hidden" }}>
                                    <Picker
                                        selectedValue={txn_type}
                                        onValueChange={(val: TxnType) => handleTypeChange(val)}
                                        dropdownIconColor={txtSec}
                                        style={{ color: txtPri, margin: -8 }}
                                    >
                                        {typesByClass.flatMap(([cls, classTypes]) => classTypes.map(t => {
                                            const m = TXN_META[t];
                                            return <Picker.Item key={t} label={`[${cls}] ${m.label}`} value={t} color={txtPri} />;
                                        }))}
                                    </Picker>
                                </View>
                                {(needsLead || needsStaff || needsContact) && (
                                    <Text style={{ fontSize: 10, color: COLORS.primary, marginTop: 5, fontWeight: "600" }}>
                                        {needsLead   ? "● Requires lead/project link"
                                        : needsContact ? "● Required: identify the lender/party below"
                                        : `● Requires ${needsStaff} selection`}
                                    </Text>
                                )}
                                {!needsLead && !needsStaff && !needsContact && (
                                    <Text style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 5 }}>
                                        ↓ Optionally identify the party below for ledger tracking
                                    </Text>
                                )}
                            </FieldRow>

                            {/* ── Lead Picker ── */}
                            {needsLead && (
                                <FieldRow label={`Select ${meta.leadLabel || "Lead / Project"} *`} txtSec={txtSec}>
                                    <LeadPicker leads={leads} selected={selectedLead} onSelect={setSelectedLead}
                                        loading={leadsLoading} border={border} txtPri={txtPri} txtSec={txtSec} cardBg={cardBg} inputBg={inputBg} />
                                </FieldRow>
                            )}

                            {/* ── Staff Picker ── */}
                            {needsStaff && (
                                <FieldRow label={needsStaff === "employee" ? "Select Employee *" : "Select Transporter *"} txtSec={txtSec}>
                                    <StaffPicker
                                        staffData={staff}
                                        staffType={needsStaff}
                                        selected={selectedStaff}
                                        onSelect={setSelectedStaff}
                                        loading={staffLoading}
                                        border={border} txtPri={txtPri} txtSec={txtSec} cardBg={cardBg} inputBg={inputBg}
                                    />
                                </FieldRow>
                            )}

                            {/* ── Contact / Party Picker ──────────────────────────────────────────
                                 Shows for ALL types that don't need a lead or staff link.
                                 Required  → loan_repayment, loan_received (must identify lender)
                                 Optional  → misc_expense, misc_income, scrap_sale (identify buyer/payee)
                                 This ensures the + button is ALWAYS accessible for those types. */}
                            {!needsLead && !needsStaff && (
                                <FieldRow
                                    label={needsContact
                                        ? "Identify Party — Friend / Family / Lender *"
                                        : "Identify Party (optional)"}
                                    txtSec={txtSec}>
                                    <ContactPicker
                                        contacts={staff.contacts ?? []}
                                        selected={selectedContact}
                                        onSelect={setSelectedContact}
                                        onAddNew={onAddContact}
                                        loading={staffLoading}
                                        border={border} txtPri={txtPri} txtSec={txtSec} cardBg={cardBg} inputBg={inputBg}
                                    />
                                </FieldRow>
                            )}

                            {/* ── Optional Lead link for freight/advance ── */}
                            {!needsLead && needsStaff && (meta.leadLabel || txn_type === "freight_cartage") && (
                                <FieldRow label="Link to Lead / Project (optional)" txtSec={txtSec}>
                                    <LeadPicker leads={leads} selected={selectedLead} onSelect={setSelectedLead}
                                        loading={leadsLoading} border={border} txtPri={txtPri} txtSec={txtSec} cardBg={cardBg} inputBg={inputBg} />
                                </FieldRow>
                            )}

                            {/* ── Amount ── */}
                            <FieldRow label="Amount (₹)" txtSec={txtSec}>
                                <TextInput
                                    style={[inputStyle, { fontSize: 20, fontWeight: "700" }]}
                                    placeholder="0.00"
                                    placeholderTextColor={COLORS.textMuted}
                                    keyboardType="decimal-pad"
                                    value={amount}
                                    onChangeText={setAmount}
                                />
                            </FieldRow>

                            {/* ── Party Name ── */}
                            <FieldRow label="Party Name" txtSec={txtSec}>
                                <TextInput style={inputStyle}
                                    placeholder={meta.partyHint || (direction === "PAYMENT" ? "Payee / party name…" : "Payer / client name…")}
                                    placeholderTextColor={COLORS.textMuted}
                                    value={party_name}
                                    onChangeText={setPartyName}
                                />
                            </FieldRow>

                            {/* ── Reference Invoice ── */}
                            <FieldRow label="Reference Invoice# / PO#" txtSec={txtSec}>
                                <TextInput style={inputStyle} placeholder="Optional reference number…"
                                    placeholderTextColor={COLORS.textMuted} value={ref_invoice} onChangeText={setRefInvoice} />
                            </FieldRow>

                            {/* ── Payment Mode ── */}
                            <FieldRow label="Payment Mode" txtSec={txtSec}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always">
                                    <View style={{ flexDirection: "row", gap: 8 }}>
                                        {PAYMENT_MODES.map(m => {
                                            const sel = payment_mode === m;
                                            return (
                                                <TouchableOpacity key={m} onPress={() => setPaymentMode(m)} activeOpacity={0.75}
                                                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5, backgroundColor: sel ? COLORS.primary + "18" : "transparent", borderColor: sel ? COLORS.primary : border }}>
                                                    <Text style={{ fontSize: 11, fontWeight: sel ? "700" : "500", color: sel ? COLORS.primary : txtSec }}>{m}</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </ScrollView>
                            </FieldRow>

                            {(["NEFT", "RTGS", "IMPS", "UPI"] as const).includes(payment_mode as any) && (
                                <FieldRow label="UTR / Ref No." txtSec={txtSec}>
                                    <TextInput style={inputStyle} placeholder="UTR or UPI reference…"
                                        placeholderTextColor={COLORS.textMuted} value={utr_ref} onChangeText={setUtrRef} />
                                </FieldRow>
                            )}
                            {payment_mode === "Cheque" && (
                                <FieldRow label="Cheque Number" txtSec={txtSec}>
                                    <TextInput style={inputStyle} placeholder="Cheque number…"
                                        placeholderTextColor={COLORS.textMuted} value={cheque_no} onChangeText={setChequeNo} />
                                </FieldRow>
                            )}

                            {/* ── Description ── */}
                            <FieldRow label="Description / Narration" txtSec={txtSec}>
                                <TextInput
                                    style={[inputStyle, { minHeight: 60, textAlignVertical: "top" }]}
                                    placeholder="Brief note about this transaction…"
                                    placeholderTextColor={COLORS.textMuted}
                                    multiline
                                    value={description}
                                    onChangeText={setDescription}
                                />
                            </FieldRow>

                            {/* ── Submit ── */}
                            <TouchableOpacity onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}
                                style={{ backgroundColor: accent, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 8, opacity: submitting ? 0.7 : 1, ...mkShadow(6) }}>
                                {submitting
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}>{dirLabel}</Text>}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function FinanceDashboard({ token, userId, name, dbName }: Props) {
    const isDark  = useColorScheme() === "dark";
    const bg      = isDark ? COLORS.bgDark    : COLORS.bgLight;
    const cardBg  = isDark ? COLORS.cardDark  : COLORS.cardLight;
    const border  = isDark ? COLORS.borderDark : COLORS.border;
    const txtPri  = isDark ? "#e8e8e8" : "#1a1a1a";
    const txtSec  = isDark ? "#999"    : "#666";
    const trackBg = isDark ? "#2a2a2a" : "#f0f0f0";
    const inputBg = isDark ? "#1a2535" : "#f8fafc";

    const [activeTab, setActiveTab] = useState<FinTab>("overview");
    const [showForm,  setShowForm]  = useState(false);
    const [formDir,   setFormDir]   = useState<"PAYMENT" | "RECEIPT">("PAYMENT");

    const {
        transactions, summary, leads, staff,
        loading, summaryLoading, leadsLoading, staffLoading,
        fetchTransactions, fetchSummary, fetchLeadsForPicker, fetchStaffPicker,
        addContact, createTransaction, deleteTransaction,
        fetchPartyLedger
    } = usePayments(token, dbName);

    // ─── Attendance hook (shared across all dashboards) ──────────────────────
    const {
        dutyStatus,
        activeDuty,
        isShiftComplete,
        startDuty,
        endDuty,
        formatDuration,
    } = useAttendance();

    const [emergencyFinVisible, setEmergencyFinVisible] = useState(false);
    const [emergencyFinReason, setEmergencyFinReason] = useState('');

    const handleFinanceDutyToggle = async () => {
        if (dutyStatus === 'OFF') {
            await startDuty();
        } else {
            if (!isShiftComplete) {
                Alert.alert('Locked', 'You cannot end duty before the required hours are completed.');
                return;
            }
            await endDuty();
        }
    };

    const submitFinanceEmergencyOff = async () => {
        if (!emergencyFinReason.trim()) {
            Alert.alert('Error', 'Please enter a reason.');
            return;
        }
        try {
            Alert.alert('Request Sent', 'Your emergency off request has been sent to Admins.');
            const res = await appService.httpClient.get('service/staff', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data?.success) {
                const admins = (res.data.data || []).filter(
                    (u: any) => u.userRole === 'userAdmin' || u.userRole === 'CorpAdmin'
                );
                for (const admin of admins) {
                    await appService.httpClient.post('service/chat/send', {
                        senderName: name,
                        senderId: userId,
                        text: `Emergency Duty Off Request: ${emergencyFinReason}`,
                        type: 'text',
                        isOneToOne: true,
                        receiverId: admin._id,
                    }, { headers: { Authorization: `Bearer ${token}` } });
                }
            }
        } catch (err) {
            console.error('Failed to send emergency chat message', err);
        }
        setEmergencyFinVisible(false);
        setEmergencyFinReason('');
    };

    const [vouchersList, setVouchersList] = useState<any[]>([]);
    const [attendanceList, setAttendanceList] = useState<any[]>([]);
    const [masterData, setMasterData] = useState<{ groups: any[]; ledgers: any[] }>({ groups: [], ledgers: [] });
    const [extraLoading, setExtraLoading] = useState(false);

    const fetchExtraData = useCallback(async () => {
        setExtraLoading(true);
        try {
            const authHeaders = {
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(dbName ? { "x-tenant-id": dbName } : {})
                }
            };
            const [vouchersRes, attendanceRes, masterRes] = await Promise.all([
                appService.httpClient.get("finance/vouchers", authHeaders),
                appService.httpClient.get("service/hr/attendance", authHeaders),
                appService.httpClient.get("finance/master", authHeaders)
            ]);

            if (vouchersRes.data?.success) {
                setVouchersList(vouchersRes.data.data || []);
            }
            if (attendanceRes.data?.success) {
                setAttendanceList(attendanceRes.data.data || []);
            }
            if (masterRes.data?.success) {
                setMasterData(masterRes.data.data || { groups: [], ledgers: [] });
            }
        } catch (err) {
            console.error("Failed to fetch extra finance data:", err);
        } finally {
            setExtraLoading(false);
        }
    }, [token, dbName]);

    useEffect(() => {
        if (!dbName) return;
        fetchExtraData();
    }, [fetchExtraData, dbName]);

    const [downloading, setDownloading] = useState(false);
    const [uploading, setUploading] = useState(false);

    const handleDownloadTemplate = useCallback(async () => {
        setDownloading(true);
        try {
            if (Platform.OS === "web") {
                const response = await appService.httpClient.get("finance/vouchers/bulk-template", {
                    responseType: "blob",
                    headers: { 
                        Authorization: `Bearer ${token}`,
                        ...(dbName ? { "x-tenant-id": dbName } : {})
                    }
                });
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement("a");
                link.href = url;
                link.setAttribute("download", "Voucher_Upload_Template.xlsx");
                document.body.appendChild(link);
                link.click();
                link.remove();
            } else {
                // Native
                const fileName = "Voucher_Upload_Template.xlsx";
                const fileUri = FileSystem.documentDirectory + fileName;
                
                const downloadRes = await FileSystem.downloadAsync(
                    `${appService.httpClient.defaults.baseURL}finance/vouchers/bulk-template`,
                    fileUri,
                    { 
                        headers: { 
                            Authorization: `Bearer ${token}`,
                            ...(dbName ? { "x-tenant-id": dbName } : {})
                        } 
                    }
                );
                
                if (downloadRes.status !== 200) {
                    throw new Error(`Server returned status code: ${downloadRes.status}`);
                }
                
                await Sharing.shareAsync(downloadRes.uri);
            }
            appService.showToast("Template downloaded successfully!", "Success");
        } catch (err: any) {
            console.log("Download Error:", err);
            const msg = err?.response?.data?.message || err.message || "Could not download template.";
            appService.showToast(msg, "Error");
        } finally {
            setDownloading(false);
        }
    }, [token, dbName]);

    const handleUploadVouchers = useCallback(async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: [
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
                    "application/vnd.ms-excel",
                    ".xlsx", ".xls"
                ],
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            const file = result.assets[0];
            setUploading(true);

            const formData = new FormData();
            formData.append("file", {
                uri: Platform.OS === "android" ? file.uri : file.uri.replace("file://", ""),
                name: file.name,
                type: file.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            } as any);

            const res = await appService.httpClient.post("finance/vouchers/bulk-upload", formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                    Authorization: `Bearer ${token}`,
                    ...(dbName ? { "x-tenant-id": dbName } : {})
                }
            });

            if (res.data?.success) {
                Alert.alert("Success", res.data.message || "Vouchers uploaded successfully!");
                // Refresh data
                await Promise.all([fetchTransactions(), fetchSummary(), fetchExtraData()]);
            } else {
                throw new Error(res.data?.message || "Failed to upload vouchers");
            }
        } catch (err: any) {
            console.log("Upload Error:", err);
            const errMsg = err?.response?.data?.message || err.message || "Failed to upload file.";
            const errorsList = err?.response?.data?.errors;
            if (errorsList && Array.isArray(errorsList)) {
                Alert.alert("Validation Failed", errorsList.slice(0, 8).join("\n") + (errorsList.length > 8 ? "\n...and more errors" : ""));
            } else {
                Alert.alert("Upload Error", errMsg);
            }
        } finally {
            setUploading(false);
        }
    }, [token, dbName, fetchTransactions, fetchSummary]);

    const [downloadingAtt, setDownloadingAtt] = useState(false);
    const [uploadingAtt, setUploadingAtt] = useState(false);

    const handleDownloadAttendanceTemplate = useCallback(async () => {
        setDownloadingAtt(true);
        try {
            if (Platform.OS === "web") {
                const response = await appService.httpClient.get("service/hr/attendance/bulk-template", {
                    responseType: "blob",
                    headers: { 
                        Authorization: `Bearer ${token}`,
                        ...(dbName ? { "x-tenant-id": dbName } : {})
                    }
                });
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement("a");
                link.href = url;
                link.setAttribute("download", "Attendance_Upload_Template.xlsx");
                document.body.appendChild(link);
                link.click();
                link.remove();
            } else {
                // Native
                const fileName = "Attendance_Upload_Template.xlsx";
                const fileUri = FileSystem.documentDirectory + fileName;
                
                const downloadRes = await FileSystem.downloadAsync(
                    `${appService.httpClient.defaults.baseURL}service/hr/attendance/bulk-template`,
                    fileUri,
                    { 
                        headers: { 
                            Authorization: `Bearer ${token}`,
                            ...(dbName ? { "x-tenant-id": dbName } : {})
                        } 
                    }
                );
                
                if (downloadRes.status !== 200) {
                    throw new Error(`Server returned status code: ${downloadRes.status}`);
                }
                
                await Sharing.shareAsync(downloadRes.uri);
            }
            appService.showToast("Attendance template downloaded successfully!", "Success");
        } catch (err: any) {
            console.log("Download Error:", err);
            const msg = err?.response?.data?.message || err.message || "Could not download attendance template.";
            appService.showToast(msg, "Error");
        } finally {
            setDownloadingAtt(false);
        }
    }, [token, dbName]);

    const handleUploadAttendance = useCallback(async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: [
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
                    "application/vnd.ms-excel",
                    ".xlsx", ".xls"
                ],
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            const file = result.assets[0];
            setUploadingAtt(true);

            const formData = new FormData();
            formData.append("file", {
                uri: Platform.OS === "android" ? file.uri : file.uri.replace("file://", ""),
                name: file.name,
                type: file.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            } as any);

            const res = await appService.httpClient.post("service/hr/attendance/bulk-upload", formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                    Authorization: `Bearer ${token}`,
                    ...(dbName ? { "x-tenant-id": dbName } : {})
                }
            });

            if (res.data?.success) {
                Alert.alert("Success", res.data.message || "Attendance uploaded successfully!");
                // Refresh data
                await Promise.all([fetchTransactions(), fetchSummary(), fetchExtraData()]);
            } else {
                throw new Error(res.data?.message || "Failed to upload attendance");
            }
        } catch (err: any) {
            console.log("Upload Error:", err);
            const errMsg = err?.response?.data?.message || err.message || "Failed to upload file.";
            const errorsList = err?.response?.data?.errors;
            if (errorsList && Array.isArray(errorsList)) {
                Alert.alert("Validation Failed", errorsList.slice(0, 8).join("\n") + (errorsList.length > 8 ? "\n...and more errors" : ""));
            } else {
                Alert.alert("Upload Error", errMsg);
            }
        } finally {
            setUploadingAtt(false);
        }
    }, [token, dbName, fetchTransactions, fetchSummary, fetchExtraData]);

    const [downloadingSalary, setDownloadingSalary] = useState(false);
    const [uploadingSalary, setUploadingSalary] = useState(false);

    const handleDownloadSalaryDuesTemplate = useCallback(async () => {
        setDownloadingSalary(true);
        try {
            if (Platform.OS === "web") {
                const response = await appService.httpClient.get("finance/vouchers/salary-enrollment-template", {
                    responseType: "blob",
                    headers: { 
                        Authorization: `Bearer ${token}`,
                        ...(dbName ? { "x-tenant-id": dbName } : {})
                    }
                });
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement("a");
                link.href = url;
                link.setAttribute("download", "Salary_By_Enrollment_Template.xlsx");
                document.body.appendChild(link);
                link.click();
                link.remove();
            } else {
                // Native
                const fileName = "Salary_By_Enrollment_Template.xlsx";
                const fileUri = FileSystem.documentDirectory + fileName;
                
                const downloadRes = await FileSystem.downloadAsync(
                    `${appService.httpClient.defaults.baseURL}finance/vouchers/salary-enrollment-template`,
                    fileUri,
                    { 
                        headers: { 
                            Authorization: `Bearer ${token}`,
                            ...(dbName ? { "x-tenant-id": dbName } : {})
                        } 
                    }
                );
                
                if (downloadRes.status !== 200) {
                    throw new Error(`Server returned status code: ${downloadRes.status}`);
                }
                
                await Sharing.shareAsync(downloadRes.uri);
            }
            appService.showToast("Salary dues template downloaded successfully!", "Success");
        } catch (err: any) {
            console.log("Download Error:", err);
            const msg = err?.response?.data?.message || err.message || "Could not download salary dues template.";
            appService.showToast(msg, "Error");
        } finally {
            setDownloadingSalary(false);
        }
    }, [token, dbName]);

    const handleUploadSalaryDues = useCallback(async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: [
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
                    "application/vnd.ms-excel",
                    ".xlsx", ".xls"
                ],
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            const file = result.assets[0];
            setUploadingSalary(true);

            const formData = new FormData();
            formData.append("file", {
                uri: Platform.OS === "android" ? file.uri : file.uri.replace("file://", ""),
                name: file.name,
                type: file.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            } as any);

            const res = await appService.httpClient.post("finance/vouchers/salary-enrollment-upload", formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                    Authorization: `Bearer ${token}`,
                    ...(dbName ? { "x-tenant-id": dbName } : {})
                }
            });

            if (res.data?.success) {
                let msg = res.data.message || "Salary dues uploaded successfully!";
                if (res.data.successList || res.data.failedList) {
                    msg += `\nSuccess: ${res.data.successList?.length || 0}`;
                    msg += `\nFailed: ${res.data.failedList?.length || 0}`;
                }
                Alert.alert("Success", msg);
                // Refresh data
                await Promise.all([fetchTransactions(), fetchSummary(), fetchExtraData()]);
            } else {
                throw new Error(res.data?.message || "Failed to upload salary dues");
            }
        } catch (err: any) {
            console.log("Upload Error:", err);
            const errMsg = err?.response?.data?.message || err.message || "Failed to upload file.";
            const errorsList = err?.response?.data?.errors;
            if (errorsList && Array.isArray(errorsList)) {
                Alert.alert("Validation Failed", errorsList.slice(0, 8).join("\n") + (errorsList.length > 8 ? "\n...and more errors" : ""));
            } else {
                Alert.alert("Upload Error", errMsg);
            }
        } finally {
            setUploadingSalary(false);
        }
    }, [token, dbName, fetchTransactions, fetchSummary, fetchExtraData]);

    // Theme bag — stable reference between renders doesn't matter here since
    // it's passed as a prop to module-level components (no re-mount risk)
    const theme = useMemo(
        () => ({ isDark, bg, cardBg, border, txtPri, txtSec, trackBg, inputBg }),
        [isDark, bg, cardBg, border, txtPri, txtSec, trackBg, inputBg]
    );

    const filteredTxns = useMemo(() => {
        if (activeTab === "payments")  return transactions.filter(t => t.direction === "PAYMENT");
        if (activeTab === "receipts")  return transactions.filter(t => t.direction === "RECEIPT");
        return transactions;
    }, [transactions, activeTab]);

    const openPaymentForm = useCallback((dir: "PAYMENT" | "RECEIPT") => {
        fetchLeadsForPicker();
        fetchStaffPicker();
        setFormDir(dir);
        setShowForm(true);
    }, [fetchLeadsForPicker, fetchStaffPicker]);

    const handleSubmit = useCallback(async (payload: any) => {
        await createTransaction(payload);
        setShowForm(false);
    }, [createTransaction]);

    const handleAddContact = useCallback(async (name: string, mobile: string, type: string) => {
        await addContact({ name, mobile, type: type as any });
    }, [addContact]);

    const handleClose = useCallback(() => setShowForm(false), []);

    const showFab = activeTab !== "overview" && activeTab !== "petty_cash" && activeTab !== "worker_salary" && activeTab !== "client_billing";

    const [showShareModal, setShowShareModal] = useState(false);
    const [shareTarget,    setShareTarget]    = useState<ContactPickerItem | null>(null);
    const [isSharing,      setIsSharing]      = useState(false);



    const executeShareLedger = async () => {
        if (!shareTarget) return;
        setIsSharing(true);
        try {
            const data = await fetchPartyLedger(shareTarget.mobile!);
            if (!data || !data.transactions || data.transactions.length === 0) {
                Alert.alert("Empty Ledger", "No transactions found for this party.");
                return;
            }
            let msg = `*LEDGER FOLIO - ${shareTarget.name}*\n`;
            msg += `Mobile: ${shareTarget.mobile} | Type: ${shareTarget.type}\n`;
            msg += `Generated: ${new Date().toLocaleDateString()}\n`;
            msg += `------------------------\n`;
            data.transactions.forEach((t: any) => {
                const dateStr = new Date(t.txn_date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                const action = t.direction === "PAYMENT" ? "DEBIT" : "CREDIT";
                msg += `${dateStr} | ${action} | ₹${t.amount}\n`;
                if (t.description) msg += `  Note: ${t.description}\n`;
            });
            msg += `------------------------\n`;
            msg += `Total Paid Out: ₹${data.totalPaid}\n`;
            msg += `Total Received: ₹${data.totalReceived}\n`;
            msg += `*Net Balance: ₹${Math.abs(data.netBalance)} ${data.netBalance >= 0 ? "SURPLUS" : "DEFICIT"}*\n`;
            msg += `------------------------\n`;

            await Share.share({ message: msg, title: `${shareTarget.name} Ledger Folio` });
            setShowShareModal(false);
            setShareTarget(null);
        } catch (err: any) {
            Alert.alert("Error", "Could not generate ledger layout.");
        } finally {
            setIsSharing(false);
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: bg }}>
            {/* ── DUTY STATUS HEADER (Finance) ───────────────────────────── */}
            <View style={{ backgroundColor: '#0f172a', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dutyStatus === 'ON' ? '#10b981' : '#ef4444' }} />
                    <Text style={{ color: dutyStatus === 'ON' ? '#10b981' : '#ef4444', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>
                        {dutyStatus === 'ON' ? 'ON DUTY' : 'OFF DUTY'}
                    </Text>
                    {dutyStatus === 'ON' && activeDuty?.dutyStart && (
                        <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '600' }}>
                            · {formatDuration(activeDuty.dutyStart)} Hrs
                        </Text>
                    )}
                    {dutyStatus === 'ON' && activeDuty?.site_name && (
                        <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '600' }}>
                            · {activeDuty.site_name}
                        </Text>
                    )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{name}</Text>
                    {dutyStatus === 'OFF' && (
                        <TouchableOpacity onPress={handleFinanceDutyToggle}
                            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#10b981', justifyContent: 'center', alignItems: 'center' }}>
                            <Ionicons name="finger-print" size={16} color="#fff" />
                        </TouchableOpacity>
                    )}
                    {dutyStatus === 'ON' && !isShiftComplete && (
                        <TouchableOpacity onPress={() => setEmergencyFinVisible(true)}
                            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#f97316', justifyContent: 'center', alignItems: 'center' }}>
                            <Ionicons name="warning-outline" size={16} color="#fff" />
                        </TouchableOpacity>
                    )}
                    {dutyStatus === 'ON' && isShiftComplete && (
                        <TouchableOpacity onPress={handleFinanceDutyToggle}
                            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' }}>
                            <Ionicons name="power" size={16} color="#fff" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* ── FINANCE SUB-TABS ──────────────────────────────────────── */}
            <View style={{ backgroundColor: cardBg, borderBottomWidth: 0.5, borderBottomColor: border }}>
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexDirection: "row" }}
                >
                    {FIN_TABS.map(tab => {
                        const isAct = activeTab === tab.key;
                        const tabColor = isAct
                            ? (tab.key === "payments" ? COLORS.danger : tab.key === "receipts" ? COLORS.success : COLORS.primary)
                            : COLORS.textMuted;
                        return (
                            <TouchableOpacity key={tab.key} onPress={() => setActiveTab(tab.key)} activeOpacity={0.75}
                                style={{ paddingHorizontal: 16, paddingVertical: 12, alignItems: "center", borderBottomWidth: isAct ? 2.5 : 0, borderBottomColor: isAct ? tabColor : "transparent" }}>
                                <Ionicons name={tab.icon as any} size={16} color={tabColor} />
                                <Text style={{ fontSize: 9.5, marginTop: 2, fontWeight: isAct ? "700" : "500", color: tabColor }}>
                                    {tab.label.toUpperCase()}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* ── CONTENT ──────────────────────────────────────────────── */}
            {activeTab === "petty_cash" ? (
                <View style={{ flex: 1, paddingBottom: FOOTER_HEIGHT }}>
                    <AdminPettyCashView hideHeader={true} />
                </View>
            ) : (summaryLoading || loading || extraLoading ? (
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={{ color: txtSec, marginTop: 12 }}>Loading financial data…</Text>
                </View>
            ) : (
                <ScrollView style={{ flex: 1 }}
                    contentContainerStyle={{ padding: 12, paddingBottom: FOOTER_HEIGHT + 80 }}
                    showsVerticalScrollIndicator={false}>
                    {activeTab === "overview" && (
                        <OverviewPanel 
                            theme={theme} 
                            summary={summary}
                            onPayment={() => { setActiveTab("payments"); openPaymentForm("PAYMENT"); }}
                            onReceipt={() => { setActiveTab("receipts"); openPaymentForm("RECEIPT"); }}
                            onRefresh={() => { fetchTransactions(); fetchSummary(); fetchExtraData(); }}
                            onDownloadTemplate={handleDownloadTemplate}
                            onUploadVouchers={handleUploadVouchers}
                            downloading={downloading}
                            uploading={uploading} 
                        />
                    )}
                    {activeTab === "worker_salary" && (
                        <WorkerSalaryPanel
                            theme={theme}
                            attendanceList={attendanceList}
                            vouchersList={vouchersList}
                            masterData={masterData}
                            onDownloadTemplate={handleDownloadTemplate}
                            onUploadVouchers={handleUploadVouchers}
                            downloading={downloading}
                            uploading={uploading}
                            onDownloadAttendanceTemplate={handleDownloadAttendanceTemplate}
                            onUploadAttendance={handleUploadAttendance}
                            downloadingAtt={downloadingAtt}
                            uploadingAtt={uploadingAtt}
                            onDownloadSalaryDuesTemplate={handleDownloadSalaryDuesTemplate}
                            onUploadSalaryDues={handleUploadSalaryDues}
                            downloadingSalary={downloadingSalary}
                            uploadingSalary={uploadingSalary}
                        />
                    )}
                    {activeTab === "client_billing" && (
                        <ClientBillingPanel
                            theme={theme}
                            attendanceList={attendanceList}
                            vouchersList={vouchersList}
                            masterData={masterData}
                            onDownloadTemplate={handleDownloadTemplate}
                            onUploadVouchers={handleUploadVouchers}
                            downloading={downloading}
                            uploading={uploading}
                        />
                    )}
                    {(activeTab === "payments" || activeTab === "receipts" || activeTab === "transactions") && (
                        <>
                            {activeTab === "transactions" && (
                                <TouchableOpacity onPress={() => setShowShareModal(true)} activeOpacity={0.8}
                                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.success + "15", padding: 12, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.success + "40" }}>
                                    <Ionicons name="logo-whatsapp" size={18} color={COLORS.success} />
                                    <Text style={{ marginLeft: 8, fontSize: 12, fontWeight: "700", color: COLORS.success, letterSpacing: 0.5 }}>SHARE PARTY LEDGER</Text>
                                </TouchableOpacity>
                            )}
                            <TxnList txns={filteredTxns} theme={theme}
                                emptyLabel={activeTab === "payments" ? "No payment records yet"
                                    : activeTab === "receipts" ? "No receipt records yet"
                                    : "No transactions yet"}
                                onDelete={deleteTransaction} />
                        </>
                    )}
                </ScrollView>
            ))}

            {/* ── FABs ─────────────────────────────────────────────────── */}
            {showFab && (
                <View style={{ position: "absolute", bottom: FOOTER_HEIGHT + 16, right: 16, flexDirection: "row", gap: 10, zIndex: 500 }}>
                    {(activeTab === "receipts" || activeTab === "transactions") && (
                        <FABBtn color={COLORS.success} icon="arrow-down-circle" onPress={() => openPaymentForm("RECEIPT")} />
                    )}
                    {(activeTab === "payments" || activeTab === "transactions") && (
                        <FABBtn color={COLORS.danger} icon="arrow-up-circle" onPress={() => openPaymentForm("PAYMENT")} />
                    )}
                </View>
            )}

            {/* ── ADD TRANSACTION MODAL ─────────────────────────────────── */}
            <AddTxnModal
                visible={showForm}
                direction={formDir}
                leads={leads}
                leadsLoading={leadsLoading}
                staff={staff}
                staffLoading={staffLoading}
                onAddContact={handleAddContact}
                theme={theme}
                onClose={handleClose}
                onSubmit={handleSubmit}
            />

            {/* ── EMERGENCY DUTY OFF MODAL ──────────────────────────────── */}
            <Modal visible={emergencyFinVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
                    <View style={{ backgroundColor: cardBg, borderRadius: 16, padding: 20 }}>
                        <Text style={{ color: txtPri, fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>Emergency Duty Off</Text>
                        <Text style={{ color: txtSec, fontSize: 14, marginBottom: 15 }}>Please enter a reason for ending your duty early. This will be recorded.</Text>
                        <TextInput
                            placeholder="Enter reason here..."
                            placeholderTextColor="#94a3b8"
                            value={emergencyFinReason}
                            onChangeText={setEmergencyFinReason}
                            style={{ borderWidth: 1, borderColor: border, borderRadius: 8, padding: 10, color: txtPri, backgroundColor: isDark ? '#0f172a' : '#f8fafc', marginBottom: 20, minHeight: 80, textAlignVertical: 'top' }}
                            multiline
                        />
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                            <TouchableOpacity onPress={() => { setEmergencyFinVisible(false); setEmergencyFinReason(''); }}
                                style={{ paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, backgroundColor: isDark ? '#334155' : '#e2e8f0' }}>
                                <Text style={{ color: txtPri, fontWeight: '700' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={submitFinanceEmergencyOff}
                                style={{ paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, backgroundColor: '#ef4444' }}>
                                <Text style={{ color: '#fff', fontWeight: '700' }}>Submit</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}