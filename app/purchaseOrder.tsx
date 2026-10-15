import { AppHeader } from "@/components/AppHeader";
import { appService } from "@/UtilServices/appHelper";
import { Picker } from "@react-native-picker/picker";
import * as Print from "expo-print";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { COLORS, styles } from "@/styles/stylesIndex";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProductItem, Vendor } from "@/hooks/interface";
import { usePIPOTI } from "@/hooks/PI-PO-TI";
import { useUserContext } from "@/context/AuthContext";

const formatMobile = (mobile: string) => {
  if (!mobile) return "";
  const m = mobile.replace(/\s+/g, "");
  if (m.length === 10) return `+91${m}`;
  if (m.startsWith("+") && m.length === 13) return m;
  if (m.length === 12) return `+${m}`;
  return m;
};

export default function PurchaseOrder() {
  const router = useRouter();
  const { user } = useUserContext();
  const token = user?.token ?? "";
  const { seller, locations, selectedLocation, selectLocation } = usePIPOTI(token);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      const res = await appService.httpClient.get(`/service/parties/suppliers`);
      setVendors(res.data);
    } catch (err) {
      console.log("Vendor load error:", err);
    }
  };

  const loadVendorProducts = async (vendorId: string) => {
    if (!vendorId) {
      setSelectedVendor(null);
      return;
    }
    try {
      const res = await appService.httpClient.get(`/product/rate/vendor/${vendorId}`);
      setSelectedVendor(res.data);
    } catch (err: any) {
      console.log("Product Load Error:", err.response?.data || err);
      setSelectedVendor(null);
    }
  };

  const toggleCategory = (catName: string) => {
    setExpandedCategories((prev) =>
      prev.includes(catName)
        ? prev.filter((c) => c !== catName)
        : [...prev, catName]
    );
  };

  const toggleProductName = (catName: string, prodName: string) => {
    const key = `${catName}-${prodName}`;
    setExpandedProducts((prev) =>
      prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key]
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

    // Auto select/deselect row
    if (Number(qty) > 0) product.checked = true;
    else product.checked = false;

    setSelectedVendor(newVendor);
  };

  const calculateRowAmount = (product: any) =>
    Number(product.qty || 0) * Number(product.price || 0);

  const calculateGrandTotal = () => {
    if (!selectedVendor) return 0;
    return selectedVendor.productCost.reduce((catSum, cat) => {
      return (
        catSum +
        cat.products.reduce((pSum, p) => pSum + calculateRowAmount(p), 0)
      );
    }, 0);
  };

  const handlePDF = async () => {
    if (!selectedVendor || !selectedLocation) {
      alert("Vendor and Location are required!");
      return;
    }
    const selectedProducts = selectedVendor.productCost
      .flatMap((cat) => cat.products.filter((p: any) => p.checked))
      .filter((p: any) => Number(p.qty) > 0);
    if (selectedProducts.length === 0) {
      alert("No products selected!");
      return;
    }

    setSaving(true);
    try {
      const lineItems = selectedProducts.map((p: any, i) => ({
        sr_no: i + 1,
        description: p.description,
        hsn_sac: p.hsn_sac || "",
        quantity: Number(p.qty),
        unit: p.UoM || "PCS",
        rate: Number(p.price),
        taxable_amount: Number(p.qty) * Number(p.price),
        total_amount: Number(p.qty) * Number(p.price),
      }));

      const grandTotal = calculateGrandTotal();

      const payload = {
        locationId: selectedLocation._id,
        seller: {
          business_name: seller?.name || "",
          address: seller?.address || {},
          tax_registrations: { gstin: selectedLocation.gstin, pan: seller?.pan || "" },
        },
        buyer: {
          billing_address: {
            company_name: (selectedVendor as any).name || selectedVendor.vendorName,
            contact_person: selectedVendor.contactPerson,
            mobile: selectedVendor.mobileNo,
            line1: selectedVendor.vendorAddress,
          }
        },
        items: lineItems,
        totals: {
          taxable_amount: grandTotal,
          grand_total: grandTotal,
        },
        status: "Issued"
      };

      const res = await appService.httpClient.post("finance/pos", payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const savedPO = res.data?.data;
      
      appService.showToast(`PO ${savedPO.docNo} generated and saved!`, "Success");
      
      const { uri } = await Print.printToFileAsync({ html: buildPOHTML(savedPO) });
      await Sharing.shareAsync(uri);
    } catch (err) {
      console.log("PO Save/PDF Error:", err);
      appService.showToast("Failed to generate PO", "Error");
    } finally {
      setSaving(false);
    }
  };

  const buildPOHTML = (po: any) => {
    return `<html>
      <head>
        <style>
          body { font-family: Arial; padding: 25px; color: #333; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
          .seller-info { flex: 1; }
          .po-info { flex: 1; text-align: right; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
          th { background-color: #f2f2f2; font-weight: bold; }
          .total-row { font-weight: bold; background-color: #f9f9f9; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="seller-info">
            <h1 style="margin:0">${po.seller.business_name}</h1>
            <p>
              ${[
                po.seller.address?.line1,
                po.seller.address?.city,
                po.seller.address?.state,
                po.seller.address?.pincode ? `PIN-${po.seller.address.pincode}` : ''
              ].filter(Boolean).join(', ')}
            </p>
            <p>GSTIN: ${po.seller.tax_registrations?.gstin}</p>
          </div>
          <div class="po-info">
            <h2 style="margin:0; color: #007bff;">PURCHASE ORDER</h2>
            <p>PO No: <b>${po.docNo}</b></p>
            <p>Date: ${new Date(po.date).toLocaleDateString()}</p>
          </div>
        </div>
        <div>
          <h3>Vendor Details:</h3>
          <p><b>${po.buyer.billing_address.company_name}</b></p>
          <p>${po.buyer.billing_address.line1 || ""}</p>
          <p>Mobile: ${po.buyer.billing_address.mobile}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>S.No</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${po.items.map((it: any) => `
              <tr>
                <td>${it.sr_no}</td>
                <td>${it.description}</td>
                <td>${it.quantity} ${it.unit}</td>
                <td>₹${it.rate}</td>
                <td>₹${it.total_amount}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="4" style="text-align:right">Grand Total:</td>
              <td>₹${po.totals.grand_total}</td>
            </tr>
          </tfoot>
        </table>
      </body>
    </html>`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
      <AppHeader 
        title="Purchase Order" 
        onBackPress={() => router.back()} 
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <ScrollView style={{ padding: 15 }} keyboardShouldPersistTaps="handled">
        {/* 🏢 Location Selection */}
        <View style={{ marginBottom: 20, padding: 12, backgroundColor: "#f8f9fa", borderRadius: 8, borderWidth: 1, borderColor: "#dee2e6" }}>
            <Text style={{ fontSize: 14, fontWeight: "700", marginBottom: 10, color: "#495057" }}>Seller Office / Branch</Text>
            {locations.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {locations.map(loc => {
                        const active = selectedLocation?._id === loc._id;
                        return (
                            <TouchableOpacity key={loc._id} onPress={() => selectLocation(loc._id)}
                                style={{ backgroundColor: active ? "#007bff" : "#fff", borderColor: active ? "#007bff" : "#ced4da", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1 }}>
                                <Text style={{ fontSize: 12, fontWeight: "700", color: active ? "#fff" : "#6c757d" }}>{loc.locationName}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            ) : (
                <Text style={{ fontSize: 14, color: "#212529", fontWeight: '700' }}>{selectedLocation?.locationName || "Head Office"}</Text>
            )}
            <Text style={{ fontSize: 11, color: "#6c757d", marginTop: 6 }}>
                GST: {selectedLocation?.gstin || "N/A"} | State: {selectedLocation?.address?.state || "N/A"}
            </Text>
        </View>

        <Text style={{ fontSize: 18, fontWeight: "700" }}>Select Vendor</Text>
      <View
        style={{
          borderWidth: 1,
          borderRadius: 5,
          marginVertical: 10,
          overflow: "hidden",
        }}
      >
        <Picker
          selectedValue={selectedVendor?._id || ""}
          onValueChange={(val) => loadVendorProducts(val)}
        >
          <Picker.Item label="Select Vendor" value="" />
          {vendors.map((v) => (
            <Picker.Item key={v._id} label={(v as any).name || v.vendorName} value={v._id} />
          ))}
        </Picker>
      </View>

      {!selectedVendor && <Text>No vendor selected</Text>}

      {selectedVendor?.productCost.map((cat, ci) => {
        const grouped: Record<string, any[]> = {};
        cat.products.forEach((p: any) => {
          if (!grouped[p.productName]) grouped[p.productName] = [];
          grouped[p.productName].push(p);
        });

        return (
          <View key={ci} style={{ marginBottom: 20 }}>
            <TouchableOpacity
              onPress={() => toggleCategory(cat.categoryName)}
              style={{
                backgroundColor: "#eee",
                padding: 8,
                borderRadius: 4,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Text style={{ fontWeight: "700", marginRight: 6 }}>
                {expandedCategories.includes(cat.categoryName) ? "▼" : "▶"}
              </Text>
              <Text style={{ fontWeight: "700" }}>{cat.categoryName}</Text>
            </TouchableOpacity>

            {expandedCategories.includes(cat.categoryName) &&
              Object.keys(grouped).map((prodName, pi) => {
                const key = `${cat.categoryName}-${prodName}`;
                return (
                  <View key={pi} style={{ marginTop: 6, marginLeft: 10 }}>
                    <TouchableOpacity
                      onPress={() => toggleProductName(cat.categoryName, prodName)}
                      style={{
                        backgroundColor: "#f2f2f2",
                        padding: 6,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontWeight: "600", marginRight: 6 }}>
                        {expandedProducts.includes(key) ? "▼" : "▶"}
                      </Text>
                      <Text style={{ fontWeight: "600" }}>{prodName}</Text>
                    </TouchableOpacity>

                    {expandedProducts.includes(key) && (
                      <View>
                        {/* Grid title row */}
                        <View
                          style={{
                            flexDirection: "row",
                            backgroundColor: "#d3d3d3",
                            borderWidth: 1,
                            borderColor: "#ccc",
                            padding: 6,
                          }}
                        >
                          <Text style={{ flex: 1, fontWeight: "700" }}>Description</Text>
                          <Text style={{ width: 60, textAlign: "center", fontWeight: "700" }}>Qty</Text>
                          <Text style={{ width: 60, textAlign: "center", fontWeight: "700" }}>UoM</Text>
                          <Text style={{ width: 60, textAlign: "center", fontWeight: "700" }}>Rate</Text>
                          <Text style={{ width: 80, textAlign: "center", fontWeight: "700" }}>Amount</Text>
                        </View>

                        {grouped[prodName].map((p, idx) => (
                          <View
                            key={idx}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              borderWidth: 1,
                              borderColor: "#ccc",
                              padding: 6,
                              marginBottom: 2,
                            }}
                          >
                            <TouchableOpacity
                              onPress={() => toggleProduct(ci, idx)}
                              style={{
                                width: 22,
                                height: 22,
                                borderWidth: 1,
                                backgroundColor: p.checked ? "green" : "red",
                                marginRight: 8,
                              }}
                            />
                            <Text style={{ flex: 1 }}>{p.description}</Text>
                            <TextInput
                              placeholder="Qty"
                              keyboardType="numeric"
                              value={p.qty || ""}
                              onChangeText={(val) => updateQty(ci, idx, val)}
                              style={{
                                width: 45,
                                borderWidth: 1,
                                padding: 4,
                                marginRight: 6,
                                textAlign: "center",
                              }}
                            />
                            <Text style={{ width: 60, textAlign: "center" }}>{p.UoM || ""}</Text>
                            <Text style={{ width: 60, textAlign: "center" }}>{p.price}</Text>
                            <Text style={{ width: 80, textAlign: "center" }}>
                              {calculateRowAmount(p)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
          </View>
        );
      })}

      <Text style={{ fontWeight: "700", fontSize: 16, marginTop: 10 }}>
        Grand Total: {calculateGrandTotal()}
      </Text>

      <TouchableOpacity
        onPress={handlePDF}
        disabled={saving}
        style={{
          backgroundColor: saving ? "#6c757d" : "#007bff",
          padding: 12,
          marginTop: 15,
          borderRadius: 8,
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: 10
        }}
      >
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>
          {saving ? "Processing..." : "Generate & Save PO"}
        </Text>
        {!saving && <Text style={{ color: "#fff", fontSize: 20 }}>📄</Text>}
      </TouchableOpacity>
      </ScrollView>
      </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

