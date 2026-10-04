import { httpClient } from "@/context/AuthContext";
import { Picker } from "@react-native-picker/picker";
import * as Print from "expo-print";
import { useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import {
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

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      const res = await httpClient.get(`/product/vendor`);
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
      const res = await httpClient.get(`/product/rate/vendor/${vendorId}`);
      setSelectedVendor(res.data);
    } catch (err) {
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
    const product = newVendor.productCost[catIndex].products[prodIndex];
    product.checked = !product.checked;
    setSelectedVendor(newVendor);
  };

  const updateQty = (catIndex: number, prodIndex: number, qty: string) => {
    if (!selectedVendor) return;
    const newVendor = { ...selectedVendor };
    const product = newVendor.productCost[catIndex].products[prodIndex];
    product.qty = qty;

    // Auto select/deselect row
    if (Number(qty) > 0) product.checked = true;
    else product.checked = false;

    setSelectedVendor(newVendor);
  };

  const calculateRowAmount = (product: ProductItem) =>
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
    if (!selectedVendor) return;
    const selectedProducts = selectedVendor.productCost
      .flatMap((cat) => cat.products.filter((p) => p.checked))
      .filter((p) => Number(p.qty) > 0);
    if (selectedProducts.length === 0) {
      alert("No products selected!");
      return;
    }

    let html = `<html>
      <head>
        <style>
          body { font-family: Arial; padding: 15px; }
          h1 { font-size: 20px; font-weight: bold; }
          h2 { font-size: 14px; margin-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #000; padding: 6px; text-align: center; }
          th { font-weight: bold; }
          td.description { text-align: left; }
        </style>
      </head>
      <body>
        <h1>Vendor: ${selectedVendor.vendorName}</h1>
        <h2>Contact: ${selectedVendor.contactPerson} | Mobile: ${formatMobile(
      selectedVendor.mobileNo
    )}</h2>`;

    selectedVendor.productCost.forEach((cat) => {
      html += `<h3>Category: ${cat.categoryName}</h3>`;
      const grouped: Record<string, ProductItem[]> = {};
      cat.products.forEach((p) => {
        if (!grouped[p.productName]) grouped[p.productName] = [];
        grouped[p.productName].push(p);
      });

      Object.keys(grouped).forEach((prodName) => {
        html += `<h4>Product Name: ${prodName}</h4>`;
        html += `<table>
          <tr>
            <th>S.No</th>
            <th>Description</th>
            <th>Qty</th>
            <th>UoM</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>`;
        grouped[prodName].forEach((p, i) => {
          if (!p.checked || !p.qty) return;
          html += `<tr>
            <td>${i + 1}</td>
            <td class="description">${p.description}</td>
            <td>${p.qty}</td>
            <td>${p.UoM || ""}</td>
            <td>${p.price}</td>
            <td>${calculateRowAmount(p)}</td>
          </tr>`;
        });
        html += `</table>`;
      });
    });

    html += `<h3>Grand Total: ${calculateGrandTotal()}</h3></body></html>`;

    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  };

  return (
    <ScrollView style={{ padding: 15 }}>
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
            <Picker.Item key={v._id} label={v.vendorName} value={v._id} />
          ))}
        </Picker>
      </View>

      {!selectedVendor && <Text>No vendor selected</Text>}

      {selectedVendor?.productCost.map((cat, ci) => {
        const grouped: Record<string, ProductItem[]> = {};
        cat.products.forEach((p) => {
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
        style={{
          backgroundColor: "#007bff",
          padding: 10,
          marginTop: 15,
          borderRadius: 6,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 20 }}>📄</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
