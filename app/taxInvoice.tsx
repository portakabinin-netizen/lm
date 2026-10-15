import * as Print from "expo-print";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
    useColorScheme,
    View,
} from "react-native";
import { StatePicker } from "@/UtilServices/StatePicker";
import { DistrictPicker } from "@/UtilServices/DistrictPicker";
import { getStateCodeByName } from "@/UtilServices/gstConstants";
import { SafeAreaView } from "react-native-safe-area-context";

import { appService } from "@/UtilServices/appHelper";
import { useUserContext } from "@/context/AuthContext";
import { usePIPOTI } from "@/hooks/PI-PO-TI";
import { getInvoiceHTML } from "./ti";
import { AppHeader } from "@/components/AppHeader";

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
};

type SavedInvoice = {
    _id: string;
    invoice_number: string;
    invoice_date: string;
    due_date?: string;
    financial_year: string;
    status: string;
    leadId: string;
    totals?: { grand_total: number };
    buyer: {
        billing_address: {
            company_name?: string;
            mobile?: string;
            email?: string;
            city?: string;
            state?: string;
            gstin?: string;
        };
    };
    items: any[];
};

type LineItem = {
    description: string;
    hsn_sac: string;
    quantity: string;
    unit: string;
    rate: string;
    discount_percent: string;
    gst_rate: string;       // total GST % — split equally as CGST/SGST
};

type CatalogProduct = {
    _id: string;
    productName: string;
    description: string;
    hsn_sac: string;       // product-level HSN/SAC (fallback to category)
    UoM: string;
    margin: number;
};

type CatalogCategory = {
    _id: string;
    categoryName: string;
    hsn_sac: string;       // category-level HSN/SAC (applies to all products)
    products: CatalogProduct[];
};

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
    place_of_supply: string;
    due_days: string;
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
    payment_terms: "",
    place_of_supply: "",
    due_days: "Due on Receipt",
    internal_notes: "",
};

