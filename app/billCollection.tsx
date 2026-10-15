/**
 * 💰 billCollection.tsx
 *
 * PURPOSE:
 * Bill Collection screen — select a client from the Account Ledger
 * (Sundry Debtors group), view their outstanding invoices, and record
 * a Receipt voucher (Dr Cash/Bank, Cr Client Ledger).
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    View,
    Text,
    ScrollView,
    FlatList,
    ActivityIndicator,
    TextInput,
    TouchableOpacity,
    Modal,
    KeyboardAvoidingView,
    Platform,
    useColorScheme,
    Alert,
    StyleSheet,
    RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";

import { AppHeader } from "@/components/AppHeader";
import { useUserContext } from "@/context/AuthContext";
import { appService } from "@/UtilServices/appHelper";
import { C, useTheme } from "@/hooks/Theme";

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface Ledger {
    _id: string;
    ledgerName: string;
    groupName?: string;
    ledgerGroupId?: string;
    currentBalance?: number;
    openingBalance?: number;
    leadIds?: string[];
    refId?: string;
    refType?: string;
}

interface Group {
    _id: string;
    groupName: string;
    nature: string;
}

interface Invoice {
    _id: string;
    invoice_number: string;
    invoice_date: string;
    due_date?: string;
    status: string;
    totals?: { grand_total: number };
    buyer?: { billing_address?: { company_name?: string } };
}

type PayMode = "Cash" | "Bank" | "UPI" | "Cheque" | "NEFT/RTGS";

const PAY_MODES: PayMode[] = ["Cash", "Bank", "UPI", "Cheque", "NEFT/RTGS"];
const STATUS_COLOR: Record<string, string> = {
    Draft: "#6b7280",
    Issued: "#1d4ed8",
    Sent: "#059669",
    Paid: "#15803d",
    "Partially Paid": "#ea580c",
    Overdue: "#dc2626",
    Cancelled: "#9ca3af",
};

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const fmtDate = (s?: string) => {
    if (!s) return "—";
    const d = new Date(s);
    return isNaN(d.getTime())
        ? s
        : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const fmtAmt = (n?: number) =>
    "₹ " + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ─── Component ────────────────────────────────────────────────────────────── */
