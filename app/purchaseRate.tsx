import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { AppHeader } from "@/components/AppHeader";
import { COLORS } from "@/styles/stylesIndex";
import { useUserContext } from "@/context/AuthContext";
import { appService } from "@/UtilServices/appHelper";
import GridForm, { GridFormRef } from "./priceGridForm";

interface RateProduct {
  productId?: string;
  productName: string;
  description?: string;
  price?: number;
  buyPrice?: number;
  salePrice?: number;
  UoM?: string;
}

interface CategoryCostGroup {
  categoryId: string;
  categoryName: string;
  products: RateProduct[];
}

interface VendorRateData {
  _id: string;
  vendorName: string;
  contactPerson?: string;
  mobileNo?: string;
  vendorGST?: string;
  vendorAddress?: string;
  productCost: CategoryCostGroup[];
}

const COMMON_UOMS = ["PCS", "BOX", "SQF", "RFT", "PKT", "KGM", "LTR", "SQM", "RMT", "SET"];

export default function PurchaseRateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; vendorId?: string; name?: string }>();
  const resolvedVendorId = String(params.id || params.vendorId || "");
  const fallbackName = typeof params.name === "string" ? params.name : "";

  const { user } = useUserContext();
  const corporateId = user?.corporateId || "";
  const corpAdminId = user?.corpAdminId || user?.userId || "";

  const [loading, setLoading] = useState(true);
  const [vendorData, setVendorData] = useState<VendorRateData | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [printing, setPrinting] = useState(false);

  // ── "Select Category & Product" Modal State on Screen 1 ─────────────────────
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState<string>("");
  const [selectedProdId, setSelectedProdId] = useState<string>("");
  const [isCustomProduct, setIsCustomProduct] = useState(false);
  const [prodNameInput, setProdNameInput] = useState("");
  const [prodDescInput, setProdDescInput] = useState("");
  const [buyPriceInput, setBuyPriceInput] = useState("");
  const [salePriceInput, setSalePriceInput] = useState("");
  const [uomInput, setUomInput] = useState("PCS");
  const [savingRate, setSavingRate] = useState(false);

  const gridFormRef = useRef<GridFormRef | null>(null);

  // ── Load vendor & rate data ────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!resolvedVendorId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await appService.httpClient.get(`product/rate/vendor/${resolvedVendorId}`);
      if (res.data) {
        setVendorData(res.data);
      }
    } catch (err: any) {
      console.warn("Error fetching vendor rates:", err);
      // Fallback: try fetching vendor profile directly if rate lookup 404s
      try {
        const partyRes = await appService.httpClient.get(`service/parties/suppliers`);
        const list = Array.isArray(partyRes.data)
          ? partyRes.data
          : partyRes.data?.data || partyRes.data?.vendors || [];
        const found = list.find((v: any) => String(v._id) === resolvedVendorId);
        if (found) {
          setVendorData({
            _id: found._id,
            vendorName: found.name || found.vendorName || fallbackName || "Vendor",
            contactPerson: found.contact_person || found.contactPerson || "",
            mobileNo: found.mobile || found.mobileNo || "",
            vendorGST: found.gst || found.vendorGST || "",
            vendorAddress: found.billingAddress?.line1 || found.vendorAddress || "",
            productCost: [],
          });
        }
      } catch (fallbackErr) {
        console.warn("Fallback supplier fetch failed:", fallbackErr);
      }
    } finally {
      setLoading(false);
    }
  }, [resolvedVendorId, fallbackName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Load all categories for the "Select Category & Product" modal ────────────
  const loadCategoriesForSelect = async () => {
    try {
      setLoadingCategories(true);
      const res = await appService.httpClient.get(`product/category`, {
        params: {
          corporateId: corporateId || undefined,
          corpAdminId: corpAdminId || undefined,
        },
      });
      const list = Array.isArray(res.data)
        ? res.data
        : res.data?.categories || res.data?.data || [];
      const safe = Array.isArray(list) ? list : [];
      setAllCategories(safe);

      if (safe.length > 0 && !selectedCatId) {
        handleCategoryChange(safe[0]._id, safe);
      }
    } catch (err) {
      console.warn("Could not load categories for modal:", err);
    } finally {
      setLoadingCategories(false);
    }
  };

  const handleOpenSelectModal = () => {
    setShowSelectModal(true);
    loadCategoriesForSelect();
  };

  const handleCategoryChange = (catId: string, list = allCategories) => {
    setSelectedCatId(catId);
    const cat = list.find((c) => String(c._id) === String(catId));
    const prods = Array.isArray(cat?.products) ? cat.products : [];

    if (prods.length > 0) {
      setSelectedProdId(String(prods[0]._id));
      setIsCustomProduct(false);
      setProdNameInput(prods[0].productName || "");
      setProdDescInput(prods[0].description || "");
      setBuyPriceInput(prods[0].buyPrice ? String(prods[0].buyPrice) : (prods[0].price ? String(prods[0].price) : ""));
      setSalePriceInput(prods[0].salePrice ? String(prods[0].salePrice) : (prods[0].price ? String(prods[0].price) : ""));
      setUomInput(prods[0].UoM || "PCS");
    } else {
      setSelectedProdId("NEW");
      setIsCustomProduct(true);
      setProdNameInput("");
      setProdDescInput("");
      setBuyPriceInput("");
      setSalePriceInput("");
      setUomInput("PCS");
    }
  };

  const handleProductChange = (prodId: string) => {
    setSelectedProdId(prodId);
    if (prodId === "NEW") {
      setIsCustomProduct(true);
      setProdNameInput("");
      setProdDescInput("");
      setBuyPriceInput("");
      setSalePriceInput("");
      setUomInput("PCS");
      return;
    }

    setIsCustomProduct(false);
    const cat = allCategories.find((c) => String(c._id) === String(selectedCatId));
    const prod = (cat?.products || []).find((p: any) => String(p._id) === String(prodId));
    if (prod) {
      setProdNameInput(prod.productName || "");
      setProdDescInput(prod.description || "");
      setBuyPriceInput(prod.buyPrice ? String(prod.buyPrice) : (prod.price ? String(prod.price) : ""));
      setSalePriceInput(prod.salePrice ? String(prod.salePrice) : (prod.price ? String(prod.price) : ""));
      setUomInput(prod.UoM || "PCS");
    }
  };

  // ── Save single category/product rate from Screen 1 modal ──────────────────
  const handleSaveProductRate = async () => {
    if (!selectedCatId) {
      appService.showToast("Please select a category", "Info");
      return;
    }
    const finalName = prodNameInput.trim();
    if (!finalName) {
      appService.showToast("Product name is required", "Error");
      return;
    }
    const buyVal = parseFloat(buyPriceInput) || 0;
    const saleVal = parseFloat(salePriceInput) || 0;

    if (buyVal <= 0 && saleVal <= 0) {
      appService.showToast("Please enter Buy Price or Sale Price", "Info");
      return;
    }

    const cat = allCategories.find((c) => String(c._id) === String(selectedCatId));

    try {
      setSavingRate(true);
      const payload = [
        {
          corporateId,
          corpAdminId,
          vendorId: resolvedVendorId,
          categoryId: selectedCatId,
          categoryName: cat?.categoryName || cat?.name || "Category",
          productId: selectedProdId === "NEW" ? undefined : selectedProdId,
          productName: finalName,
          description: prodDescInput.trim() || finalName,
          UoM: uomInput || "PCS",
          price: buyVal,
          buyPrice: buyVal,
          salePrice: saleVal,
        },
      ];

      const res = await appService.httpClient.post(`product/rate/add`, payload);
      if (res.status === 200 || res.status === 201) {
        appService.showToast("Product rate added successfully", "Success");
        setShowSelectModal(false);
        loadData();
      } else {
        appService.showToast("Failed to save rate", "Error");
      }
    } catch (err: any) {
      appService.showToast(err?.response?.data?.error || "Failed to save rate", "Error");
    } finally {
      setSavingRate(false);
    }
  };

  // ── PDF HTML Generation ───────────────────────────────────────────────────
  const generateHTML = () => {
    const vName = vendorData?.vendorName || fallbackName || "Vendor";
    const contact = vendorData?.contactPerson || "N/A";
    const phone = vendorData?.mobileNo || "N/A";
    const gst = vendorData?.vendorGST || "";
    const address = vendorData?.vendorAddress || "";

    const categories = vendorData?.productCost || [];

    let rowsHtml = "";
    if (categories.length === 0) {
      rowsHtml = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 20px; color: #64748b;">
            No purchase rates configured yet for this vendor.
          </td>
        </tr>
      `;
    } else {
      let sl = 1;
      categories.forEach((cat) => {
        rowsHtml += `
          <tr style="background-color: #f1f5f9; font-weight: bold;">
            <td colspan="6" style="text-align: left; padding: 8px 12px; color: #1e3a8a;">
              Category: ${cat.categoryName}
            </td>
          </tr>
        `;
        (cat.products || []).forEach((prod) => {
          const buy = prod.buyPrice !== undefined && prod.buyPrice !== null ? prod.buyPrice : (prod.price || 0);
          const sale = prod.salePrice !== undefined && prod.salePrice !== null ? prod.salePrice : 0;
          rowsHtml += `
            <tr>
              <td style="text-align: center;">${sl++}</td>
              <td style="text-align: left;"><strong>${prod.productName}</strong></td>
              <td style="text-align: left; color: #475569;">${prod.description || "-"}</td>
              <td style="text-align: right; font-weight: bold; color: #047857;">&#8377; ${Number(buy).toLocaleString("en-IN")}</td>
              <td style="text-align: right; font-weight: bold; color: #7c3aed;">&#8377; ${Number(sale).toLocaleString("en-IN")}</td>
              <td style="text-align: center;">${prod.UoM || "PCS"}</td>
            </tr>
          `;
        });
      });
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Vendor Price List - ${vName}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 24px; color: #1e293b; }
            .header { border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 20px; }
            .title { font-size: 22px; font-weight: 800; color: #1e3a8a; margin: 0 0 6px 0; }
            .meta-grid { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: #475569; }
            .meta-item { margin-bottom: 4px; }
            .meta-item strong { color: #0f172a; }
            table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
            th { background-color: #1e3a8a; color: #ffffff; padding: 10px; border: 1px solid #cbd5e1; text-align: center; }
            td { padding: 8px 10px; border: 1px solid #cbd5e1; vertical-align: middle; }
            .footer { margin-top: 30px; font-size: 11px; text-align: center; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">${vName}</h1>
            <div class="meta-grid">
              <div class="meta-item"><strong>Contact Person:</strong> ${contact}</div>
              <div class="meta-item"><strong>Mobile:</strong> ${phone}</div>
              ${gst ? `<div class="meta-item"><strong>GSTIN:</strong> ${gst}</div>` : ""}
              ${address ? `<div class="meta-item"><strong>Address:</strong> ${address}</div>` : ""}
              <div class="meta-item"><strong>Generated On:</strong> ${new Date().toLocaleDateString("en-IN")}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 45px;">S.No</th>
                <th style="width: 25%;">Product Name</th>
                <th>Description / Specification</th>
                <th style="width: 100px;">Buy Rate (&#8377;)</th>
                <th style="width: 100px;">Sale Rate (&#8377;)</th>
                <th style="width: 65px;">UoM</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="footer">
            Generated via HiBiz Portakabin App &bull; Confidential Vendor Price Reference
          </div>
        </body>
      </html>
    `;
  };

  const handlePrint = async () => {
    try {
      setPrinting(true);
      const html = generateHTML();
      await Print.printAsync({ html });
    } catch (err) {
      console.warn("Print error:", err);
      Alert.alert("Print Error", "Could not open system print preview");
    } finally {
      setPrinting(false);
    }
  };

  const handleShare = async () => {
    try {
      setPrinting(true);
      const html = generateHTML();
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `Share Price List - ${vendorData?.vendorName || "Vendor"}`,
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Sharing Unavailable", "Sharing is not supported on this device.");
      }
    } catch (err) {
      console.warn("Share error:", err);
      Alert.alert("Share Error", "Failed to share PDF.");
    } finally {
      setPrinting(false);
    }
  };

  const displayName = vendorData?.vendorName || fallbackName || "Vendor Rates";
  const categories = vendorData?.productCost || [];
  const totalProducts = categories.reduce((sum, c) => sum + (c.products?.length || 0), 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc" }} edges={["top"]}>
      <AppHeader
        title="Purchase Rates"
        onBackPress={() => router.back()}
        rightAction={() => (
          <TouchableOpacity
            onPress={() => setShowEditModal(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "rgba(255,255,255,0.2)",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 20,
              marginRight: 6,
            }}
          >
            <Ionicons name="create-outline" size={18} color="#fff" style={{ marginRight: 4 }} />
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Edit</Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ marginTop: 12, fontSize: 14, color: "#64748b" }}>Loading vendor rates...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 100 }}>
          {/* 🏢 VENDOR DETAILS CARD */}
          <View
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 16,
              padding: 16,
              marginBottom: 16,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06,
              shadowRadius: 6,
              elevation: 2,
              borderWidth: 1,
              borderColor: "#e2e8f0",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: COLORS.primary + "15",
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: 14,
                }}
              >
                <Ionicons name="business" size={24} color={COLORS.primary} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: "#0f172a" }}>
                  {displayName}
                </Text>
                {vendorData?.contactPerson ? (
                  <Text style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                    Contact: <Text style={{ fontWeight: "600", color: "#334155" }}>{vendorData.contactPerson}</Text>
                  </Text>
                ) : null}
              </View>
            </View>

            {vendorData?.mobileNo ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(`tel:${vendorData.mobileNo}`)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 10,
                  paddingTop: 10,
                  borderTopWidth: 1,
                  borderTopColor: "#f1f5f9",
                }}
              >
                <Ionicons name="call" size={15} color={COLORS.primary} style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 14, fontWeight: "700", color: COLORS.primary }}>
                  {vendorData.mobileNo}
                </Text>
                <Text style={{ fontSize: 12, color: "#94a3b8", marginLeft: 8 }}>(Tap to call)</Text>
              </TouchableOpacity>
            ) : null}

            {vendorData?.vendorAddress ? (
              <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 6 }}>
                <Ionicons name="location-outline" size={15} color="#64748b" style={{ marginRight: 6, marginTop: 2 }} />
                <Text style={{ fontSize: 12, color: "#64748b", flex: 1 }}>{vendorData.vendorAddress}</Text>
              </View>
            ) : null}

            {/* 🛠️ QUICK ACTION BUTTONS */}
            <View style={{ flexDirection: "row", marginTop: 14, gap: 8 }}>
              {/* Button for Select Category and its Product (Screen 1) */}
              <TouchableOpacity
                onPress={handleOpenSelectModal}
                style={{
                  flex: 1.3,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: COLORS.primary,
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  borderRadius: 10,
                }}
              >
                <Ionicons name="add-circle" size={16} color="#fff" style={{ marginRight: 5 }} />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                  + Add Product Rate
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowEditModal(true)}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#eff6ff",
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#bfdbfe",
                }}
              >
                <Ionicons name="pricetag" size={15} color={COLORS.primary} style={{ marginRight: 4 }} />
                <Text style={{ color: COLORS.primary, fontWeight: "700", fontSize: 12 }}>Set/Edit All</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePrint}
                disabled={printing}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#f1f5f9",
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#cbd5e1",
                }}
              >
                <Ionicons name="print-outline" size={16} color="#334155" style={{ marginRight: 3 }} />
                <Text style={{ color: "#334155", fontWeight: "700", fontSize: 12 }}>Print</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleShare}
                disabled={printing}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#ecfdf5",
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#a7f3d0",
                }}
              >
                <Ionicons name="share-social-outline" size={16} color="#047857" style={{ marginRight: 3 }} />
                <Text style={{ color: "#047857", fontWeight: "700", fontSize: 12 }}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 🏷️ RATE LIST HEADER */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#1e293b" }}>
              Configured Rates ({totalProducts})
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <TouchableOpacity
                onPress={handleOpenSelectModal}
                style={{ flexDirection: "row", alignItems: "center" }}
              >
                <Ionicons name="add" size={16} color={COLORS.primary} style={{ marginRight: 2 }} />
                <Text style={{ fontSize: 13, color: COLORS.primary, fontWeight: "700" }}>Select & Add</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={loadData} style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="refresh" size={15} color="#64748b" style={{ marginRight: 2 }} />
                <Text style={{ fontSize: 13, color: "#64748b", fontWeight: "600" }}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 📋 CATEGORY & PRODUCT RATE LIST */}
          {categories.length === 0 ? (
            <View
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 16,
                padding: 32,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#e2e8f0",
                marginTop: 10,
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: "#f1f5f9",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                }}
              >
                <Ionicons name="pricetag-outline" size={32} color="#94a3b8" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#334155" }}>
                No Rates Configured
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: "#94a3b8",
                  textAlign: "center",
                  marginTop: 6,
                  paddingHorizontal: 20,
                  lineHeight: 18,
                }}
              >
                This vendor does not have agreed item rates yet. Tap below to select a category & product or configure in bulk.
              </Text>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
                <TouchableOpacity
                  onPress={handleOpenSelectModal}
                  style={{
                    backgroundColor: COLORS.primary,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderRadius: 12,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Select Product Rate</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setShowEditModal(true)}
                  style={{
                    backgroundColor: "#f1f5f9",
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#cbd5e1",
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="pricetag-outline" size={16} color="#334155" style={{ marginRight: 6 }} />
                  <Text style={{ color: "#334155", fontWeight: "700", fontSize: 13 }}>Set All Rates</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            categories.map((cat, catIdx) => (
              <View
                key={cat.categoryId || `cat_${catIdx}`}
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: 14,
                  marginBottom: 14,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                  overflow: "hidden",
                }}
              >
                {/* Category Header */}
                <View
                  style={{
                    backgroundColor: "#f1f5f9",
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: "#e2e8f0",
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="folder-open-outline" size={18} color={COLORS.primary} style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#1e3a8a", flex: 1 }}>
                    {cat.categoryName}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#64748b", fontWeight: "600" }}>
                    {cat.products?.length || 0} items
                  </Text>
                </View>

                {/* Products Table with Both Buy & Sale Prices */}
                {(cat.products || []).map((prod, pIdx) => {
                  const buy = prod.buyPrice !== undefined && prod.buyPrice !== null ? prod.buyPrice : (prod.price || 0);
                  const sale = prod.salePrice !== undefined && prod.salePrice !== null ? prod.salePrice : 0;
                  const profit = sale > buy && buy > 0 ? sale - buy : 0;

                  return (
                    <View
                      key={prod.productId || `prod_${pIdx}`}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        borderBottomWidth: pIdx === (cat.products?.length || 0) - 1 ? 0 : 1,
                        borderBottomColor: "#f1f5f9",
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={{ fontSize: 14, fontWeight: "700", color: "#1e293b" }}>
                            {prod.productName}
                          </Text>
                          {prod.description ? (
                            <Text style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                              {prod.description}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={{ fontSize: 11, color: "#94a3b8", fontWeight: "700" }}>
                          per {prod.UoM || "PCS"}
                        </Text>
                      </View>

                      {/* Buy Price and Sale Price Pills */}
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 10 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            backgroundColor: "#f0fdf4",
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: "#bbf7d0",
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#166534", marginRight: 4 }}>
                            Buy:
                          </Text>
                          <Text style={{ fontSize: 14, fontWeight: "800", color: "#15803d" }}>
                            ₹{Number(buy).toLocaleString("en-IN")}
                          </Text>
                        </View>

                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            backgroundColor: "#faf5ff",
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: "#e9d5ff",
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#6b21a8", marginRight: 4 }}>
                            Sale:
                          </Text>
                          <Text style={{ fontSize: 14, fontWeight: "800", color: "#7e22ce" }}>
                            {sale > 0 ? `₹${Number(sale).toLocaleString("en-IN")}` : "Not Set"}
                          </Text>
                        </View>

                        {profit > 0 && (
                          <View
                            style={{
                              backgroundColor: "#ecfdf5",
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 6,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: "700", color: "#059669" }}>
                              +₹{Number(profit).toLocaleString("en-IN")}
                            </Text>
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
      )}

      {/* 🔘 MODAL: "Select Category and its Product" Directly on Screen 1 */}
      <Modal visible={showSelectModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={selectModalStyles.overlay}>
            <View style={selectModalStyles.card}>
              <View style={selectModalStyles.header}>
                <View>
                  <Text style={selectModalStyles.title}>Select Category & Product</Text>
                  <Text style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    Assign Buy & Sale price for {displayName}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowSelectModal(false)}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* 1. Category Picker */}
                <Text style={selectModalStyles.label}>1. Select Category *</Text>
                <View style={selectModalStyles.pickerWrapper}>
                  {loadingCategories ? (
                    <ActivityIndicator size="small" color={COLORS.primary} style={{ padding: 14 }} />
                  ) : (
                    <Picker
                      selectedValue={selectedCatId}
                      onValueChange={(val) => handleCategoryChange(val)}
                      style={{ height: 48, color: "#0f172a" }}
                    >
                      {allCategories.map((c) => (
                        <Picker.Item
                          key={c._id}
                          label={c.categoryName || c.name || "Category"}
                          value={c._id}
                        />
                      ))}
                    </Picker>
                  )}
                </View>

                {/* 2. Product Picker or Custom Name */}
                <Text style={selectModalStyles.label}>2. Select Product *</Text>
                {(() => {
                  const cat = allCategories.find((c) => String(c._id) === String(selectedCatId));
                  const prods = Array.isArray(cat?.products) ? cat.products : [];

                  return (
                    <>
                      <View style={selectModalStyles.pickerWrapper}>
                        <Picker
                          selectedValue={selectedProdId}
                          onValueChange={(val) => handleProductChange(val)}
                          style={{ height: 48, color: "#0f172a" }}
                        >
                          {prods.map((p: any) => (
                            <Picker.Item
                              key={p._id}
                              label={p.productName}
                              value={p._id}
                            />
                          ))}
                          <Picker.Item label="➕ Add New Product..." value="NEW" />
                        </Picker>
                      </View>

                      {isCustomProduct && (
                        <View style={{ marginTop: 8 }}>
                          <Text style={[selectModalStyles.label, { color: COLORS.primary }]}>
                            New Product Name *
                          </Text>
                          <TextInput
                            style={selectModalStyles.input}
                            placeholder="Enter product name..."
                            value={prodNameInput}
                            onChangeText={setProdNameInput}
                          />
                        </View>
                      )}
                    </>
                  );
                })()}

                {/* 3. Description */}
                <Text style={selectModalStyles.label}>Description / Spec</Text>
                <TextInput
                  style={selectModalStyles.input}
                  placeholder="Optional description"
                  value={prodDescInput}
                  onChangeText={setProdDescInput}
                />

                {/* 4. Buy Price and Sale Price Inputs */}
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[selectModalStyles.label, { color: "#15803d" }]}>Buy Price (₹) *</Text>
                    <TextInput
                      style={[selectModalStyles.input, { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4", color: "#166534", fontWeight: "700" }]}
                      placeholder="0.00"
                      keyboardType="numeric"
                      value={buyPriceInput}
                      onChangeText={setBuyPriceInput}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[selectModalStyles.label, { color: "#7e22ce" }]}>Sale Price (₹) *</Text>
                    <TextInput
                      style={[selectModalStyles.input, { borderColor: "#e9d5ff", backgroundColor: "#faf5ff", color: "#6b21a8", fontWeight: "700" }]}
                      placeholder="0.00"
                      keyboardType="numeric"
                      value={salePriceInput}
                      onChangeText={setSalePriceInput}
                    />
                  </View>
                </View>

                {/* 5. Unit of Measure (UoM) */}
                <Text style={selectModalStyles.label}>Unit of Measure (UoM)</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {COMMON_UOMS.map((u) => (
                    <TouchableOpacity
                      key={u}
                      onPress={() => setUomInput(u)}
                      style={[
                        selectModalStyles.uomChip,
                        uomInput === u && selectModalStyles.uomChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          selectModalStyles.uomChipText,
                          uomInput === u && selectModalStyles.uomChipTextActive,
                        ]}
                      >
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={selectModalStyles.footer}>
                <TouchableOpacity
                  onPress={() => setShowSelectModal(false)}
                  style={selectModalStyles.cancelBtn}
                >
                  <Text style={selectModalStyles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSaveProductRate}
                  disabled={savingRate}
                  style={[selectModalStyles.submitBtn, savingRate && { opacity: 0.6 }]}
                >
                  {savingRate ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={selectModalStyles.submitBtnText}>Save Rate</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 📝 SET / EDIT ALL RATES MODAL (GRID FORM) */}
      <Modal visible={showEditModal} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
          <GridForm
            ref={gridFormRef}
            vendorId={resolvedVendorId}
            vendorName={displayName}
            onSaved={() => {
              setShowEditModal(false);
              loadData();
            }}
            onClose={() => {
              setShowEditModal(false);
            }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const selectModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 18,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 6,
    marginTop: 10,
  },
  pickerWrapper: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    overflow: "hidden",
  },
  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: "#1e293b",
  },
  uomChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  uomChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  uomChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  uomChipTextActive: {
    color: "#ffffff",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 12,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  submitBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
});