const EMPTY_ITEM: LineItem = {
    description: "",
    hsn_sac: "",
    quantity: "1",
    unit: "PCS",
    rate: "",
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

function calcItem(it: LineItem) {
    const qty = parseFloat(it.quantity) || 0;
    const rate = parseFloat(it.rate) || 0;
    const disc = parseFloat(it.discount_percent) || 0;
    const gst = parseFloat(it.gst_rate) || 0;
    const gross = qty * rate;
    const taxable = gross * (1 - disc / 100);
    const gstAmt = taxable * (gst / 100);
    const total = taxable + gstAmt;
    return { taxable, gstAmt, total };
}

function calcTotals(items: LineItem[]) {
    let taxable = 0, gstTotal = 0, grand = 0;
    items.forEach(it => {
        const { taxable: t, gstAmt: g, total: tot } = calcItem(it);
        taxable += t;
        gstTotal += g;
        grand += tot;
    });
    return { taxable, gstTotal, grand };
}

const STATUS_COLOR: Record<string, string> = {
    Draft: "#6b6560",
    Issued: "#1a3c6b",
    Sent: "#2e7d32",
    Paid: "#1b5e20",
    "Partially Paid": "#e65100",
    Overdue: "#b71c1c",
    Cancelled: "#9e9e9e",
    Void: "#9e9e9e",
};

function currentFY() {
    const d = new Date();
    const y = d.getFullYear();
    return d.getMonth() >= 3 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
}

/* ════════════════════════════════════════════════════════
   COMPONENT
════════════════════════════════════════════════════════ */
export default function TaxInvoice() {
    const router = useRouter();
    const { user } = useUserContext();
    const token = user?.token ?? "";

    const piHook = usePIPOTI(token);
    const { seller, loading: sellerLoading, selectedLocation, locations, selectLocation } = piHook;
    const sellerRef = useRef(seller);
    sellerRef.current = seller;

    /* ── state ─────────────────────────────────────────── */
    const [leads, setLeads] = useState<Lead[]>([]);
    const [leadsLoading, setLeadsLoading] = useState(false);

    // invoices per lead: leadId → SavedInvoice[]
    const [invoicesMap, setInvoicesMap] = useState<Record<string, SavedInvoice[]>>({});
    const [invoicesLoading, setInvoicesLoading] = useState<Record<string, boolean>>({});

    // form sheet
    const [formVisible, setFormVisible] = useState(false);
    const [formLead, setFormLead] = useState<Lead | null>(null);
    const [editInvoice, setEditInvoice] = useState<SavedInvoice | null>(null);
    const [form, setForm] = useState<BuyerForm>(EMPTY_FORM);
    const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);
    const [saving, setSaving] = useState(false);

    // PDF action
    const [pdfLoading, setPdfLoading] = useState<string | null>(null);

    // catalogue
    const [catalogCategories, setCatalogCategories] = useState<CatalogCategory[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogPickerVisible, setCatalogPickerVisible] = useState(false);

    const [statePickerVisible, setStatePickerVisible] = useState(false);
    const [districtPickerVisible, setDistrictPickerVisible] = useState(false);
    const [posPickerVisible, setPosPickerVisible] = useState(false);

    // quote import picker
    const [quotePickerVisible, setQuotePickerVisible] = useState(false);
    const [quotesForLead, setQuotesForLead] = useState<any[]>([]);
    const [pendingLead, setPendingLead] = useState<Lead | null>(null);

    /* ── fetch Accepted leads ───────────────────────────── */
    const fetchLeads = useCallback(() => {
        if (!token) return;
        setLeadsLoading(true);
        appService.httpClient
            .get("/service/leads/status/Accepted", {
                headers: { Authorization: `Bearer ${token}` },
            })
            .then(res => {
                const data: Lead[] = res.data?.success ? res.data.data : [];
                data.sort((a, b) => (b.lead_no ?? 0) - (a.lead_no ?? 0));
                setLeads(data);
            })
            .catch(() => appService.showToast("Could not load leads", "Error"))
            .finally(() => setLeadsLoading(false));
    }, [token]);

    /* ── fetch invoices for one lead ────────────────────── */
    const fetchInvoicesForLead = useCallback((leadId: string) => {
        if (!token) return;
        setInvoicesLoading(prev => ({ ...prev, [leadId]: true }));
        
        const restrictedLocId = user?.locationId;
        const params: any = { leadId };
        if (user?.userRole !== "CorpAdmin" && restrictedLocId) {
            params.locationId = restrictedLocId;
        }

        appService.httpClient
            .get("finance/invoices", {
                headers: { Authorization: `Bearer ${token}` },
                params,
            })
            .then(res => {
                const data: SavedInvoice[] = res.data?.data ?? res.data ?? [];
                setInvoicesMap(prev => ({ ...prev, [leadId]: Array.isArray(data) ? data : [] }));
            })
            .catch(() => setInvoicesMap(prev => ({ ...prev, [leadId]: [] })))
            .finally(() => setInvoicesLoading(prev => ({ ...prev, [leadId]: false })));
    }, [token, user?.locationId, user?.userRole]);

    useEffect(() => { fetchLeads(); }, [fetchLeads]);

    /* ── fetch product catalogue ────────────────────── */
    const fetchCatalog = useCallback(() => {
        if (catalogCategories.length > 0 || catalogLoading) return;
        setCatalogLoading(true);
        appService.httpClient
            .get("/product/category", { headers: { Authorization: `Bearer ${token}` } })
            .then(res => setCatalogCategories(Array.isArray(res.data) ? res.data : []))
            .catch(() => appService.showToast("Could not load catalogue", "Error"))
            .finally(() => setCatalogLoading(false));
    }, [token, catalogCategories.length, catalogLoading]);

    /* ── open New Invoice form (called after quote selection) ─ */
    const openNewInvoiceDirect = useCallback((lead: Lead, preItems: LineItem[]) => {
        setFormLead(lead);
        setEditInvoice(null);
        setForm({
            ...EMPTY_FORM,
            company_name: lead.sender_name ?? "",
            mobile: lead.sender_mobile ?? "",
            email: lead.sender_email ?? "",
            city: lead.sender_city ?? "",
            state: lead.sender_state ?? "",
            place_of_supply: lead.sender_state ?? "",
        });
        setItems(preItems.length ? preItems : [{ ...EMPTY_ITEM, description: lead.product_name ?? "" }]);
        setFormVisible(true);
        fetchInvoicesForLead(lead._id);
        fetchCatalog();
    }, [fetchInvoicesForLead, fetchCatalog]);

    /* ── fetch existing quotes for a lead (for import) ──── */
    const fetchAndShowQuotePicker = useCallback((lead: Lead) => {
        const params: any = { leadId: lead._id };
        const restrictedLocId = user?.locationId;
        if (user?.userRole !== "CorpAdmin" && restrictedLocId) {
            params.locationId = restrictedLocId;
        }

        appService.httpClient
            .get("finance/quotations", {
                headers: { Authorization: `Bearer ${token}` },
                params,
            })
            .then(res => {
                const data = res.data?.data ?? res.data ?? [];
                setQuotesForLead(Array.isArray(data) ? data : []);
                setPendingLead(lead);
                setQuotePickerVisible(true);
            })
            .catch(() => {
                openNewInvoiceDirect(lead, []);
            });
    }, [token, user?.locationId, user?.userRole, openNewInvoiceDirect]);

    /* ── open New Invoice — check for existing quotes first ─ */
    const openNewInvoice = useCallback((lead: Lead) => {
        fetchAndShowQuotePicker(lead);
    }, [fetchAndShowQuotePicker]);

    /* ── open Edit Invoice form ─────────────────────────── */
    const openEditInvoice = useCallback((lead: Lead, inv: SavedInvoice) => {
        setFormLead(lead);
        setEditInvoice(inv);
        const b = inv.buyer?.billing_address ?? {};
        setForm({
            ...EMPTY_FORM,
            company_name: b.company_name ?? "",
            mobile: b.mobile ?? "",
            email: b.email ?? "",
            city: b.city ?? "",
            state: b.state ?? "",
            gstin: b.gstin ?? "",
            payment_terms: "Net 30 Days",
            place_of_supply: b.state ?? "",
        });
        // map saved items back to form shape
        const mappedItems: LineItem[] = (inv.items ?? []).map(it => ({
            description: it.description ?? "",
            hsn_sac: it.hsn_sac ?? "",
            quantity: String(it.quantity ?? 1),
            unit: it.unit ?? "PCS",
            rate: String(it.rate ?? ""),
            discount_percent: String(it.discount_percent ?? 0),
            gst_rate: String((it.cgst_rate + it.sgst_rate) * 2 || it.igst_rate || 18),
        }));
        setItems(mappedItems.length ? mappedItems : [{ ...EMPTY_ITEM }]);
        setFormVisible(true);
        fetchCatalog();
    }, [fetchCatalog]);

    /* ── save (create / update) ─────────────────────────── */
    const handleSave = useCallback(async () => {
        if (!formLead) return;
        if (!form.company_name.trim()) { appService.showToast("Company / Buyer name is required.", "Error"); return; }
        if (!items[0]?.description?.trim()) { appService.showToast("Add at least one line item.", "Error"); return; }

        setSaving(true);
        try {
            const due = new Date();
            due.setDate(due.getDate() + (parseInt(form.due_days, 10) || 30));

            // Decide GST type based on state
            const selState = seller?.address?.state?.trim().toLowerCase() || "";
            const buyState = form.state?.trim().toLowerCase() || "";
            const isSameState = selState === buyState;

            const lineItems = items.map((it, idx) => {
                const qty = parseFloat(it.quantity) || 0;
                const rate = parseFloat(it.rate) || 0;
                const disc = parseFloat(it.discount_percent) || 0;
                const gstTot = parseFloat(it.gst_rate) || 0;
                const taxable = qty * rate * (1 - disc / 100);
                const half = gstTot / 2;

                const cgst = isSameState ? taxable * (half / 100) : 0;
                const sgst = isSameState ? taxable * (half / 100) : 0;
                const igst = !isSameState ? taxable * (gstTot / 100) : 0;
                const total = taxable + cgst + sgst + igst;

                return {
                    sr_no: idx + 1,
                    description: it.description.trim(),
                    hsn_sac: it.hsn_sac.trim(),
                    quantity: qty,
                    unit: it.unit.trim() || "PCS",
                    rate,
                    discount_percent: disc,
                    taxable_amount: taxable,
                    cgst_rate: isSameState ? half : 0,
                    cgst_amount: cgst,
                    sgst_rate: isSameState ? half : 0,
                    sgst_amount: sgst,
                    igst_rate: !isSameState ? gstTot : 0,
                    igst_amount: igst,
                    total_amount: total,
                };
            });

            const totals = calcTotals(items);

            const totalTax = lineItems.reduce((acc, it) => acc + (it.cgst_amount + it.sgst_amount + it.igst_amount), 0);
            const totalTaxable = lineItems.reduce((acc, it) => acc + it.taxable_amount, 0);

            const payload = {
                leadId: formLead._id,
                locationId: selectedLocation?._id,
                corpAdminId: user?.corpAdminId ?? user?._id,
                seller: {
                    business_name: seller?.name ?? "",
                    tax_registrations: { gstin: selectedLocation?.gstin || seller?.gst || "", pan: seller?.pan ?? "" },
                    bank_details: (selectedLocation?.bankDetails || seller?.bank) ?? {},
                    authorized_signatory: seller?.signatory ?? {},
                },
                buyer: {
                    billing_address: {
                        company_name: form.company_name.trim(),
                        contact_person: form.contact_person.trim(),
                        mobile: form.mobile.trim(),
                        email: form.email.trim(),
                        city: form.city.trim(),
                        state: form.state.trim(),
                        pincode: form.pincode.trim(),
                        gstin: form.gstin.trim(),
                        pan: form.pan.trim(),
                        line1: form.line1.trim(),
                    },
                },
                items: lineItems,
                payment_terms: form.payment_terms.trim(),
                place_of_supply: form.place_of_supply.trim(),
                due_date: due.toISOString(),
                totals: {
                    taxable_amount: totalTaxable,
                    total_cgst: isSameState ? totalTax / 2 : 0,
                    total_sgst: isSameState ? totalTax / 2 : 0,
                    total_igst: !isSameState ? totalTax : 0,
                    total_tax: totalTax,
                    grand_total: totalTaxable + totalTax,
                },
            };

            if (editInvoice) {
                await appService.httpClient.put(`finance/invoices/${editInvoice._id}`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                appService.showToast("Invoice updated!", "Success");
            } else {
                await appService.httpClient.post("finance/invoices", payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                appService.showToast("Invoice created!", "Success");
            }

            setFormVisible(false);
            fetchInvoicesForLead(formLead._id);
        } catch (e: any) {
            appService.showToast(e?.response?.data?.message ?? e?.message ?? "Something went wrong", "Error");
        } finally {
            setSaving(false);
        }
    }, [formLead, form, items, editInvoice, token, user, seller, fetchInvoicesForLead]);

    /* ── generate PDF for a saved invoice ──────────────── */
    const handlePDF = useCallback(async (inv: SavedInvoice) => {
        setPdfLoading(inv._id);
        try {
            const pdfItems = (inv.items ?? []).map((it: any) => ({
                desc: it.description,
                qty: it.quantity,
                rate: it.rate,
                gst: (it.cgst_rate + it.sgst_rate) * 2,
                hsn: it.hsn_sac,
                unit: it.unit,
                disc: it.discount_percent,
            }));
            const ti = {
                invoiceNo: inv.invoice_number,
                date: inv.invoice_date,
                buyer: inv.buyer?.billing_address?.company_name ?? "—",
                mobile: inv.buyer?.billing_address?.mobile ?? "",
                buyerEmail: inv.buyer?.billing_address?.email ?? "",
                items: pdfItems,
            };
            let taxable = 0, gstTotal = 0;
            pdfItems.forEach((i: any) => {
                const disc = i.disc ?? 0;
                const gross = i.qty * i.rate;
                const ta = gross * (1 - disc / 100);
                taxable += ta;
                gstTotal += ta * (i.gst / 100);
            });
            const sellerInfo = seller ? {
                name: seller.name,
                tag: seller.tag,
                email: seller.email,
                address: seller.address?.line1 || "",
                city: seller.address?.city || "",
                state: seller.address?.state || "",
                pin: seller.address?.pincode || "",
                gst: seller.gst,
                pan: seller.pan,
                bank: seller.bank,
                signatory: seller.signatory,
            } : null;

            const html = getInvoiceHTML({ seller: sellerInfo, invoice: ti, totals: { taxable, gstTotal, grand: taxable + gstTotal } });
            const { uri } = await Print.printToFileAsync({ html, base64: false });
            await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: inv.invoice_number, UTI: "com.adobe.pdf" });
        } catch (e: any) {
            appService.showToast(e?.message, "Error");
        } finally {
            setPdfLoading(null);
        }
    }, []);

    /* ── guard ──────────────────────────────────────────── */
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
        <>
        <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>

            {/* ── HEADER ── */}
            <AppHeader 
                title="Tax Invoices" 
                onBackPress={() => router.back()} 
                rightAction={() => (
                    <TouchableOpacity style={styles.refreshBtn} onPress={fetchLeads} activeOpacity={0.7}>
                        <Text style={styles.refreshIcon}>↻</Text>
                    </TouchableOpacity>
                )}
            />

            {/* ── SECTION LABEL ── */}
            <View style={styles.sectionRow as any}>
                <Text style={styles.sectionTitle}>Accepted Leads</Text>
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
                    <Text style={styles.emptyText}>No accepted leads found.</Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
                    {leads.map(lead => {
                        const invoices = invoicesMap[lead._id] ?? [];
                        const iLoading = !!invoicesLoading[lead._id];
                        return (
                            <LeadCard
                                key={lead._id}
                                lead={lead}
                                invoices={invoices}
                                invoicesLoading={iLoading}
                                pdfLoading={pdfLoading}
                                onNewInvoice={() => openNewInvoice(lead)}
                                onEditInvoice={inv => openEditInvoice(lead, inv)}
                                onLoadInvoices={() => fetchInvoicesForLead(lead._id)}
                                onPDF={handlePDF}
                            />
                        );
                    })}
                </ScrollView>
            )}

            {/* ════════════════════════════════════════════════════
                INVOICE FORM SHEET
            ════════════════════════════════════════════════════ */}
            <Modal
                visible={formVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setFormVisible(false)}
            >
                <SafeAreaView style={styles.sheetRoot}>
                    <View style={styles.sheetHeader as any}>
                        <TouchableOpacity onPress={() => setFormVisible(false)} style={styles.closeBtn}>
                            <Text style={styles.closeBtnTxt}>✕</Text>
                        </TouchableOpacity>
                        <View style={styles.sheetHeaderCenter as any}>
                            <Text style={styles.sheetTitle}>{editInvoice ? "Edit Invoice" : "New Invoice"}</Text>
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
                                                        style={[styles.statusPill, { backgroundColor: active ? COLORS.pri : "#f1f5f9", borderColor: active ? COLORS.pri : COLORS.bdr, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1 }]}>
                                                        <Text style={{ fontSize: 10, fontWeight: "700", color: active ? "#fff" : COLORS.muted }}>{loc.locationName}</Text>
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
                                <LabeledInput label="Company / Buyer Name *" value={form.company_name} onChangeText={v => setForm(p => ({ ...p, company_name: v }))} placeholder="e.g. Acme Pvt Ltd" />
                                <LabeledInput label="Contact Person" value={form.contact_person} onChangeText={v => setForm(p => ({ ...p, contact_person: v }))} placeholder="e.g. Rajesh Kumar" />
                                <FormRow>
                                    <LabeledInput label="Mobile" value={form.mobile} onChangeText={v => setForm(p => ({ ...p, mobile: v }))} placeholder="9XXXXXXXXX" keyboardType="phone-pad" flex />
                                    <LabeledInput label="Email" value={form.email} onChangeText={v => setForm(p => ({ ...p, email: v }))} placeholder="buyer@email.com" keyboardType="email-address" flex />
                                </FormRow>
                                <LabeledInput label="Address" value={form.line1} onChangeText={v => setForm(p => ({ ...p, line1: v }))} placeholder="Street / Building" />
                                <FormRow>
                                    <TouchableOpacity 
                                        style={[styles.inputWrap, { flex: 1, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: COLORS.bdr, paddingVertical: 4 }]} 
                                        onPress={() => setDistrictPickerVisible(true)}
                                    >
                                        <Text style={{ fontSize: 10, color: COLORS.muted, marginBottom: 2 }}>City / District</Text>
                                        <Text style={{ fontSize: 14, color: form.city ? "#000" : COLORS.muted }}>
                                            {form.city || "Select City"}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={[styles.inputWrap, { flex: 1, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: COLORS.bdr, paddingVertical: 4 }]} 
                                        onPress={() => setStatePickerVisible(true)}
                                    >
                                        <Text style={{ fontSize: 10, color: COLORS.muted, marginBottom: 2 }}>State</Text>
                                        <Text style={{ fontSize: 14, color: form.state ? "#000" : COLORS.muted }}>
                                            {form.state || "Select State"}
                                        </Text>
                                    </TouchableOpacity>
                                    <LabeledInput label="Pincode" value={form.pincode} onChangeText={v => setForm(p => ({ ...p, pincode: v }))} placeholder="110001" keyboardType="number-pad" flex />
                                </FormRow>
                            </FormSection>

                            {/* ── Tax Details ── */}
                            <FormSection title="Tax Details">
                                <FormRow>
                                    <LabeledInput label="GSTIN" value={form.gstin} onChangeText={v => setForm(p => ({ ...p, gstin: v.toUpperCase() }))} placeholder="22AAAAA0000A1Z5" autoCapitalize="characters" flex />
                                    <LabeledInput label="PAN" value={form.pan} onChangeText={v => setForm(p => ({ ...p, pan: v.toUpperCase() }))} placeholder="AAAAA0000A" autoCapitalize="characters" flex />
                                </FormRow>
                                <FormRow>
                                    <TouchableOpacity 
                                        style={[styles.inputWrap, { flex: 1, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: COLORS.bdr, paddingVertical: 4 }]} 
                                        onPress={() => setPosPickerVisible(true)}
                                    >
                                        <Text style={{ fontSize: 10, color: COLORS.muted, marginBottom: 2 }}>Place of Supply</Text>
                                        <Text style={{ fontSize: 14, color: form.place_of_supply ? "#000" : COLORS.muted }}>
                                            {form.place_of_supply || "Select State"}
                                        </Text>
                                    </TouchableOpacity>
                                    <LabeledInput label="Payment Terms" value={form.payment_terms} onChangeText={v => setForm(p => ({ ...p, payment_terms: v }))} placeholder="Net 30 Days" flex />
                                    <LabeledInput label="Due In (days)" value={form.due_days} onChangeText={v => setForm(p => ({ ...p, due_days: v }))} placeholder="30" keyboardType="number-pad" flex />
                                </FormRow>
                            </FormSection>

                            {/* ── Line Items ── */}
                            <FormSection title={`Line Items  (${items.length})`}>
                                {items.map((it, idx) => (
                                    <ItemRow
                                        key={idx}
                                        item={it}
                                        index={idx}
                                        isLast={idx === items.length - 1}
                                        onChange={(field, val) =>
                                            setItems(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r))
                                        }
                                        onRemove={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                                    />
                                ))}
                                <View style={{ flexDirection: "row", gap: 8 }}>
                                    <TouchableOpacity
                                        style={styles.addItemBtn}
                                        onPress={() => setItems(prev => [...prev, { ...EMPTY_ITEM }])}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={styles.addItemBtnTxt}>＋ Manual</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.addItemBtn, { backgroundColor: COLORS.pri, borderColor: COLORS.pri, flex: 1.5 }]}
                                        onPress={() => setCatalogPickerVisible(true)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[styles.addItemBtnTxt, { color: "#fff" }]}>
                                            {catalogLoading ? "Loading…" : "📦 Catalogue"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </FormSection>

                            {/* ── Live Totals Preview ── */}
                            {items.some(it => it.rate) && (() => {
                                const { taxable, gstTotal, grand } = calcTotals(items);
                                return (
                                    <View style={styles.totalsPreview as any}>
                                        <TotalsRow label="Taxable" value={fmtAmount(taxable)} />
                                        <TotalsRow label="GST" value={fmtAmount(gstTotal)} />
                                        <View style={styles.grandPreviewRow as any}>
                                            <Text style={styles.grandPreviewLabel}>Grand Total</Text>
                                            <Text style={styles.grandPreviewValue}>{fmtAmount(grand)}</Text>
                                        </View>
                                    </View>
                                );
                            })()}
                        </ScrollView>
                    </KeyboardAvoidingView>
                </SafeAreaView>
            </Modal>

        </SafeAreaView>

        {/* ── QUOTE IMPORT PICKER ── */}
        <Modal
            visible={quotePickerVisible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setQuotePickerVisible(false)}
        >
            <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
                <View style={styles.sheetHeader}>
                    <TouchableOpacity style={styles.closeBtn} onPress={() => setQuotePickerVisible(false)}>
                        <Text style={styles.closeBtnTxt}>✕</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.sheetTitle}>Import from Quote?</Text>
                        <Text style={styles.sheetSubtitle}>Pick a quote to pre-fill items, or skip</Text>
                    </View>
                </View>
                <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
                    <TouchableOpacity
                        style={[styles.addItemBtn, { marginBottom: 8 }]}
                        onPress={() => {
                            setQuotePickerVisible(false);
                            if (pendingLead) openNewInvoiceDirect(pendingLead, []);
                        }}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.addItemBtnTxt}>Skip — start blank</Text>
                    </TouchableOpacity>

                    {quotesForLead.length === 0 ? (
                        <Text style={{ color: COLORS.muted, textAlign: "center", marginTop: 20 }}>No quotes found.</Text>
                    ) : (
                        quotesForLead.map((q: any) => (
                            <TouchableOpacity
                                key={q._id}
                                style={{ backgroundColor: COLORS.srf, borderRadius: 10, borderWidth: 1, borderColor: COLORS.bdr, padding: 14, marginBottom: 8 }}
                                onPress={() => {
                                    setQuotePickerVisible(false);
                                    if (!pendingLead) return;
                                    const preItems: LineItem[] = (q.items ?? []).map((it: any) => ({
                                        description: it.description ?? "",
                                        hsn_sac: it.hsn_sac ?? "",
                                        quantity: String(it.quantity ?? 1),
                                        unit: it.unit ?? "PCS",
                                        rate: String(it.rate ?? ""),
                                        discount_percent: String(it.discount_percent ?? 0),
                                        gst_rate: String((it.cgst_rate ?? 0) * 2 || 18),
                                    }));
                                    openNewInvoiceDirect(pendingLead, preItems);
                                }}
                                activeOpacity={0.8}
                            >
                                <Text style={{ fontSize: 14, fontWeight: "700", color: COLORS.pri }}>{q.quote_number}</Text>
                                <Text style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                                    {q.buyer?.billing_address?.company_name ?? ""} · {q.items?.length ?? 0} item(s) · {q.status}
                                </Text>
                            </TouchableOpacity>
                        ))
                    )}
                </ScrollView>
            </SafeAreaView>
        </Modal>

        {/* ── CATALOGUE PICKER ── */}
        <TaxInvoiceCatalogPicker
            visible={catalogPickerVisible}
            categories={catalogCategories}
            onClose={() => setCatalogPickerVisible(false)}
            onAddItems={(picked: LineItem[]) =>
                setItems(prev => [...prev.filter(it => it.description.trim()), ...picked])
            }
        />

        <StatePicker
            visible={statePickerVisible}
            onClose={() => setStatePickerVisible(false)}
            onSelect={(name) => setForm(p => ({ ...p, state: name, city: "", place_of_supply: name }))}
            title="Select State"
        />
        <DistrictPicker
            visible={districtPickerVisible}
            onClose={() => setDistrictPickerVisible(false)}
            onSelect={(name) => setForm(p => ({ ...p, city: name }))}
            stateCode={getStateCodeByName(form.state)}
        />
        <StatePicker
            visible={posPickerVisible}
            onClose={() => setPosPickerVisible(false)}
            onSelect={(name) => setForm(p => ({ ...p, place_of_supply: name }))}
            title="Select Place of Supply"
        />

        </>
    );
}

