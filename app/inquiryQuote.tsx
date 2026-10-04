import { StatePicker } from "@/UtilServices/StatePicker";
import { DistrictPicker } from "@/UtilServices/DistrictPicker";
import { getStateCodeByName } from "@/UtilServices/gstConstants";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { AppHeader } from "@/components/AppHeader";

import { appService } from "@/UtilServices/appHelper";
import { useUserContext } from "@/context/AuthContext";
import { usePIPOTI } from "@/hooks/PI-PO-TI";

/* ════════════════════════════════════════════════════════
   DESIGN SYSTEM
════════════════════════════════════════════════════════ */
const COLORS = {
    pri: "#1e3a8a", // Navy Blue
    acc: "#f59e0b", // accent amber
    accl: "#EEF2FF", // light accent
    bg: "#f8fafc",  // background
    srf: "#ffffff", // surface
    txt: "#0f172a", // core text
    muted: "#64748b", // muted text
    bdr: "#e2e8f0",  // border
    green: "#10b981", // success
};

/* ════════════════════════════════════════════════════════
   TYPES
════════════════════════════════════════════════════════ */
type Lead = {
    _id: string;
    lead_no: number;
    sender_name: string;
    sender_mobile: string;
    sender_email: string;
    sender_city: string;
    sender_state: string;
    product_name: string;
    createdAt: string;
    source?: string;
    buyerInfo?: {
        contact_person?: string;
        company_name?: string;
        gst_no?: string;
        place_of_supply?: string;
        billing_address?: {
            line1?: string;
            city?: string;
            state?: string;
            pincode?: string;
            country?: string;
        };
        shipping_address?: {
            line1?: string;
            city?: string;
            state?: string;
            pincode?: string;
            contact_person?: string;
            mobile?: string;
            same_as_billing?: boolean;
        };
    };
};

type CatalogProduct = {
    _id: string;
    productName: string;
    description: string;
    hsn_sac: string;       // product-level HSN/SAC (may be blank, fallback to category)
    UoM: string;
    margin: number;        // default margin %
};

type CatalogCategory = {
    _id: string;
    categoryName: string;
    hsn_sac: string;       // category-level HSN/SAC (applies to all products)
    products: CatalogProduct[];
};

/** One line item in the quote */
type LineItem = {
    _id?: string;
    vendorId?: string;
    categoryId?: string;
    productId: string;
    description: string;
    hsn_sac: string;
    unit: string;
    quantity: string;
    buy_rate: string;    // purchase cost
    rate: string;        // selling rate (shown to buyer)
    margin_pct: string;  // applied margin %
    discount_percent: string;
    gst_rate: string;
    category_name?: string;
    product_name?: string;
    product_description?: string;
};

type SavedQuote = {
    _id: string;
    quote_number: string;
    quote_date: string;
    validity_date?: string;
    financial_year: string;
    status: string;
    revision_count?: number;
    leadId: string;
    lead_no?: number;
    payment_terms?: string;
    delivery_terms?: string;
    terms_conditions?: string;
    footer_message?: string;
    internal_notes?: string;
    items?: any[];
    totals?: {
        grand_total: number;
        taxable_amount?: number;
        total_cgst?: number;
        total_sgst?: number;
        total_igst?: number;
        total_tax?: number;
    };
    seller?: { business_name?: string };
    buyer: {
        billing_address: {
            company_name?: string;
            contact_person?: string;
            mobile?: string;
            email?: string;
            city?: string;
            state?: string;
            pincode?: string;
            gstin?: string;
            line1?: string;
        };
        shipping_address?: {
            company_name?: string;
            contact_person?: string;
            mobile?: string;
            city?: string;
            state?: string;
            pincode?: string;
            line1?: string;
        };
    };
};

/** Buyer form state */
type BuyerForm = {
    company_name: string;
    contact_person: string;
    mobile: string;
    email: string;
    city: string;
    state: string;
    pincode: string;
    gstin: string;
    pan: string;
    line1: string;
    payment_terms: string;
    delivery_terms: string;
    validity_days: string;
    terms_conditions: string;
    footer_message: string;
    shipping_address: {
        line1: string;
        city: string;
        state: string;
        pincode: string;
        contact_person: string;
        mobile: string;
    };
    internal_notes: string;
};

const EMPTY_FORM: BuyerForm = {
    company_name: "",
    contact_person: "",
    mobile: "",
    email: "",
    city: "",
    state: "",
    pincode: "",
    gstin: "",
    pan: "",
    line1: "",
    payment_terms: "Advance",
    delivery_terms: "Ex-Works",
    validity_days: "15",
    terms_conditions: "1. Warranty: 12 months.\n2. Delivery within 2 weeks of PO.\n3. Taxes as applicable.",
    footer_message: "Thank you for your business!",
    shipping_address: { line1: "", city: "", state: "", pincode: "", contact_person: "", mobile: "" },
    internal_notes: "",
};

const EMPTY_ITEM: LineItem = {
    _id: "",
    productId: "",
    description: "",
    hsn_sac: "",
    unit: "PCS",
    quantity: "1",
    buy_rate: "",
    rate: "",
    margin_pct: "15",
    discount_percent: "0",
    gst_rate: "18",
};

/* ════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════ */
function fmtDate(s?: string): string {
    if (!s) return "—";
    const d = new Date(s);
    return isNaN(d.getTime())
        ? s
        : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(n?: number): string {
    return "₹ " + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Derive selling rate from buy rate + margin % */
function sellFromBuy(buyRate: string, marginPct: string): string {
    const b = parseFloat(buyRate) || 0;
    const m = parseFloat(marginPct) || 0;
    if (!b) return "";
    return (b * (1 + m / 100)).toFixed(2);
}

function calcItem(it: LineItem, isLocal: boolean = true) {
    const qty = parseFloat(it.quantity) || 0;
    const rate = parseFloat(it.rate) || 0;
    const disc = parseFloat(it.discount_percent) || 0;
    const gstRate = parseFloat(it.gst_rate) || 0;
    const taxable = qty * rate * (1 - disc / 100);

    if (isLocal) {
        const half = gstRate / 2;
        const cgst = taxable * (half / 100);
        const sgst = taxable * (half / 100);
        return { taxable, cgst, sgst, igst: 0, gstAmt: cgst + sgst, total: taxable + cgst + sgst };
    } else {
        const igst = taxable * (gstRate / 100);
        return { taxable, cgst: 0, sgst: 0, igst, gstAmt: igst, total: taxable + igst };
    }
}


const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: COLORS.bg },
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
    loadingText: { marginTop: 10, color: COLORS.muted, fontSize: 13 },

    /* ── Header ── */
    header: {
        backgroundColor: COLORS.pri,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingTop: Platform.OS === "android" ? 14 : 10,
        paddingBottom: 12,
        gap: 8,
    },
    backBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
    backArrow: { color: "#fff", fontSize: 28, fontWeight: "300", lineHeight: 32 },
    headerCenter: { flex: 1 },
    headerTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
    headerSub: { color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 1 },
    refreshBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
    refreshIcon: { color: "#fff", fontSize: 22, fontWeight: "400" },

    /* ── Section label ── */
    sectionRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 8,
    },
    sectionTitle: { fontSize: 12, fontWeight: "700", color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.8 },
    countBadge: {
        backgroundColor: COLORS.pri,
        borderRadius: 10,
        paddingHorizontal: 7,
        paddingVertical: 1,
    },
    countBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },

    /* ── Empty / list ── */
    listContent: { padding: 14, paddingBottom: 40 },
    emptyBox: { alignItems: "center", paddingTop: 60 },
    emptyIcon: { fontSize: 48, marginBottom: 10 },
    emptyText: { color: COLORS.muted, fontSize: 14, textAlign: "center" },

    /* ── Lead card ── */
    leadCard: {
        backgroundColor: COLORS.srf,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.bdr,
        overflow: "hidden",
    },
    leadCardTop: {
        flexDirection: "row",
        alignItems: "center",
    },
    cardAccent: { width: 4, alignSelf: "stretch", backgroundColor: COLORS.pri },
    leadCardBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 12 },
    leadCardRow1: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
    leadNo: { fontSize: 12, fontWeight: "700", color: COLORS.pri, fontFamily: "monospace" },
    leadDate: { fontSize: 11, color: COLORS.muted },
    leadName: { fontSize: 15, fontWeight: "700", color: COLORS.txt, marginBottom: 2 },
    leadMeta: { fontSize: 11, color: COLORS.muted },

    cardRight: { flexDirection: "row", alignItems: "center", paddingRight: 12, gap: 6 },
    qCountBadge: {
        backgroundColor: COLORS.acc,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 5,
    },
    qCountTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
    expandChevron: { fontSize: 22, color: COLORS.bdr, fontWeight: "400" },

    /* card action row */
    cardActions: {
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: COLORS.bdr,
        backgroundColor: "#faf8f4",
    },
    newQuoteBtn: {
        flex: 1,
        backgroundColor: COLORS.pri,
        borderRadius: 8,
        paddingVertical: 9,
        alignItems: "center",
    },
    newQuoteBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },
    viewQuotesBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: COLORS.bdr,
        borderRadius: 8,
        paddingVertical: 9,
        alignItems: "center",
        backgroundColor: COLORS.srf,
    },
    viewQuotesBtnTxt: { color: COLORS.txt, fontSize: 12, fontWeight: "600" },

    /* ── Quote rows (inside expanded card) ── */
    quotesContainer: {
        borderTopWidth: 1,
        borderTopColor: COLORS.bdr,
    },
    qLoadRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14 },
    qLoadTxt: { color: COLORS.muted, fontSize: 12 },
    noQuotesTxt: { padding: 14, color: COLORS.muted, fontSize: 12, textAlign: "center" },

    quoteRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.bdr,
        gap: 8,
    },
    quoteRowLeft: { flex: 1 },
    quoteRowRight: { alignItems: "flex-end", gap: 4 },
    quoteNo: { fontSize: 13, fontWeight: "700", color: COLORS.txt, fontFamily: "monospace", marginBottom: 2 },
    quoteBuyer: { fontSize: 12, color: COLORS.muted, marginBottom: 2 },
    quoteMeta: { fontSize: 10, color: COLORS.muted },
    quoteAmount: { fontSize: 13, fontWeight: "700", color: COLORS.pri },
    statusPill: {
        borderWidth: 1,
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    statusPillTxt: { fontSize: 10, fontWeight: "700" },
    editQuoteBtn: {
        backgroundColor: COLORS.acc,
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        marginTop: 2,
    },
    editQuoteTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },

    /* ── Form Sheet ── */
    sheetRoot: { flex: 1, backgroundColor: COLORS.bg },
    sheetHeader: {
        backgroundColor: COLORS.pri,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 13,
        gap: 8,
    },
    closeBtn: { width: 32, height: 32, justifyContent: "center", alignItems: "center" },
    closeBtnTxt: { color: "#fff", fontSize: 18, fontWeight: "400" },
    sheetHeaderCenter: { flex: 1 },
    sheetTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
    sheetSubtitle: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 1 },
    saveBtn: {
        backgroundColor: COLORS.acc,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        minWidth: 60,
        alignItems: "center",
    },
    saveBtnTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },

    /* form body */
    formContent: { padding: 14, paddingBottom: 40, gap: 0 },
    formSection: {
        backgroundColor: COLORS.srf,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: COLORS.bdr,
        marginBottom: 14,
        overflow: "hidden",
    },
    formSectionTitle: {
        fontSize: 11,
        fontWeight: "700",
        color: COLORS.muted,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: "#faf8f4",
        borderBottomWidth: 1,
        borderBottomColor: COLORS.bdr,
    },
    formRow: { flexDirection: "row", gap: 0 },
    inputWrap: { padding: 12, paddingBottom: 10 },
    inputLabel: { fontSize: 11, color: COLORS.muted, fontWeight: "600", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.3 },
    input: {
        backgroundColor: COLORS.bg,
        borderWidth: 1,
        borderColor: COLORS.bdr,
        borderRadius: 7,
        paddingHorizontal: 10,
        paddingVertical: 9,
        fontSize: 14,
        color: COLORS.txt,
    },
    inputMulti: { height: 80, textAlignVertical: "top" },

    /* ── Items section header cols ── */
    itemColHeader: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: "#faf8f4",
        borderBottomWidth: 1,
        borderBottomColor: COLORS.bdr,
    },
    itemColHdrTxt: { fontSize: 10, fontWeight: "700", color: COLORS.muted, textTransform: "uppercase" },

    itemActionsRow: {
        flexDirection: "row",
        gap: 8,
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: COLORS.bdr,
    },
    addItemBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: COLORS.pri,
        borderRadius: 7,
        paddingVertical: 8,
        alignItems: "center",
    },
    addItemBtnTxt: { color: COLORS.pri, fontSize: 13, fontWeight: "700" },
    catalogBtn: {
        flex: 1.6,
        backgroundColor: COLORS.pri,
        borderRadius: 7,
        paddingVertical: 8,
        alignItems: "center",
    },
    catalogBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },

    /* ── Totals preview ── */
    totalsPreview: {
        backgroundColor: COLORS.srf,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: COLORS.bdr,
        marginBottom: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 6,
    },
    totalsRow: { flexDirection: "row", justifyContent: "space-between" },
    totalsLabel: { fontSize: 13, color: COLORS.muted },
    totalsValue: { fontSize: 13, color: COLORS.txt, fontWeight: "600" },
    grandRow: { borderTopWidth: 1, borderTopColor: COLORS.bdr, paddingTop: 8, marginTop: 4 },
    grandLabel: { fontSize: 15, fontWeight: "700", color: COLORS.pri },
    grandValue: { fontSize: 15, fontWeight: "700", color: COLORS.pri },

    /* ── Quote Item Row (qir) ── */
    qirWrap: {
        borderBottomWidth: 1,
        borderBottomColor: COLORS.bdr,
        paddingHorizontal: 10,
        paddingVertical: 10,
    },
    qirTopRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
    qirNum: { fontSize: 11, fontWeight: "700", color: COLORS.muted, minWidth: 18 },
    qirDescInput: {
        backgroundColor: COLORS.bg,
        borderWidth: 1,
        borderColor: COLORS.bdr,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 6,
        fontSize: 13,
        color: COLORS.txt,
    },
    qirRemoveBtn: { padding: 4 },
    qirRemoveTxt: { color: "#c0392b", fontSize: 14, fontWeight: "700" },
    qirRateRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
    qirCell: { flex: 1 },
    qirCellLabel: { fontSize: 9, fontWeight: "700", color: COLORS.muted, textTransform: "uppercase", marginBottom: 3 },
    qirInput: {
        backgroundColor: COLORS.bg,
        borderWidth: 1,
        borderColor: COLORS.bdr,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 5,
        fontSize: 12,
        color: COLORS.txt,
        textAlign: "right",
    },
    qirTotal: { fontSize: 12, fontWeight: "700", color: COLORS.pri, textAlign: "right" },
    qirSummaryRow: { flexDirection: "row", gap: 12, paddingTop: 4 },
    qirSummaryTxt: { fontSize: 10, color: COLORS.muted },

    /* ── Product Picker Modal ── */
    pickerRoot: { flex: 1, backgroundColor: COLORS.bg },
    pickerHeader: {
        backgroundColor: COLORS.pri,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 13,
        gap: 8,
    },
    pickerTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
    pickerStepSub: { color: "rgba(255,255,255,0.65)", fontSize: 11, marginTop: 1 },
    addSelBtn: {
        backgroundColor: COLORS.acc,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 7,
        alignItems: "center",
    },
    addSelBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },

    pickerCatBlock: {
        marginHorizontal: 12,
        marginTop: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: COLORS.bdr,
        overflow: "hidden",
        backgroundColor: COLORS.srf,
    },
    pickerCatRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: "#f2efe9",
        gap: 8,
    },
    pickerCatName: { flex: 1, fontSize: 14, fontWeight: "700", color: COLORS.pri },
    pickerCatCount: { fontSize: 11, color: COLORS.muted },

    pickerProdRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: COLORS.bdr,
        gap: 10,
    },
    pickerProdSel: { backgroundColor: COLORS.accl + "55" },
    pickerProdName: { fontSize: 13, fontWeight: "700", color: COLORS.txt, marginBottom: 2 },
    pickerProdDesc: { fontSize: 11, color: COLORS.muted, marginBottom: 2 },
    pickerProdUom: { fontSize: 10, color: COLORS.muted },

    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: COLORS.bdr,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.srf,
        marginTop: 2,
    },
    checkboxChecked: { backgroundColor: COLORS.pri, borderColor: COLORS.pri },
    checkmark: { color: "#fff", fontSize: 13, fontWeight: "700" },

    pickerRateRow: {
        flexDirection: "row",
        gap: 8,
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: COLORS.bdr,
    },
    pickerRateCell: { flex: 1 },
    pickerRateLabel: { fontSize: 9, fontWeight: "700", color: COLORS.muted, textTransform: "uppercase", marginBottom: 3 },
    pickerRateInput: {
        backgroundColor: COLORS.bg,
        borderWidth: 1,
        borderColor: COLORS.bdr,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 5,
        fontSize: 12,
        color: COLORS.txt,
        textAlign: "right",
    },

    /* ── Wizard (3-step picker) ── */
    stepBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 8,
        backgroundColor: COLORS.pri,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.15)",
    },
    stepDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "rgba(255,255,255,0.3)",
    },
    stepDotActive: { backgroundColor: COLORS.acc },

    wizardRow: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: COLORS.srf,
        marginHorizontal: 12,
        marginTop: 10,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: COLORS.bdr,
        gap: 8,
    },
    wizardRowLeft: { flex: 1 },
    wizardRowTitle: { fontSize: 15, fontWeight: "700", color: COLORS.txt, marginBottom: 2 },
    wizardRowSub: { fontSize: 12, color: COLORS.muted },
    wizardChevron: { fontSize: 22, color: COLORS.bdr, fontWeight: "400" },
    wizardHint: { fontSize: 12, color: COLORS.muted, marginTop: 8, textAlign: "center", paddingHorizontal: 24 },

    /* vendor price badge on step-3 product rows */
    vendorPriceBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 2 },
    vendorPriceBadge: {
        backgroundColor: COLORS.pri + "18",
        borderRadius: 4,
        paddingHorizontal: 7,
        paddingVertical: 2,
    },
    vendorPriceBadgeTxt: { fontSize: 11, fontWeight: "600", color: COLORS.pri },
    hsnBadge: {
        backgroundColor: COLORS.acc + "22",
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    hsnBadgeTxt: { fontSize: 10, fontWeight: "600", color: COLORS.acc },

    /* ── Quote Row buttons ── */
    quoteRowBtns: { flexDirection: "row", gap: 6, marginTop: 4 },
    previewQuoteBtn: {
        backgroundColor: COLORS.pri + "18",
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 5,
    },
    previewQuoteTxt: { color: COLORS.pri, fontSize: 11, fontWeight: "700" },

    /* ── Quote Preview Modal ── */
    previewRoot: { flex: 1, backgroundColor: COLORS.bg },
    previewHeader: {
        backgroundColor: COLORS.pri,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 13,
        gap: 10,
    },
    previewTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
    previewSub: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 1 },
    previewContent: { padding: 14, paddingBottom: 40, gap: 12 },
    previewSection: {
        backgroundColor: COLORS.srf,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: COLORS.bdr,
        padding: 14,
    },
    previewSectionTitle: {
        fontSize: 10,
        fontWeight: "700",
        color: COLORS.muted,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginBottom: 8,
    },
    previewCompany: { fontSize: 16, fontWeight: "700", color: COLORS.txt, marginBottom: 3 },
    previewSmall: { fontSize: 12, color: COLORS.muted, marginBottom: 2 },
    previewRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
    previewLabel: { fontSize: 13, color: COLORS.muted },
    previewValue: { fontSize: 13, fontWeight: "600", color: COLORS.txt },
    previewItemRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: COLORS.bdr,
        gap: 8,
    },
    previewItemRight: { alignItems: "flex-end", minWidth: 90 },
    previewItemName: { fontSize: 13, fontWeight: "600", color: COLORS.txt, marginBottom: 2 },
    previewItemQty: { fontSize: 11, color: COLORS.muted },
    previewItemRate: { fontSize: 11, color: COLORS.muted },
    previewItemTotal: { fontSize: 13, fontWeight: "700", color: COLORS.pri, marginTop: 2 },
    previewTotals: {
        backgroundColor: COLORS.srf,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: COLORS.bdr,
        padding: 14,
    },
    previewActions: {
        backgroundColor: COLORS.srf,
        borderTopWidth: 1,
        borderTopColor: COLORS.bdr,
        padding: 14,
        gap: 10,
        paddingBottom: Platform.OS === "ios" ? 24 : 14,
    },
    previewActionRow: {
        flexDirection: "row",
        gap: 8,
        justifyContent: "center",
    },
    previewActionBtn: {
        flex: 1,
        backgroundColor: COLORS.bg,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: COLORS.bdr,
        paddingVertical: 12,
        alignItems: "center",
        gap: 4,
    },
    previewActionIcon: { fontSize: 22 },
    previewActionTxt: { fontSize: 11, fontWeight: "700", color: COLORS.txt },
    markSentBtn: {
        backgroundColor: COLORS.green,
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: "center",
    },
    markSentTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
});

