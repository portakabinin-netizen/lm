// PurchaseOrder.tsx
import { httpClient } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import * as Print from "expo-print";
import { useLocalSearchParams } from "expo-router";
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
import { ProductItem, Vendor } from "./interface";

const formatMobile = (mobile: string) => {
  if (!mobile) return "";
  const m = mobile.replace(/\s+/g, "");
  if (m.length === 10) return `+91${m}`;
  if (m.startsWith("+") && m.length === 13) return m;
  if (m.length === 12) return `+${m}`;
  return m;
};

export default function PurchaseOrder() {
  const { id } = useLocalSearchParams();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<string[]>([]);

  // Dates: orderDate (current) and deliveryDate
  const [orderDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [deliveryDate, setDeliveryDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [showDeliveryPicker, setShowDeliveryPicker] = useState(false);

  // Delivery address details
  const [deliveryAddress, setDeliveryAddress] = useState<string>("");
  const [deliveryState, setDeliveryState] = useState<string>("");
  const [deliveryPin, setDeliveryPin] = useState<string>("");

  // After saving PO & generating PDF we store uri & poNumber
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [savedPoNumber, setSavedPoNumber] = useState<string | null>(null);

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      const res = await httpClient.get(`/product/vendor`);
      setVendors(res.data);
    } catch (err) {
      console.log("Vendor load error:", err);
      Alert.alert("Error", "Failed to load vendors");
    }
  };

  const loadVendorProducts = async (vendorId: string) => {
    if (!vendorId) {
      setSelectedVendor(null);
      return;
    }
    try {
      const res = await httpClient.get(`/product/rate/vendor/${vendorId}`);
      setSelectedVendor(res.data);
      // Reset PDF state when vendor changes
      setPdfUri(null);
      setSavedPoNumber(null);
    } catch (err) {
      console.log("Product Load Error:", err.response?.data || err);
      setSelectedVendor(null);
      Alert.alert("Error", "Failed to load vendor products");
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
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Keep original toggle logic (index based) to preserve your existing behavior
  const toggleProduct = (catIndex: number, prodIndex: number) => {
    if (!selectedVendor) return;
    const newVendor: any = { ...selectedVendor };
    const product = newVendor.productCost[catIndex].products[prodIndex];
    product.checked = !product.checked;
    setSelectedVendor(newVendor);
  };

  const updateQty = (catIndex: number, prodIndex: number, qty: string) => {
    if (!selectedVendor) return;
    const newVendor: any = { ...selectedVendor };
    const product = newVendor.productCost[catIndex].products[prodIndex];
    product.qty = qty;
    // Auto select/deselect row
    product.checked = Number(qty) > 0;
    setSelectedVendor(newVendor);
  };

  const calculateRowAmount = (product: ProductItem) =>
    Number(product.qty || 0) * Number(product.price || 0);

  const calculateGrandTotal = () => {
    if (!selectedVendor) return 0;
    return selectedVendor.productCost.reduce((catSum: number, cat: any) => {
      return (
        catSum +
        cat.products.reduce((pSum: number, p: any) => pSum + calculateRowAmount(p), 0)
      );
    }, 0);
  };

  // Save PO to backend and return response
  const savePOToBackend = async () => {
    if (!selectedVendor) {
      Alert.alert("Select vendor", "Please select a vendor first.");
      return null;
    }

    // collect selected items
    const items: any[] = [];
    selectedVendor.productCost.forEach((cat: any) => {
      cat.products.forEach((p: any) => {
        if (p.checked && Number(p.qty) > 0) {
          items.push({
            categoryName: cat.categoryName,
            productName: p.productName,
            description: p.description,
            qty: Number(p.qty),
            UoM: p.UoM || "",
            rate: Number(p.price),
            amount: calculateRowAmount(p),
          });
        }
      });
    });

    if (items.length === 0) {
      Alert.alert("No items", "No products selected or qty is zero.");
      return null;
    }

    const payload = {
      vendorId: selectedVendor._id,
      items,
      grandTotal: calculateGrandTotal(),
      orderDate,
      deliveryDate,
      deliveryAddress,
      deliveryState,
      deliveryPin,
    };

    try {
      const res = await httpClient.post(`/pdf-generate/po/create`, payload);
      // expects { success: true, poNumber: "PO-..." , savedOrder: { ... } }
      
      return res.data;
    } catch (err) {
      Alert.alert("Error", "Failed to save Purchase Order");
      return null;
    }
  };

  // Build HTML (uses selectedVendor and items) - similar to your old HTML but includes PO header
  const buildHtmlForPO = (poNumber: string) => {
    if (!selectedVendor) return "<html><body>No vendor</body></html>";

    let html = `<html>
      <head>
        <style>
          body { font-family: Arial; padding: 15px; color: #000; }
          h1 { font-size: 20px; margin-bottom: 6px; }
          .meta { margin-bottom: 12px; }
          .box { border: 1px solid #222; padding: 8px; margin-bottom: 12px; }
          table { width:100%; border-collapse: collapse; margin-bottom: 12px; }
          th, td { border: 1px solid #000; padding: 6px; text-align: center; }
          th { background: #f0f0f0; }
          td.left { text-align: left; }
        </style>
      </head>
      <body>
        <h1>Purchase Order</h1>

        <div class="box">
          <div class="meta"><strong>PO Number:</strong> ${poNumber}</div>
          <div class="meta"><strong>Order Date:</strong> ${orderDate} &nbsp;&nbsp; <strong>Delivery Date:</strong> ${deliveryDate}</div>
        </div>

        <div class="box">
          <h3>Vendor Details</h3>
          <div><strong>Name:</strong> ${selectedVendor.vendorName}</div>
          <div><strong>Contact:</strong> ${selectedVendor.contactPerson} | ${formatMobile(selectedVendor.mobileNo)}</div>
          <div><strong>Address:</strong> ${selectedVendor.vendorAddress || "-"}</div>
          <div><strong>GST:</strong> ${selectedVendor.vendorGST || "-"}</div>
        </div>

        <div class="box">
          <h3>Delivery Address</h3>
          <div>${deliveryAddress || "-"}</div>
          <div>${deliveryState || ""} - ${deliveryPin || ""}</div>
        </div>
    `;

    // table header
    html += `<table>
      <tr>
        <th>S.No</th>
        <th class="left">Description</th>
        <th>Qty</th>
        <th>UoM</th>
        <th>Rate</th>
        <th>Amount</th>
      </tr>`;

    let counter = 1;
    // iterate original productCost to maintain your order
    selectedVendor.productCost.forEach((cat: any) => {
      // optionally print category
      html += `<tr><td colspan="6" style="text-align:left; font-weight:bold; background:#eee">Category: ${cat.categoryName}</td></tr>`;
      cat.products.forEach((p: any) => {
        if (!p.checked || !p.qty) return;
        html += `<tr>
          <td>${counter++}</td>
          <td class="left">${p.description || p.productName}</td>
          <td>${p.qty}</td>
          <td>${p.UoM || ""}</td>
          <td>${p.price}</td>
          <td>${calculateRowAmount(p)}</td>
        </tr>`;
      });
    });

    html += `</table>`;

    html += `<h3>Grand Total: ${calculateGrandTotal()}</h3>`;

    html += `</body></html>`;

    return html;
  };

  // Save + generate PDF and set pdfUri + savedPoNumber so FAB appears
  const saveAndGeneratePDF = async () => {
    const saved = await savePOToBackend();
    if (!saved) return;

    const poNumber = saved.poNumber || saved.data?.poNumber || saved.savedOrder?.poNumber || null;
    if (!poNumber) {
      Alert.alert("Warning", "PO saved but no PO number returned by backend.");
    }
    setSavedPoNumber(poNumber);

    // Build HTML and create file
    const html = buildHtmlForPO(poNumber || "N/A");
    try {
      const { uri } = await Print.printToFileAsync({ html });
      setPdfUri(uri);
      // On iOS the file is already a pdf; on Android it may be different but sharing will work
      Alert.alert("Success", "Purchase Order saved and PDF generated.");
    } catch (err) {
      console.log("PDF generation error:", err);
      Alert.alert("Error", "Failed to generate PDF");
    }
  };

  const openPdf = async () => {
    if (!pdfUri) {
      Alert.alert("No PDF", "Generate PO to see PDF.");
      return;
    }
    // Sharing.shareAsync can open the file chooser — using share to "open"
    try {
      await Sharing.shareAsync(pdfUri);
    } catch (err) {
      console.log("Open PDF error:", err);
      Alert.alert("Error", "Unable to open PDF");
    }
  };

  const sharePdf = async () => {
    if (!pdfUri) {
      Alert.alert("No PDF", "Generate PO to share.");
      return;
    }
    try {
      await Sharing.shareAsync(pdfUri);
    } catch (err) {
      console.log("Share PDF error:", err);
      Alert.alert("Error", "Unable to share PDF");
    }
  };

  const printPdf = async () => {
    if (!pdfUri) {
      Alert.alert("No PDF", "Generate PO to print.");
      return;
    }
    try {
      // Print.printAsync accepts html or uri — pass uri where supported
      // Some platforms require Print.printAsync({ uri }) others expect html. We'll try uri first.
      // If uri is not supported, fallback to re-generating html and call Print.printAsync({ html })
      try {
        // @ts-ignore
        await Print.printAsync({ uri: pdfUri });
      } catch (e) {
        // fallback: build HTML and call printAsync
        const html = buildHtmlForPO(savedPoNumber || "N/A");
        // @ts-ignore
        await Print.printAsync({ html });
      }
    } catch (err) {
      console.log("Print PDF error:", err);
      Alert.alert("Error", "Unable to print PDF");
    }
  };

  // UI Rendering
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ padding: 15 }} contentContainerStyle={{ paddingBottom: 120 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
          Select Vendor
        </Text>

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
              <Picker.Item key={v._id} label={v.vendorName} value={v._id} />
            ))}
          </Picker>
        </View>

        {/* TOP: Order Date and Delivery Date on same line */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700" }}>Order Date</Text>
            <TextInput
              value={orderDate}
              editable={false}
              style={{
                borderWidth: 1,
                borderRadius: 6,
                padding: 8,
                marginTop: 6,
                backgroundColor: "#f2f2f2",
              }}
            />
          </View>

          <View style={{ width: 12 }} />

          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700" }}>Delivery Date</Text>
            <TouchableOpacity
              onPress={() => setShowDeliveryPicker(true)}
              style={{
                borderWidth: 1,
                borderRadius: 6,
                padding: 8,
                marginTop: 6,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "#fff",
              }}
            >
              <Text>{deliveryDate}</Text>
              <Ionicons name="calendar-outline" size={20} />
            </TouchableOpacity>

            {showDeliveryPicker && (
              <DateTimePicker
                value={new Date(deliveryDate)}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                onChange={(event: any, selectedDate?: Date) => {
                  setShowDeliveryPicker(false);
                  if (selectedDate) {
                    setDeliveryDate(selectedDate.toISOString().slice(0, 10));
                  }
                }}
              />
            )}
          </View>
        </View>

        {/* Delivery address + state + pin (next line) */}
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontWeight: "700", marginBottom: 6 }}>Delivery Address</Text>
          <TextInput
            placeholder="Delivery address"
            value={deliveryAddress}
            onChangeText={setDeliveryAddress}
            multiline
            style={{
              borderWidth: 1,
              borderRadius: 6,
              padding: 8,
              minHeight: 60,
              marginBottom: 8,
            }}
          />

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TextInput
              placeholder="State"
              value={deliveryState}
              onChangeText={setDeliveryState}
              style={{
                flex: 1,
                borderWidth: 1,
                borderRadius: 6,
                padding: 8,
                marginRight: 8,
              }}
            />
            <TextInput
              placeholder="PIN"
              value={deliveryPin}
              onChangeText={setDeliveryPin}
              keyboardType="number-pad"
              style={{
                width: 120,
                borderWidth: 1,
                borderRadius: 6,
                padding: 8,
              }}
            />
          </View>
        </View>

        {!selectedVendor && <Text>No vendor selected</Text>}

        {/* Category & Products (keeps your existing logic/layout) */}
        {selectedVendor?.productCost.map((cat: any, ci: number) => {
          const grouped: Record<string, ProductItem[]> = {};
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

                          {grouped[prodName].map((p: any, idx: number) => (
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

        {/* Save & Generate PO button */}
        <TouchableOpacity
          onPress={saveAndGeneratePDF}
          style={{
            backgroundColor: "#007bff",
            padding: 10,
            marginTop: 15,
            borderRadius: 6,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 16 }}>Save & Generate PO</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* FAB: appears only after PDF is generated (pdfUri set) */}
      {pdfUri && (
        <View
          style={{
            position: "absolute",
            right: 16,
            bottom: 20,
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 28,
              padding: 6,
              elevation: 6,
              marginBottom: 8,
            }}
          >
            <TouchableOpacity onPress={() => openPdf()} style={{ padding: 8 }}>
              <Ionicons name="document-text-outline" size={26} color="#333" />
            </TouchableOpacity>
          </View>

          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 28,
              padding: 6,
              elevation: 6,
              marginBottom: 8,
            }}
          >
            <TouchableOpacity onPress={() => sharePdf()} style={{ padding: 8 }}>
              <Ionicons name="share-social-outline" size={26} color="#333" />
            </TouchableOpacity>
          </View>

          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 28,
              padding: 6,
              elevation: 6,
            }}
          >
            <TouchableOpacity onPress={() => printPdf()} style={{ padding: 8 }}>
              <Ionicons name="print-outline" size={26} color="#333" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
