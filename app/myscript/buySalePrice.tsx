import { httpClient } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { styles } from "../myscript/dashboards/styles/styles";

export default function VendorRatesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Data
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ratesMap, setRatesMap] = useState({}); // vendorId → categoryId → productId → { buyRate, saleRate, uom, description, rateRecordId }

  // UI state
  const [expandedVendor, setExpandedVendor] = useState(null);
  const [expandedCategoryForVendor, setExpandedCategoryForVendor] = useState({});

  // Modals
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState(null); // "rate" | "link" | "editCategoryProducts"

  // Editing states
  const [editingRate, setEditingRate] = useState(null);

  // Form fields (rate)
  const [vendorId, setVendorId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [productId, setProductId] = useState("");
  const [description, setDescription] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [uom, setUom] = useState("");

  // Category/Product modal
  const [newCategoryName, setNewCategoryName] = useState("");
  const [gridProducts, setGridProducts] = useState([]);
  const [activeVendorForModal, setActiveVendorForModal] = useState(null);
  const [selectedCategoryForGrid, setSelectedCategoryForGrid] = useState(null);

  // Dummy Session
  const userSession = {
    corpName: "portakabin.in",
    tagName: "Unit of Hiresh iSearch",
    userName: "Suresh Chauhan",
    userId: "6922fdef5ccd1468ac80563",
    CorpId: "",
    corpProfileImage: "https://ui-avatars.com/api/?name=Porta+Kabin",
    userRole: "CorpAdmin",
  };

  // Load initial data
  const loadAll = async () => {
    setLoading(true);
    try {
      const [rVendors, rCategories, rPriceTags] = await Promise.all([
        httpClient.get(`/product/vendor`),
        httpClient.get(`/product/category`),
        //axios.get(`${api_url}/pricetags/summary`)
        []
      ]);

      setVendors(Array.isArray(rVendors.data) ? rVendors.data : []);
      setCategories(Array.isArray(rCategories.data) ? rCategories.data : []);

      const linked = {};
      if (Array.isArray(rPriceTags.data)) {
        rPriceTags.data.forEach(row => {
          const vId = row.vendorId?._id || row.vendorId;
          const cId = row.categoryId?._id || row.categoryId;
          const pId = row.productId?._id || row.productId;
          if (!vId || !cId || !pId) return;

          if (!linked[vId]) linked[vId] = {};
          if (!linked[vId][cId]) linked[vId][cId] = {};

          linked[vId][cId][pId] = {
            buyRate: row.buyRate ?? row.buyPrice ?? "",
            saleRate: row.saleRate ?? row.salePrice ?? "",
            uom: row.UoM ?? row.uom ?? "",
            description: row.description ?? "",
            rateRecordId: row._id ?? null
          };
        });
      }
      setRatesMap(linked);

    } catch (e) {
      console.warn(e);
      Alert.alert("Error", "Unable to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // Helpers
  const getVendorCounts = (vId) => {
    const v = ratesMap[vId] || {};
    const linkedCategories = Object.keys(v).length;
    let linkedProducts = 0;
    Object.values(v).forEach(catObj => linkedProducts += Object.keys(catObj || {}).length);
    return { linkedCategories, linkedProducts };
  };

  const toggleVendor = (vId) => setExpandedVendor(prev => (prev === vId ? null : vId));
  const toggleCategoryForVendor = (vendorId, categoryId) => {
    setExpandedCategoryForVendor(prev => {
      const current = prev[vendorId];
      return { ...prev, [vendorId]: current === categoryId ? null : categoryId };
    });
  };

  // Rate modal
  const openAddRateModalFor = (vId, cId, pId, prodDesc) => {
    setEditingRate(null);
    setVendorId(vId);
    setCategoryId(cId);
    setProductId(pId);
    setDescription(prodDesc || "");
    setBuyPrice("");
    setSalePrice("");
    setUom("");
    setModalMode("rate");
    setModalVisible(true);
  };

  const openEditRateModal = (vId, cId, pId) => {
    const saved = ratesMap[vId] && ratesMap[vId][cId] && ratesMap[vId][cId][pId];
    setEditingRate(saved || null);
    setVendorId(vId);
    setCategoryId(cId);
    setProductId(pId);
    setDescription(saved?.description || "");
    setBuyPrice(String(saved?.buyRate ?? ""));
    setSalePrice(String(saved?.saleRate ?? ""));
    setUom(saved?.uom || "");
    setModalMode("rate");
    setModalVisible(true);
  };

  const saveRate = async () => {
    if (!vendorId || !categoryId || !productId || !buyPrice || !salePrice || !uom)
      return Alert.alert("Validation", "All fields required");

    try {
      const payload = {
        vendorId,
        categoryId,
        productId,
        description,
        buyRate: parseFloat(buyPrice),
        saleRate: parseFloat(salePrice),
        uom,
      };

      if (editingRate && editingRate.rateRecordId) {
        await httpClient.put(`/vendor/rates/${editingRate.rateRecordId}`, payload);
        Alert.alert("Updated", "Rate updated successfully");
      } else {
        await httpClient.post(`/product/pricetags/save`, { vendorId, categoryId, items: [{ ...payload }] });
        Alert.alert("Saved", "Rate added successfully");
      }

      setModalVisible(false);
      setVendorId(""); setCategoryId(""); setProductId(""); setDescription(""); setBuyPrice(""); setSalePrice(""); setUom(""); setEditingRate(null);
      await loadAll();

    } catch (err) {
      console.warn(err);
      Alert.alert("Error", err?.response?.data?.error || "Failed to save rate");
    }
  };

  const deletePriceTag = (vId, cId, pId) => {
    Alert.alert("Delete", "Are you sure you want to delete this price?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const rateId = ratesMap[vId][cId][pId].rateRecordId;
            await httpClient.delete(`/vendor/rates/${rateId}`);
            Alert.alert("Deleted");
            await loadAll();
          } catch (err) {
            console.warn(err);
            Alert.alert("Error", "Failed to delete price");
          }
        }
      }
    ]);
  };

  // Grid modal helpers
  const addGridProduct = () => setGridProducts(prev => [...prev, { productName: "", description: "", buyRate: "", saleRate: "", UoM: "SQF" }]);
  const removeGridProduct = (idx) => setGridProducts(prev => prev.filter((_, i) => i !== idx));
  const updateGridProduct = (idx, key, value) => {
    setGridProducts(prev => {
      const copy = [...prev];
      copy[idx][key] = value;
      return copy;
    });
  };

  const saveCategoryProductsGrid = async () => {
    try {
      if (!newCategoryName.trim()) return Alert.alert("Validation", "Category name is required");
      if (!gridProducts.length) return Alert.alert("Validation", "Add at least one product");

      // 1. Create new category if linking
      let categoryIdToUse = selectedCategoryForGrid;
      if (modalMode === "link") {
        const r = await httpClient.post(`/product/category/add`, { categoryName: newCategoryName });
        categoryIdToUse = r.data._id;
      }

      // 2. Save products
      for (const prod of gridProducts) {
        if (!prod._id) {
          const r = await httpClient.post(`/product/add`, { categoryId: categoryIdToUse, productName: prod.productName, description: prod.description });
          prod._id = r.data._id;
        } else {
          await httpClient.put(`/product/${categoryIdToUse}/${prod._id}`, { productName: prod.productName, description: prod.description });
        }
      }

      // 3. Save rates if provided
      const items = gridProducts
        .filter(p => p.buyRate || p.saleRate)
        .map(p => ({ productId: p._id, buyRate: parseFloat(p.buyRate), saleRate: parseFloat(p.saleRate), UoM: p.UoM || "SQF" }));

      if (items.length) {
        await httpClient.post(`/product/pricetags/save`, { vendorId: activeVendorForModal, categoryId: categoryIdToUse, items });
      }

      setModalVisible(false);
      setNewCategoryName("");
      setGridProducts([]);
      setSelectedCategoryForGrid(null);
      setActiveVendorForModal(null);
      await loadAll();
      Alert.alert("Success", "Category and products saved successfully");

    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to save data");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeContainer, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#0b6cff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeContainer}>
      {/* HEADER */}
      <SafeAreaView style={styles.headerSafe} edges={["top"]}>
        <View style={styles.header}>
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={styles.headerTitle}>{userSession.corpName}</Text>
            <Text style={styles.headersubTitle}>{userSession.tagName}</Text>
          </View>
          <View style={{ marginRight: 10 }}>
            <Image source={{ uri: userSession.corpProfileImage }} style={styles.menuImage} />
          </View>
        </View>
      </SafeAreaView>

      {/* TOOLBAR */}
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#0b6cff" />
        </TouchableOpacity>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={styles.toolbarTitle}>Vendors</Text>
          <TouchableOpacity onPress={() => loadAll()} style={{ marginLeft: 20 }}>
            <Ionicons name="refresh" size={22} color="#0b6cff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* BODY */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {vendors.map((vendor) => {
          const vId = vendor._id;
          const counts = getVendorCounts(vId);

          return (
            <View key={vId} style={{ marginBottom: 18 }}>
              <View style={styles.card}>
                <TouchableOpacity
                  onPress={() => toggleVendor(vId)}
                  style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                >
                  <Ionicons name="business" size={20} color="#0b6cff" />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={styles.vendorName}>{vendor.vendorName}</Text>
                    <Text style={{ color: "#444", fontSize: 13 }}>
                      {counts.linkedCategories} categories • {counts.linkedProducts} products
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Expanded Vendor */}
              {expandedVendor === vId && (
                <View style={{ marginTop: 10, marginLeft: 6 }}>
                  {/* Link New Category-Product */}
                  <TouchableOpacity
                    onPress={() => {
                      setActiveVendorForModal(vId);
                      setModalMode("link");
                      setModalVisible(true);
                    }}
                    style={{ padding: 6, backgroundColor: "#00a86b", borderRadius: 6, marginBottom: 12, alignSelf: "flex-start" }}
                  >
                    <Text style={{ color: "#fff", fontSize: 12 }}>Link New Category-Product</Text>
                  </TouchableOpacity>

                  {categories.map((cat) => {
                    const cId = cat._id;
                    const expandedCatId = expandedCategoryForVendor[vId];
                    return (
                      <View key={cId} style={{ marginBottom: 12 }}>
                        <View style={{ ...styles.card, paddingVertical: 10 }}>
                          <TouchableOpacity
                            onPress={() => toggleCategoryForVendor(vId, cId)}
                            style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                          >
                            <Ionicons name="pricetag-outline" size={18} color="#0b6cff" />
                            <Text style={{ marginLeft: 8, fontWeight: "700" }}>{cat.categoryName}</Text>
                          </TouchableOpacity>
                        </View>

                        {expandedCatId === cId && (
                          <View style={{ marginLeft: 12, marginTop: 8 }}>
                            {/* Modify Category + Products */}
                            <TouchableOpacity
                              onPress={() => {
                                setActiveVendorForModal(vId);
                                setSelectedCategoryForGrid(cId);
                                setGridProducts(cat.products.map(p => ({ ...p, buyRate: ratesMap[vId]?.[cId]?.[p._id]?.buyRate || "", saleRate: ratesMap[vId]?.[cId]?.[p._id]?.saleRate || "", UoM: ratesMap[vId]?.[cId]?.[p._id]?.uom || "SQF" })));
                                setNewCategoryName(cat.categoryName);
                                setModalMode("editCategoryProducts");
                                setModalVisible(true);
                              }}
                              style={{ padding: 6, backgroundColor: "#ff9900", borderRadius: 6, marginBottom: 8, alignSelf: "flex-start" }}
                            >
                              <Text style={{ color: "#fff", fontSize: 12 }}>Modify Category + Products</Text>
                            </TouchableOpacity>

                            {/* Products */}
                            {cat.products?.map((prod) => {
                              const saved = ratesMap[vId] && ratesMap[vId][cId] && ratesMap[vId][cId][prod._id];
                              return (
                                <View key={prod._id} style={styles.card}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontWeight: "600" }}>{prod.productName}</Text>
                                    <Text style={styles.productDesc}>↳ {prod.description || "No description"}</Text>
                                    {saved ? (
                                      <Text style={{ marginTop: 6 }}>
                                        Buy: ₹{saved.buyRate} | Sale: ₹{saved.saleRate} / {saved.uom}
                                      </Text>
                                    ) : <Text style={{ marginTop: 6, color: "#666" }}>No rate yet</Text>}
                                  </View>

                                  <View style={{ justifyContent: "center" }}>
                                    <TouchableOpacity
                                      onPress={() => saved ? openEditRateModal(vId, cId, prod._id) : openAddRateModalFor(vId, cId, prod._id, prod.description)}
                                      style={{ padding: 8, backgroundColor: "#0b6cff", borderRadius: 8 }}
                                    >
                                      <Text style={{ color: "#fff" }}>{saved ? "Edit Rate" : "Add Rate"}</Text>
                                    </TouchableOpacity>

                                    {saved && (
                                      <TouchableOpacity onPress={() => deletePriceTag(vId, cId, prod._id)} style={{ marginTop: 8 }}>
                                        <Text style={{ color: "#d12f2f" }}>Delete</Text>
                                      </TouchableOpacity>
                                    )}
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
      </ScrollView>

      {/* MODAL: RATE */}
      <Modal visible={modalVisible && modalMode === "rate"} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrapper}>
          <ScrollView contentContainerStyle={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingRate ? "Edit Rate" : "Add Rate"}</Text>

            <Text style={styles.label}>Buy Price</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={buyPrice} onChangeText={setBuyPrice} />

            <Text style={styles.label}>Sale Price</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={salePrice} onChangeText={setSalePrice} />

            <Text style={styles.label}>UoM</Text>
            <TextInput style={styles.input} value={uom} onChangeText={setUom} />

            <View style={styles.actionsRow}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#777" }]} onPress={() => setModalVisible(false)}>
                <Text style={styles.actionBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#0b6cff", marginLeft: 12 }]} onPress={saveRate}>
                <Text style={styles.actionBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL: GRID (Add/Edit Category + Products) */}
      <Modal visible={modalVisible && (modalMode === "link" || modalMode === "editCategoryProducts")} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrapper}>
          <ScrollView contentContainerStyle={styles.modalCard}>
            <Text style={styles.modalTitle}>{modalMode === "link" ? "Add New Category + Products" : "Edit Category + Products"}</Text>

            <Text style={styles.label}>Category Name</Text>
            <TextInput style={styles.input} value={newCategoryName} onChangeText={setNewCategoryName} placeholder="Enter category name" />

            {gridProducts.map((prod, idx) => (
              <View key={idx} style={{ marginVertical: 8, borderWidth: 1, borderColor: "#ccc", padding: 8, borderRadius: 6 }}>
                <Text style={styles.label}>Product Name</Text>
                <TextInput style={styles.input} value={prod.productName} onChangeText={(val) => updateGridProduct(idx, "productName", val)} />

                <Text style={styles.label}>Description</Text>
                <TextInput style={styles.input} value={prod.description} onChangeText={(val) => updateGridProduct(idx, "description", val)} />

                <Text style={styles.label}>Buy Price</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={String(prod.buyRate || "")} onChangeText={(val) => updateGridProduct(idx, "buyRate", val)} />

                <Text style={styles.label}>Sale Price</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={String(prod.saleRate || "")} onChangeText={(val) => updateGridProduct(idx, "saleRate", val)} />

                <TouchableOpacity
                  style={{ marginTop: 6, backgroundColor: "#d12f2f", padding: 6, borderRadius: 6, alignSelf: "flex-start" }}
                  onPress={() => removeGridProduct(idx)}
                >
                  <Text style={{ color: "#fff" }}>Remove Product</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity onPress={addGridProduct} style={{ marginVertical: 12, backgroundColor: "#0b6cff", padding: 8, borderRadius: 6 }}>
              <Text style={{ color: "#fff", textAlign: "center" }}>+ Add Product</Text>
            </TouchableOpacity>

            <View style={styles.actionsRow}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#777" }]} onPress={() => setModalVisible(false)}>
                <Text style={styles.actionBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#0b6cff", marginLeft: 12 }]} onPress={saveCategoryProductsGrid}>
                <Text style={styles.actionBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