/* ════════════════════════════════════════════════════════
   LEAD CARD  (with inline invoices list)
════════════════════════════════════════════════════════ */
type LeadCardProps = {
    lead: Lead;
    invoices: SavedInvoice[];
    invoicesLoading: boolean;
    pdfLoading: string | null;
    onNewInvoice: () => void;
    onEditInvoice: (inv: SavedInvoice) => void;
    onLoadInvoices: () => void;
    onPDF: (inv: SavedInvoice) => void;
};

function LeadCard({ lead, invoices, invoicesLoading, pdfLoading, onNewInvoice, onEditInvoice, onLoadInvoices, onPDF }: LeadCardProps) {
    const [expanded, setExpanded] = useState(false);

    const toggle = () => {
        if (!expanded) onLoadInvoices();
        setExpanded(e => !e);
    };

    return (
        <View style={styles.leadCard as any}>
            {/* top: lead info */}
            <TouchableOpacity style={styles.leadCardTop} onPress={toggle} activeOpacity={0.8}>
                <View style={styles.cardAccent as any} />
                <View style={styles.leadCardBody as any}>
                    <View style={styles.leadCardRow1 as any}>
                        <Text style={styles.leadNo}>LEAD-{lead.lead_no}</Text>
                        <Text style={styles.leadDate}>{fmtDate(lead.createdAt)}</Text>
                    </View>
                    <Text style={styles.leadName} numberOfLines={1}>{lead.sender_name}</Text>
                    <Text style={styles.leadMeta}>
                        {[lead.product_name, lead.sender_city, lead.sender_state].filter(Boolean).join("  ·  ")}
                    </Text>
                </View>
                <View style={styles.cardRight}>
                    {invoices.length > 0 && (
                        <View style={styles.invCountBadge}>
                            <Text style={styles.invCountTxt}>{invoices.length}</Text>
                        </View>
                    )}
                    <Text style={[styles.expandChevron, expanded && { transform: [{ rotate: "90deg" }] }]}>›</Text>
                </View>
            </TouchableOpacity>

            {/* action row */}
            <View style={styles.cardActions}>
                <TouchableOpacity style={styles.newInvBtn} onPress={onNewInvoice} activeOpacity={0.8}>
                    <Text style={styles.newInvBtnTxt}>＋ New Invoice</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.viewInvBtn} onPress={toggle} activeOpacity={0.8}>
                    <Text style={styles.viewInvBtnTxt}>
                        {expanded ? "▲ Hide" : `🧾 Invoices (${invoices.length})`}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* expanded invoices */}
            {expanded && (
                <View style={styles.invContainer}>
                    {invoicesLoading ? (
                        <View style={styles.invLoadRow}>
                            <ActivityIndicator size="small" color={COLORS.pri} />
                            <Text style={styles.invLoadTxt}>Loading invoices…</Text>
                        </View>
                    ) : invoices.length === 0 ? (
                        <Text style={styles.noInvTxt}>No invoices created yet for this lead.</Text>
                    ) : (
                        invoices.map(inv => (
                            <InvoiceRow
                                key={inv._id}
                                invoice={inv}
                                pdfLoading={pdfLoading === inv._id}
                                onEdit={() => onEditInvoice(inv)}
                                onPDF={() => onPDF(inv)}
                            />
                        ))
                    )}
                </View>
            )}
        </View>
    );
}

