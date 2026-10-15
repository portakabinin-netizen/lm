import { httpClient } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
const today = new Date();
today.setHours(0, 0, 0, 0);
const formatDate = (date: Date) => {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

/**
 * Props:
 *  - type: "PO" | "PI" | "TI" | "DN" | "CN"
 *  - title: string (display)
 */
export default function OrderFlowForm({ type, title }: { type: string; title: string }) {
  const [parties, setParties] = useState<any[]>([]); // parties (vendors/customers) fetched
  const [partyType, setPartyType] = useState<string>(() => (type === "PO" ? "vendor" : type === "PI" || type === "TI" ? "customer" : "customer")); 
  const [selectedParty, setSelectedParty] = useState<any | null>(null);

  // For PO: selectedParty.productCost used. For others we allow manual items.
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<string[]>([]);
  const [deliveryDate, setDeliveryDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [showDeliveryPicker, setShowDeliveryPicker] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [deliveryPin, setDeliveryPin] = useState("");

  const [manualItems, setManualItems] = useState<any[]>([]); // for non-PO docs
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [savedNumber, setSavedNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadParties();
  }, [partyType]);

  const loadParties = async () => {
    try {
      // Try unified parties endpoint first
      let res;
      try {
        res = await httpClient.get(`/party?type=${partyType}`);
      } catch (err) {
        // fallback: vendor endpoint for vendor
        if (partyType === "vendor") {
          res = await httpClient.get(`/product/vendor`);
        } else {
          // fallback: try /customer endpoint
          res = await httpClient.get(`/customer`);
        }
      }
      setParties(res?.data || []);
      setSelectedParty(null);
    } catch (err) {
      console.log("Party load error:", err);
      Alert.alert("Error", "Failed to load parties");
    }
  };

  const loadPartyProducts = async (partyId: string) => {
    if (!partyId) {
      setSelectedParty(null);
      return;
    }
    try {
      // For vendor: load vendor product cost grouped
      if (partyType === "vendor") {
        const res = await httpClient.get(`/product/rate/vendor/${partyId}`);
        setSelectedParty(res.data);
      } else {
        // For customer, no product list - set basic party
        // try to fetch customer detail
        try {
          const res = await httpClient.get(`/customer/${partyId}`);
          setSelectedParty(res.data);
        } catch {
          // fallback - find in parties list
          const p = parties.find((x) => x._id === partyId || x.id === partyId);
          setSelectedParty(p || null);
        }
      }
    } catch (err) {
      console.log("loadPartyProducts error", err);
      setSelectedParty(null);
    }
  };

  const toggleCategory = (catName: string) =>
    setExpandedCategories((prev) => (prev.includes(catName) ? prev.filter((c) => c !== catName) : [...prev, catName]));

  const toggleProductName = (catName: string, prodName: string) => {
    const key = `${catName}-${prodName}`;
    setExpandedProducts((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const toggleProductChecked = (catIndex: number, prodIndex: number) => {
    if (!selectedParty) return;
    const clone = { ...selectedParty };
    const product = clone.productCost[catIndex].products[prodIndex];
    product.checked = !product.checked;
    setSelectedParty(clone);
  };

  const updateQty = (catIndex: number, prodIndex: number, qty: string) => {
    if (!selectedParty) return;
    const clone = { ...selectedParty };
    const product = clone.productCost[catIndex].products[prodIndex];
    product.qty = qty;
    product.checked = Number(qty) > 0;
    setSelectedParty(clone);
  };

  const addManualRow = () => {
    setManualItems((s) => [...s, { description: "", qty: "", UoM: "", rate: "", amount: 0 }]);
  };

  const updateManualRow = (idx: number, key: string, val: any) => {
    setManualItems((s) => {
      const c = [...s];
      c[idx][key] = val;
      if (key === "qty" || key === "rate") {
        const q = Number(c[idx].qty || 0);
        const r = Number(c[idx].rate || 0);
        c[idx].amount = q * r;
      }
      return c;
    });
  };

  const removeManualRow = (idx: number) => {
    setManualItems((s) => s.filter((_, i) => i !== idx));
  };

  const calculateRowAmount = (product: any) => Number(product.qty || 0) * Number(product.price || product.rate || 0);

  const calculateGrandTotal = () => {
    let total = 0;
    if (type === "PO") {
      if (!selectedParty) return 0;
      total = selectedParty.productCost.reduce((catSum: number, cat: any) => {
        return catSum + cat.products.reduce((pSum: number, p: any) => pSum + calculateRowAmount(p), 0);
      }, 0);
    } else {
      total = manualItems.reduce((s, it) => s + Number(it.amount || 0), 0);
    }
    return total;
  };

  const buildHtml = (number: string) => {
    const party = selectedParty || {};
    let html = `<html><head><meta charset="utf-8"><style>
      body{font-family:Arial;padding:16px} h1{font-size:20px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #000;padding:6px;text-align:center} th{background:#eee}
    </style></head><body>`;
    html += `<h1>${title} - ${number || ""}</h1>`;
    html += `<div><strong>Party:</strong> ${party.partyName || party.vendorName || party.vendorName || "-"}</div>`;
    html += `<div><strong>Contact:</strong> ${party.partyMobile || party.mobileNo || "-"}</div>`;
    html += `<div><strong>Order Date:</strong> ${new Date().toLocaleDateString()}</div>`;
    html += `<div><strong>Delivery Date:</strong> ${deliveryDate}</div>`;
    html += `<div style="margin-top:8px"><strong>Delivery Address:</strong><br/>${deliveryAddress || "-"}<br/>${deliveryState || ""} - ${deliveryPin || ""}</div>`;

    html += `<h3 style="margin-top:12px">Items</h3>`;
    html += `<table><tr><th>S.No</th><th>Description</th><th>Qty</th><th>UoM</th><th>Rate</th><th>Amount</th></tr>`;
    let c = 1;
    if (type === "PO" && selectedParty?.productCost) {
      selectedParty.productCost.forEach((cat: any) => {
        html += `<tr><td colspan="6" style="text-align:left;background:#f2f2f2"><strong>Category: ${cat.categoryName}</strong></td></tr>`;
        cat.products.forEach((p: any) => {
          if (!p.checked || !p.qty) return;
          html += `<tr><td>${c++}</td><td style="text-align:left">${p.description || p.productName}</td><td>${p.qty}</td><td>${p.UoM||""}</td><td>${p.price||p.rate}</td><td>${calculateRowAmount(p)}</td></tr>`;
        });
      });
    } else {
      manualItems.forEach((it, i) => {
        html += `<tr><td>${i + 1}</td><td style="text-align:left">${it.description}</td><td>${it.qty}</td><td>${it.UoM}</td><td>${it.rate}</td><td>${it.amount}</td></tr>`;
      });
    }
    html += `</table>`;
    html += `<h3>Grand Total: ${calculateGrandTotal()}</h3>`;
    html += `</body></html>`;
    return html;
  };

  const saveAndGenerate = async () => {
    setLoading(true);
    try {
      // Build payload matching backend structure
      const payloadBase: any = {
        billingAddress: "", // optional
        shippingAddress: "", // optional
        party: {
          partyType: partyType,
          partyId: selectedParty?._id || selectedParty?.id || null,
          partyName: selectedParty?.partyName || selectedParty?.vendorName || selectedParty?.vendorName || "",
          partyAddress: selectedParty?.partyAddress || selectedParty?.vendorAddress || "",
          partyGST: selectedParty?.partyGST || selectedParty?.vendorGST || "",
          partyMobile: selectedParty?.partyMobile || selectedParty?.mobileNo || "",
        },
        items: [],
        grandTotal: calculateGrandTotal(),
        date: new Date(),
        dueDate: null,
      };

      if (type === "PO") {
        // collect selected vendor items
        selectedParty.productCost.forEach((cat: any) => {
          cat.products.forEach((p: any) => {
            if (p.checked && Number(p.qty) > 0) {
              payloadBase.items.push({
                categoryName: cat.categoryName,
                productName: p.productName,
                description: p.description,
                qty: Number(p.qty),
                UoM: p.UoM,
                rate: Number(p.price),
                amount: calculateRowAmount(p),
              });
            }
          });
        });
      } else {
        // manual items
        manualItems.forEach((it: any) => {
          payloadBase.items.push({
            categoryName: it.categoryName || "",
            productName: it.productName || "",
            description: it.description || "",
            qty: Number(it.qty || 0),
            UoM: it.UoM || "",
            rate: Number(it.rate || 0),
            amount: Number(it.amount || 0),
          });
        });
      }

      // choose endpoint
      const endpoints: any = {
        PO: "/orderflows/po/create",
        PI: "/orderflows/pi/create",
        TI: "/orderflows/ti/create",
        DN: "/orderflows/dn/create",
        CN: "/orderflows/cn/create",
      };
      const ep = endpoints[type];

      // submit
      const res = await axios.post(`${api_url}${ep}`, payloadBase);
      if (!res?.data?.success) {
        Alert.alert("Save failed", JSON.stringify(res.data || res));
        setLoading(false);
        return;
      }

      const number = res.data.number || res.data.poNumber || res.data.poNumber || null;
      setSavedNumber(number);

      // generate pdf
      const html = buildHtml(number || "N/A");
      const { uri } = await Print.printToFileAsync({ html });
      setPdfUri(uri);

      Alert.alert("Saved", `${type} saved as ${number}`);
    } catch (err) {
      console.log("save error", err);
      Alert.alert("Error", "Failed to save document");
    } finally {
      setLoading(false);
    }
  };

  const openPdf = async () => {
    if (!pdfUri) return Alert.alert("No PDF", "Generate PDF first");
    try {
      await Sharing.shareAsync(pdfUri);
    } catch (err) {
      Alert.alert("Error", "Unable to open PDF");
    }
  };

  // ui
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ padding: 15, paddingBottom: 140 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>{title}</Text>

        {/* Party type switcher for DN/CN, for PO/PI it's fixed */}
        {(type === "DN" || type === "CN") && (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontWeight: "700" }}>Party Type</Text>
            <View style={{ borderWidth: 1, borderRadius: 6, marginTop: 6 }}>
              <Picker selectedValue={partyType} onValueChange={(v) => setPartyType(v)}>
                <Picker.Item label="Customer" value="customer" />
                <Picker.Item label="Vendor" value="vendor" />
              </Picker>
            </View>
          </View>
        )}

        {/* Party selector */}
        <Text style={{ fontWeight: "700", marginTop: 6 }}>Select {partyType === "vendor" ? "Vendor" : "Customer"}</Text>
        <View style={{ borderWidth: 1, borderRadius: 6, marginTop: 6, overflow: "hidden" }}>
          <Picker
            selectedValue={selectedParty?._id || selectedParty?.id || ""}
            onValueChange={(val) => loadPartyProducts(val)}
          >
            <Picker.Item label={`Select ${partyType}`} value="" />
            {parties.map((p) => (
              <Picker.Item key={p._id || p.id} label={p.vendorName || p.partyName || p.name} value={p._id || p.id} />
            ))}
          </Picker>
        </View>
        

        {/* Dates same line: orderDate fixed today, deliveryDate pick */}
        
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
          {/* Order Date */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700" }}>Order Date</Text>
            <TextInput
              value={formatDate(today)}
              editable={false}
              style={{
                borderWidth: 1,
                padding: 8,
                borderRadius: 6,
                marginTop: 6,
                backgroundColor: "#f2f2f2",
              }}
            />
          </View>

          <View style={{ width: 12 }} />

          {/* Delivery Date */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700" }}>Delivery Date</Text>

            <TouchableOpacity
              onPress={() => setShowDeliveryPicker(true)}
              style={{
                borderWidth: 1,
                padding: 8,
                borderRadius: 6,
                marginTop: 6,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text>{deliveryDate}</Text>
              <Ionicons name="calendar-outline" size={20} />
            </TouchableOpacity>

            {showDeliveryPicker && (
              <DateTimePicker
                value={new Date(deliveryDate)}
                mode="date"
                minimumDate={today}   // ✅ prevents past dates
                display={Platform.OS === "ios" ? "inline" : "default"}
                onChange={(event, selectedDate) => {
                  setShowDeliveryPicker(false);

                  if (selectedDate) {
                    selectedDate.setHours(0, 0, 0, 0);

                    if (selectedDate >= today) {
                      setDeliveryDate(formatDate(selectedDate));
                    }
                  }
                }}
              />
            )}
          </View>
        </View>

        {/* Delivery address row */}
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: "700" }}>Delivery Address</Text>
          <TextInput value={deliveryAddress} onChangeText={setDeliveryAddress} multiline style={{ borderWidth: 1, padding: 8, borderRadius: 6, minHeight: 60, marginTop: 6 }} />
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            <TextInput value={deliveryState} onChangeText={setDeliveryState} placeholder="State" style={{ flex: 1, borderWidth: 1, padding: 8, borderRadius: 6, marginRight: 8 }} />
            <TextInput value={deliveryPin} maxLength={6} onChangeText={setDeliveryPin} placeholder="PIN" keyboardType="number-pad" style={{ width: 120, borderWidth: 1, padding: 8, borderRadius: 6  }} />
          </View>
        </View>

        {/* Items section */}
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontWeight: "700", marginBottom: 8 }}>Items</Text>

          {/* If PO and selectedParty has productCost → show grouped view as in your working code */}
          {type === "PO" && selectedParty?.productCost ? (
            selectedParty.productCost.map((cat: any, ci: number) => {
              const grouped: Record<string, any[]> = {};
              cat.products.forEach((p: any) => {
                if (!grouped[p.productName]) grouped[p.productName] = [];
                grouped[p.productName].push(p);
              });

              return (
                <View key={ci} style={{ marginBottom: 14 }}>
                  <TouchableOpacity onPress={() => toggleCategory(cat.categoryName)} style={{ backgroundColor: "#eee", padding: 8, borderRadius: 4, flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontWeight: "700", marginRight: 6 }}>{expandedCategories.includes(cat.categoryName) ? "▼" : "▶"}</Text>
                    <Text style={{ fontWeight: "700" }}>{cat.categoryName}</Text>
                  </TouchableOpacity>

                  {expandedCategories.includes(cat.categoryName) &&
                    Object.keys(grouped).map((prodName, pi) => {
                      const key = `${cat.categoryName}-${prodName}`;
                      return (
                        <View key={pi} style={{ marginTop: 6, marginLeft: 10 }}>
                          <TouchableOpacity onPress={() => toggleProductName(cat.categoryName, prodName)} style={{ backgroundColor: "#f2f2f2", padding: 6, flexDirection: "row", alignItems: "center" }}>
                            <Text style={{ fontWeight: "600", marginRight: 6 }}>{expandedProducts.includes(key) ? "▼" : "▶"}</Text>
                            <Text style={{ fontWeight: "600" }}>{prodName}</Text>
                          </TouchableOpacity>

                          {expandedProducts.includes(key) && (
                            <View>
                              <View style={{ flexDirection: "row", backgroundColor: "#d3d3d3", borderWidth: 1, borderColor: "#ccc", padding: 6 }}>
                                <Text style={{ flex: 1, fontWeight: "700" }}>Description</Text>
                                <Text style={{ width: 60, textAlign: "center", fontWeight: "700" }}>Qty</Text>
                                <Text style={{ width: 60, textAlign: "center", fontWeight: "700" }}>UoM</Text>
                                <Text style={{ width: 60, textAlign: "center", fontWeight: "700" }}>Rate</Text>
                                <Text style={{ width: 80, textAlign: "center", fontWeight: "700" }}>Amount</Text>
                              </View>

                              {grouped[prodName].map((p: any, idx: number) => (
                                <View key={idx} style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#ccc", padding: 6, marginBottom: 2 }}>
                                  <TouchableOpacity onPress={() => toggleProductChecked(ci, idx)} style={{ width: 22, height: 22, borderWidth: 1, backgroundColor: p.checked ? "green" : "red", marginRight: 8 }} />
                                  <Text style={{ flex: 1 }}>{p.description}</Text>
                                  <TextInput placeholder="Qty" keyboardType="numeric" value={p.qty || ""} onChangeText={(val) => updateQty(ci, idx, val)} style={{ width: 45, borderWidth: 1, padding: 4, marginRight: 6, textAlign: "center" }} />
                                  <Text style={{ width: 60, textAlign: "center" }}>{p.UoM || ""}</Text>
                                  <Text style={{ width: 60, textAlign: "center" }}>{p.price}</Text>
                                  <Text style={{ width: 80, textAlign: "center" }}>{calculateRowAmount(p)}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}
                </View>
              );
            })
          ) : (
            /* Manual items for PI/TI/DN/CN */
            <View>
              {manualItems.map((it, i) => (
                <View key={i} style={{ borderWidth: 1, borderColor: "#ddd", padding: 8, borderRadius: 6, marginBottom: 8 }}>
                  <TextInput placeholder="Description" value={it.description} onChangeText={(v) => updateManualRow(i, "description", v)} style={{ borderWidth: 1, padding: 8, borderRadius: 6, marginBottom: 6 }} />
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <TextInput placeholder="Qty" keyboardType="numeric" value={String(it.qty || "")} onChangeText={(v) => updateManualRow(i, "qty", v)} style={{ flex: 1, borderWidth: 1, padding: 8, borderRadius: 6, marginRight: 6 }} />
                    <TextInput placeholder="UoM" value={it.UoM} onChangeText={(v) => updateManualRow(i, "UoM", v)} style={{ width: 80, borderWidth: 1, padding: 8, borderRadius: 6, marginRight: 6 }} />
                    <TextInput placeholder="Rate" keyboardType="numeric" value={String(it.rate || "")} onChangeText={(v) => updateManualRow(i, "rate", v)} style={{ width: 100, borderWidth: 1, padding: 8, borderRadius: 6, marginRight: 6 }} />
                    <Text style={{ width: 90 }}>{it.amount || 0}</Text>
                  </View>
                  <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "flex-end" }}>
                    <TouchableOpacity onPress={() => removeManualRow(i)} style={{ padding: 8 }}>
                      <Text style={{ color: "red" }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <TouchableOpacity onPress={addManualRow} style={{ backgroundColor: "#007bff", padding: 10, borderRadius: 6, alignItems: "center", marginTop: 8 }}>
                <Text style={{ color: "#fff" }}>+ Add Item</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Text style={{ fontWeight: "700", fontSize: 16, marginTop: 12 }}>Grand Total: {calculateGrandTotal()}</Text>

        <TouchableOpacity onPress={saveAndGenerate} style={{ backgroundColor: "#007bff", padding: 12, marginTop: 12, borderRadius: 6, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontSize: 16 }}>{loading ? "Saving..." : `Save & Generate ${type}`}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* FAB */}
      {pdfUri && (
        <View style={{ position: "absolute", right: 16, bottom: 20, alignItems: "center" }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 28, padding: 6, elevation: 6, marginBottom: 8 }}>
            <TouchableOpacity onPress={openPdf} style={{ padding: 8 }}>
              <Ionicons name="document-text-outline" size={26} color="#333" />
            </TouchableOpacity>
          </View>
          <View style={{ backgroundColor: "#fff", borderRadius: 28, padding: 6, elevation: 6, marginBottom: 8 }}>
            <TouchableOpacity onPress={() => Sharing.shareAsync(pdfUri)} style={{ padding: 8 }}>
              <Ionicons name="share-social-outline" size={26} color="#333" />
            </TouchableOpacity>
          </View>
          <View style={{ backgroundColor: "#fff", borderRadius: 28, padding: 6, elevation: 6 }}>
            <TouchableOpacity onPress={() => Print.printAsync({ uri: pdfUri })} style={{ padding: 8 }}>
              <Ionicons name="print-outline" size={26} color="#333" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