function calcTotals(items: LineItem[], isLocal: boolean = true) {
    let taxable = 0, cgst = 0, sgst = 0, igst = 0, grand = 0;
    items.forEach(it => {
        const c = calcItem(it, isLocal);
        taxable += c.taxable;
        cgst += c.cgst;
        sgst += c.sgst;
        igst += c.igst;
        grand += c.total;
    });
    return { taxable, cgst, sgst, igst, gstTotal: cgst + sgst + igst, grand };
}

const STATUS_COLOR: Record<string, string> = {
    Draft: "#6b6560",
    Revised: "#b45e00",
    Sent: "#1a6b3c",
    Accepted: "#1b5e20",
    Rejected: "#b71c1c",
    Expired: "#e65100",
    Converted: "#1a3c6b",
};

/** Statuses that are considered "active / sent" and trigger Revised on re-edit */
const SENT_STATUSES = new Set(["Sent", "Accepted", "Revised"]);

/* ════════════════════════════════════════════════════════
   COMPONENT
════════════════════════════════════════════════════════ */
export default function InquiryQuote() {
    const router = useRouter();
    const { user } = useUserContext();
    const token = user?.token ?? "";

    const piHook = usePIPOTI(token);
    const { seller, loading: sellerLoading, locations, selectedLocation, selectLocation } = piHook;

    /* ── state ─────────────────────────────────────────── */
    const [leads, setLeads] = useState<Lead[]>([]);
    const [leadsLoading, setLeadsLoading] = useState(false);

    // quotes per lead: leadId → SavedQuote[]
    const [quotesMap, setQuotesMap] = useState<Record<string, SavedQuote[]>>({});
    const [quotesLoading, setQuotesLoading] = useState<Record<string, boolean>>({});

    // buyer form sheet
    const [formVisible, setFormVisible] = useState(false);
    const [formLead, setFormLead] = useState<Lead | null>(null);
    const [editQuote, setEditQuote] = useState<SavedQuote | null>(null); // null = new
    const [form, setForm] = useState<BuyerForm>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    // items for the quote
    const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);

    // product catalogue
    const [catalogCategories, setCatalogCategories] = useState<CatalogCategory[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [pickerVisible, setPickerVisible] = useState(false);

    const [previewQuote, setPreviewQuote] = useState<SavedQuote | null>(null);
    const [sendingStatus, setSendingStatus] = useState<any>(null);

    const [statePickerVisible, setStatePickerVisible] = useState(false);
    const [districtPickerVisible, setDistrictPickerVisible] = useState(false);
    const [shipStatePickerVisible, setShipStatePickerVisible] = useState(false);
    const [shipDistrictPickerVisible, setShipDistrictPickerVisible] = useState(false);

    // full vendor list for hydration
    const [allVendors, setAllVendors] = useState<any[]>([]);

    const fetchAllVendors = useCallback(() => {
        if (!token) return;
        appService.httpClient
            .get("/service/parties/suppliers", { headers: { Authorization: `Bearer ${token}` } })
            .then(res => {
                const data = res.data?.success ? res.data.data : (res.data?.vendors || res.data || []);
                setAllVendors(Array.isArray(data) ? data : []);
            })
            .catch(() => { });
    }, [token]);


    /** Hydrate items using compositeId from _id or description */
    const hydrateItems = useCallback((rawItems: any[]) => {
        return rawItems.map(it => {
            const id = (it._id && it._id.includes(".")) ? it._id :
                (it.productId && String(it.productId).includes(".")) ? it.productId :
                    (it.vendorId && it.categoryId && it.productId && !String(it.vendorId).includes("."))
                        ? `${it.vendorId}.${it.categoryId}.${it.productId}`
                        : (it.description || "");

            if (!id || typeof id !== 'string' || !id.includes(".")) return it;
            const [vId, cId, pId] = id.split(".");

            const vendor = allVendors.find(v => v._id == vId);
            if (!vendor) return { ...it, vendorId: vId, categoryId: cId, productId: pId };

            const catCost = (vendor.productCost ?? []).find((c: any) => c.categoryId == cId);
            if (!catCost) return { ...it, vendorId: vId, categoryId: cId, productId: pId };

            const vProd = (catCost.products ?? []).find((p: any) => p.productId == pId);
            if (!vProd) return { ...it, vendorId: vId, categoryId: cId, productId: pId };

            const buyRate = String(vProd.price || it.buy_rate || "");
            const margin = it.margin_pct || "15";

            return {
                ...it,
                vendorId: vId,
                categoryId: cId,
                productId: pId,
                category_name: catCost.categoryName || it.category_name,
                product_name: vProd.productName || it.product_name,
                product_description: vProd.description || it.product_description,
                buy_rate: buyRate,
                unit: vProd.UoM || it.unit,
                hsn_sac: vProd.hsn_sac || catCost.hsn_sac || it.hsn_sac,
                description: it.description || (vProd.productName ? `${vProd.productName}${vProd.description ? ` (${vProd.description})` : ""}` : ""),
                // Automatically populate rate if zero or empty
                rate: (it.rate && parseFloat(it.rate) > 0) ? it.rate : (it.sell_rate ? String(it.sell_rate) : sellFromBuy(buyRate, margin)),
            };
        });
    }, [allVendors]);

    useEffect(() => {
        fetchAllVendors();
    }, [fetchAllVendors]);

    /** Re-hydrate items when vendor catalogue loads */
    useEffect(() => {
        if (allVendors.length > 0) {
            setItems(prev => hydrateItems(prev));
            if (previewQuote) {
                setPreviewQuote(prev => prev ? { ...prev, items: hydrateItems(prev.items || []) } : null);
            }
        }
    }, [allVendors, hydrateItems]);

    /* ── fetch quotes for one lead ──────────────────────── */
    const fetchQuotesForLead = useCallback((leadId: string) => {
        if (!token) return;
        setQuotesLoading(prev => ({ ...prev, [leadId]: true }));
        
        const restrictedLocId = user?.locationId;
        const params: any = { leadId };
        if (user?.userRole !== "CorpAdmin" && restrictedLocId) {
            params.locationId = restrictedLocId;
        }

        appService.httpClient
            .get("finance/quotations", {
                headers: { Authorization: `Bearer ${token}` },
                params,
            })
            .then(res => {
                const data: SavedQuote[] = res.data?.data ?? res.data ?? [];
                setQuotesMap(prev => ({ ...prev, [leadId]: Array.isArray(data) ? data : [] }));
            })
            .catch(() => setQuotesMap(prev => ({ ...prev, [leadId]: [] })))
            .finally(() => setQuotesLoading(prev => ({ ...prev, [leadId]: false })));
    }, [token]);

    /* ── fetch Engaged leads ────────────────────────────── */
    const fetchLeads = useCallback(() => {
        if (!token) return;
        setLeadsLoading(true);
        appService.httpClient
            .get("service/leads/status/Engaged", {
                headers: { Authorization: `Bearer ${token}` },
            })
            .then(res => {
                const data: Lead[] = res.data?.success ? res.data.data : [];
                data.sort((a, b) => (b.lead_no ?? 0) - (a.lead_no ?? 0));
                setLeads(data);
                // Refresh quote counts for each lead on load
                data.forEach(l => fetchQuotesForLead(l._id));
            })
            .catch(() => appService.showToast("Could not load leads", "Error"))
            .finally(() => setLeadsLoading(false));
    }, [token, fetchQuotesForLead]);

    /* ── fetch product catalogue ────────────────────── */
    const fetchCatalog = useCallback(() => {
        if (catalogCategories.length > 0 || catalogLoading) return;
        setCatalogLoading(true);
        appService.httpClient
            .get("product/category", { headers: { Authorization: `Bearer ${token}` } })
            .then(res => setCatalogCategories(Array.isArray(res.data) ? res.data : []))
            .catch(() => appService.showToast("Could not load product catalogue", "Error"))
            .finally(() => setCatalogLoading(false));
    }, [token, catalogCategories.length, catalogLoading]);

    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);

    /* ── open "New Quote" form pre-filled from lead ─────── */
    const openNewQuote = useCallback((lead: Lead) => {
        setFormLead(lead);
        setEditQuote(null);

        // ALWAYS open with exactly zero items as requested
        setItems([]);

        const bi = lead.buyerInfo || {};
        const baddr = bi.billing_address || {};
        const saddr = bi.shipping_address || {};

        setForm({
            ...EMPTY_FORM,
            company_name: bi.company_name || lead.sender_name || "",
            contact_person: bi.contact_person || "",
            mobile: lead.sender_mobile || "",
            email: lead.sender_email || "",
            city: baddr.city || lead.sender_city || "",
            state: bi.place_of_supply || baddr.state || lead.sender_state || "",
            pincode: baddr.pincode || "",
            gstin: bi.gst_no || "",
            line1: baddr.line1 || "",
            terms_conditions: seller?.Quotation_TC || EMPTY_FORM.terms_conditions,
            footer_message: seller?.TaxInvoiceTC || EMPTY_FORM.footer_message,
            shipping_address: {
                line1: saddr.line1 || baddr.line1 || "",
                city: saddr.city || baddr.city || "",
                state: saddr.state || baddr.state || "",
                pincode: saddr.pincode || baddr.pincode || "",
                contact_person: saddr.contact_person || bi.contact_person || "",
                mobile: saddr.mobile || lead.sender_mobile || "",
            }
        });
        setFormVisible(true);
        fetchQuotesForLead(lead._id);
        fetchCatalog();
    }, [fetchQuotesForLead, fetchCatalog, seller]);

    /* ── open "Edit Quote" form ─────────────────────────── */
    const openEditQuote = useCallback((lead: Lead, quote: SavedQuote) => {
        setFormLead(lead);
        setEditQuote(quote);

        // Priority 1: Lead's current buyerInfo (Source of Truth)
        // Priority 2: Stored quote buyer info
        // Priority 3: Original lead sender fields
        const bi = lead.buyerInfo || {};
        const qb = (quote.buyer as any)?.billing_address || {};
        const qs = (quote.buyer as any)?.shipping_address || {};
        const baddr = bi.billing_address || {};
        const saddr = bi.shipping_address || {};

        setForm({
            ...EMPTY_FORM,
            company_name: bi.company_name || qb.company_name || lead.sender_name || "",
            contact_person: bi.contact_person || qb.contact_person || "",
            mobile: qb.mobile || lead.sender_mobile || "",
            email: qb.email || lead.sender_email || "",
            city: baddr.city || qb.city || lead.sender_city || "",
            state: bi.place_of_supply || baddr.state || qb.state || lead.sender_state || "",
            pincode: baddr.pincode || qb.pincode || "",
            gstin: bi.gst_no || qb.gstin || "",
            line1: baddr.line1 || qb.line1 || "",
            payment_terms: quote.payment_terms || EMPTY_FORM.payment_terms,
            delivery_terms: quote.delivery_terms || EMPTY_FORM.delivery_terms,
            validity_days: "7",
            terms_conditions: quote.terms_conditions ?? seller?.Quotation_TC ?? EMPTY_FORM.terms_conditions,
            footer_message: quote.footer_message ?? seller?.TaxInvoiceTC ?? EMPTY_FORM.footer_message,
            internal_notes: quote.internal_notes || "",
            shipping_address: {
                line1: saddr.line1 || qs.line1 || baddr.line1 || qb.line1 || "",
                city: saddr.city || qs.city || baddr.city || qb.city || "",
                state: saddr.state || qs.state || baddr.state || qb.state || "",
                pincode: saddr.pincode || qs.pincode || baddr.pincode || qb.pincode || "",
                contact_person: saddr.contact_person || qs.contact_person || bi.contact_person || qb.contact_person || "",
                mobile: saddr.mobile || qs.mobile || lead.sender_mobile || qb.mobile || "",
            },
        });

        // restore saved items back into form shape
        const savedItems: LineItem[] = ((quote as any).items ?? []).map((it: any) => {
            const pName = it.product_name || "";
            const pDesc = it.product_description || "";
            // If description is generic/empty, use the format showing in PDF: Name (Desc)
            const fallbackDesc = pName ? `${pName}${pDesc ? ` (${pDesc})` : ""}` : (it.description || "");

            return {
                _id: it._id || "",
                vendorId: it.vendorId || "",
                categoryId: it.categoryId || "",
                productId: it.productId ?? "",
                description: it.description || fallbackDesc,
                hsn_sac: it.hsn_sac ?? "",
                unit: it.unit ?? "PCS",
                quantity: String(it.quantity ?? 1),
                buy_rate: String(it.buy_rate ?? ""),
                rate: String(it.rate ?? it.sell_rate ?? (it.quantity ? it.total_amount / it.quantity : "")),
                margin_pct: String(it.margin_pct ?? 15),
                discount_percent: String(it.discount_percent ?? 0),
                gst_rate: String(it.cgst_rate ? it.cgst_rate * 2 : (it.igst_rate || 18)),
                category_name: it.category_name ?? "",
                product_name: pName,
                product_description: pDesc,
            };
        });
        setItems(hydrateItems(savedItems.length ? savedItems : [{ ...EMPTY_ITEM }]));
        setFormVisible(true);
        fetchCatalog();
    }, [fetchCatalog, hydrateItems]);

    /* ── save (create or update) ────────────────────────── */
    const handleSave = useCallback(async () => {
        if (!formLead) return;
        if (!form.company_name.trim()) {
            appService.showToast("Company / Buyer name is required.", "Error");
            return;
        }
        if (items.length === 0) {
            appService.showToast("Add at least one item from the catalogue.", "Error");
            return;
        }
        setSaving(true);
        try {
            const validity = new Date();
            validity.setDate(validity.getDate() + (parseInt(form.validity_days, 10) || 15));

            const { selectedLocation: activeLoc } = piHook;
            const selState = activeLoc?.address?.state?.trim().toLowerCase() || "";
            const buyState = form.state?.trim().toLowerCase() || "";
            const isSameState = selState === buyState;

            const lineItems = items.map((it, idx) => {
                const qty = parseFloat(it.quantity) || 0;
                const rate = parseFloat(it.rate) || 0;
                const disc = parseFloat(it.discount_percent) || 0;
                const gstTot = parseFloat(it.gst_rate) || 18;
                const taxable = qty * rate * (1 - disc / 100);
                const half = gstTot / 2;

                const cgst = isSameState ? taxable * (half / 100) : 0;
                const sgst = isSameState ? taxable * (half / 100) : 0;
                const igst = !isSameState ? taxable * (gstTot / 100) : 0;

                // Generate a productId if missing (for manual items)
                const pId = it.productId || `MAN-${Date.now()}-${idx}`;

                return {
                    sr_no: idx + 1,
                    description: it.description.trim(),
                    hsn_sac: it.hsn_sac.trim(),
                    quantity: qty,
                    unit: it.unit.trim() || "PCS",
                    sell_rate: rate, // Mapped for Offer/Quotation schema
                    buy_rate: parseFloat(it.buy_rate) || 0,
                    margin_pct: parseFloat(it.margin_pct) || 15,
                    discount_percent: disc,
                    taxable_amount: taxable,
                    cgst_rate: isSameState ? half : 0,
                    cgst_amount: cgst,
                    sgst_rate: isSameState ? half : 0,
                    sgst_amount: sgst,
                    igst_rate: !isSameState ? gstTot : 0,
                    igst_amount: igst,
                    total_amount: taxable + cgst + sgst + igst,

                    // IDs from composite or explicit fields
                    vendorId: it.vendorId,
                    categoryId: it.categoryId,
                    productId: pId,

                    category_name: it.category_name || "Others",
                    product_name: it.product_name || it.description.split(" | ")[0] || "Item",
                    product_description: it.product_description || (it.description.includes(" | ") ? it.description.split(" | ").slice(1).join(" | ") : ""),
                };
            });

            const totals = calcTotals(items, isSameState);
            const totalIGST = isSameState ? 0 : totals.gstTotal;
            const SGST_AMT = isSameState ? totals.sgst : 0;
            const totalCGST = isSameState ? totals.cgst : 0;

            // If editing a quote that was already Sent/Accepted/Revised → mark as Revised
            const newStatus = editQuote && SENT_STATUSES.has(editQuote.status)
                ? "Revised"
                : undefined;

            const buyerInfoPayload = {
                company_name: form.company_name.trim(),
                contact_person: form.contact_person.trim(),
                gst_no: form.gstin.trim(),
                place_of_supply: form.state.trim(),
                billing_address: {
                    line1: form.line1.trim(),
                    city: form.city.trim(),
                    state: form.state.trim(),
                    pincode: form.pincode.trim(),
                    country: "India"
                },
                shipping_address: {
                    line1: form.shipping_address.line1.trim() || form.line1.trim(),
                    city: form.shipping_address.city.trim() || form.city.trim(),
                    state: form.shipping_address.state.trim() || form.state.trim(),
                    pincode: form.shipping_address.pincode.trim() || form.pincode.trim(),
                    contact_person: form.shipping_address.contact_person.trim() || form.contact_person.trim(),
                    mobile: form.shipping_address.mobile.trim() || form.mobile.trim(),
                    country: "India",
                    same_as_billing: false
                }
            };

            await appService.httpClient.put(`service/leads/${formLead._id}`, { buyerInfo: buyerInfoPayload }, {
                headers: { Authorization: `Bearer ${token}` }
            }).catch(e => console.log("Failed to update lead buyer info", e));

            const payload: any = {
                leadId: formLead._id,
                locationId: selectedLocation?._id,
                corpAdminId: user?.corpAdminId ?? user?._id,
 
                // Structured Snapshots for persistent history
                seller: {
                    business_name: seller?.name || "",
                    legal_name: seller?.tag || "",
                    logo: seller?.logo || "",
                    address: seller?.address || {},
                    tax_registrations: {
                        gstin: selectedLocation?.gstin || seller?.gst || "",
                        pan: seller?.pan || "",
                    },
                    contact: {
                        email: selectedLocation?.contactEmail || seller?.email || "",
                        mobile: selectedLocation?.contactMobile || seller?.mobile || "",
                    },
                },
                buyer: {
                    billing_address: {
                        company_name: form.company_name.trim(),
                        contact_person: form.contact_person.trim(),
                        mobile: form.mobile.trim(),
                        email: form.email.trim(),
                        line1: form.line1.trim(),
                        city: form.city.trim(),
                        state: form.state.trim(),
                        pincode: form.pincode.trim(),
                        gstin: form.gstin.trim(),
                    },
                    shipping_address: buyerInfoPayload.shipping_address
                },

                payment_terms: form.payment_terms.trim(),
                delivery_terms: form.delivery_terms.trim(),
                terms_and_conditions: {
                    items: form.terms_conditions.split("\n").filter(line => line.trim())
                },
                footer_message: form.footer_message.trim(),
                validity_date: validity.toISOString(),
                internal_notes: form.internal_notes.trim(),
                items: lineItems,
                totals: {
                    taxable_amount: totals.taxable,
                    total_cgst: totalCGST,
                    total_sgst: SGST_AMT, // SGST match
                    total_igst: totalIGST,
                    total_tax: totals.gstTotal,
                    grand_total: totals.grand,
                },
            };
            if (newStatus) payload.status = newStatus;

            if (editQuote) {
                await appService.httpClient.put(`finance/quotations/${editQuote._id}`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                appService.showToast(newStatus === "Revised" ? "Quote revised!" : "Quote updated!", "Success");
            } else {
                await appService.httpClient.post("finance/quotations", payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                appService.showToast("Quote created!", "Success");
            }

            setFormVisible(false);
            fetchQuotesForLead(formLead._id);
            fetchLeads();
        } catch (e: any) {
            const msg = e?.response?.data?.message ?? e?.message ?? "Something went wrong";
            appService.showToast(msg, "Error");
        } finally {
            setSaving(false);
        }
    }, [formLead, form, items, editQuote, token, user, seller, piHook, fetchQuotesForLead, fetchLeads]);

    /* ── mark quote as Sent ─────────────────────────────── */
    const handleMarkSent = useCallback(async (quote: SavedQuote) => {
        setSendingStatus(true);
        try {
            await appService.httpClient.put(`finance/quotations/${quote._id}`, { status: "Sent" }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            appService.showToast("Marked as Sent!", "Success");
            // refresh preview data and quotes list
            const res = await appService.httpClient.get(`finance/quotations/${quote._id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const updated: SavedQuote = res.data?.data ?? res.data;
            setPreviewQuote(updated);
            if (updated.leadId) fetchQuotesForLead(updated.leadId);
        } catch (e: any) {
            appService.showToast(e?.response?.data?.message ?? e?.message ?? "Could not update status", "Error");
        } finally {
            setSendingStatus(false);
        }
    }, [token, fetchQuotesForLead]);

    /* ── loading guard ──────────────────────────────────── */
    if (sellerLoading) {
        return (
            <View style={styles.center as any}>
                <ActivityIndicator size="large" color={COLORS.pri} />
                <Text style={styles.loadingText}>Loading company info…</Text>
            </View>
        );
    }

    /* ════ RENDER ════ */
    return (
        <SafeAreaView style={styles.root} edges={["bottom", "left", "right"]}>
            <AppHeader
                title="Inquiry Quotations"
                onBackPress={() => router.back()}
                rightAction={() => (
                    <TouchableOpacity
                        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginRight: 8 }}
                        onPress={fetchLeads}
                        activeOpacity={0.7}
                    >
                        <Text style={{ color: "#fff", fontSize: 20, fontWeight: "800" }}>↻</Text>
                    </TouchableOpacity>
                )}
            />

            {/* ── SECTION LABEL ── */}
            <View style={styles.sectionRow as any}>
                <Text style={styles.sectionTitle}>Engaged Leads</Text>
                {!leadsLoading && (
                    <View style={styles.countBadge as any}>
                        <Text style={styles.countBadgeText}>{leads.length}</Text>
                    </View>
                )}
            </View>

            {/* ── LEADS LIST ── */}
            {leadsLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={COLORS.pri} />
                    <Text style={styles.loadingText}>Loading leads…</Text>
                </View>
            ) : leads.length === 0 ? (
                <View style={styles.emptyBox as any}>
                    <Text style={styles.emptyIcon}>📋</Text>
                    <Text style={styles.emptyText}>No Engaged leads found.</Text>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                >
                    {leads.map(lead => {
                        const quotes = quotesMap[lead._id] ?? [];
                        const qLoading = !!quotesLoading[lead._id];
                        return (
                            <LeadCard
                                key={lead._id}
                                lead={lead}
                                quotes={quotes}
                                quotesLoading={qLoading}
                                onNewQuote={() => openNewQuote(lead)}
                                onEditQuote={q => openEditQuote(lead, q)}
                                onPreviewQuote={q => setPreviewQuote({ ...q, items: hydrateItems(q.items || []) })}
                                onLoadQuotes={() => fetchQuotesForLead(lead._id)}
                            />
                        );
                    })}
                </ScrollView>
            )}

            {/* ════════════════════════════════════════════════════
                BUYER INFO FORM SHEET (New / Edit Quote)
            ════════════════════════════════════════════════════ */}
            <Modal
                visible={formVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setFormVisible(false)}
            >
                <SafeAreaView style={styles.sheetRoot}>
                    {/* sheet header */}
                    <View style={styles.sheetHeader as any}>
                        <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtn}>
                            <Text style={styles.closeBtnTxt}>✕</Text>
                        </TouchableOpacity>
                        <View style={styles.sheetHeaderCenter as any}>
                            <Text style={styles.sheetTitle}>
                                {editQuote ? "Edit Quote" : "New Quote"}
                            </Text>
                            {formLead && (
                                <Text style={styles.sheetSubtitle}>
                                    LEAD-{formLead.lead_no}  ·  {formLead.sender_name}
                                </Text>
                            )}
                        </View>
                        <TouchableOpacity
                            style={[styles.saveBtn, saving && { opacity: 0.5 }]}
                            onPress={handleSave}
                            disabled={saving}
                            activeOpacity={0.8}
                        >
                            {saving
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Text style={styles.saveBtnTxt}>Save</Text>
                            }
                        </TouchableOpacity>
                    </View>

                    <KeyboardAvoidingView
                        style={{ flex: 1 }}
                        behavior={Platform.OS === "ios" ? "padding" : undefined}
                        keyboardVerticalOffset={80}
                    >
                        <ScrollView
                            contentContainerStyle={styles.formContent}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            <FormSection title="Seller Office / Branch">
                                <View style={{ padding: 12 }}>
                                    {locations.length > 1 ? (
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                                            {locations.map(loc => {
                                                const active = selectedLocation?._id === loc._id;
                                                return (
                                                    <TouchableOpacity key={loc._id} onPress={() => selectLocation(loc._id)}
                                                        style={[styles.statusPill, { backgroundColor: active ? COLORS.pri : "#f1f5f9", borderColor: active ? COLORS.pri : COLORS.bdr, paddingHorizontal: 12, paddingVertical: 6 }]}>
                                                        <Text style={[styles.statusPillTxt, { color: active ? "#fff" : COLORS.muted }]}>{loc.locationName}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </ScrollView>
                                    ) : (
                                        <Text style={{ fontSize: 13, color: COLORS.txt, fontWeight: '700' }}>{selectedLocation?.locationName || "Head Office"}</Text>
                                    )}
                                    <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
                                        GST: {selectedLocation?.gstin || "N/A"} | State: {selectedLocation?.address?.state || "N/A"}
                                    </Text>
                                </View>
                            </FormSection>

                            {/* ── Buyer Details ── */}
                            <FormSection title="Buyer Details">
                                <LabeledInput
                                    label="Company / Buyer Name *"
                                    value={form.company_name}
                                    onChangeText={(v: string) => setForm(p => ({ ...p, company_name: v }))}
                                    placeholder="e.g. Acme Pvt Ltd"
                                />
                                <LabeledInput
                                    label="Contact Person"
                                    value={form.contact_person}
                                    onChangeText={(v: string) => setForm(p => ({ ...p, contact_person: v }))}
                                    placeholder="e.g. Rajesh Kumar"
                                />
                                <FormRow>
                                    <LabeledInput
                                        label="Mobile"
                                        value={form.mobile}
                                        onChangeText={(v: string) => setForm(p => ({ ...p, mobile: v }))}
                                        placeholder="9XXXXXXXXX"
                                        keyboardType="phone-pad"
                                        flex
                                    />
                                    <LabeledInput
                                        label="Email"
                                        value={form.email}
                                        onChangeText={(v: string) => setForm(p => ({ ...p, email: v }))}
                                        placeholder="buyer@email.com"
                                        keyboardType="email-address"
                                        flex
                                    />
                                </FormRow>
                                <LabeledInput
                                    label="Address Line 1"
                                    value={form.line1}
                                    onChangeText={(v: string) => setForm(p => ({ ...p, line1: v }))}
                                    placeholder="Street / Building"
                                />
                                <FormRow>
                                    <TouchableOpacity
                                        style={[styles.inputWrap, { flex: 1, justifyContent: "center" }]}
                                        onPress={() => setDistrictPickerVisible(true)}
                                    >
                                        <Text style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>City / District</Text>
                                        <Text style={{ fontSize: 13, color: form.city ? "#000" : COLORS.muted }}>
                                            {form.city || "Select District"}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.inputWrap, { flex: 1, justifyContent: "center" }]}
                                        onPress={() => setStatePickerVisible(true)}
                                    >
                                        <Text style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>State</Text>
                                        <Text style={{ fontSize: 13, color: form.state ? "#000" : COLORS.muted }}>
                                            {form.state || "Select State"}
                                        </Text>
                                    </TouchableOpacity>
                                    <LabeledInput
                                        label="PIN Code"
                                        value={form.pincode}
                                        onChangeText={(v: string) => setForm(p => ({ ...p, pincode: v }))}
                                        placeholder="110001"
                                        keyboardType="number-pad"
                                        flex
                                    />
                                </FormRow>

                                {/* ── Shipping Address ── */}
                                <View style={{ marginTop: 15, padding: 12, backgroundColor: COLORS.bg, borderRadius: 10, borderWidth: 1, borderColor: COLORS.bdr }}>
                                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bdr, paddingBottom: 6 }}>
                                        <Text style={{ fontSize: 11, fontWeight: "800", color: COLORS.muted, textTransform: "uppercase" }}>Shipping Address</Text>
                                        <TouchableOpacity onPress={() => setForm(p => ({ ...p, shipping_address: { ...p.shipping_address, line1: p.line1, city: p.city, state: p.state, pincode: p.pincode } }))}>
                                            <Text style={{ fontSize: 11, color: COLORS.pri, fontWeight: "700" }}>Copy Billing</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <LabeledInput
                                        label="Address Line 1"
                                        value={form.shipping_address.line1}
                                        onChangeText={(v: string) => setForm(p => ({ ...p, shipping_address: { ...p.shipping_address, line1: v } }))}
                                        placeholder="Street / Building"
                                    />
                                    <FormRow>
                                        <TouchableOpacity
                                            style={[styles.inputWrap, { flex: 1, justifyContent: "center" }]}
                                            onPress={() => setShipDistrictPickerVisible(true)}
                                        >
                                            <Text style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>City / District</Text>
                                            <Text style={{ fontSize: 13, color: form.shipping_address.city ? "#000" : COLORS.muted }}>
                                                {form.shipping_address.city || "Select District"}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.inputWrap, { flex: 1, justifyContent: "center" }]}
                                            onPress={() => setShipStatePickerVisible(true)}
                                        >
                                            <Text style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>State</Text>
                                            <Text style={{ fontSize: 13, color: form.shipping_address.state ? "#000" : COLORS.muted }}>
                                                {form.shipping_address.state || "Select State"}
                                            </Text>
                                        </TouchableOpacity>
                                        <LabeledInput
                                            label="PIN Code"
                                            value={form.shipping_address.pincode}
                                            onChangeText={(v: string) => setForm(p => ({ ...p, shipping_address: { ...p.shipping_address, pincode: v } }))}
                                            placeholder="110001"
                                            keyboardType="number-pad"
                                            flex
                                        />
                                    </FormRow>
                                </View>
                            </FormSection>

                            {/* ── Tax Details ── */}
                            <FormSection title="Tax Details">
                                <FormRow>
                                    <LabeledInput
                                        label="GSTIN"
                                        value={form.gstin}
                                        onChangeText={(v: string) => setForm(p => ({ ...p, gstin: v.toUpperCase() }))}
                                        placeholder="22AAAAA0000A1Z5"
                                        autoCapitalize="characters"
                                        flex
                                    />
                                    <LabeledInput
                                        label="PAN"
                                        value={form.pan}
                                        onChangeText={(v: string) => setForm(p => ({ ...p, pan: v.toUpperCase() }))}
                                        placeholder="AAAAA0000A"
                                        autoCapitalize="characters"
                                        flex
                                    />
                                </FormRow>
                            </FormSection>

                            {/* ── Commercial Terms ── */}
                            <FormSection title="Commercial Terms">
                                <FormRow>
                                    <LabeledInput
                                        label="Payment Terms"
                                        value={form.payment_terms}
                                        onChangeText={(v: string) => setForm(p => ({ ...p, payment_terms: v }))}
                                        placeholder="Advance / Net 30"
                                        flex
                                    />
                                    <LabeledInput
                                        label="Delivery Terms"
                                        value={form.delivery_terms}
                                        onChangeText={(v: string) => setForm(p => ({ ...p, delivery_terms: v }))}
                                        placeholder="Ex-Works / CIF"
                                        flex
                                    />
                                </FormRow>
                                <LabeledInput
                                    label="Quote Valid For (days)"
                                    value={form.validity_days}
                                    onChangeText={(v: string) => setForm(p => ({ ...p, validity_days: v }))}
                                    placeholder="30"
                                    keyboardType="number-pad"
                                />
                                <LabeledInput
                                    label="Terms & Conditions (Printed)"
                                    value={form.terms_conditions}
                                    onChangeText={(v: string) => setForm(p => ({ ...p, terms_conditions: v }))}
                                    placeholder="1. Payment 100% advance..."
                                    multiline
                                    numberOfLines={3}
                                />
                                <LabeledInput
                                    label="Custom Footer Message (Printed)"
                                    value={form.footer_message}
                                    onChangeText={(v: string) => setForm(p => ({ ...p, footer_message: v }))}
                                    placeholder="Thank you for your business!"
                                    multiline
                                    numberOfLines={2}
                                />
                            </FormSection>

                            {/* ── Notes ── */}
                            <FormSection title="Internal Notes">
                                <LabeledInput
                                    label="Notes (not printed)"
                                    value={form.internal_notes}
                                    onChangeText={(v: string) => setForm(p => ({ ...p, internal_notes: v }))}
                                    placeholder="Any internal remarks…"
                                    multiline
                                    numberOfLines={3}
                                />
                            </FormSection>

                            {/* ── Line Items ── */}
                            <FormSection title={`Items  (${items.length})`}>
                                {/* header cols */}
                                <View style={styles.itemColHeader as any}>
                                    <Text style={[styles.itemColHdrTxt, { flex: 3 }]}>Product</Text>
                                    <Text style={[styles.itemColHdrTxt, { flex: 2, textAlign: "right" }]}>Buy ₹</Text>
                                    <Text style={[styles.itemColHdrTxt, { flex: 2, textAlign: "right" }]}>Sell ₹</Text>
                                    <Text style={[styles.itemColHdrTxt, { flex: 1.5, textAlign: "right" }]}>Qty</Text>
                                    <View style={{ width: 28 }} />
                                </View>

                                {items.map((it, idx) => (
                                    <QuoteItemRow
                                        key={idx}
                                        item={it}
                                        index={idx}
                                        isLocal={(seller?.address?.state?.trim().toLowerCase() || "") === (form.state?.trim().toLowerCase() || "")}
                                        onChange={(field, val) =>
                                            setItems(prev => prev.map((r, i) => {
                                                if (i !== idx) return r;
                                                const updated = { ...r, [field]: val };
                                                // auto-calc sell rate when buy or margin changes (no zero sell rate)
                                                if (field === "buy_rate" || field === "margin_pct") {
                                                    const bv = field === "buy_rate" ? val : updated.buy_rate;
                                                    const mv = field === "margin_pct" ? val : updated.margin_pct;
                                                    updated.rate = sellFromBuy(bv, mv);
                                                }
                                                // auto-calc margin when rate changes
                                                if (field === "rate") {
                                                    const bv = parseFloat(updated.buy_rate) || 0;
                                                    const rv = parseFloat(val) || 0;
                                                    if (bv > 0) {
                                                        updated.margin_pct = (((rv - bv) / bv) * 100).toFixed(2);
                                                    }
                                                }
                                                return updated;
                                            }))
                                        }
                                        onRemove={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                                    />
                                ))}

                                <View style={styles.itemActionsRow as any}>
                                    <TouchableOpacity
                                        style={[styles.catalogBtn, { flex: 1 }]}
                                        onPress={() => setPickerVisible(true)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={styles.catalogBtnTxt}>
                                            {catalogLoading ? "Loading…" : "📦 From Catalogue"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </FormSection>

                            {/* ── Live Totals ── */}
                            {items.some(it => it.rate) && (() => {
                                const isSameState = (seller?.address?.state?.trim().toLowerCase() || "") === (form.state?.trim().toLowerCase() || "");
                                const { taxable, cgst, sgst, igst, gstTotal, grand } = calcTotals(items, isSameState);
                                return (
                                    <View style={styles.totalsPreview as any}>
                                        <View style={styles.totalsRow as any}>
                                            <Text style={styles.totalsLabel}>Taxable Total</Text>
                                            <Text style={styles.totalsValue}>{fmtAmount(taxable)}</Text>
                                        </View>
                                        {isSameState ? (
                                            <>
                                                <View style={styles.totalsRow}>
                                                    <Text style={styles.totalsLabel}>CGST</Text>
                                                    <Text style={styles.totalsValue}>{fmtAmount(cgst)}</Text>
                                                </View>
                                                <View style={styles.totalsRow}>
                                                    <Text style={styles.totalsLabel}>SGST</Text>
                                                    <Text style={styles.totalsValue}>{fmtAmount(sgst)}</Text>
                                                </View>
                                            </>
                                        ) : (
                                            <View style={styles.totalsRow}>
                                                <Text style={styles.totalsLabel}>IGST</Text>
                                                <Text style={styles.totalsValue}>{fmtAmount(igst)}</Text>
                                            </View>
                                        )}
                                        <View style={styles.totalsRow}>
                                            <Text style={[styles.totalsLabel, { fontWeight: "700" }]}>Total GST</Text>
                                            <Text style={[styles.totalsValue, { fontWeight: "700" }]}>{fmtAmount(gstTotal)}</Text>
                                        </View>
                                        <View style={[styles.totalsRow, styles.grandRow]}>
                                            <Text style={styles.grandLabel}>Grand Total</Text>
                                            <Text style={styles.grandValue}>{fmtAmount(grand)}</Text>
                                        </View>
                                    </View>
                                );
                            })()}
                        </ScrollView>
                    </KeyboardAvoidingView>
                </SafeAreaView>
            </Modal>

            {/* ── PRODUCT PICKER MODAL ── */}
            <ProductPickerModal
                visible={pickerVisible}
                categories={catalogCategories}
                vendorsList={allVendors}
                token={token}
                onClose={() => setPickerVisible(false)}
                onAddItems={picked =>
                    setItems(prev => [...prev.filter(it => it.description.trim()), ...picked])
                }
            />

            {/* ── QUOTE PREVIEW MODAL ── */}
            <QuotePreviewModal
                quote={previewQuote}
                seller={seller}
                lead={previewQuote ? leads.find(l => l._id === previewQuote.leadId) : null}
                currentUser={user}
                onClose={() => setPreviewQuote(null)}
                onMarkSent={handleMarkSent}
                sendingStatus={sendingStatus}
            />

            <StatePicker 
                visible={statePickerVisible} 
                onClose={() => setStatePickerVisible(false)} 
                onSelect={(name) => setForm(p => ({ ...p, state: name, city: "" }))} 
            />
            <DistrictPicker 
                visible={districtPickerVisible} 
                onClose={() => setDistrictPickerVisible(false)} 
                onSelect={(name) => setForm(p => ({ ...p, city: name }))}
                stateCode={getStateCodeByName(form.state)}
            />

            <StatePicker 
                visible={shipStatePickerVisible} 
                onClose={() => setShipStatePickerVisible(false)} 
                onSelect={(name) => setForm(p => ({ ...p, shipping_address: { ...p.shipping_address, state: name, city: "" } }))} 
            />
            <DistrictPicker 
                visible={shipDistrictPickerVisible} 
                onClose={() => setShipDistrictPickerVisible(false)} 
                onSelect={(name) => setForm(p => ({ ...p, shipping_address: { ...p.shipping_address, city: name } }))}
                stateCode={getStateCodeByName(form.shipping_address.state)}
            />

        </SafeAreaView>
    );
}

/* ════════════════════════════════════════════════════════
   QUOTE ITEM ROW  (in form sheet — buy, sell, qty, gst)
════════════════════════════════════════════════════════ */
type QuoteItemRowProps = {
    item: LineItem;
    index: number;
    isLocal?: boolean;
    onChange: (field: keyof LineItem, val: string) => void;
    onRemove: () => void;
};

/* ════════════════════════════════════════════════════════
   FORM HELPERS
════════════════════════════════════════════════════════ */
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={styles.formSection as any}>
            <Text style={styles.formSectionTitle}>{title}</Text>
            {children}
        </View>
    );
}

function FormRow({ children }: { children: React.ReactNode }) {
    return <View style={styles.formRow}>{children}</View>;
}

function LabeledInput({ label, flex, ...props }: any) {
    return (
        <View style={[styles.inputWrap, flex && { flex: 1 }]}>
            <Text style={styles.inputLabel}>{label}</Text>
            <TextInput
                style={[styles.input, props.multiline && styles.inputMulti]}
                placeholderTextColor={COLORS.muted + "88"}
                {...props}
            />
        </View>
    );
}

function QuoteItemRow({ item, index, isLocal = true, onChange, onRemove }: QuoteItemRowProps) {
    const { taxable, cgst, sgst, igst, gstAmt, total } = calcItem(item, isLocal);
    return (
        <View style={styles.qirWrap as any}>
            <View style={styles.qirTopRow as any}>
                <Text style={styles.qirNum}>#{index + 1}</Text>
                <TextInput
                    style={[styles.qirDescInput, { flex: 1 }]}
                    value={item.description}
                    onChangeText={v => {
                        onChange("description", v);
                        // Manual input: keep product_name consistent with description
                        onChange("product_name", v.split(" | ")[0]);
                    }}
                    placeholder="Product / service description"
                    placeholderTextColor={COLORS.muted + "88"}
                />
                <TouchableOpacity onPress={onRemove} style={styles.qirRemoveBtn}>
                    <Text style={styles.qirRemoveTxt}>✕</Text>
                </TouchableOpacity>
            </View>

            {/* buy / sell / margin row */}
            <View style={styles.qirRateRow as any}>
                <View style={styles.qirCell as any}>
                    <Text style={styles.qirCellLabel}>Buy ₹</Text>
                    <TextInput
                        style={styles.qirInput}
                        value={item.buy_rate}
                        onChangeText={v => onChange("buy_rate", v)}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={COLORS.muted + "88"}
                    />
                </View>
                <View style={styles.qirCell}>
                    <Text style={styles.qirCellLabel}>Margin %</Text>
                    <TextInput
                        style={styles.qirInput}
                        value={item.margin_pct}
                        onChangeText={v => onChange("margin_pct", v)}
                        keyboardType="decimal-pad"
                        placeholder="15"
                        placeholderTextColor={COLORS.muted + "88"}
                    />
                </View>
                <View style={styles.qirCell}>
                    <Text style={[styles.qirCellLabel, { color: COLORS.green }]}>Sell ₹</Text>
                    <TextInput
                        style={[styles.qirInput, { borderColor: COLORS.green }]}
                        value={item.rate}
                        onChangeText={v => onChange("rate", v)}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={COLORS.muted + "88"}
                    />
                </View>
                <View style={styles.qirCell}>
                    <Text style={styles.qirCellLabel}>Qty</Text>
                    <TextInput
                        style={styles.qirInput}
                        value={item.quantity}
                        onChangeText={v => onChange("quantity", v)}
                        keyboardType="decimal-pad"
                        placeholder="1"
                        placeholderTextColor={COLORS.muted + "88"}
                    />
                </View>
            </View>

            {/* gst / hsn / unit row */}
            <View style={styles.qirRateRow}>
                <View style={styles.qirCell}>
                    <Text style={styles.qirCellLabel}>GST %</Text>
                    <TextInput
                        style={styles.qirInput}
                        value={item.gst_rate}
                        onChangeText={v => onChange("gst_rate", v)}
                        keyboardType="decimal-pad"
                        placeholder="18"
                        placeholderTextColor={COLORS.muted + "88"}
                    />
                </View>
                <View style={styles.qirCell}>
                    <Text style={styles.qirCellLabel}>HSN</Text>
                    <TextInput
                        style={styles.qirInput}
                        value={item.hsn_sac}
                        onChangeText={v => onChange("hsn_sac", v)}
                        placeholder="0000"
                        placeholderTextColor={COLORS.muted + "88"}
                    />
                </View>
                <View style={styles.qirCell}>
                    <Text style={styles.qirCellLabel}>Unit</Text>
                    <TextInput
                        style={styles.qirInput}
                        value={item.unit}
                        onChangeText={v => onChange("unit", v)}
                        placeholder="PCS"
                        placeholderTextColor={COLORS.muted + "88"}
                    />
                </View>
                <View style={[styles.qirCell, { justifyContent: "flex-end" }]}>
                    {item.rate ? (
                        <Text style={styles.qirTotal}>{fmtAmount(total)}</Text>
                    ) : null}
                </View>
            </View>

            {item.rate ? (
                <View style={styles.qirSummaryRow}>
                    <Text style={styles.qirSummaryTxt}>Taxable {fmtAmount(taxable)}</Text>
                    {isLocal ? (
                        <>
                            <Text style={styles.qirSummaryTxt}>CGST {fmtAmount(cgst)}</Text>
                            <Text style={styles.qirSummaryTxt}>SGST {fmtAmount(sgst)}</Text>
                        </>
                    ) : (
                        <Text style={styles.qirSummaryTxt}>IGST {fmtAmount(igst)}</Text>
                    )}
                    <Text style={[styles.qirSummaryTxt, { fontWeight: "700" }]}>Total {fmtAmount(total)}</Text>
                </View>
            ) : null}
        </View>
    );
}

/* ════════════════════════════════════════════════════════
   CATALOGUE PICKER — 3-STEP WIZARD
   Step 1 → pick category
   Step 2 → pick vendor (fetched for that category)
   Step 3 → review vendor buy-rates, select products, tweak margin
════════════════════════════════════════════════════════ */

type VendorSummary = {
    _id: string;
    vendorName: string;
    mobileNo: string;
    contactPerson: string;
};

type VendorProduct = {
    _id?: string;
    productId: string;
    productName: string;
    price: number;  // buy rate from vendor
    UoM: string;
    hsn_sac: string;
    description: string;
};

type ProductPickerModalProps = {
    visible: boolean;
    categories: CatalogCategory[];
    vendorsList: any[];
    token: string;
    onClose: () => void;
    onAddItems: (items: LineItem[]) => void;
};

type CategorySummary = {
    _id: string;
    categoryName: string;
    productCount?: number;
};

function ProductPickerModal({ visible, categories, vendorsList, token, onClose, onAddItems }: ProductPickerModalProps) {
    /* ── wizard state ── */
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // step 1: Select Category
    const [selCategory, setSelCategory] = useState<CategorySummary | null>(null);

    // step 2: Select Vendor
    const [selVendor, setSelVendor] = useState<any | null>(null);

    // Filtered vendors (who dealing in selCategory)
    const [filteredVendors, setFilteredVendors] = useState<any[]>([]);

    // step 3: Select Products (Filtered by Vendor & Category)
    const [vendorProducts, setVendorProducts] = useState<any[]>([]);
    const [vpLoading, setVpLoading] = useState(false);

    // per-product row state
    const [checked, setChecked] = useState<Record<string, {
        selected: boolean; buy_rate: string; margin_pct: string; rate: string;
        categoryId?: string; categoryName?: string;
    }>>({});

    // Accumulate items from different vendors/categories before final confirmation
    const [selectionPool, setSelectionPool] = useState<LineItem[]>([]);

    /* ── reset on open/close ── */
    useEffect(() => {
        if (!visible) {
            setStep(1);
            setSelCategory(null);
            setSelVendor(null);
            setFilteredVendors([]);
            setVendorProducts([]);
            setChecked({});
            setSelectionPool([]);
        }
    }, [visible]);

    /* ── step 1 → step 2: Pick Category & Filter Vendors ── */
    const pickCategory = (cat: CategorySummary) => {
        setSelCategory(cat);
        // Find vendors who have this category in their productCost
        const matches = vendorsList.filter(v =>
            (v.productCost ?? []).some((pc: any) => pc.categoryId === cat._id)
        );
        setFilteredVendors(matches);
        setStep(2);
    };

    /* ── step 2 → step 3: Pick Vendor & Show Products for Category ── */
    const pickVendor = (v: any) => {
        setSelVendor(v);
        setVendorProducts([]);
        setChecked({});
        setVpLoading(true);
        setStep(3);

        // Extract products ONLY for the selected category
        const catData = (v.productCost ?? []).find((pc: any) => pc.categoryId === selCategory?._id);
        const productsOfCat = (catData?.products ?? []).map((p: any) => ({
            ...p,
            categoryId: catData?.categoryId,
            categoryName: catData?.categoryName,
            hsn_sac: p.hsn_sac || catData?.hsn_sac || "",
        }));

        setVendorProducts(productsOfCat);

        // pre-populate state
        const initial: typeof checked = {};
        productsOfCat.forEach((p: any) => {
            const buyStr = p.price ? String(p.price) : "";
            const catalogCat = categories.find(cc => cc._id === p.categoryId);
            const catalogProd = catalogCat?.products?.find((cp: any) => cp._id === p.productId);
            const marginPct = String(catalogProd?.margin ?? 15);

            initial[p.productId] = {
                selected: false,
                buy_rate: buyStr,
                margin_pct: marginPct,
                rate: sellFromBuy(buyStr, marginPct),
                categoryId: p.categoryId,
                categoryName: p.categoryName,
            };
        });
        setChecked(initial);
        setVpLoading(false);
    };

    /* ── helpers ── */
    const updateRate = (prodId: string, field: "buy_rate" | "margin_pct" | "rate", val: string) => {
        setChecked(p => {
            const cur = p[prodId] ?? { selected: true, buy_rate: "", margin_pct: "15", rate: "" };
            const updated = { ...cur, [field]: val };
            if (field === "buy_rate" || field === "margin_pct") {
                updated.rate = sellFromBuy(
                    field === "buy_rate" ? val : updated.buy_rate,
                    field === "margin_pct" ? val : updated.margin_pct,
                );
            }
            return { ...p, [prodId]: updated };
        });
    };

    const toggleProduct = (prodId: string) =>
        setChecked(p => ({ ...p, [prodId]: { ...(p[prodId] ?? { buy_rate: "", margin_pct: "15", rate: "" }), selected: !p[prodId]?.selected } }));

    const handleAdd = () => {
        const newItems: LineItem[] = vendorProducts
            .filter(p => checked[p.productId]?.selected)
            .map(p => {
                const c = checked[p.productId];
                const combinedDesc = [c.categoryName, p.productName, p.description].filter(Boolean).join(" | ");
                const compositeId = `${selVendor?._id}.${c.categoryId}.${p.productId}`;
                return {
                    _id: compositeId,
                    vendorId: selVendor?._id,
                    categoryId: c.categoryId,
                    productId: p.productId,
                    description: combinedDesc,
                    hsn_sac: p.hsn_sac || "",
                    unit: p.UoM || "PCS",
                    quantity: "1",
                    buy_rate: c.buy_rate,
                    margin_pct: c.margin_pct,
                    rate: c.rate || sellFromBuy(c.buy_rate, c.margin_pct),
                    discount_percent: "0",
                    gst_rate: "18",
                    category_name: c.categoryName || "",
                    product_name: p.productName,
                    product_description: p.description || "",
                };
            });

        if (newItems.length) {
            setSelectionPool(prev => {
                const poolMap = new Map<string, LineItem>();
                // Load existing pool
                prev.forEach(pi => poolMap.set(pi.productId, pi));
                // Merge/Overwrite with new selections
                newItems.forEach(ni => poolMap.set(ni.productId, ni));
                return Array.from(poolMap.values());
            });
            appService.showToast(`Pool updated (${newItems.length} items)`, "Success");
        }

        // Return to category selection to allow adding from other categories/vendors
        setStep(1);
        setSelCategory(null);
        setSelVendor(null);
        setChecked({});
    };

    const handleFinish = () => {
        onAddItems(selectionPool);
        onClose();
    };

    const currentSelCount = Object.values(checked).filter(c => c.selected).length;
    const poolCount = selectionPool.length;

    /* ── back navigation ── */
    const goBack = () => {
        if (step === 3) setStep(2);
        else if (step === 2) setStep(1);
        else onClose();
    };

    /* ── step titles ── */
    const stepTitle = step === 1 ? "Select Category" : step === 2 ? "Select Vendor" : "Select Products";
    const stepSub = step === 2 && selCategory ? `${selCategory.categoryName}`
        : step === 3 && selVendor ? `${selVendor.vendorName || selVendor.name}`
            : "";

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={goBack}>
            <SafeAreaView style={styles.pickerRoot}>
                {/* ── header ── */}
                <View style={styles.pickerHeader}>
                    <TouchableOpacity onPress={goBack} style={styles.closeBtn}>
                        <Text style={styles.closeBtnTxt}>{step === 1 ? "✕" : "‹"}</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.pickerTitle}>{stepTitle}</Text>
                        {!!stepSub && <Text style={styles.pickerStepSub} numberOfLines={1}>{stepSub}</Text>}
                    </View>
                    {(poolCount > 0 || currentSelCount > 0) && (
                        <TouchableOpacity
                            style={[styles.addSelBtn, !poolCount && !currentSelCount && { opacity: 0.4 }]}
                            onPress={step === 3 ? handleAdd : handleFinish}
                        >
                            <Text style={styles.addSelBtnTxt}>
                                {step === 3 ? `Add (${currentSelCount})` : `Finish (${poolCount})`}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* ── step indicator ── */}
                <View style={styles.stepBar}>
                    {([1, 2, 3] as const).map(n => (
                        <View key={n} style={[styles.stepDot, step >= n && styles.stepDotActive]} />
                    ))}
                </View>

                {/* ══════ STEP 1: CATEGORIES ══════ */}
                {step === 1 && (
                    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                        {categories.length === 0 ? (
                            <View style={styles.center}>
                                <Text style={styles.emptyText}>No categories available.</Text>
                            </View>
                        ) : (
                            categories.map(c => {
                                const poolItems = selectionPool.filter(it => it.categoryId === c._id);
                                const hasSelected = poolItems.length > 0;
                                return (
                                    <TouchableOpacity
                                        key={c._id}
                                        style={[styles.wizardRow, hasSelected && { backgroundColor: COLORS.pri + "15" }]}
                                        onPress={() => pickCategory(c)}
                                        activeOpacity={0.8}
                                    >
                                        <View style={styles.wizardRowLeft}>
                                            <Text style={[styles.wizardRowTitle, hasSelected && { color: COLORS.pri }]}>{c.categoryName}</Text>
                                            <Text style={styles.wizardRowSub}>
                                                {(c.products ?? []).length} products in catalogue
                                                {hasSelected && <Text style={{ color: COLORS.pri, fontWeight: "700" }}>  ·  {poolItems.length} in pool</Text>}
                                            </Text>
                                        </View>
                                        <Text style={[styles.wizardChevron, hasSelected && { color: COLORS.pri }]}>{hasSelected ? "✓" : "›"}</Text>
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </ScrollView>
                )}

                {/* ══════ STEP 2: VENDORS (Filtered by Category) ══════ */}
                {step === 2 && (
                    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                        {filteredVendors.length === 0 ? (
                            <View style={styles.center}>
                                <Text style={styles.emptyText}>No vendors deal in this category.</Text>
                            </View>
                        ) : (
                            filteredVendors.map(v => {
                                const poolItems = selectionPool.filter(it => it.vendorId === v._id && it.categoryId === selCategory?._id);
                                const hasSelected = poolItems.length > 0;
                                return (
                                    <TouchableOpacity
                                        key={v._id}
                                        style={[styles.wizardRow, hasSelected && { backgroundColor: COLORS.pri + "15" }]}
                                        onPress={() => pickVendor(v)}
                                        activeOpacity={0.8}
                                    >
                                        <View style={styles.wizardRowLeft}>
                                            <Text style={[styles.wizardRowTitle, hasSelected && { color: COLORS.pri }]}>{v.vendorName || v.name}</Text>
                                            <Text style={styles.wizardRowSub}>
                                                {[v.contactPerson, v.mobileNo].filter(Boolean).join("  ·  ")}
                                                {hasSelected && <Text style={{ color: COLORS.pri, fontWeight: "700" }}>  ·  {poolItems.length} selected</Text>}
                                            </Text>
                                        </View>
                                        <Text style={[styles.wizardChevron, hasSelected && { color: COLORS.pri }]}>{hasSelected ? "✓" : "›"}</Text>
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </ScrollView>
                )}

                {/* ══════ STEP 3: PRODUCTS ══════ */}
                {step === 3 && (
                    vpLoading ? (
                        <View style={styles.center}>
                            <ActivityIndicator size="large" color={COLORS.pri} />
                            <Text style={styles.loadingText}>Loading buy rates…</Text>
                        </View>
                    ) : vendorProducts.length === 0 ? (
                        <View style={styles.center}>
                            <Text style={styles.emptyIcon}>📦</Text>
                            <Text style={styles.emptyText}>No products with rates for this vendor &amp; category.</Text>
                        </View>
                    ) : (
                        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                            {vendorProducts.map(prod => {
                                const c = checked[prod.productId];
                                const sel = !!c?.selected;
                                return (
                                    <View key={prod.productId} style={[styles.pickerProdRow, sel && styles.pickerProdSel]}>
                                        {/* checkbox */}
                                        <TouchableOpacity
                                            style={[styles.checkbox, sel && styles.checkboxChecked]}
                                            onPress={() => toggleProduct(prod.productId)}
                                        >
                                            {sel && <Text style={styles.checkmark}>✓</Text>}
                                        </TouchableOpacity>

                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.pickerProdName}>{prod.productName}</Text>
                                            {!!prod.description && prod.description !== prod.productName && (
                                                <Text style={styles.pickerProdDesc} numberOfLines={1}>{prod.description}</Text>
                                            )}
                                            <View style={styles.vendorPriceBadgeRow}>
                                                <View style={styles.vendorPriceBadge}>
                                                    <Text style={styles.vendorPriceBadgeTxt}>
                                                        Vendor ₹ {prod.price?.toFixed(2) ?? "—"}  /  {prod.UoM}
                                                    </Text>
                                                </View>
                                                {!!prod.hsn_sac && (
                                                    <View style={styles.hsnBadge}>
                                                        <Text style={styles.hsnBadgeTxt}>HSN {prod.hsn_sac}</Text>
                                                    </View>
                                                )}
                                            </View>

                                            {sel && (
                                                <View style={styles.pickerRateRow}>
                                                    <View style={styles.pickerRateCell}>
                                                        <Text style={styles.pickerRateLabel}>Buy ₹</Text>
                                                        <TextInput
                                                            style={styles.pickerRateInput}
                                                            value={c?.buy_rate ?? ""}
                                                            onChangeText={v => updateRate(prod.productId, "buy_rate", v)}
                                                            keyboardType="decimal-pad"
                                                            placeholder="0.00"
                                                            placeholderTextColor={COLORS.muted + "66"}
                                                        />
                                                    </View>
                                                    <View style={styles.pickerRateCell}>
                                                        <Text style={styles.pickerRateLabel}>Margin %</Text>
                                                        <TextInput
                                                            style={styles.pickerRateInput}
                                                            value={c?.margin_pct ?? "15"}
                                                            onChangeText={v => updateRate(prod.productId, "margin_pct", v)}
                                                            keyboardType="decimal-pad"
                                                            placeholder="15"
                                                            placeholderTextColor={COLORS.muted + "66"}
                                                        />
                                                    </View>
                                                    <View style={styles.pickerRateCell}>
                                                        <Text style={[styles.pickerRateLabel, { color: COLORS.green }]}>Sell ₹</Text>
                                                        <TextInput
                                                            style={[styles.pickerRateInput, { borderColor: COLORS.green }]}
                                                            value={c?.rate ?? ""}
                                                            onChangeText={v => updateRate(prod.productId, "rate", v)}
                                                            keyboardType="decimal-pad"
                                                            placeholder="0.00"
                                                            placeholderTextColor={COLORS.muted + "66"}
                                                        />
                                                    </View>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                );
                            })}
                        </ScrollView>
                    )
                )}
            </SafeAreaView>
        </Modal>
    );
}


/* ════════════════════════════════════════════════════════
   LEAD CARD  (with inline quote list)
════════════════════════════════════════════════════════ */
type LeadCardProps = {
    lead: Lead;
    quotes: SavedQuote[];
    quotesLoading: boolean;
    onNewQuote: () => void;
    onEditQuote: (q: SavedQuote) => void;
    onPreviewQuote: (q: SavedQuote) => void;
    onLoadQuotes: () => void;
};

function LeadCard({ lead, quotes, quotesLoading, onNewQuote, onEditQuote, onPreviewQuote, onLoadQuotes }: LeadCardProps) {
    const [expanded, setExpanded] = useState(false);

    const toggle = () => {
        if (!expanded) onLoadQuotes();
        setExpanded(e => !e);
    };

    return (
        <View style={styles.leadCard as any}>
            {/* ── card top: lead info ── */}
            <TouchableOpacity style={styles.leadCardTop} onPress={toggle} activeOpacity={0.8}>
                <View style={styles.cardAccent as any} />
                <View style={styles.leadCardBody as any}>
                    <View style={styles.leadCardRow1 as any}>
                        <Text style={styles.leadNo}>LEAD-{lead.lead_no}</Text>
                        <Text style={styles.leadDate}>{fmtDate(lead.createdAt)}</Text>
                    </View>
                    <Text style={styles.leadName} numberOfLines={1}>{lead.sender_name}</Text>
                    <Text style={styles.leadMeta}>
                        {[lead.product_name, lead.sender_city, lead.sender_state]
                            .filter(Boolean).join("  ·  ")}
                    </Text>
                </View>
                <View style={styles.cardRight}>
                    {quotes.length > 0 && (
                        <View style={styles.qCountBadge}>
                            <Text style={styles.qCountTxt}>{quotes.length}</Text>
                        </View>
                    )}
                    <Text style={[styles.expandChevron, expanded && { transform: [{ rotate: "90deg" }] }]}>›</Text>
                </View>
            </TouchableOpacity>

            {/* ── card actions row ── */}
            <View style={styles.cardActions}>
                <TouchableOpacity style={styles.newQuoteBtn} onPress={onNewQuote} activeOpacity={0.8}>
                    <Text style={styles.newQuoteBtnTxt}>＋ New Quote</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.viewQuotesBtn} onPress={toggle} activeOpacity={0.8}>
                    <Text style={styles.viewQuotesBtnTxt}>
                        {expanded ? "▲ Hide" : `📄 Quotes (${quotes.length})`}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* ── expanded: existing quotes ── */}
            {expanded && (
                <View style={styles.quotesContainer}>
                    {quotesLoading ? (
                        <View style={styles.qLoadRow}>
                            <ActivityIndicator size="small" color={COLORS.pri} />
                            <Text style={styles.qLoadTxt}>Loading quotes…</Text>
                        </View>
                    ) : quotes.length === 0 ? (
                        <Text style={styles.noQuotesTxt}>No quotes created yet for this lead.</Text>
                    ) : (
                        quotes.map(q => (
                            <QuoteRow
                                key={q._id}
                                quote={q}
                                lead={lead}
                                onEdit={() => onEditQuote(q)}
                                onPreview={() => onPreviewQuote(q)}
                            />
                        ))
                    )}
                </View>
            )}
        </View>
    );
}

/* ════════════════════════════════════════════════════════
   QUOTE ROW  (inside expanded lead card)
════════════════════════════════════════════════════════ */
function QuoteRow({ quote, lead, onEdit, onPreview }: { quote: SavedQuote; lead: Lead; onEdit: () => void; onPreview: () => void }) {
    const statusColor = STATUS_COLOR[quote.status] ?? COLORS.muted;
    const grand = quote.totals?.grand_total ?? 0;
    const buyer = quote.buyer?.billing_address?.company_name
        || (lead as any)?.buyerInfo?.company_name
        || (lead as any)?.sender_name
        || "—";
    const isSent = quote.status === "Sent";
    return (
        <View style={styles.quoteRow}>
            <View style={styles.quoteRowLeft}>
                <Text style={styles.quoteNo}>{quote.quote_number}</Text>
                <Text style={styles.quoteBuyer} numberOfLines={1}>{buyer}</Text>
                <Text style={styles.quoteMeta}>
                    📅 {fmtDate(quote.quote_date)}
                    {quote.validity_date ? `  ·  Valid till ${fmtDate(quote.validity_date)}` : ""}
                </Text>
            </View>
            <View style={styles.quoteRowRight}>
                <Text style={styles.quoteAmount}>{grand > 0 ? fmtAmount(grand) : "—"}</Text>
                <View style={[styles.statusPill, {
                    backgroundColor: statusColor + (isSent ? "30" : "22"),
                    borderColor: statusColor,
                    borderWidth: isSent ? 1.5 : 1,
                }]}>
                    <Text style={[styles.statusPillTxt, { color: statusColor, fontWeight: isSent ? "800" : "700" }]}>
                        {isSent ? "✓ Sent" : quote.status}
                    </Text>
                </View>
                <View style={styles.quoteRowBtns}>
                    <TouchableOpacity style={styles.previewQuoteBtn} onPress={onPreview} activeOpacity={0.8}>
                        <Text style={styles.previewQuoteTxt}>👁 Preview</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.editQuoteBtn} onPress={onEdit} activeOpacity={0.8}>
                        <Text style={styles.editQuoteTxt}>✏ Edit</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

/* ════════════════════════════════════════════════════════
   PDF HTML GENERATOR  (TI.html style)
════════════════════════════════════════════════════════ */
function buildQuoteHTML(q: SavedQuote, sellerOverride?: any, lead?: any, currentUser?: any): string {
    const sel = sellerOverride || (q.seller ?? {}) as any;
    const sellerName = sel.name || sel.business_name || "";
    const sellerLogo = sel.logo || "";
    const sellerTag = sel.tag || sel.legal_name || "";
    const sellerGST = sel.gst || sel.tax_registrations?.gstin || "";
    const sellerAddress = sel.address && typeof sel.address === 'string' ? { line1: sel.address, city: sel.city, state: sel.state, pincode: sel.pin } : (sel.address ?? {});
    const sellerContact = sel.email ? { email: sel.email } : (sel.contact ?? {});
    const bank = sel.bank || sel.bank_details || {};
    const taxRegs = sel.taxRegistrations || sel.tax_registrations || {};

    // T&C and Footer fallbacks
    const finalTC = q.terms_conditions || sel.Quotation_TC || "1. Validity: This quote is valid for 15 days.\n2. Payment: Advance payment as per company policy.\n3. Taxes: GST as applicable.\n4. Delivery: Subject to stock availability.\n5. Jurisdiction: Subject to local court jurisdiction.";
    const finalFooter = q.footer_message || sel.TaxInvoiceTC || "We look forward to your positive response!";

    // PAN and Mobile from sel or currentUser
    const panValue = sel.pan || (currentUser?.accessCorporate || []).find((c: any) => c.dbName === currentUser?.dbName)?.corporatePAN || taxRegs.pan || "";
    const mobileValue = currentUser?.usermobile || sel.mobile || sel.contact?.mobile || "";
    const telephoneValue = sel.telephone || sel.contact?.telephone || "";

    const tcLines = (finalTC || "").split("\n").filter((l: string) => l.trim().length > 0);
    const tcFormattedList = tcLines.map((line: string) => {
        let processed = line.trim();
        // Support for markdown-style **bolding**
        processed = processed.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

        // Case 1: Main Section Headers (Numbered like "1. ", "1) ", "(1) ") -> BOLD and UNDERLINE
        if (/^(\d+[\.\)])|(\(\d+\))/.test(processed)) {
            return `<div style="margin-top: 24px; margin-bottom: 12px; padding-bottom: 2px;">
                        <span style="font-size: 12.5px; font-weight: 900; color: #1e3a8a; text-decoration: underline; text-underline-offset: 4px; letter-spacing: 0.3px;">${processed}</span>
                    </div>`;
        }

        // Case 2: Bullet Points or Key:Value pairs
        const isBulletMark = /^[-*•]\s+/.test(processed);
        const hasColonMarker = processed.includes(":") && !processed.startsWith("http");

        if (isBulletMark || hasColonMarker) {
            let itemContent = isBulletMark ? processed.replace(/^[-*•]\s+/, "") : processed;

            // Auto-bold text before the first colon
            if (itemContent.includes(":")) {
                const firstColonIndex = itemContent.indexOf(":");
                const keyPart = itemContent.substring(0, firstColonIndex).trim();
                const valuePart = itemContent.substring(firstColonIndex + 1).trim();
                itemContent = `<b>${keyPart}:</b> ${valuePart}`;
            }

            return `<div style="margin-left: 15px; display: flex; align-items: flex-start; margin-bottom: 8px;">
                        <span style="margin-right: 12px; color: #1e3a8a; font-weight: 900; font-size: 14px; line-height: 1;">•</span>
                        <div style="flex: 1; color: #333; line-height: 1.5; font-size: 11px;">${itemContent}</div>
                    </div>`;
        }

        // Case 3: Standard Indented Paragraph
        return `<div style="margin-left: 20px; margin-bottom: 8px; line-height: 1.6; color: #555; font-size: 11px;">${processed}</div>`;
    }).join("");

    const bi = lead?.buyerInfo || {};
    const qb = (q.buyer as any)?.billing_address || {};
    const billing = {
        company_name: bi.company_name || qb.company_name || "",
        contact_person: bi.contact_person || qb.contact_person || "",
        line1: (bi.billing_address?.line1) || qb.line1 || "",
        city: (bi.billing_address?.city) || qb.city || "",
        state: (bi.billing_address?.state || bi.place_of_supply) || qb.state || "",
        pincode: (bi.billing_address?.pincode) || qb.pincode || "",
        mobile: qb.mobile || lead?.sender_mobile || "",
        email: qb.email || lead?.sender_email || "",
        gstin: bi.gst_no || qb.gstin || "",
    };

    const bs = bi.shipping_address || {};
    const qs = (q.buyer as any)?.shipping_address || {};
    const shipping = {
        company_name: bs.company_name || billing.company_name || "",
        contact_person: bs.contact_person || qs.contact_person || billing.contact_person || "",
        line1: bs.line1 || qs.line1 || billing.line1 || "",
        city: bs.city || qs.city || billing.city || "",
        state: bs.state || qs.state || billing.state || "",
        pincode: bs.pincode || qs.pincode || billing.pincode || "",
        mobile: bs.mobile || qs.mobile || billing.mobile || "",
    };

    // Decide GST type based on state for rendering
    const sState = sel.state?.trim().toLowerCase() || "";
    const bState = billing.state?.trim().toLowerCase() || "";
    const isLocal = sState === bState;

    // Item rows and HSN grouping for Tax Summary
    const hsnGroups: Record<string, { taxable: number; cgstAmt: number; sgstAmt: number; igstAmt: number; rate: number }> = {};

    // Group items by category_name
    const groupedItems: Record<string, any[]> = {};
    (q.items ?? []).forEach((it: any) => {
        const cat = it.category_name || "Others";
        if (!groupedItems[cat]) groupedItems[cat] = [];
        groupedItems[cat].push(it);
    });

    let itemsHtml = "";
    let catIndex = 1;
    Object.entries(groupedItems).forEach(([cat, items]) => {
        const lowerCat = cat.toLowerCase();
        const isNa = lowerCat === "others" || lowerCat === "na";

        // Category Header Row
        if (!isNa) {
            itemsHtml += `
                <tr style="background: #f1f5f9;">
                    <td style="text-align: center; vertical-align: middle; font-weight: 800;">${catIndex}.</td>
                    <td colspan="7" style="font-weight: 800; color: #1e3a8a; font-size: 10px; text-transform: uppercase;">
                        Category: ${cat}
                    </td>
                </tr>
            `;
        }

        items.forEach((it: any, subIndex: number) => {
            const rowRate = parseFloat(it.rate ?? it.sell_rate ?? 0);
            const taxable = it.taxable_amount ?? (it.quantity * rowRate);
            const cgst = it.cgst_amount ?? 0;
            const sgst = it.sgst_amount ?? 0;
            const igst = it.igst_amount ?? 0;
            const hsn = it.hsn_sac || "N/A";
            const tax_rate = (it.cgst_rate ?? 0) + (it.sgst_rate ?? 0) + (it.igst_rate ?? 0);

            if (!hsnGroups[hsn]) hsnGroups[hsn] = { taxable: 0, cgstAmt: 0, sgstAmt: 0, igstAmt: 0, rate: tax_rate };
            hsnGroups[hsn].taxable += taxable;
            hsnGroups[hsn].cgstAmt += cgst;
            hsnGroups[hsn].sgstAmt += sgst;
            hsnGroups[hsn].igstAmt += igst;

            const serialNo = `${catIndex}.${subIndex + 1}`;

            itemsHtml += `<tr>
                <td style="text-align: center; vertical-align: middle; font-weight: 700;">${serialNo}</td>
                <td>
                    <div style="font-weight: 700; color: #111;">${it.product_name || "Item"}</div>
                    <div style="font-size: 9px; color: #555;">${it.product_description || ""}</div>
                </td>
                <td style="text-align: center;">${hsn}</td>
                <td style="text-align: right;">${it.quantity} ${it.unit || ""}</td>
                <td style="text-align: right;">${fmtAmount(rowRate).replace("₹ ", "")}</td>
                <td style="text-align: right;">${fmtAmount(taxable).replace("₹ ", "")}</td>
                <td style="text-align: center;">${tax_rate}%</td>
                <td style="text-align: right;">${fmtAmount(cgst + sgst + igst).replace("₹ ", "")}</td>
            </tr>`;
        });
        catIndex++;
    });

    const hsnSummaryHtml = Object.entries(hsnGroups).map(([hsn, data]) => `
        <tr>
            <td style="text-align:center">${hsn}</td>
            <td style="text-align:right">${fmtAmount(data.taxable).replace("₹ ", "")}</td>
            ${isLocal ? `
                <td style="text-align:center">${data.rate / 2}%</td>
                <td style="text-align:right">${fmtAmount(data.cgstAmt).replace("₹ ", "")}</td>
                <td style="text-align:center">${data.rate / 2}%</td>
                <td style="text-align:right">${fmtAmount(data.sgstAmt).replace("₹ ", "")}</td>
            ` : `
                <td style="text-align:center">${data.rate}%</td>
                <td style="text-align:right">${fmtAmount(data.igstAmt).replace("₹ ", "")}</td>
            `}
            <td style="text-align:right">${fmtAmount(data.cgstAmt + data.sgstAmt + data.igstAmt).replace("₹ ", "")}</td>
        </tr>
    `).join("");

    const grand = q.totals?.grand_total ?? 0;
    const taxableTotal = q.totals?.taxable_amount ?? 0;
    const taxTotal = q.totals?.total_tax ?? 0;

    // Estimate total pages used by items to provide dynamic 'See Page X'
    // Page 1 fits ~10 items with header. Each subsequent page fits ~15 items.
    const tcItemCount = q.items?.length || 0;
    let estimatedQuotePages = 1;
    if (tcItemCount > 10) {
        estimatedQuotePages += Math.ceil((tcItemCount - 10) / 15);
    }
    const tnCPage = estimatedQuotePages + 1;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; margin: 0; padding: 20px; font-size: 11px; line-height: 1.4; }
        .quote-container { border: 1px solid #ddd; padding: 20px; background: #fff; max-width: 850px; margin: auto; }
        .hdr { display: flex; justify-content: space-between; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 20px; }
        .seller-info { flex: 2; }
        .seller-name { font-size: 20px; font-weight: 800; color: #1e3a8a; margin-bottom: 5px; }
        .seller-tag { font-size: 12px; font-style: italic; color: #666; margin-bottom: 8px; }
        .doc-type { flex: 1; text-align: right; }
        .doc-type-title { font-size: 24px; font-weight: 900; color: #1e3a8a; margin: 0; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
        .addr-box { border: 1px solid #eee; padding: 10px; border-radius: 4px; background: #fafafa; }
        .addr-h { font-weight: 800; text-transform: uppercase; font-size: 10px; color: #666; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        .meta-bar { display: flex; justify-content: space-between; background: #f1f5f9; padding: 8px 15px; border-radius: 4px; border: 1px solid #e2e8f0; margin-bottom: 20px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        th { background: #1e3a8a; color: #fff; padding: 8px; font-size: 10px; text-transform: uppercase; text-align: center; }
        td { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
        .num { text-align: right; font-family: monospace; font-size: 12px; }
        .totals-wrap { display: flex; justify-content: flex-end; }
        .totals-table { width: 280px; }
        .grand-row { background: #1e3a8a; color: #fff; font-weight: 800; font-size: 14px; }
        .section-h { font-weight: 800; font-size: 10px; color: #1e3a8a; margin-bottom: 8px; text-transform: uppercase; border-left: 3px solid #1e3a8a; padding-left: 8px; }
        .footer-msg { margin-top: 30px; padding-top: 10px; border-top: 1px solid #eee; font-style: italic; color: #666; text-align: center; }
        .sign-area { display: flex; justify-content: space-between; margin-top: 40px; }
        .sign-box { border-top: 1px solid #333; width: 180px; text-align: center; padding-top: 5px; font-weight: 700; }
    </style>
</head>
<body>
    <div class="quote-container">
        <div class="hdr">
            <div class="seller-info">
                <div style="display:flex; align-items:center; gap:15px; margin-bottom:10px;">
                    ${sellerLogo ? `<img src="${sellerLogo}" style="height: 60px; max-width: 150px; object-fit: contain;" />` : ""}
                    <div>
                        <div class="seller-name">${sellerName}</div>
                        <div class="seller-tag">${sellerTag}</div>
                    </div>
                </div>
                <div style="font-size:10px; color:#444;">
                    ${sellerAddress.line1 || ""}, ${sellerAddress.city || ""}, ${sellerAddress.state || ""} - ${sellerAddress.pincode || ""}<br/>
                    Email: ${sellerContact.email || ""} | Mobile: ${mobileValue}${telephoneValue ? ` | Tel: ${telephoneValue}` : ""}<br/>
                    <b>GSTIN: ${sellerGST}</b> | PAN: ${panValue}
                    ${taxRegs.msme_udyam ? ` | MSME: ${taxRegs.msme_udyam}` : ""}
                    ${taxRegs.cin ? ` | CIN: ${taxRegs.cin}` : ""}
                    ${taxRegs.tan ? `<br/>TAN: ${taxRegs.tan}` : ""}
                    ${taxRegs.iec ? ` | IEC: ${taxRegs.iec}` : ""}
                    ${taxRegs.fssai ? ` | FSSAI: ${taxRegs.fssai}` : ""}
                </div>
            </div>
                    <div class="doc-type">
                <h1 class="doc-type-title">QUOTATION</h1>
                <div style="font-size:12px; margin-top:5px; color:#1e3a8a; font-weight:800;">
                    ${q.revision_count && q.revision_count > 0 ? `REVISION #${q.revision_count}` : `ORIGINAL FOR BUYER`}
                </div>
            </div>
        </div>
        <div class="meta-bar">
            <span>Inquiry:# ${lead?.lead_no || q.lead_no || ""} | Date: ${fmtDate(lead?.createdAt)} | Source: ${lead?.source || "Direct"}</span>
            <span style="text-align: right;">Quote No: <span style="color:#1e3a8a">${q.quote_number}</span> | Date: ${fmtDate(q.quote_date)} | Valid Till: ${fmtDate(q.validity_date)}</span>
        </div>
        <div class="grid-2">
            <div class="addr-box">
                <div class="addr-h">Billing Address</div>
                <div style="font-size:13px; font-weight:800; color:#1e3a8a; margin-bottom:4px;">${billing.company_name || ""}</div>
                ${billing.contact_person ? `Attn: ${billing.contact_person}<br/>` : ""}
                ${billing.line1 ? `${billing.line1}<br/>` : ""}
                ${billing.city ? `${billing.city}, ` : ""}${billing.state ? `${billing.state} ` : ""}${billing.pincode || ""}<br/>
                Mobile: ${billing.mobile || ""} | Email: ${billing.email || ""}<br/>
                GSTIN: <b>${billing.gstin || "N/A"}</b>
            </div>
            <div class="addr-box">
                <div class="addr-h">Shipping Address</div>
                <div style="font-size:13px; font-weight:800; color:#1e3a8a; margin-bottom:4px;">${shipping.company_name || billing.company_name || ""}</div>
                ${shipping.contact_person ? `Attn: ${shipping.contact_person}<br/>` : ""}
                ${shipping.line1 ? `${shipping.line1}<br/>` : ""}
                ${shipping.city ? `${shipping.city}, ` : ""}${shipping.state ? `${shipping.state} ` : ""}${shipping.pincode || ""}<br/>
                Mobile: ${shipping.mobile || ""}
            </div>
        </div>
        <table>
            <thead><tr><th style="width:30px">#</th><th style="text-align:left">Item Description</th><th style="width:80px">HSN/SAC</th><th style="width:70px">Qty</th><th style="width:90px">Rate (₹)</th><th style="width:100px">Taxable (₹)</th><th style="width:50px">GST</th><th style="width:90px">Tax Amt (₹)</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
        </table>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:20px;">
            <div style="flex:1">
                <div class="section-h">Tax Summary (HSN Wise)</div>
                <table style="font-size:9px">
                    <thead>
                        <tr>
                            <th>HSN</th>
                            <th>Taxable</th>
                            ${isLocal ? `
                                <th>CGST %</th><th>CGST</th>
                                <th>SGST %</th><th>SGST</th>
                            ` : `
                                <th>IGST %</th><th>IGST</th>
                            `}
                            <th>Total Tax</th>
                        </tr>
                    </thead>
                    <tbody>${hsnSummaryHtml}</tbody>
                </table>
                <div style="font-size:10px; margin-top:5px; border-top:1px solid #eee; padding-top:5px; color:#444;">
                    <b>Bank Details:</b> ${bank.bank_name || "—"} | A/C: ${bank.account_number || "—"} | IFSC: ${bank.ifsc_code || "—"} | Branch: ${bank.branch || "—"}
                </div>
            </div>
            <div class="totals-wrap">
                <table class="totals-table">
                    <tr><td style="font-weight:700">Total Taxable Value</td><td class="num">${fmtAmount(taxableTotal).replace("₹ ", "")}</td></tr>
                    ${isLocal ? `
                        <tr><td style="font-weight:700">Total CGST</td><td class="num">${fmtAmount(q.totals?.total_cgst ?? 0).replace("₹ ", "")}</td></tr>
                        <tr><td style="font-weight:700">Total SGST</td><td class="num">${fmtAmount(q.totals?.total_sgst ?? 0).replace("₹ ", "")}</td></tr>
                    ` : `
                        <tr><td style="font-weight:700">Total IGST</td><td class="num">${fmtAmount(q.totals?.total_igst ?? 0).replace("₹ ", "")}</td></tr>
                    `}
                    <tr class="grand-row"><td>Grand Total</td><td class="num">₹ ${fmtAmount(grand).replace("₹ ", "")}</td></tr>
                </table>
            </div>
        </div>
        <div class="sign-area"><div><div style="font-size:9px; color:#888;">Lead Ref: ${q.leadId || "N/A"}<br/>Generated On: ${new Date().toLocaleDateString()}</div></div><div class="sign-box"><div style="font-size:10px; margin-bottom:25px;">For ${sellerName}</div>${sel.authorized_signatory?.signature_label || "Authorised Signatory"}<br/><span style="font-size:9px; font-weight:normal;">${sel.authorized_signatory?.name || ""} (${sel.authorized_signatory?.designation || ""})</span></div></div>
        
        <div style="margin-top: 15px; text-align: right; font-weight: 800; color: #1e3a8a; font-size: 10px; font-style: italic;">
            See Page ${tnCPage} for Terms & Conditions of Sales & Service >>
        </div>

        <div class="footer-msg">${finalFooter}</div>
    </div>

    <!-- ── DYNAMIC PAGE: TERMS & CONDITIONS / AGREEMENT ── -->
    <div style="display: block; page-break-before: always; break-before: page; border: 1px solid #ddd; padding: 40px; background: #fff; max-width: 850px; margin: 40px auto; min-height: 1000px; position: relative; font-size: 11px;">
        <div style="text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 20px;">
            <h1 style="font-size: 16px; font-weight: 900; color: #1e3a8a; margin: 0; text-transform: uppercase;">Page ${tnCPage} : Terms & Conditions of Sale & Service</h1>
            <div style="font-size: 10px; color: #666; margin-top: 5px;">Linked to Quotation No: <b>${q.quote_number}</b> | Date: <b>${fmtDate(q.quote_date)}</b></div>
        </div>

        <p style="margin-bottom: 15px; line-height: 1.6;">
            This Agreement is executed between <b>${sellerName}</b> (the <b>"Seller"</b>) 
            and <b>${billing.company_name || ""}</b> (the <b>"Buyer"</b>). Both parties agree to the following terms regarding the supplies and services detailed in the referenced quotation.
        </p>

        <div style="color: #333; font-size: 11px;">
            ${tcFormattedList}
        </div>

        <div style="margin-top: 40px; border-top: 2px solid #1e3a8a; padding-top: 15px;">
            <b style="font-size: 12px; text-transform: uppercase; color:#1e3a8a;">Execution & Acceptance</b>
            <div style="display: flex; justify-content: space-between; margin-top: 15px; gap: 40px;">
                <div style="width: 48%;">
                    <div style="font-weight: 800; color: #1e3a8a; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 8px;">For ${sellerName}</div>
                    <div style="font-size: 10px; color: #555; line-height: 1.4;">
                        (Authorized Signatory & Stamp)<br/>
                        ${sellerAddress.line1 || ""}, ${sellerAddress.city || ""}, ${sellerAddress.state || ""} - ${sellerAddress.pincode || ""}<br/>
                        <b>GSTIN: ${sellerGST}</b>
                    </div>
                </div>
                <div style="width: 48%;">
                    <div style="font-weight: 800; color: #1e3a8a; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 8px;">For ${billing.company_name || ""}</div>
                    <div style="font-size: 10px; color: #555; line-height: 1.4;">
                        (Accepted By & Company Seal)<br/>
                        <b>Billing Address:</b> ${billing.line1 || ""}, ${billing.city || ""}, ${billing.state || ""} ${billing.pincode || ""}
                    </div>
                </div>
            </div>
        </div>

        <div style="margin-top: 40px; font-size: 10px; color: #444; font-weight: 700; border-top: 1px solid #eee; padding-top: 10px; text-align: center;">
            Note: Payment of the advance amount confirms that the Buyer has read, understood, and agreed to these terms in full.
        </div>

        <div style="position: absolute; bottom: 20px; width: 100%; text-align: center; left: 0; font-size: 9px; color: #aaa; font-weight: 800;">
            Page ${tnCPage} : Terms & Conditions of Sale & Service
        </div>
    </div>
</body>
</html>`;
}

type QuotePreviewModalProps = {
    quote: SavedQuote | null;
    seller?: any;
    lead?: any;
    currentUser?: any;
    onClose: () => void;
    onMarkSent: (q: SavedQuote) => void;
    sendingStatus: boolean;
};

export function QuotePreviewModal({ quote, seller, lead, currentUser, onClose, onMarkSent, sendingStatus }: QuotePreviewModalProps) {
    const [loadingAction, setLoadingAction] = useState<null | 'whatsapp' | 'email' | 'print'>(null);
    if (!quote) return null;
    const grand = quote.totals?.grand_total ?? 0;
    const statusColor = STATUS_COLOR[quote.status] ?? COLORS.muted;
    const isSent = quote.status === "Sent";
    const canMarkSent = ["Draft", "Revised"].includes(quote.status);

    const preparePDF = async (): Promise<string> => {
        const { printToFileAsync } = await import("expo-print");
        const { uri: tmpUri } = await printToFileAsync({ html: buildQuoteHTML(quote, seller, lead, currentUser), base64: false });
        // @ts-ignore
        const FSLeg: any = await import("expo-file-system/legacy");
        const copyFn = FSLeg.copyAsync ?? FSLeg.default?.copyAsync;
        const cacheDir = FSLeg.cacheDirectory ?? FSLeg.default?.cacheDirectory ?? "";
        const safeNo = String(quote.quote_number || "").replace(/\//g, "-");
        const dest = cacheDir + safeNo + ".pdf";
        await copyFn({ from: tmpUri, to: dest });
        return dest;
    };

    const handleAction = async (type: 'whatsapp' | 'email' | 'print') => {
        setLoadingAction(type);
        try {
            const pdfUri = await preparePDF();
            if (type === 'print') {
                const { printAsync } = await import("expo-print");
                await printAsync({ html: buildQuoteHTML(quote, seller, lead, currentUser) });
            } else {
                const Sharing = await import("expo-sharing");
                await Sharing.shareAsync(pdfUri, { mimeType: "application/pdf" });
            }
        } catch { appService.showToast("Action failed.", "Error"); }
        finally { setLoadingAction(null); }
    };

    return (
        <Modal visible={!!quote} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={styles.previewRoot}>
                <View style={styles.previewHeader}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}><Text style={styles.closeBtnTxt}>✕</Text></TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.previewTitle}>{quote.quote_number}</Text>
                        <Text style={styles.previewSub}>{fmtDate(quote.quote_date)}</Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: statusColor + "33", borderColor: statusColor, borderWidth: 1.5, marginRight: 4 }]}><Text style={[styles.statusPillTxt, { color: statusColor, fontWeight: "800" }]}>{isSent ? "✓ Sent" : quote.status}</Text></View>
                </View>
                <View style={{ flex: 1, backgroundColor: "#f1f5f9", padding: 12 }}>
                    <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff', elevation: 8 }}>
                        <WebView originWhitelist={['*']} source={{ html: buildQuoteHTML(quote, seller, lead, currentUser) }} style={{ flex: 1 }} scalesPageToFit={true} />
                    </View>
                </View>
                <View style={styles.previewActions}>
                    <View style={styles.previewActionRow}>
                        {['whatsapp', 'email', 'print'].map((type: any) => (
                            <TouchableOpacity key={type} style={styles.previewActionBtn} onPress={() => handleAction(type)} disabled={loadingAction !== null}>
                                {loadingAction === type ? <ActivityIndicator size="small" color={COLORS.pri} /> : <Text style={styles.previewActionIcon}>{type === 'whatsapp' ? '💬' : type === 'email' ? '📧' : '🖨️'}</Text>}
                                <Text style={styles.previewActionTxt}>{type === 'print' ? 'Print' : type.charAt(0).toUpperCase() + type.slice(1)}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    {canMarkSent && (
                        <TouchableOpacity style={[styles.markSentBtn, sendingStatus && { opacity: 0.5 }]} onPress={() => onMarkSent(quote)} disabled={sendingStatus}>
                            {sendingStatus ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.markSentTxt}>✅  Mark as Sent</Text>}
                        </TouchableOpacity>
                    )}
                </View>
            </SafeAreaView>
        </Modal>
    );
}