/* ════════════════════════════════════════════════════════
   INVOICE ROW  (inside expanded lead card)
════════════════════════════════════════════════════════ */
function InvoiceRow({ invoice, pdfLoading, onEdit, onPDF }: {
    invoice: SavedInvoice;
    pdfLoading: boolean;
    onEdit: () => void;
    onPDF: () => void;
}) {
    const statusColor = STATUS_COLOR[invoice.status] ?? COLORS.muted;
    const grand = invoice.totals?.grand_total ?? 0;
    const buyer = invoice.buyer?.billing_address?.company_name ?? "—";
    return (
        <View style={styles.invRow}>
            <View style={styles.invRowLeft}>
                <Text style={styles.invNo}>{invoice.invoice_number}</Text>
                <Text style={styles.invBuyer} numberOfLines={1}>{buyer}</Text>
                <Text style={styles.invMeta}>📅 {fmtDate(invoice.invoice_date)}  ·  FY {invoice.financial_year}</Text>
            </View>
            <View style={styles.invRowRight}>
                <Text style={styles.invAmount}>{grand > 0 ? fmtAmount(grand) : "—"}</Text>
                <View style={[styles.statusPill, { backgroundColor: statusColor + "22", borderColor: statusColor }]}>
                    <Text style={[styles.statusPillTxt, { color: statusColor }]}>{invoice.status}</Text>
                </View>
                <View style={styles.invActionRow}>
                    <TouchableOpacity style={styles.editInvBtn} onPress={onEdit} activeOpacity={0.8}>
                        <Text style={styles.editInvTxt}>✏ Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.pdfBtn} onPress={onPDF} disabled={pdfLoading} activeOpacity={0.8}>
                        {pdfLoading
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={styles.pdfBtnTxt}>📄 PDF</Text>
                        }
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

/* ════════════════════════════════════════════════════════
   ITEM ROW  (inside form sheet)
════════════════════════════════════════════════════════ */
type ItemRowProps = {
    item: LineItem;
    index: number;
    isLast: boolean;
    onChange: (field: keyof LineItem, val: string) => void;
    onRemove: () => void;
};

function ItemRow({ item, index, isLast, onChange, onRemove }: ItemRowProps) {
    const { taxable, gstAmt, total } = calcItem(item);
    return (
        <View style={[styles.itemRowWrap, !isLast && styles.itemRowBorder]}>
            <View style={styles.itemRowHeader}>
                <Text style={styles.itemRowNum}>Item {index + 1}</Text>
                <TouchableOpacity onPress={onRemove} style={styles.removeItemBtn}>
                    <Text style={styles.removeItemTxt}>✕ Remove</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.itemRowBody}>
                <LabeledInput label="Description *" value={item.description} onChangeText={v => onChange("description", v)} placeholder="Product / Service name" />
                <FormRow>
                    <LabeledInput label="HSN / SAC" value={item.hsn_sac} onChangeText={v => onChange("hsn_sac", v)} placeholder="8471" flex />
                    <LabeledInput label="Unit" value={item.unit} onChangeText={v => onChange("unit", v)} placeholder="PCS" flex />
                </FormRow>
                <FormRow>
                    <LabeledInput label="Qty" value={item.quantity} onChangeText={v => onChange("quantity", v)} keyboardType="number-pad" placeholder="1" flex />
                    <LabeledInput label="Rate (₹)" value={item.rate} onChangeText={v => onChange("rate", v)} keyboardType="number-pad" placeholder="0.00" flex />
                    <LabeledInput label="Disc %" value={item.discount_percent} onChangeText={v => onChange("discount_percent", v)} keyboardType="number-pad" placeholder="0" flex />
                    <LabeledInput label="GST %" value={item.gst_rate} onChangeText={v => onChange("gst_rate", v)} keyboardType="number-pad" placeholder="18" flex />
                </FormRow>
                {item.rate ? (
                    <View style={styles.itemCalcRow}>
                        <Text style={styles.itemCalcTxt}>Taxable: {fmtAmount(taxable)}</Text>
                        <Text style={styles.itemCalcTxt}>+GST: {fmtAmount(gstAmt)}</Text>
                        <Text style={[styles.itemCalcTxt, { color: COLORS.pri, fontWeight: "700" }]}>= {fmtAmount(total)}</Text>
                    </View>
                ) : null}
            </View>
        </View>
    );
}