export default function BillCollectionScreen() {
    const router = useRouter();
    const { user } = useUserContext();
    const isDark = useColorScheme() === "dark";
    const th = useTheme(isDark);
    const token = user?.token ?? "";

    /* ── State: Ledger Data ─────────────────────────────────────────────── */
    const [ledgers, setLedgers] = useState<Ledger[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    /* ── State: Search & Selection ──────────────────────────────────────── */
    const [search, setSearch] = useState("");
    const [selectedLedger, setSelectedLedger] = useState<Ledger | null>(null);

    /* ── State: Invoices ────────────────────────────────────────────────── */
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [invoicesLoading, setInvoicesLoading] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

    /* ── State: Collection Form ─────────────────────────────────────────── */
    const [collectModalVisible, setCollectModalVisible] = useState(false);
    const [amount, setAmount] = useState("");
    const [payMode, setPayMode] = useState<PayMode>("Cash");
    const [narration, setNarration] = useState("");
    const [chequeNo, setChequeNo] = useState("");
    const [utrRef, setUtrRef] = useState("");
    const [saving, setSaving] = useState(false);

    /* ── State: Leads Picker for Multi-Project Client Ledgers ────────────── */
    const [leadsPicker, setLeadsPicker] = useState<any[]>([]);
    const [selectedLeadId, setSelectedLeadId] = useState<string>("");

    /* ── Fetch Master (Groups + Ledgers) ────────────────────────────────── */
    const fetchMaster = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        try {
            const res = await appService.httpClient.get("finance/master", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.data?.success) {
                setGroups(res.data.data.groups || []);
                const allLedgers: Ledger[] = res.data.data.ledgers || [];
                // Filter: only Sundry Debtors group
                const debtorGroup = (res.data.data.groups as Group[]).find(
                    (g) => g.groupName?.toLowerCase().includes("sundry debtor")
                );
                const debtorLedgers = debtorGroup
                    ? allLedgers.filter(
                          (l) =>
                              String(l.ledgerGroupId) === String(debtorGroup._id) ||
                              l.groupName?.toLowerCase().includes("sundry debtor")
                      )
                    : allLedgers.filter((l) =>
                          l.groupName?.toLowerCase().includes("sundry debtor") ||
                          l.ledgerName?.toLowerCase() !== "default client"
                      );
                setLedgers(debtorLedgers.length ? debtorLedgers : allLedgers.filter(l =>
                    !["Cash Book", "Cash", "Petty Cash", "Sales", "Local Sales", "Purchase", "Local Purchase",
                     "Salary & Wages", "Default Client", "Default Vendor"].includes(l.ledgerName)
                ));
            }
        } catch (err: any) {
            appService.showToast(err?.response?.data?.message || "Failed to load ledger accounts", "Error");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [token]);

    useEffect(() => { 
        if (token) {
            fetchMaster();
            appService.httpClient.get("payment/leads-picker", {
                headers: { Authorization: `Bearer ${token}` }
            }).then(res => {
                if (res.data?.success) {
                    setLeadsPicker(res.data.data || []);
                }
            }).catch(err => console.error("Failed to load leads picker", err));
        }
    }, [token, fetchMaster]);

    /* ── Fetch invoices when ledger selected ────────────────────────────── */
    const fetchInvoicesForLedger = useCallback(async (ledger: Ledger) => {
        setInvoices([]);
        setInvoicesLoading(true);
        try {
            const leadIds = ledger.leadIds?.length
                ? ledger.leadIds
                : ledger.refId
                ? [ledger.refId]
                : [];

            if (leadIds.length === 0) {
                setInvoicesLoading(false);
                return;
            }

            // Fetch invoices for all linked leads
            const results = await Promise.all(
                leadIds.map((lid) =>
                    appService.httpClient.get("finance/invoices", {
                        headers: { Authorization: `Bearer ${token}` },
                        params: { leadId: lid },
                    })
                )
            );

            const allInvoices: Invoice[] = [];
            results.forEach((r) => {
                const data = r.data?.data ?? r.data ?? [];
                if (Array.isArray(data)) allInvoices.push(...data);
            });

            // Dedupe by _id, sort by date descending
            const unique = Array.from(
                new Map(allInvoices.map((i) => [i._id, i])).values()
            ).sort(
                (a, b) =>
                    new Date(b.invoice_date).getTime() -
                    new Date(a.invoice_date).getTime()
            );

            setInvoices(unique);
        } catch {
            // silently fail — invoices are informational only
        } finally {
            setInvoicesLoading(false);
        }
    }, [token]);

    const handleSelectLedger = (ledger: Ledger) => {
        setSelectedLedger(ledger);
        setSelectedInvoice(null);
        setInvoices([]);
        fetchInvoicesForLedger(ledger);
    };

    /* ── Open Collection Modal ──────────────────────────────────────────── */
    const openCollectModal = (invoice?: Invoice) => {
        setSelectedInvoice(invoice || null);
        setAmount(invoice?.totals?.grand_total ? String(invoice.totals.grand_total) : "");
        setNarration(
            invoice
                ? `Bill Collection – ${invoice.invoice_number} – ${selectedLedger?.ledgerName || ""}`
                : `Bill Collection – ${selectedLedger?.ledgerName || ""}`
        );
        setChequeNo("");
        setUtrRef("");
        setPayMode("Cash");

        // Initialize selectedLeadId for multi-project picker
        if (selectedLedger?.leadIds && selectedLedger.leadIds.length > 0) {
            setSelectedLeadId(selectedLedger.leadIds[0]);
        } else if (selectedLedger?.refType === "Lead" && selectedLedger.refId) {
            setSelectedLeadId(selectedLedger.refId);
        } else {
            setSelectedLeadId("");
        }

        setCollectModalVisible(true);
    };

    /* ── Submit Receipt Voucher ─────────────────────────────────────────── */
    const handleCollect = async () => {
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) {
            appService.showToast("Enter a valid amount", "Error");
            return;
        }
        if (!selectedLedger) {
            appService.showToast("No client ledger selected", "Error");
            return;
        }

        setSaving(true);
        try {
            const linkedLeadId = selectedLedger.leadIds && selectedLedger.leadIds.length > 1
                ? selectedLeadId
                : (selectedLedger.leadIds?.length
                    ? selectedLedger.leadIds[0]
                    : (selectedLedger.refType === "Lead" && selectedLedger.refId
                    ? selectedLedger.refId
                    : null));

            // Receipt voucher: Dr Cash/Bank (debit), Cr Client Ledger (credit)
            const drLedgerId = payMode === "Bank" || payMode === "NEFT/RTGS" || payMode === "Cheque"
                ? "main_bank"
                : "cash_in_hand";

            const entries = [
                {
                    ledgerId: drLedgerId,
                    ledgerName: drLedgerId === "main_bank" ? "Main Bank Account" : "Cash-in-Hand",
                    debit: amt,
                    credit: 0,
                    accountType: "Category",
                },
                {
                    ledgerId: selectedLedger._id,
                    ledgerName: selectedLedger.ledgerName,
                    debit: 0,
                    credit: amt,
                    accountType: "Category", // Direct ledger _id (Sundry Debtor account)
                    leadId: linkedLeadId,
                },
            ];

            const extraNotes = [
                payMode === "Cheque" && chequeNo ? `Cheque: ${chequeNo}` : null,
                (payMode === "NEFT/RTGS" || payMode === "UPI") && utrRef ? `UTR/Ref: ${utrRef}` : null,
                selectedInvoice ? `Against Invoice: ${selectedInvoice.invoice_number}` : null,
            ]
                .filter(Boolean)
                .join(" | ");

            const fullNarration = [narration, extraNotes].filter(Boolean).join(" | ");

            const payload = {
                voucherType: "Receipt",
                date: new Date().toISOString(),
                narration: fullNarration,
                paymentMode: payMode,
                locationId: user?.locationId || null,
                entries,
                leadId: linkedLeadId,
                ...(selectedInvoice ? { refInvoiceId: selectedInvoice._id, refInvoiceNo: selectedInvoice.invoice_number } : {}),
            };

            const res = await appService.httpClient.post("finance/vouchers", payload, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.data?.success) {
                appService.showToast(
                    `₹${amt.toLocaleString("en-IN")} collected from ${selectedLedger.ledgerName}`,
                    "Success"
                );
                setCollectModalVisible(false);
                setSelectedLedger(null);
                setInvoices([]);
                setSelectedInvoice(null);
                fetchMaster(true);
            } else {
                appService.showToast(res.data?.message || "Failed to record collection", "Error");
            }
        } catch (err: any) {
            appService.showToast(err?.response?.data?.message || err?.message || "Something went wrong", "Error");
        } finally {
            setSaving(false);
        }
    };

    /* ── Filtered Ledgers ───────────────────────────────────────────────── */
    const filteredLedgers = useMemo(() => {
        if (!search.trim()) return ledgers;
        const q = search.toLowerCase();
        return ledgers.filter(
            (l) =>
                l.ledgerName?.toLowerCase().includes(q) ||
                l.groupName?.toLowerCase().includes(q)
        );
    }, [ledgers, search]);

    /* ── Matching Leads for Selected Payer ───────────────────────────────── */
    const matchingLeads = useMemo(() => {
        if (!selectedLedger?.leadIds || selectedLedger.leadIds.length === 0) return [];
        return leadsPicker.filter(l => selectedLedger.leadIds!.includes(l._id));
    }, [selectedLedger, leadsPicker]);

    /* ── Outstanding Amount Helper ──────────────────────────────────────── */
    const outstandingTotal = useMemo(() => {
        return invoices
            .filter((inv) => !["Paid", "Cancelled", "Void"].includes(inv.status))
            .reduce((acc, inv) => acc + (inv.totals?.grand_total ?? 0), 0);
    }, [invoices]);

    /* ── Render ─────────────────────────────────────────────────────────── */
    if (loading) {
        return (
            <View style={[s.center, { backgroundColor: th.bg }]}>
                <ActivityIndicator size="large" color={C.primary} />
                <Text style={[s.loadingTxt, { color: th.txtSec }]}>Loading Ledger Accounts…</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={[s.root, { backgroundColor: th.bg }]} edges={["top"]}>
            <AppHeader
                title="Bill Collection"
                onBackPress={() => router.back()}
                rightAction={() => (
                    <TouchableOpacity onPress={() => fetchMaster(true)} style={{ padding: 4 }}>
                        <Ionicons name="refresh" size={22} color="#fff" />
                    </TouchableOpacity>
                )}
            />

            {/* ── Two-pane layout on wider screens, stacked otherwise ── */}
            <View style={{ flex: 1 }}>
                {selectedLedger ? (
                    /* ─── DETAIL VIEW: Selected Client ─────────────────── */
                    <ScrollView
                        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={() => fetchMaster(true)}
                                tintColor={C.primary}
                            />
                        }
                    >
                        {/* Back to list */}
                        <TouchableOpacity
                            style={[s.backChip, { backgroundColor: th.card, borderColor: th.border }]}
                            onPress={() => { setSelectedLedger(null); setInvoices([]); }}
                        >
                            <Ionicons name="arrow-back" size={16} color={C.primary} />
                            <Text style={[s.backChipTxt, { color: C.primary }]}>All Clients</Text>
                        </TouchableOpacity>

                        {/* Client Banner */}
                        <View style={[s.clientBanner, { backgroundColor: C.primary }]}>
                            <View style={s.bannerLeft}>
                                <View style={s.avatarCircle}>
                                    <Text style={s.avatarTxt}>
                                        {selectedLedger.ledgerName.charAt(0).toUpperCase()}
                                    </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.clientName} numberOfLines={2}>
                                        {selectedLedger.ledgerName}
                                    </Text>
                                    <Text style={s.clientSub}>Account Ledger • Sundry Debtor</Text>
                                </View>
                            </View>
                            <View style={s.bannerRight}>
                                <Text style={s.outstandingLabel}>Outstanding</Text>
                                <Text style={s.outstandingAmt}>{fmtAmt(outstandingTotal)}</Text>
                            </View>
                        </View>

                        {/* Collect Now (without invoice) */}
                        <TouchableOpacity
                            style={[s.collectBtn, { backgroundColor: C.primary }]}
                            onPress={() => openCollectModal()}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="cash-outline" size={20} color="#fff" />
                            <Text style={s.collectBtnTxt}>Collect Payment</Text>
                        </TouchableOpacity>

                        {/* Invoice List */}
                        <Text style={[s.sectionTitle, { color: th.txt }]}>
                            📄 Invoices{invoices.length > 0 ? ` (${invoices.length})` : ""}
                        </Text>

                        {invoicesLoading ? (
                            <View style={s.miniCenter}>
                                <ActivityIndicator size="small" color={C.primary} />
                                <Text style={[s.loadingTxt, { color: th.txtSec }]}>Loading invoices…</Text>
                            </View>
                        ) : invoices.length === 0 ? (
                            <View style={[s.emptyBox, { backgroundColor: th.card, borderColor: th.border }]}>
                                <Ionicons name="document-outline" size={40} color={th.border} />
                                <Text style={[s.emptyTxt, { color: th.txtSec }]}>
                                    No invoices linked to this ledger account.
                                </Text>
                                <Text style={[s.emptyHint, { color: th.txtSec }]}>
                                    You can still collect payment against this account.
                                </Text>
                            </View>
                        ) : (
                            invoices.map((inv) => {
                                const isPaid = inv.status === "Paid" || inv.status === "Cancelled";
                                const statusColor = STATUS_COLOR[inv.status] ?? "#6b7280";
                                return (
                                    <View
                                        key={inv._id}
                                        style={[
                                            s.invoiceCard,
                                            { backgroundColor: th.card, borderColor: th.border },
                                            isPaid && { opacity: 0.6 },
                                        ]}
                                    >
                                        {/* Left accent bar */}
                                        <View style={[s.invoiceAccent, { backgroundColor: statusColor }]} />

                                        <View style={{ flex: 1, padding: 12 }}>
                                            <View style={s.invoiceRow1}>
                                                <Text style={[s.invoiceNo, { color: th.txt }]}>
                                                    {inv.invoice_number}
                                                </Text>
                                                <View style={[s.statusPill, { borderColor: statusColor, backgroundColor: statusColor + "22" }]}>
                                                    <Text style={[s.statusTxt, { color: statusColor }]}>
                                                        {inv.status}
                                                    </Text>
                                                </View>
                                            </View>
                                            <Text style={[s.invoiceDate, { color: th.txtSec }]}>
                                                Dated: {fmtDate(inv.invoice_date)}
                                                {inv.due_date ? `  ·  Due: ${fmtDate(inv.due_date)}` : ""}
                                            </Text>
                                            <View style={s.invoiceRow2}>
                                                <Text style={[s.invoiceAmt, { color: isPaid ? th.txtSec : C.primary }]}>
                                                    {fmtAmt(inv.totals?.grand_total)}
                                                </Text>
                                                {!isPaid && (
                                                    <TouchableOpacity
                                                        style={[s.collectInvoiceBtn, { backgroundColor: C.primary }]}
                                                        onPress={() => openCollectModal(inv)}
                                                        activeOpacity={0.8}
                                                    >
                                                        <Text style={s.collectInvoiceBtnTxt}>Collect</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </ScrollView>
                ) : (
                    /* ─── LIST VIEW: Client Ledger Accounts ────────────── */
                    <View style={{ flex: 1 }}>
                        {/* Search bar */}
                        <View style={[s.searchSection, { backgroundColor: th.card, borderBottomColor: th.border }]}>
                            <Text style={[s.searchLabel, { color: th.txt }]}>
                                Select Client Account
                            </Text>
                            <Text style={[s.searchHint, { color: th.txtSec }]}>
                                Choose from your Account Ledger (Sundry Debtors)
                            </Text>
                            <View style={[s.searchBox, { backgroundColor: th.inputBg, borderColor: th.border }]}>
                                <Ionicons name="search" size={18} color={th.txtSec} />
                                <TextInput
                                    style={[s.searchInput, { color: th.txt }]}
                                    placeholder="Search client name…"
                                    placeholderTextColor={th.txtSec}
                                    value={search}
                                    onChangeText={setSearch}
                                />
                                {search.length > 0 && (
                                    <TouchableOpacity onPress={() => setSearch("")}>
                                        <Ionicons name="close-circle" size={18} color={th.txtSec} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        {/* Ledger List */}
                        <FlatList
                            data={filteredLedgers}
                            keyExtractor={(item) => item._id}
                            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                            refreshControl={
                                <RefreshControl
                                    refreshing={refreshing}
                                    onRefresh={() => fetchMaster(true)}
                                    tintColor={C.primary}
                                />
                            }
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[s.ledgerCard, { backgroundColor: th.card, borderColor: th.border }]}
                                    onPress={() => handleSelectLedger(item)}
                                    activeOpacity={0.75}
                                >
                                    {/* Avatar */}
                                    <View style={[s.miniAvatar, { backgroundColor: C.primary + "20" }]}>
                                        <Text style={[s.miniAvatarTxt, { color: C.primary }]}>
                                            {item.ledgerName.charAt(0).toUpperCase()}
                                        </Text>
                                    </View>

                                    {/* Info */}
                                    <View style={{ flex: 1 }}>
                                        <Text style={[s.ledgerName, { color: th.txt }]} numberOfLines={1}>
                                            {item.ledgerName}
                                        </Text>
                                        <Text style={[s.ledgerGroup, { color: th.txtSec }]}>
                                            Sundry Debtors
                                            {item.leadIds?.length
                                                ? ` · ${item.leadIds.length} lead${item.leadIds.length > 1 ? "s" : ""} linked`
                                                : ""}
                                        </Text>
                                    </View>

                                    {/* Balance chip */}
                                    {item.currentBalance !== undefined && (
                                        <View
                                            style={[
                                                s.balChip,
                                                {
                                                    backgroundColor:
                                                        (item.currentBalance ?? 0) > 0
                                                            ? C.primary + "18"
                                                            : C.danger + "18",
                                                },
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    s.balChipTxt,
                                                    {
                                                        color:
                                                            (item.currentBalance ?? 0) > 0
                                                                ? C.primary
                                                                : C.danger,
                                                    },
                                                ]}
                                            >
                                                {fmtAmt(item.currentBalance)}
                                            </Text>
                                        </View>
                                    )}

                                    <Ionicons name="chevron-forward" size={20} color={th.txtSec} style={{ marginLeft: 8 }} />
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                <View style={s.miniCenter}>
                                    <Ionicons name="people-outline" size={60} color={th.border} />
                                    <Text style={[s.emptyTxt, { color: th.txtSec, marginTop: 12 }]}>
                                        {search
                                            ? `No ledger accounts match "${search}"`
                                            : "No Sundry Debtor ledger accounts found.\nCreate ledger accounts in Ledger Master first."}
                                    </Text>
                                </View>
                            }
                        />
                    </View>
                )}
            </View>

            {/* ════════════════════════════════════════════
                COLLECTION MODAL
            ════════════════════════════════════════════ */}
            <Modal
                visible={collectModalVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setCollectModalVisible(false)}
            >
                <SafeAreaView style={[s.modalRoot, { backgroundColor: th.bg }]}>
                    {/* Header */}
                    <View style={[s.modalHeader, { borderBottomColor: th.border }]}>
                        <TouchableOpacity onPress={() => setCollectModalVisible(false)} style={s.closeMdBtn}>
                            <Ionicons name="close" size={24} color={th.txt} />
                        </TouchableOpacity>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={[s.modalTitle, { color: th.txt }]}>Record Collection</Text>
                            <Text style={[s.modalSub, { color: th.txtSec }]} numberOfLines={1}>
                                {selectedInvoice
                                    ? `Invoice ${selectedInvoice.invoice_number}`
                                    : selectedLedger?.ledgerName}
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={[s.saveBtn, saving && { opacity: 0.5 }]}
                            onPress={handleCollect}
                            disabled={saving}
                            activeOpacity={0.8}
                        >
                            {saving ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={s.saveBtnTxt}>Save</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <KeyboardAvoidingView
                        style={{ flex: 1 }}
                        behavior={Platform.OS === "ios" ? "padding" : undefined}
                        keyboardVerticalOffset={80}
                    >
                        <ScrollView
                            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* Client info box */}
                            <View style={[s.infoBox, { backgroundColor: C.primary + "12", borderColor: C.primary + "40" }]}>
                                <View style={s.infoBoxRow}>
                                    <Ionicons name="person-circle-outline" size={20} color={C.primary} />
                                    <Text style={[s.infoBoxTitle, { color: C.primary }]}>
                                        {selectedLedger?.ledgerName}
                                    </Text>
                                </View>
                                {selectedInvoice && (
                                    <View style={[s.infoBoxRow, { marginTop: 6 }]}>
                                        <Ionicons name="document-text-outline" size={16} color={C.primary} />
                                        <Text style={[s.infoBoxSub, { color: C.primary }]}>
                                            Invoice: {selectedInvoice.invoice_number} •{" "}
                                            {fmtAmt(selectedInvoice.totals?.grand_total)}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            {/* Amount */}
                            <FormSection title="Amount Received">
                                <View style={[s.amtInputWrap, { backgroundColor: th.inputBg, borderColor: th.border }]}>
                                    <Text style={[s.currencySymbol, { color: C.primary }]}>₹</Text>
                                    <TextInput
                                        style={[s.amtInput, { color: th.txt }]}
                                        placeholder="0.00"
                                        placeholderTextColor={th.txtSec}
                                        keyboardType="numeric"
                                        value={amount}
                                        onChangeText={setAmount}
                                    />
                                </View>
                            </FormSection>

                            {/* Project/Lead Selection dropdown for multi-project client ledgers */}
                            {selectedLedger && selectedLedger.leadIds && selectedLedger.leadIds.length > 1 && (
                                <FormSection title="Attribute to Project / Lead">
                                    <View style={{
                                        borderWidth: 1,
                                        borderColor: th.border,
                                        borderRadius: 8,
                                        backgroundColor: th.inputBg,
                                        paddingHorizontal: 8,
                                        marginBottom: 12
                                    }}>
                                        <Picker
                                            selectedValue={selectedLeadId}
                                            onValueChange={(val) => setSelectedLeadId(val)}
                                            style={{ color: th.txt }}
                                        >
                                            {matchingLeads.map(l => (
                                                <Picker.Item 
                                                    key={l._id} 
                                                    label={`${l.sender_name || 'Project'} (Lead #${l.lead_no})`} 
                                                    value={l._id} 
                                                    color={th.isDark ? "#FFF" : "#000"} 
                                                />
                                            ))}
                                            {matchingLeads.length === 0 && selectedLedger.leadIds.map(id => (
                                                <Picker.Item 
                                                    key={id} 
                                                    label={`Lead ID: ${id.substring(id.length - 6)}`} 
                                                    value={id} 
                                                    color={th.isDark ? "#FFF" : "#000"} 
                                                />
                                            ))}
                                        </Picker>
                                    </View>
                                </FormSection>
                            )}

                            {/* Payment Mode */}
                            <FormSection title="Payment Mode">
                                <View style={s.modeRow}>
                                    {PAY_MODES.map((mode) => (
                                        <TouchableOpacity
                                            key={mode}
                                            style={[
                                                s.modeChip,
                                                {
                                                    backgroundColor:
                                                        payMode === mode ? C.primary : th.inputBg,
                                                    borderColor:
                                                        payMode === mode ? C.primary : th.border,
                                                },
                                            ]}
                                            onPress={() => setPayMode(mode)}
                                        >
                                            <Text
                                                style={[
                                                    s.modeChipTxt,
                                                    { color: payMode === mode ? "#fff" : th.txt },
                                                ]}
                                            >
                                                {mode}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </FormSection>

                            {/* Cheque Number (if Cheque selected) */}
                            {payMode === "Cheque" && (
                                <FormSection title="Cheque Details">
                                    <LabeledInput
                                        label="Cheque Number"
                                        value={chequeNo}
                                        onChangeText={setChequeNo}
                                        placeholder="e.g. 123456"
                                        keyboardType="numeric"
                                        th={th}
                                    />
                                </FormSection>
                            )}

                            {/* UTR Ref (if NEFT/UPI) */}
                            {(payMode === "NEFT/RTGS" || payMode === "UPI") && (
                                <FormSection title="Reference Details">
                                    <LabeledInput
                                        label="UTR / Transaction Ref"
                                        value={utrRef}
                                        onChangeText={setUtrRef}
                                        placeholder="e.g. NEFTXXXXXX"
                                        th={th}
                                    />
                                </FormSection>
                            )}

                            {/* Narration */}
                            <FormSection title="Narration">
                                <LabeledInput
                                    label="Description / Notes"
                                    value={narration}
                                    onChangeText={setNarration}
                                    placeholder="e.g. Payment received against invoice…"
                                    multiline
                                    th={th}
                                />
                            </FormSection>

                            {/* Summary preview */}
                            <View style={[s.summaryBox, { backgroundColor: th.card, borderColor: th.border }]}>
                                <SummaryRow
                                    label="From Account (Cr)"
                                    value={selectedLedger?.ledgerName ?? "—"}
                                    th={th}
                                />
                                <SummaryRow
                                    label="To Account (Dr)"
                                    value={
                                        payMode === "Cash"
                                            ? "Cash-in-Hand (My Petty Cash)"
                                            : "Main Bank Account"
                                    }
                                    th={th}
                                />
                                <SummaryRow
                                    label="Voucher Type"
                                    value="Receipt"
                                    th={th}
                                    valueColor={C.success}
                                />
                                <View style={[s.summaryDivider, { borderTopColor: th.border }]} />
                                <SummaryRow
                                    label="Amount"
                                    value={fmtAmt(parseFloat(amount) || 0)}
                                    th={th}
                                    valueColor={C.primary}
                                    bold
                                />
                            </View>
                        </ScrollView>
                    </KeyboardAvoidingView>
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}

/* ─── Small Sub-Components ──────────────────────────────────────────────────── */
const FormSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={s.formSection}>
        <Text style={s.formSectionTitle}>{title}</Text>
        <View style={{ padding: 12 }}>{children}</View>
    </View>
);

const LabeledInput = ({
    label, value, onChangeText, placeholder, keyboardType, multiline, th,
}: {
    label: string;
    value: string;
    onChangeText: (v: string) => void;
    placeholder?: string;
    keyboardType?: any;
    multiline?: boolean;
    th: any;
}) => (
    <View style={{ marginBottom: 8 }}>
        <Text style={[s.inputLabel, { color: th.txtSec }]}>{label}</Text>
        <TextInput
            style={[
                s.textInput,
                { backgroundColor: th.inputBg, borderColor: th.border, color: th.txt },
                multiline && { height: 72, textAlignVertical: "top" },
            ]}
            placeholder={placeholder}
            placeholderTextColor={th.txtSec}
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType || "default"}
            multiline={multiline}
        />
    </View>
);

const SummaryRow = ({
    label, value, th, valueColor, bold,
}: {
    label: string;
    value: string;
    th: any;
    valueColor?: string;
    bold?: boolean;
}) => (
    <View style={s.summaryRow}>
        <Text style={[s.summaryLabel, { color: th.txtSec }]}>{label}</Text>
        <Text
            style={[
                s.summaryValue,
                { color: valueColor || th.txt },
                bold && { fontWeight: "800", fontSize: 15 },
            ]}
            numberOfLines={1}
        >
            {value}
        </Text>
    </View>
);

/* ─── Styles ────────────────────────────────────────────────────────────────── */
const s = StyleSheet.create({
    root: { flex: 1 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
    miniCenter: { alignItems: "center", padding: 32 },
    loadingTxt: { marginTop: 10, fontSize: 13 },

    /* Search section */
    searchSection: {
        padding: 16,
        borderBottomWidth: 1,
    },
    searchLabel: { fontSize: 16, fontWeight: "800", marginBottom: 4 },
    searchHint: { fontSize: 12, marginBottom: 12 },
    searchBox: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 46,
        gap: 8,
    },
    searchInput: { flex: 1, fontSize: 14 },

    /* Ledger card */
    ledgerCard: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        gap: 12,
    },
    miniAvatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
        justifyContent: "center",
        alignItems: "center",
    },
    miniAvatarTxt: { fontSize: 18, fontWeight: "800" },
    ledgerName: { fontSize: 15, fontWeight: "700" },
    ledgerGroup: { fontSize: 11, marginTop: 2 },
    balChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    balChipTxt: { fontSize: 11, fontWeight: "700" },

    /* Back chip */
    backChip: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginBottom: 14,
        gap: 6,
    },
    backChipTxt: { fontSize: 13, fontWeight: "700" },

    /* Client banner */
    clientBanner: {
        borderRadius: 16,
        padding: 18,
        marginBottom: 14,
        flexDirection: "row",
        alignItems: "center",
    },
    bannerLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
    avatarCircle: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: "rgba(255,255,255,0.25)",
        justifyContent: "center",
        alignItems: "center",
    },
    avatarTxt: { fontSize: 22, fontWeight: "800", color: "#fff" },
    clientName: { fontSize: 17, fontWeight: "800", color: "#fff", flex: 1 },
    clientSub: { fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 },
    bannerRight: { alignItems: "flex-end" },
    outstandingLabel: { fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: "700", textTransform: "uppercase" },
    outstandingAmt: { fontSize: 16, fontWeight: "800", color: "#fff", marginTop: 2 },

    /* Collect button */
    collectBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        paddingVertical: 14,
        marginBottom: 18,
        gap: 10,
    },
    collectBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },

    /* Section title */
    sectionTitle: { fontSize: 14, fontWeight: "800", marginBottom: 12 },

    /* Empty box */
    emptyBox: {
        alignItems: "center",
        padding: 28,
        borderRadius: 14,
        borderWidth: 1,
        borderStyle: "dashed",
    },
    emptyTxt: { fontSize: 13, textAlign: "center", marginTop: 10, fontWeight: "600" },
    emptyHint: { fontSize: 11, textAlign: "center", marginTop: 6 },

    /* Invoice card */
    invoiceCard: {
        flexDirection: "row",
        borderWidth: 1,
        borderRadius: 14,
        marginBottom: 10,
        overflow: "hidden",
    },
    invoiceAccent: { width: 4, minHeight: 60 },
    invoiceRow1: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
    invoiceNo: { fontSize: 14, fontWeight: "800" },
    invoiceDate: { fontSize: 11, marginBottom: 8 },
    invoiceRow2: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    invoiceAmt: { fontSize: 15, fontWeight: "800" },
    statusPill: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
    statusTxt: { fontSize: 10, fontWeight: "700" },
    collectInvoiceBtn: {
        paddingHorizontal: 16,
        paddingVertical: 7,
        borderRadius: 8,
    },
    collectInvoiceBtnTxt: { color: "#fff", fontSize: 12, fontWeight: "700" },

    /* Modal */
    modalRoot: { flex: 1 },
    modalHeader: {
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        borderBottomWidth: 1,
    },
    closeMdBtn: { padding: 4 },
    modalTitle: { fontSize: 16, fontWeight: "800" },
    modalSub: { fontSize: 12, marginTop: 1 },
    saveBtn: {
        backgroundColor: C.primary,
        borderRadius: 10,
        paddingHorizontal: 18,
        paddingVertical: 9,
        minWidth: 60,
        alignItems: "center",
    },
    saveBtnTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },

    /* Form */
    formSection: {
        backgroundColor: "transparent",
        borderRadius: 12,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: "#e2e8f0",
        overflow: "hidden",
    },
    formSectionTitle: {
        fontSize: 11,
        fontWeight: "700",
        color: "#64748b",
        textTransform: "uppercase",
        letterSpacing: 0.8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: "#f8fafc",
        borderBottomWidth: 1,
        borderBottomColor: "#e2e8f0",
    },
    inputLabel: { fontSize: 11, fontWeight: "600", marginBottom: 6, textTransform: "uppercase" },
    textInput: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
    },

    /* Amount input */
    amtInputWrap: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1.5,
        borderRadius: 12,
        paddingHorizontal: 14,
        height: 58,
    },
    currencySymbol: { fontSize: 22, fontWeight: "800", marginRight: 6 },
    amtInput: { flex: 1, fontSize: 26, fontWeight: "800" },

    /* Mode chips */
    modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    modeChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1.5,
    },
    modeChipTxt: { fontSize: 13, fontWeight: "600" },

    /* Info box */
    infoBox: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
        marginBottom: 14,
    },
    infoBoxRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    infoBoxTitle: { fontSize: 15, fontWeight: "800", flex: 1 },
    infoBoxSub: { fontSize: 12, fontWeight: "600" },

    /* Summary */
    summaryBox: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 8 },
    summaryRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 5,
    },
    summaryLabel: { fontSize: 12, fontWeight: "600" },
    summaryValue: { fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" },
    summaryDivider: { borderTopWidth: 1, marginVertical: 6 },
});
