import { AppHeader } from "@/components/AppHeader";
import { appService } from "@/UtilServices/appHelper";
import { Picker } from "@react-native-picker/picker";
import * as Print from "expo-print";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { COLORS } from "@/styles/stylesIndex";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Vendor } from "@/hooks/interface";
import { usePIPOTI } from "@/hooks/PI-PO-TI";
import { useUserContext } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";

export default function PurchaseOrder() {
  const router = useRouter();
  const { user } = useUserContext();
  const token = user?.token ?? "";
  const { seller, locations, selectedLocation, selectLocation } = usePIPOTI(token);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      const res = await appService.httpClient.get(`/service/parties/suppliers`);
      const list = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.vendors || []);
      setVendors(Array.isArray(list) ? list : []);
    } catch (err) {
      console.log("Vendor load error:", err);
    }
  };

  const loadVendorProducts = async (vendorId: string) => {
    if (!vendorId) {
      setSelectedVendor(null);
      return;
    }
    setVendorLoading(true);
    try {
      const res = await appService.httpClient.get(`/product/rate/vendor/${vendorId}`);
      setSelectedVendor(res.data);
      // Auto-expand all categories by default for fast ordering
      if (res.data?.productCost?.length) {
        setExpandedCategories(res.data.productCost.map((c: any) => c.categoryName));
        const allKeys: string[] = [];
        res.data.productCost.forEach((c: any) => {
          c.products?.forEach((p: any) => {
            allKeys.push(`${c.categoryName}-${p.productName}`);
          });
        });
        setExpandedProducts(allKeys);
      }
    } catch (err: any) {
      console.log("Product Load Error:", err.response?.data || err);
      setSelectedVendor(null);
    } finally {
      setVendorLoading(false);
    }
  };

  const toggleCategory = (catName: string) => {
    setExpandedCategories((prev) =>
      prev.includes(catName) ? prev.filter((c) => c !== catName) : [...prev, catName]
    );
  };

  const toggleProductName = (catName: string, prodName: string) => {
    const key = `${catName}-${prodName}`;
    setExpandedProducts((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleProduct = (catIndex: number, prodIndex: number) => {
    if (!selectedVendor) return;
    const newVendor = { ...selectedVendor };
    const product = newVendor.productCost[catIndex].products[prodIndex] as any;
    product.checked = !product.checked;
    setSelectedVendor(newVendor);
  };

  const updateQty = (catIndex: number, prodIndex: number, qty: string) => {
    if (!selectedVendor) return;
    const newVendor = { ...selectedVendor };
    const product = newVendor.productCost[catIndex].products[prodIndex] as any;
    product.qty = qty;
    if (Number(qty) > 0) product.checked = true;
    else product.checked = false;
    setSelectedVendor(newVendor);
  };

  const updateGstRate = (catIndex: number, prodIndex: number, rate: number) => {
    if (!selectedVendor) return;
    const newVendor = { ...selectedVendor };
    const product = newVendor.productCost[catIndex].products[prodIndex] as any;
    product.taxRate = rate;
    setSelectedVendor(newVendor);
  };

  // State comparison for GST calculation
  const sellerState = (selectedLocation?.address?.state || seller?.address?.state || "").trim().toLowerCase();
  const vendorState = (
    (selectedVendor as any)?.billingAddress?.state ||
    (selectedVendor as any)?.state ||
    ""
  ).trim().toLowerCase();
  
  const isSameState = Boolean(sellerState && vendorState && sellerState === vendorState);

  // Selected products calculation
  const orderBreakdown = useMemo(() => {
    if (!selectedVendor || !Array.isArray(selectedVendor.productCost)) {
      return {
        selectedItems: [],
        taxableSubtotal: 0,
        cgstTotal: 0,
        sgstTotal: 0,
        igstTotal: 0,
        totalTax: 0,
        grandTotal: 0,
      };
    }

    const selectedItems: any[] = [];
    let taxableSubtotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;

    selectedVendor.productCost.forEach((cat, ci) => {
      (cat.products || []).forEach((p: any, pi) => {
        if (p.checked && Number(p.qty) > 0) {
          const qty = Number(p.qty);
          const rate = Number(p.price || 0);
          const taxable = qty * rate;
          const taxPct = Number(p.taxRate ?? 18);
          const taxAmount = (taxable * taxPct) / 100;

          let cgstAmt = 0;
          let sgstAmt = 0;
          let igstAmt = 0;

          if (isSameState) {
            cgstAmt = taxAmount / 2;
            sgstAmt = taxAmount / 2;
          } else {
            igstAmt = taxAmount;
          }

          taxableSubtotal += taxable;
          cgstTotal += cgstAmt;
          sgstTotal += sgstAmt;
          igstTotal += igstAmt;

          selectedItems.push({
            ...p,
            catIndex: ci,
            prodIndex: pi,
            qty,
            rate,
            taxable,
            taxPct,
            taxAmount,
            cgstAmt,
            sgstAmt,
            igstAmt,
            total: taxable + taxAmount,
          });
        }
      });
    });

    const totalTax = cgstTotal + sgstTotal + igstTotal;
    const grandTotal = taxableSubtotal + totalTax;

    return {
      selectedItems,
      taxableSubtotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      totalTax,
      grandTotal,
    };
  }, [selectedVendor, isSameState]);

  const handleSavePO = async () => {
    if (!selectedVendor || !selectedLocation) {
      alert("Vendor and Location are required!");
      return null;
    }
    if (orderBreakdown.selectedItems.length === 0) {
      alert("Please select at least 1 product with quantity!");
      return null;
    }

    setSaving(true);
    try {
      const lineItems = orderBreakdown.selectedItems.map((it: any, i: number) => ({
        sr_no: i + 1,
        description: it.description,
        hsn_sac: it.hsn_sac || "",
        quantity: it.qty,
        unit: it.UoM || "PCS",
        rate: it.rate,
        discount_percent: 0,
        taxable_amount: it.taxable,
        cgst_rate: isSameState ? it.taxPct / 2 : 0,
        cgst_amount: it.cgstAmt,
        sgst_rate: isSameState ? it.taxPct / 2 : 0,
        sgst_amount: it.sgstAmt,
        igst_rate: !isSameState ? it.taxPct : 0,
        igst_amount: it.igstAmt,
        total_amount: it.total,
      }));

      const payload = {
        locationId: selectedLocation._id,
        seller: {
          business_name: seller?.name || "",
          address: seller?.address || {},
          tax_registrations: { gstin: selectedLocation.gstin, pan: seller?.pan || "" },
        },
        buyer: {
          company_name: (selectedVendor as any).name || selectedVendor.vendorName || "",
          contact_person: (selectedVendor as any).contact_person || selectedVendor.contactPerson || "",
          mobile: (selectedVendor as any).mobile || selectedVendor.mobileNo || "",
          billing: {
            line1: (selectedVendor as any).billingAddress?.line1 || (selectedVendor as any).vendorAddress || "",
            city: (selectedVendor as any).billingAddress?.city || "",
            state: (selectedVendor as any).billingAddress?.state || "",
          },
          billing_address: {
            company_name: (selectedVendor as any).name || selectedVendor.vendorName || "",
            contact_person: (selectedVendor as any).contact_person || selectedVendor.contactPerson || "",
            mobile: (selectedVendor as any).mobile || selectedVendor.mobileNo || "",
            line1: (selectedVendor as any).billingAddress?.line1 || (selectedVendor as any).vendorAddress || "",
            city: (selectedVendor as any).billingAddress?.city || "",
            state: (selectedVendor as any).billingAddress?.state || "",
          },
        },
        items: lineItems,
        totals: {
          subtotal: orderBreakdown.taxableSubtotal,
          taxable_amount: orderBreakdown.taxableSubtotal,
          total_cgst: orderBreakdown.cgstTotal,
          total_sgst: orderBreakdown.sgstTotal,
          total_igst: orderBreakdown.igstTotal,
          total_tax: orderBreakdown.totalTax,
          grand_total: orderBreakdown.grandTotal,
        },
        status: "Issued",
      };

      const res = await appService.httpClient.post("finance/pos", payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const savedPO = res.data?.data;
      appService.showToast(`PO ${savedPO?.docNo || ""} saved successfully!`, "Success");
      return savedPO;
    } catch (err: any) {
      console.log("PO Save/PDF Error:", err);
      appService.showToast(err?.response?.data?.message || "Failed to save PO", "Error");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewAndSave = async () => {
    const savedPO = await handleSavePO();
    if (!savedPO) return;
    try {
      const html = buildPOHTML(savedPO);
      await Print.printAsync({ html });
    } catch (err) {
      console.log("Print preview error:", err);
    }
  };

  const handleSharePDF = async () => {
    const savedPO = await handleSavePO();
    if (!savedPO) return;
    try {
      const html = buildPOHTML(savedPO);
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { UTI: ".pdf", mimeType: "application/pdf" });
      } else {
        await Print.printAsync({ html });
      }
    } catch (err) {
      console.log("Share error:", err);
    }
  };

  const buildPOHTML = (po: any) => {
    const isInterState = po?.totals?.total_igst > 0;
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 32px; color: #1e293b; background: #fff; }
      .header { display: flex; justify-content: space-between; border-bottom: 3px solid #0284c7; padding-bottom: 16px; margin-bottom: 24px; }
      .seller-info h1 { font-size: 22px; margin: 0 0 6px 0; color: #0f172a; }
      .seller-info p, .po-info p { margin: 2px 0; font-size: 13px; color: #475569; }
      .po-info { text-align: right; }
      .po-title { font-size: 24px; font-weight: 800; color: #0284c7; margin: 0 0 4px 0; }
      .cards-container { display: flex; gap: 20px; margin-bottom: 24px; }
      .party-card { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
      .party-card h3 { margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; }
      .party-card p { margin: 3px 0; font-size: 13px; color: #1e293b; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
      th { background-color: #0f172a; color: #fff; font-weight: 600; text-align: left; padding: 10px 12px; }
      td { border-bottom: 1px solid #e2e8f0; padding: 10px 12px; }
      .text-right { text-align: right; }
      .text-center { text-align: center; }
      .summary-table { width: 340px; margin-left: auto; margin-top: 24px; border-collapse: collapse; font-size: 13px; }
      .summary-table td { padding: 6px 12px; }
      .summary-total { font-weight: 800; font-size: 16px; border-top: 2px solid #0f172a; color: #0284c7; }
      .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; }
      .badge-intra { background: #e0f2fe; color: #0369a1; }
      .badge-inter { background: #fef3c7; color: #b45309; }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="seller-info">
        <h1>${po?.seller?.business_name || ""}</h1>
        <p>${[po?.seller?.address?.line1, po?.seller?.address?.city, po?.seller?.address?.state, po?.seller?.address?.pincode ? `PIN-${po.seller.address.pincode}` : ""].filter(Boolean).join(", ")}</p>
        <p><b>GSTIN:</b> ${po?.seller?.tax_registrations?.gstin || "N/A"}</p>
      </div>
      <div class="po-info">
        <div class="po-title">PURCHASE ORDER</div>
        <p><b>PO Number:</b> ${po?.docNo || ""}</p>
        <p><b>Date:</b> ${new Date(po?.date || Date.now()).toLocaleDateString("en-IN")}</p>
        <p><span class="badge ${isInterState ? "badge-inter" : "badge-intra"}">${isInterState ? "INTER-STATE (IGST)" : "INTRA-STATE (CGST + SGST)"}</span></p>
      </div>
    </div>

    <div class="cards-container">
      <div class="party-card">
        <h3>Vendor / Supplier</h3>
        <p><b>${po?.buyer?.company_name || (selectedVendor as any)?.name || selectedVendor?.vendorName || ""}</b></p>
        <p>${po?.buyer?.billing?.line1 || (selectedVendor as any)?.billingAddress?.line1 || (selectedVendor as any)?.vendorAddress || ""}</p>
        <p>State: <b>${po?.buyer?.billing?.state || (selectedVendor as any)?.billingAddress?.state || "N/A"}</b></p>
        <p>Contact: ${po?.buyer?.contact_person || (selectedVendor as any)?.contact_person || ""} (${po?.buyer?.mobile || (selectedVendor as any)?.mobile || ""})</p>
      </div>
      <div class="party-card">
        <h3>Delivery Location</h3>
        <p><b>${selectedLocation?.locationName || "Head Office"}</b></p>
        <p>${selectedLocation?.address?.line1 || ""}, ${selectedLocation?.address?.city || ""}</p>
        <p>State: <b>${selectedLocation?.address?.state || "Delhi"}</b></p>
        <p>GSTIN: <b>${selectedLocation?.gstin || "N/A"}</b></p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 40px;" class="text-center">#</th>
          <th>Item & Description</th>
          <th style="width: 70px;" class="text-center">HSN</th>
          <th style="width: 70px;" class="text-center">Qty</th>
          <th style="width: 80px;" class="text-right">Rate</th>
          <th style="width: 90px;" class="text-right">Taxable</th>
          <th style="width: 90px;" class="text-right">${isInterState ? "IGST" : "CGST+SGST"}</th>
          <th style="width: 100px;" class="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${(po.items || []).map((it: any) => `
          <tr>
            <td class="text-center">${it.sr_no}</td>
            <td><b>${it.description}</b></td>
            <td class="text-center">${it.hsn_sac || "—"}</td>
            <td class="text-center">${it.quantity} ${it.unit}</td>
            <td class="text-right">₹${it.rate.toFixed(2)}</td>
            <td class="text-right">₹${it.taxable_amount.toFixed(2)}</td>
            <td class="text-right">₹${((it.cgst_amount || 0) + (it.sgst_amount || 0) + (it.igst_amount || 0)).toFixed(2)}</td>
            <td class="text-right"><b>₹${it.total_amount.toFixed(2)}</b></td>
          </tr>
        `).join("")}
      </tbody>
    </table>

    <table class="summary-table">
      <tr>
        <td>Subtotal (Taxable):</td>
        <td class="text-right">₹${(po?.totals?.taxable_amount || 0).toFixed(2)}</td>
      </tr>
      ${isInterState ? `
        <tr>
          <td>Integrated GST (IGST):</td>
          <td class="text-right">₹${(po?.totals?.total_igst || 0).toFixed(2)}</td>
        </tr>
      ` : `
        <tr>
          <td>Central GST (CGST):</td>
          <td class="text-right">₹${(po?.totals?.total_cgst || 0).toFixed(2)}</td>
        </tr>
        <tr>
          <td>State GST (SGST):</td>
          <td class="text-right">₹${(po?.totals?.total_sgst || 0).toFixed(2)}</td>
        </tr>
      `}
      <tr class="summary-total">
        <td>Grand Total:</td>
        <td class="text-right">₹${(po?.totals?.grand_total || 0).toFixed(2)}</td>
      </tr>
    </table>
  </body>
</html>`;
  };

  return (
    <SafeAreaView style={ui.container} edges={["top"]}>
      <AppHeader
        title="Purchase Order"
        onBackPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace("/");
          }
        }}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView style={ui.scrollView} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            
            {/* 🏢 Location Selector */}
            <View style={ui.card}>
              <View style={ui.cardHeaderRow}>
                <Ionicons name="business" size={18} color="#0284c7" />
                <Text style={ui.cardTitle}>Seller Office / Branch</Text>
              </View>

              {locations.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
                  {locations.map((loc) => {
                    const active = selectedLocation?._id === loc._id;
                    return (
                      <TouchableOpacity
                        key={loc._id}
                        onPress={() => selectLocation(loc._id)}
                        style={[ui.chip, active && ui.chipActive]}
                      >
                        <Text style={[ui.chipText, active && ui.chipTextActive]}>{loc.locationName}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={ui.staticBranchText}>{selectedLocation?.locationName || "Head Office"}</Text>
              )}

              <View style={ui.locationMetaRow}>
                <Text style={ui.locationMeta}>GSTIN: <Text style={ui.bold}>{selectedLocation?.gstin || "N/A"}</Text></Text>
                <Text style={ui.locationMeta}>State: <Text style={ui.bold}>{selectedLocation?.address?.state || "N/A"}</Text></Text>
              </View>
            </View>

            {/* 🤝 Vendor Selector */}
            <View style={ui.card}>
              <View style={ui.cardHeaderRow}>
                <Ionicons name="people" size={18} color="#0284c7" />
                <Text style={ui.cardTitle}>Select Vendor</Text>
              </View>

              <View style={ui.pickerWrapper}>
                <Picker
                  selectedValue={selectedVendor?._id || ""}
                  onValueChange={(val) => loadVendorProducts(val)}
                  style={{ height: 50, color: "#1e293b" }}
                >
                  <Picker.Item label="-- Choose Vendor --" value="" />
                  {vendors.map((v) => (
                    <Picker.Item key={v._id} label={(v as any).name || v.vendorName} value={v._id} />
                  ))}
                </Picker>
              </View>

              {selectedVendor && (
                <View style={ui.vendorMetaBox}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={ui.vendorMetaName}>{(selectedVendor as any).name || selectedVendor.vendorName}</Text>
                    <View style={[ui.taxBadge, isSameState ? ui.taxBadgeIntra : ui.taxBadgeInter]}>
                      <Text style={[ui.taxBadgeText, isSameState ? ui.taxBadgeTextIntra : ui.taxBadgeTextInter]}>
                        {isSameState ? "Intra-State (CGST+SGST)" : "Inter-State (IGST)"}
                      </Text>
                    </View>
                  </View>
                  <Text style={ui.vendorMetaSub}>
                    State: <Text style={ui.bold}>{(selectedVendor as any).billingAddress?.state || "N/A"}</Text> | Mobile: {(selectedVendor as any).mobile || selectedVendor.mobileNo || "N/A"}
                  </Text>
                </View>
              )}
            </View>

            {vendorLoading && (
              <View style={{ padding: 30, alignItems: "center" }}>
                <ActivityIndicator size="large" color="#0284c7" />
                <Text style={{ marginTop: 10, color: "#64748b", fontSize: 13 }}>Loading vendor price rate sheet...</Text>
              </View>
            )}

            {/* 📦 Product Catalog Selection */}
            {selectedVendor && !vendorLoading && (!selectedVendor.productCost || selectedVendor.productCost.length === 0) && (
              <View style={ui.emptyBox}>
                <Ionicons name="pricetag-outline" size={40} color="#94a3b8" />
                <Text style={ui.emptyText}>No price rates configured for this vendor.</Text>
                <Text style={ui.emptySubText}>Please add rates under "Add/Update Prices".</Text>
              </View>
            )}

            {selectedVendor?.productCost?.map((cat, ci) => {
              const isCatExpanded = expandedCategories.includes(cat.categoryName);
              const grouped: Record<string, any[]> = {};
              cat.products.forEach((p: any) => {
                if (!grouped[p.productName]) grouped[p.productName] = [];
                grouped[p.productName].push(p);
              });

              return (
                <View key={ci} style={ui.categoryCard}>
                  {/* Category Header */}
                  <TouchableOpacity
                    onPress={() => toggleCategory(cat.categoryName)}
                    activeOpacity={0.7}
                    style={ui.categoryHeader}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Ionicons
                        name={isCatExpanded ? "chevron-down-circle" : "chevron-forward-circle"}
                        size={20}
                        color="#0284c7"
                      />
                      <Text style={ui.categoryTitle}>{cat.categoryName}</Text>
                    </View>
                    <Text style={ui.categoryCount}>{cat.products?.length || 0} items</Text>
                  </TouchableOpacity>

                  {isCatExpanded && (
                    <View style={ui.categoryBody}>
                      {Object.keys(grouped).map((prodName, pi) => {
                        const key = `${cat.categoryName}-${prodName}`;
                        const isProdExpanded = expandedProducts.includes(key);

                        return (
                          <View key={pi} style={ui.productGroup}>
                            <TouchableOpacity
                              onPress={() => toggleProductName(cat.categoryName, prodName)}
                              style={ui.productHeader}
                            >
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                <Ionicons
                                  name={isProdExpanded ? "folder-open" : "folder"}
                                  size={16}
                                  color="#475569"
                                />
                                <Text style={ui.productGroupTitle}>{prodName}</Text>
                              </View>
                              <Ionicons
                                name={isProdExpanded ? "chevron-up" : "chevron-down"}
                                size={16}
                                color="#64748b"
                              />
                            </TouchableOpacity>

                            {isProdExpanded && (
                              <View style={ui.itemList}>
                                {grouped[prodName].map((p, idx) => {
                                  const isChecked = Boolean(p.checked);
                                  const qty = Number(p.qty || 0);
                                  const rate = Number(p.price || 0);
                                  const taxable = qty * rate;
                                  const gstRate = Number(p.taxRate ?? 18);
                                  const gstAmt = (taxable * gstRate) / 100;
                                  const lineTotal = taxable + gstAmt;

                                  return (
                                    <View key={idx} style={[ui.itemCard, isChecked && ui.itemCardActive]}>
                                      {/* Top Row: Checkbox, Title & Total */}
                                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                        <TouchableOpacity
                                          onPress={() => toggleProduct(ci, idx)}
                                          style={[ui.checkbox, isChecked && ui.checkboxActive]}
                                        >
                                          {isChecked && <Ionicons name="checkmark" size={14} color="#fff" />}
                                        </TouchableOpacity>

                                        <View style={{ flex: 1 }}>
                                          <Text style={ui.itemDesc}>{p.description}</Text>
                                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                                            <Text style={ui.itemMeta}>Rate: ₹{rate} / {p.UoM || "PCS"}</Text>
                                            {p.hsn_sac ? (
                                              <View style={ui.hsnPill}>
                                                <Text style={ui.hsnPillText}>HSN {p.hsn_sac}</Text>
                                              </View>
                                            ) : null}
                                          </View>
                                        </View>

                                        <View style={{ alignItems: "flex-end" }}>
                                          <Text style={[ui.lineTotalAmt, !isChecked && { color: "#94a3b8" }]}>₹{lineTotal.toFixed(0)}</Text>
                                          <Text style={ui.lineTaxText}>incl. {gstRate}% GST</Text>
                                        </View>
                                      </View>

                                      {/* Bottom Controls Row: Qty & GST Selector */}
                                      <View style={ui.itemControlsRow}>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                          <Text style={ui.controlLabel}>Qty:</Text>
                                          <TextInput
                                            placeholder="0"
                                            placeholderTextColor="#94a3b8"
                                            keyboardType="numeric"
                                            value={p.qty ? String(p.qty) : ""}
                                            onChangeText={(val) => updateQty(ci, idx, val)}
                                            style={ui.qtyInput}
                                          />
                                          <Text style={ui.controlUnit}>{p.UoM || "PCS"}</Text>
                                        </View>

                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                          <Text style={ui.controlLabel}>GST Rate:</Text>
                                          <View style={ui.taxPickerBox}>
                                            <Picker
                                              selectedValue={gstRate}
                                              onValueChange={(val) => updateGstRate(ci, idx, Number(val))}
                                              style={ui.taxPicker}
                                            >
                                              {[0, 5, 12, 18, 28].map((r) => (
                                                <Picker.Item key={r} label={`${r}%`} value={r} />
                                              ))}
                                            </Picker>
                                          </View>
                                        </View>
                                      </View>
                                    </View>
                                  );
                                })}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}

            {/* 🧾 Live Tax Breakdown Summary Card */}
            {orderBreakdown.selectedItems.length > 0 && (
              <View style={ui.summaryCard}>
                <View style={ui.summaryHeader}>
                  <Ionicons name="receipt-outline" size={20} color="#0284c7" />
                  <Text style={ui.summaryTitle}>Tax & Order Summary</Text>
                  <View style={[ui.taxBadge, isSameState ? ui.taxBadgeIntra : ui.taxBadgeInter]}>
                    <Text style={[ui.taxBadgeText, isSameState ? ui.taxBadgeTextIntra : ui.taxBadgeTextInter]}>
                      {isSameState ? "CGST + SGST" : "IGST"}
                    </Text>
                  </View>
                </View>

                <View style={ui.summaryRow}>
                  <Text style={ui.summaryLabel}>Taxable Subtotal</Text>
                  <Text style={ui.summaryValue}>₹{orderBreakdown.taxableSubtotal.toFixed(2)}</Text>
                </View>

                {isSameState ? (
                  <>
                    <View style={ui.summaryRow}>
                      <Text style={ui.summaryLabel}>Central GST (CGST)</Text>
                      <Text style={ui.summaryValue}>₹{orderBreakdown.cgstTotal.toFixed(2)}</Text>
                    </View>
                    <View style={ui.summaryRow}>
                      <Text style={ui.summaryLabel}>State GST (SGST)</Text>
                      <Text style={ui.summaryValue}>₹{orderBreakdown.sgstTotal.toFixed(2)}</Text>
                    </View>
                  </>
                ) : (
                  <View style={ui.summaryRow}>
                    <Text style={ui.summaryLabel}>Integrated GST (IGST)</Text>
                    <Text style={ui.summaryValue}>₹{orderBreakdown.igstTotal.toFixed(2)}</Text>
                  </View>
                )}

                <View style={[ui.summaryRow, ui.grandTotalRow]}>
                  <Text style={ui.grandTotalLabel}>Grand Total (incl. GST)</Text>
                  <Text style={ui.grandTotalValue}>₹{orderBreakdown.grandTotal.toFixed(2)}</Text>
                </View>

                {/* Action Buttons */}
                <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                  <TouchableOpacity
                    onPress={handlePreviewAndSave}
                    disabled={saving}
                    activeOpacity={0.8}
                    style={[ui.actionBtn, ui.btnPrimary, saving && { opacity: 0.6 }]}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="print-outline" size={18} color="#fff" />
                        <Text style={ui.actionBtnText}>Preview & Print</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSharePDF}
                    disabled={saving}
                    activeOpacity={0.8}
                    style={[ui.actionBtn, ui.btnSuccess, saving && { opacity: 0.6 }]}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="share-social-outline" size={18} color="#fff" />
                        <Text style={ui.actionBtnText}>Share PDF</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const ui = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollView: {
    padding: 16,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: 0.3,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  chipActive: {
    backgroundColor: "#0284c7",
    borderColor: "#0284c7",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  chipTextActive: {
    color: "#ffffff",
  },
  staticBranchText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  locationMetaRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  locationMeta: {
    fontSize: 11,
    color: "#64748b",
  },
  bold: {
    fontWeight: "700",
    color: "#1e293b",
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    overflow: "hidden",
  },
  vendorMetaBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  vendorMetaName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0369a1",
  },
  vendorMetaSub: {
    fontSize: 11,
    color: "#475569",
    marginTop: 4,
  },
  taxBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  taxBadgeIntra: {
    backgroundColor: "#e0f2fe",
  },
  taxBadgeInter: {
    backgroundColor: "#fef3c7",
  },
  taxBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  taxBadgeTextIntra: {
    color: "#0369a1",
  },
  taxBadgeTextInter: {
    color: "#b45309",
  },
  emptyBox: {
    padding: 30,
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 10,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    marginTop: 10,
  },
  emptySubText: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 4,
  },
  categoryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  categoryCount: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  categoryBody: {
    padding: 10,
  },
  productGroup: {
    marginBottom: 10,
  },
  productHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
  },
  productGroupTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  itemList: {
    marginTop: 6,
    gap: 6,
  },
  itemCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 8,
  },
  itemCardActive: {
    borderColor: "#0284c7",
    backgroundColor: "#f0f9ff",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#94a3b8",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: "#0284c7",
    borderColor: "#0284c7",
  },
  itemDesc: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  itemMeta: {
    fontSize: 11,
    color: "#64748b",
  },
  hsnPill: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hsnPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
  },
  itemControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  controlLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  controlUnit: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  qtyInput: {
    width: 54,
    height: 36,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    backgroundColor: "#ffffff",
  },
  taxPickerBox: {
    width: 80,
    height: 36,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    justifyContent: "center",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  taxPicker: {
    height: 36,
    width: 90,
    color: "#1e293b",
  },
  lineTotalBox: {
    width: 70,
    alignItems: "flex-end",
  },
  lineTotalAmt: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0284c7",
  },
  lineTaxText: {
    fontSize: 9,
    color: "#64748b",
    marginTop: 1,
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0284c7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 10,
    marginBottom: 10,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
    flex: 1,
    marginLeft: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  summaryLabel: {
    fontSize: 13,
    color: "#64748b",
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b",
  },
  grandTotalRow: {
    borderTopWidth: 2,
    borderTopColor: "#e2e8f0",
    paddingTop: 10,
    marginTop: 6,
  },
  grandTotalLabel: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0284c7",
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    elevation: 3,
  },
  btnPrimary: {
    backgroundColor: "#0284c7",
    shadowColor: "#0284c7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  btnSuccess: {
    backgroundColor: "#10b981",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  actionBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
});