/* ════════════════════════════════════════════════════════
   FORM UTILS
════════════════════════════════════════════════════════ */
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={styles.formSection}>
            <Text style={styles.formSectionTitle}>{title}</Text>
            {children}
        </View>
    );
}

function FormRow({ children }: { children: React.ReactNode }) {
    return <View style={styles.formRow}>{children}</View>;
}

type LabeledInputProps = {
    label: string; value: string; onChangeText: (v: string) => void;
    placeholder?: string; keyboardType?: any; autoCapitalize?: any;
    multiline?: boolean; numberOfLines?: number; flex?: boolean;
};

function LabeledInput({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize, multiline, numberOfLines, flex }: LabeledInputProps) {
    return (
        <View style={[styles.inputWrap, flex && { flex: 1 }]}>
            <Text style={styles.inputLabel}>{label}</Text>
            <TextInput
                style={[styles.input, multiline && styles.inputMulti]}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={COLORS.muted + "88"}
                keyboardType={keyboardType ?? "default"}
                autoCapitalize={autoCapitalize ?? "words"}
                multiline={multiline}
                numberOfLines={numberOfLines}
                blurOnSubmit={false}
            />
        </View>
    );
}

function TotalsRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{label}</Text>
            <Text style={styles.totalsValue}>{value}</Text>
        </View>
    );
}

function sellFromBuy(buyRate: string, marginPct: string): string {
    const b = parseFloat(buyRate) || 0;
    const m = parseFloat(marginPct) || 0;
    if (!b) return "";
    return (b * (1 + m / 100)).toFixed(2);
}

/* ════════════════════════════════════════════════════════
   COLORS + STYLES
════════════════════════════════════════════════════════ */
const COLORS = {
    pri: "#1a3c6b",
    acc: "#c8973a",
    accl: "#f0d9a8",
    bg: "#f5f3ef",
    srf: "#ffffff",
    bdr: "#d4cfc6",
    muted: "#6b6560",
    txt: "#1a1a1a",
    green: "#1b5e20",
};

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
    refreshIcon: { color: "#fff", fontSize: 22 },

    /* ── Section label ── */
    sectionRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 8,
    },
    sectionTitle: { fontSize: 12, fontWeight: "700", color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.8 },
    countBadge: { backgroundColor: COLORS.pri, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
    countBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },

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
    leadCardTop: { flexDirection: "row", alignItems: "center" },
    cardAccent: { width: 4, alignSelf: "stretch", backgroundColor: COLORS.pri },
    leadCardBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 12 },
    leadCardRow1: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
    leadNo: { fontSize: 12, fontWeight: "700", color: COLORS.pri, fontFamily: "monospace" },
    leadDate: { fontSize: 11, color: COLORS.muted },
    leadName: { fontSize: 15, fontWeight: "700", color: COLORS.txt, marginBottom: 2 },
    leadMeta: { fontSize: 11, color: COLORS.muted },
    cardRight: { flexDirection: "row", alignItems: "center", paddingRight: 12, gap: 6 },
    invCountBadge: { backgroundColor: COLORS.acc, borderRadius: 10, minWidth: 20, height: 20, justifyContent: "center", alignItems: "center", paddingHorizontal: 5 },
    invCountTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
    expandChevron: { fontSize: 22, color: COLORS.bdr },

    cardActions: {
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: COLORS.bdr,
        backgroundColor: "#faf8f4",
    },
    newInvBtn: { flex: 1, backgroundColor: COLORS.pri, borderRadius: 8, paddingVertical: 9, alignItems: "center" },
    newInvBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },
    viewInvBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.bdr, borderRadius: 8, paddingVertical: 9, alignItems: "center", backgroundColor: COLORS.srf },
    viewInvBtnTxt: { color: COLORS.txt, fontSize: 12, fontWeight: "600" },

    /* ── Invoice rows ── */
    invContainer: { borderTopWidth: 1, borderTopColor: COLORS.bdr },
    invLoadRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14 },
    invLoadTxt: { color: COLORS.muted, fontSize: 12 },
    noInvTxt: { padding: 14, color: COLORS.muted, fontSize: 12, textAlign: "center" },

    invRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.bdr,
        gap: 8,
    },
    invRowLeft: { flex: 1 },
    invRowRight: { alignItems: "flex-end", gap: 4 },
    invNo: { fontSize: 13, fontWeight: "700", color: COLORS.txt, fontFamily: "monospace", marginBottom: 2 },
    invBuyer: { fontSize: 12, color: COLORS.muted, marginBottom: 2 },
    invMeta: { fontSize: 10, color: COLORS.muted },
    invAmount: { fontSize: 13, fontWeight: "700", color: COLORS.pri },
    statusPill: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    statusPillTxt: { fontSize: 10, fontWeight: "700" },
    invActionRow: { flexDirection: "row", gap: 6, marginTop: 2 },
    editInvBtn: { backgroundColor: COLORS.acc, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
    editInvTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
    pdfBtn: { backgroundColor: COLORS.pri, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
    pdfBtnTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },

    /* ── Form sheet ── */
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
    saveBtn: { backgroundColor: COLORS.acc, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, minWidth: 60, alignItems: "center" },
    saveBtnTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },

    formContent: { padding: 14, paddingBottom: 40 },
    formSection: { backgroundColor: COLORS.srf, borderRadius: 10, borderWidth: 1, borderColor: COLORS.bdr, marginBottom: 14, overflow: "hidden" },
    formSectionTitle: { fontSize: 11, fontWeight: "700", color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#faf8f4", borderBottomWidth: 1, borderBottomColor: COLORS.bdr },
    formRow: { flexDirection: "row", gap: 0 },
    inputWrap: { padding: 12, paddingBottom: 10 },
    inputLabel: { fontSize: 11, color: COLORS.muted, fontWeight: "600", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.3 },
    input: { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.bdr, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: COLORS.txt },
    inputMulti: { height: 80, textAlignVertical: "top" },

    /* item rows */
    itemRowWrap: { paddingHorizontal: 0, backgroundColor: COLORS.srf },
    itemRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.bdr },
    itemRowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingTop: 10 },
    itemRowNum: { fontSize: 12, fontWeight: "700", color: COLORS.muted, textTransform: "uppercase" },
    removeItemBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    removeItemTxt: { fontSize: 11, color: "#b71c1c", fontWeight: "600" },
    itemRowBody: {},
    itemCalcRow: { flexDirection: "row", justifyContent: "flex-end", gap: 12, paddingHorizontal: 12, paddingBottom: 10 },
    itemCalcTxt: { fontSize: 11, color: COLORS.muted },

    addItemBtn: { margin: 12, borderWidth: 1.5, borderColor: COLORS.pri, borderStyle: "dashed", borderRadius: 8, paddingVertical: 11, alignItems: "center" },
    addItemBtnTxt: { color: COLORS.pri, fontSize: 14, fontWeight: "700" },

    /* totals preview */
    totalsPreview: { backgroundColor: COLORS.srf, borderRadius: 10, borderWidth: 1, borderColor: COLORS.bdr, overflow: "hidden", marginBottom: 14 },
    totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.bdr },
    totalsLabel: { fontSize: 12, color: COLORS.muted },
    totalsValue: { fontSize: 12, color: COLORS.txt, fontWeight: "600", fontFamily: "monospace" },
    grandPreviewRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, backgroundColor: COLORS.pri },
    grandPreviewLabel: { fontSize: 14, color: "#fff", fontWeight: "700" },
    grandPreviewValue: { fontSize: 15, color: COLORS.accl, fontWeight: "700", fontFamily: "monospace" },
});

/* ════════════════════════════════════════════════════════
   CATALOGUE PICKER MODAL  (for Tax Invoice)
════════════════════════════════════════════════════════ */
type TaxInvoiceCatalogPickerProps = {
    visible:    boolean;
    categories: CatalogCategory[];
    onClose:    () => void;
    onAddItems: (items: LineItem[]) => void;
};

function TaxInvoiceCatalogPicker({ visible, categories, onClose, onAddItems }: TaxInvoiceCatalogPickerProps) {
    const [checked, setChecked] = useState<Record<string, {
        selected: boolean; buy_rate: string; margin_pct: string; rate: string;
    }>>({});
    const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

    const toggleCat = (id: string) =>
        setExpandedCats(p => ({ ...p, [id]: !p[id] }));

    const toggleProduct = (prod: CatalogProduct) => {
        setChecked(p => {
            const cur = p[prod._id];
            if (cur) return { ...p, [prod._id]: { ...cur, selected: !cur.selected } };
            return { ...p, [prod._id]: { selected: true, buy_rate: "", margin_pct: String(prod.margin ?? 15), rate: "" } };
        });
    };

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

    const handleAdd = () => {
        const newItems: LineItem[] = [];
        categories.forEach(cat =>
            cat.products.forEach(prod => {
                const c = checked[prod._id];
                if (!c?.selected) return;
                newItems.push({
                    description:      prod.productName,
                    hsn_sac:          prod.hsn_sac || cat.hsn_sac || "",
                    unit:             prod.UoM || "PCS",
                    quantity:         "1",
                    rate:             c.rate || sellFromBuy(c.buy_rate, c.margin_pct),
                    discount_percent: "0",
                    gst_rate:         "18",
                });
            })
        );
        if (!newItems.length) { onClose(); return; }
        onAddItems(newItems);
        setChecked({});
        onClose();
    };

    const selectedCount = Object.values(checked).filter(c => c.selected).length;

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
                {/* header */}
                <View style={[styles.sheetHeader]}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Text style={styles.closeBtnTxt}>✕</Text>
                    </TouchableOpacity>
                    <Text style={[styles.sheetTitle, { flex: 1 }]}>Select Products</Text>
                    <TouchableOpacity
                        style={[{ backgroundColor: COLORS.acc, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }, !selectedCount && { opacity: 0.4 }]}
                        onPress={handleAdd}
                        disabled={!selectedCount}
                    >
                        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Add{selectedCount > 0 ? ` (${selectedCount})` : ""}</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                    {categories.length === 0 ? (
                        <View style={styles.center}><Text style={{ color: COLORS.muted }}>No products in catalogue.</Text></View>
                    ) : (
                        categories.map(cat => (
                            <View key={cat._id} style={{ marginHorizontal: 12, marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.bdr, overflow: "hidden", backgroundColor: COLORS.srf }}>
                                <TouchableOpacity
                                    style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#f2efe9", gap: 8 }}
                                    onPress={() => toggleCat(cat._id)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: COLORS.pri }}>{cat.categoryName}</Text>
                                    <Text style={{ fontSize: 11, color: COLORS.muted }}>{cat.products.length} items</Text>
                                    <Text style={[{ fontSize: 20, color: COLORS.bdr }, expandedCats[cat._id] && { transform: [{ rotate: "90deg" }] }]}>›</Text>
                                </TouchableOpacity>

                                {expandedCats[cat._id] && cat.products.map(prod => {
                                    const c = checked[prod._id];
                                    const sel = !!c?.selected;
                                    return (
                                        <View key={prod._id} style={[{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.bdr, gap: 10 }, sel && { backgroundColor: COLORS.accl + "55" }]}>
                                            <TouchableOpacity
                                                style={[{ width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: COLORS.bdr, alignItems: "center", justifyContent: "center", marginTop: 2 }, sel && { backgroundColor: COLORS.pri, borderColor: COLORS.pri }]}
                                                onPress={() => toggleProduct(prod)}
                                            >
                                                {sel && <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>✓</Text>}
                                            </TouchableOpacity>

                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.txt }}>{prod.productName}</Text>
                                                <Text style={{ fontSize: 11, color: COLORS.muted }} numberOfLines={1}>{prod.description}</Text>
                                                <Text style={{ fontSize: 10, color: COLORS.muted }}>{prod.UoM} · Margin {c?.margin_pct ?? prod.margin}%</Text>

                                                {sel && (
                                                    <View style={{ flexDirection: "row", gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.bdr }}>
                                                        {["buy_rate", "margin_pct", "rate"].map(field => (
                                                            <View key={field} style={{ flex: 1 }}>
                                                                <Text style={{ fontSize: 9, fontWeight: "700", color: field === "rate" ? COLORS.green : COLORS.muted, textTransform: "uppercase", marginBottom: 3 }}>
                                                                    {field === "buy_rate" ? "Buy ₹" : field === "margin_pct" ? "Margin %" : "Sell ₹"}
                                                                </Text>
                                                                <TextInput
                                                                    style={[{ backgroundColor: COLORS.bg, borderWidth: 1, borderColor: field === "rate" ? COLORS.green : COLORS.bdr, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 5, fontSize: 12, color: COLORS.txt, textAlign: "right" }]}
                                                                    value={c?.[field as "buy_rate" | "margin_pct" | "rate"] ?? ""}
                                                                    onChangeText={v => updateRate(prod._id, field as "buy_rate" | "margin_pct" | "rate", v)}
                                                                    keyboardType="decimal-pad"
                                                                    placeholder="0"
                                                                    placeholderTextColor={COLORS.muted + "66"}
                                                                />
                                                            </View>
                                                        ))}
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        ))
                    )}
                </ScrollView>
            </SafeAreaView>
        </Modal>
    );
}
