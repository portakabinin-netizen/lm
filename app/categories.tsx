import { AppHeader } from "@/components/AppHeader";
import { useUserContext } from "@/context/AuthContext";
import { styles as G } from "@/styles/stylesIndex";
import { appService } from "@/UtilServices/appHelper";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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

const COMMON_UNITS = ["PCS", "BOX", "SQF", "RFT", "PKT", "KGM", "LTR", "SQM", "RMT", "BTL"];
const GST_RATES = [0, 5, 12, 18, 28];

export default function CategoryScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"category" | "product" | null>(null);

  const [editingCategory, setEditingCategory] = useState<any | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryHsn, setCategoryHsn] = useState("");

  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [selectedCategoryForProduct, setSelectedCategoryForProduct] = useState<any | null>(null);
  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [productHsn, setProductHsn] = useState("");
  const [productMoU, setProductMoU] = useState("PCS");
  const [productPrice, setProductPrice] = useState("");
  const [productTaxRate, setProductTaxRate] = useState("18");
  const [saving, setSaving] = useState(false);

  const { user } = useUserContext();
  const corporateId = user?.corporateId || "";
  const corpAdminId = user?.corpAdminId || user?.userId || "";

  /* ----------------------------------- */
  /*            LOAD DATA                */
  /* ----------------------------------- */
  const loadCategories = async () => {
    try {
      setLoading(true);
      const res = await appService.httpClient.get(`product/category`, {
        params: {
          corporateId: corporateId || undefined,
          corpAdminId: corpAdminId || undefined,
        },
      });
      const list = Array.isArray(res.data)
        ? res.data
        : res.data?.categories || res.data?.data || [];
      const safeList = Array.isArray(list) ? list : [];
      setCategories(safeList);
      // Automatically expand first category if none expanded
      if (safeList.length > 0 && !expandedCategory) {
        setExpandedCategory(safeList[0]._id);
      }
    } catch (err) {
      appService.showToast("Unable to load categories", "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, [corporateId]);

  /* ----------------------------------- */
  /*        LIVE GST CALCULATIONS        */
  /* ----------------------------------- */
  const gstBreakdown = useMemo(() => {
    const base = parseFloat(productPrice) || 0;
    const rate = parseFloat(productTaxRate) || 0;
    const totalGst = (base * rate) / 100;
    const halfRate = rate / 2;
    const halfGst = totalGst / 2;
    const totalWithGst = base + totalGst;

    return {
      base,
      rate,
      totalGst,
      cgstRate: halfRate,
      cgstAmount: halfGst,
      sgstRate: halfRate,
      sgstAmount: halfGst,
      igstRate: rate,
      igstAmount: totalGst,
      totalWithGst,
    };
  }, [productPrice, productTaxRate]);

  /* ----------------------------------- */
  /*        CATEGORY SAVE / DELETE       */
  /* ----------------------------------- */
  const openAddCategoryModal = () => {
    setModalType("category");
    setEditingCategory(null);
    setCategoryName("");
    setCategoryHsn("");
    setModalVisible(true);
  };

  const openEditCategoryModal = (cat: any) => {
    setModalType("category");
    setEditingCategory(cat);
    setCategoryName(cat.categoryName || "");
    setCategoryHsn(cat.hsn_sac || "");
    setModalVisible(true);
  };

  const saveCategory = async () => {
    if (!categoryName.trim()) {
      appService.showToast("Category name required", "Error");
      return;
    }
    if (categoryHsn && !/^\d{4,8}$/.test(categoryHsn.trim())) {
      appService.showToast("HSN/SAC code must be 4–8 digits.", "Error");
      return;
    }

    setSaving(true);
    try {
      const body = {
        categoryName: categoryName.trim(),
        hsn_sac: categoryHsn.trim(),
        corporateId,
        corpAdminId,
      };
      if (editingCategory?._id) {
        await appService.httpClient.put(`product/category/${editingCategory._id}`, body);
      } else {
        await appService.httpClient.post(`product/category/add`, body);
      }
      setModalVisible(false);
      await loadCategories();
      appService.showToast(editingCategory ? "Category updated!" : "Category created!", "Success");
    } catch (err: any) {
      appService.showToast(err?.response?.data?.error || "Failed to save category", "Error");
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = (cat: any) => {
    if (cat.products?.length > 0) {
      appService.showToast("Category contains products. Remove products first.", "Error");
      return;
    }

    Alert.alert("Delete Category", `Are you sure you want to delete "${cat.categoryName}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await appService.httpClient.delete(`product/category/${cat._id}`, {
              params: { corporateId, corpAdminId },
            });
            await loadCategories();
            appService.showToast("Category deleted", "Success");
          } catch (err: any) {
            appService.showToast(err?.response?.data?.error || "Failed to delete category", "Error");
          }
        },
      },
    ]);
  };

  /* ----------------------------------- */
  /*         PRODUCT HANDLERS            */
  /* ----------------------------------- */
  const openAddProductModal = (cat: any) => {
    setModalType("product");
    setEditingProduct(null);
    setSelectedCategoryForProduct(cat);
    setProductName("");
    setProductDesc("");
    setProductHsn(cat.hsn_sac || ""); // inherit category HSN
    setProductMoU("PCS");
    setProductPrice("");
    setProductTaxRate("18");
    setModalVisible(true);
  };

  const openEditProductModal = (cat: any, p: any) => {
    setModalType("product");
    setEditingProduct(p);
    setSelectedCategoryForProduct(cat);
    setProductName(p.productName || "");
    setProductDesc(p.description || "");
    setProductHsn(p.hsn_sac || cat.hsn_sac || "");
    setProductMoU(p.UoM || p.productMoU || "PCS");
    setProductPrice(String(p.price || ""));
    setProductTaxRate(String(p.tax_rate ?? 18));
    setModalVisible(true);
  };

  const saveProduct = async () => {
    if (!productName.trim() || !productDesc.trim() || !productMoU.trim()) {
      appService.showToast("Product name, description and unit required!", "Error");
      return;
    }
    if (productHsn && !/^\d{4,8}$/.test(productHsn.trim())) {
      appService.showToast("HSN/SAC code must be 4–8 digits.", "Error");
      return;
    }

    const catId = selectedCategoryForProduct?._id;
    if (!catId) {
      appService.showToast("No Category selected!", "Error");
      return;
    }

    setSaving(true);
    try {
      const body = {
        categoryId: catId,
        productName: productName.trim(),
        description: productDesc.trim(),
        hsn_sac: productHsn.trim(),
        UoM: productMoU.trim(),
        price: parseFloat(productPrice) || 0,
        tax_rate: parseFloat(productTaxRate) || 18,
        corporateId,
        corpAdminId,
      };
      if (editingProduct?._id) {
        await appService.httpClient.put(`product/${catId}/${editingProduct._id}`, body);
      } else {
        await appService.httpClient.post(`product/add`, body);
      }
      setModalVisible(false);
      await loadCategories();
      appService.showToast(editingProduct ? "Product updated!" : "Product saved successfully!", "Success");
    } catch (err: any) {
      appService.showToast(err?.response?.data?.error || "Failed to save product", "Error");
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = (catId: string, productId: string) => {
    Alert.alert("Delete Product", "Are you sure you want to delete this product?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await appService.httpClient.delete(`product/${catId}/${productId}`, {
              params: { corporateId, corpAdminId },
            });
            await loadCategories();
            appService.showToast("Product deleted", "Success");
          } catch (err: any) {
            console.warn(err);
            appService.showToast(
              err?.response?.data?.error || "Cannot delete. Product may be in use.",
              "Error"
            );
          }
        },
      },
    ]);
  };

  /* ----------------------------------- */
  /*          CARD COMPONENTS            */
  /* ----------------------------------- */
  const renderProductItem = (cat: any, p: any) => {
    const priceNum = Number(p.price || 0);
    const taxRate = Number(p.tax_rate ?? 18);
    const gstAmt = (priceNum * taxRate) / 100;
    const cgstAmt = gstAmt / 2;
    const sgstAmt = gstAmt / 2;
    const grossTotal = priceNum + gstAmt;

    return (
      <View key={p._id} style={ui.productCard}>
        <View style={ui.productCardTop}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={ui.productTitle}>{p.productName}</Text>
              {(p.hsn_sac || cat.hsn_sac) ? (
                <View style={ui.hsnBadge}>
                  <Text style={ui.hsnBadgeText}>HSN {p.hsn_sac || cat.hsn_sac}</Text>
                </View>
              ) : null}
            </View>
            <Text style={ui.productDesc}>↳ {p.description || "No description provided"}</Text>
          </View>

          {/* Action buttons */}
          <View style={ui.actionBtnGroup}>
            <TouchableOpacity
              onPress={() => openEditProductModal(cat, p)}
              style={ui.iconBtnEdit}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="pencil" size={15} color="#0284c7" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => deleteProduct(cat._id, p._id)}
              style={ui.iconBtnDelete}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={15} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* GST & Price Breakdown Bar */}
        <View style={ui.priceBreakdownBar}>
          <View style={ui.priceCol}>
            <Text style={ui.priceLabel}>Base Rate</Text>
            <Text style={ui.priceValue}>₹{priceNum} <Text style={ui.priceUnit}>/{p.UoM || "PCS"}</Text></Text>
          </View>

          <View style={ui.taxSplitCol}>
            <View style={ui.gstRateTag}>
              <Text style={ui.gstRateTagText}>{taxRate}% GST</Text>
            </View>
            <Text style={ui.taxSplitDetail}>
              CGST ({taxRate / 2}%): ₹{cgstAmt.toFixed(0)} | SGST ({taxRate / 2}%): ₹{sgstAmt.toFixed(0)}
            </Text>
            <Text style={ui.taxSplitDetail}>
              or IGST ({taxRate}%): ₹{gstAmt.toFixed(0)}
            </Text>
          </View>

          <View style={ui.grossCol}>
            <Text style={ui.priceLabel}>Gross Incl. Tax</Text>
            <Text style={ui.grossValue}>₹{grossTotal.toFixed(0)}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderCategoryItem = ({ item }: { item: any }) => {
    const isExpanded = expandedCategory === item._id;
    const productCount = item.products?.length || 0;

    return (
      <View style={ui.categoryCard}>
        {/* Category Header Card */}
        <TouchableOpacity
          onPress={() => setExpandedCategory(isExpanded ? null : item._id)}
          activeOpacity={0.7}
          style={ui.categoryHeader}
        >
          <View style={ui.catIconWrap}>
            <Ionicons name="cube" size={20} color="#0284c7" />
          </View>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={ui.categoryTitle}>{item.categoryName}</Text>
              {item.hsn_sac ? (
                <View style={ui.categoryHsnBadge}>
                  <Text style={ui.categoryHsnText}>HSN {item.hsn_sac}</Text>
                </View>
              ) : null}
            </View>
            <Text style={ui.categorySubtitle}>{productCount} {productCount === 1 ? "Product" : "Products"}</Text>
          </View>

          {/* Quick Header Actions */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity
              onPress={() => openAddProductModal(item)}
              style={ui.btnAddProduct}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={ui.btnAddProductText}>Add</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => openEditCategoryModal(item)}
              style={ui.catActionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="pencil" size={16} color="#64748b" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => deleteCategory(item)}
              style={ui.catActionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={16} color={productCount > 0 ? "#cbd5e1" : "#ef4444"} />
            </TouchableOpacity>

            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={18}
              color="#0284c7"
            />
          </View>
        </TouchableOpacity>

        {/* Product list when expanded */}
        {isExpanded && (
          <View style={ui.categoryBody}>
            {productCount === 0 ? (
              <View style={ui.emptyProductsBox}>
                <Ionicons name="layers-outline" size={28} color="#94a3b8" />
                <Text style={ui.emptyProductsText}>No products added yet.</Text>
                <TouchableOpacity
                  onPress={() => openAddProductModal(item)}
                  style={ui.btnEmptyAdd}
                >
                  <Ionicons name="add-circle-outline" size={16} color="#0284c7" />
                  <Text style={ui.btnEmptyAddText}>Add First Product</Text>
                </TouchableOpacity>
              </View>
            ) : (
              item.products.map((p: any) => renderProductItem(item, p))
            )}
          </View>
        )}
      </View>
    );
  };

  /* ----------------------------------- */
  /*                 UI                  */
  /* ----------------------------------- */
  if (loading) {
    return (
      <SafeAreaView style={[G.safeContainer, { justifyContent: "center", alignItems: "center" }]} edges={["top"]}>
        <ActivityIndicator size="large" color="#0284c7" />
        <Text style={{ marginTop: 12, color: "#64748b", fontWeight: "600", fontSize: 13 }}>Loading Catalog...</Text>
      </SafeAreaView>
    );
  }

  const totalProducts = categories.reduce((sum, c) => sum + (c.products?.length || 0), 0);

  return (
    <SafeAreaView style={ui.safeArea} edges={["top"]}>
      <AppHeader
        title="Categories & Products"
        onBackPress={() => router.back()}
        rightAction={() => (
          <TouchableOpacity onPress={openAddCategoryModal} style={ui.headerAddBtn}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={ui.headerAddBtnText}>Category</Text>
          </TouchableOpacity>
        )}
      />

      {/* Top Stat Summary Banner */}
      <View style={ui.statsBanner}>
        <View style={ui.statItem}>
          <Text style={ui.statNum}>{categories.length}</Text>
          <Text style={ui.statLabel}>Categories</Text>
        </View>
        <View style={ui.statDivider} />
        <View style={ui.statItem}>
          <Text style={ui.statNum}>{totalProducts}</Text>
          <Text style={ui.statLabel}>Products</Text>
        </View>
        <View style={ui.statDivider} />
        <View style={ui.statItem}>
          <Text style={[ui.statNum, { color: "#0284c7" }]}>GST</Text>
          <Text style={ui.statLabel}>IGST / CGST / SGST</Text>
        </View>
      </View>

      {/* CATEGORIES LIST */}
      <FlatList
        data={categories}
        keyExtractor={(i) => String(i._id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={ui.emptyState}>
            <Ionicons name="cube-outline" size={64} color="#cbd5e1" />
            <Text style={ui.emptyStateTitle}>No Categories Added</Text>
            <Text style={ui.emptyStateDesc}>Create your first product category with HSN/SAC code to get started.</Text>
            <TouchableOpacity onPress={openAddCategoryModal} style={ui.btnCreateFirst}>
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={ui.btnCreateFirstText}>Create Category</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={renderCategoryItem}
      />

      {/* ──────────────── MODAL ──────────────── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={ui.modalOverlay}
        >
          <View style={ui.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              
              {/* ──────────────── CATEGORY FORM ──────────────── */}
              {modalType === "category" && (
                <>
                  <View style={ui.modalHeaderRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={ui.modalHeaderIcon}>
                        <Ionicons name="folder-open" size={20} color="#0284c7" />
                      </View>
                      <View>
                        <Text style={ui.modalHeading}>
                          {editingCategory ? "Edit Category" : "New Category"}
                        </Text>
                        <Text style={ui.modalSubHeading}>Organize products & default HSN</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setModalVisible(false)} style={ui.modalCloseBtn}>
                      <Ionicons name="close" size={20} color="#64748b" />
                    </TouchableOpacity>
                  </View>

                  <Text style={ui.inputLabel}>Category Name *</Text>
                  <TextInput
                    style={ui.input}
                    placeholder="e.g. Hardware & Tools, Electricals, Timber"
                    placeholderTextColor="#94a3b8"
                    value={categoryName}
                    onChangeText={setCategoryName}
                  />

                  <Text style={ui.inputLabel}>Default HSN / SAC Code</Text>
                  <TextInput
                    style={ui.input}
                    placeholder="6-digit code e.g. 841391"
                    placeholderTextColor="#94a3b8"
                    value={categoryHsn}
                    onChangeText={(v) => setCategoryHsn(v.replace(/\D/g, "").slice(0, 8))}
                    keyboardType="number-pad"
                    maxLength={8}
                  />
                  {categoryHsn ? (
                    <Text style={ui.hsnHint}>
                      {categoryHsn.length < 4
                        ? "⚠ Enter at least 4 digits for valid GST HSN/SAC"
                        : `✓ Valid ${categoryHsn.length}-digit HSN/SAC code`}
                    </Text>
                  ) : null}

                  <View style={ui.modalActionRow}>
                    <TouchableOpacity
                      style={ui.btnCancel}
                      onPress={() => setModalVisible(false)}
                    >
                      <Text style={ui.btnCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={ui.btnSave}
                      onPress={saveCategory}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                          <Text style={ui.btnSaveText}>{editingCategory ? "Update" : "Save"}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* ──────────────── PRODUCT FORM ──────────────── */}
              {modalType === "product" && (
                <>
                  <View style={ui.modalHeaderRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                      <View style={ui.modalHeaderIcon}>
                        <Ionicons name="pricetag" size={20} color="#0284c7" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={ui.modalHeading}>
                          {editingProduct ? "Edit Product" : "New Product"}
                        </Text>
                        <Text style={ui.modalSubHeading} numberOfLines={1}>
                          In: {selectedCategoryForProduct?.categoryName || "Category"}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setModalVisible(false)} style={ui.modalCloseBtn}>
                      <Ionicons name="close" size={20} color="#64748b" />
                    </TouchableOpacity>
                  </View>

                  {/* Product Name */}
                  <Text style={ui.inputLabel}>Product Name *</Text>
                  <TextInput
                    style={ui.input}
                    placeholder="Enter product title or model"
                    placeholderTextColor="#94a3b8"
                    value={productName}
                    onChangeText={setProductName}
                  />

                  {/* Description */}
                  <Text style={ui.inputLabel}>Description *</Text>
                  <TextInput
                    style={[ui.input, { minHeight: 70, textAlignVertical: "top" }]}
                    placeholder="Specification, brand, size or description"
                    placeholderTextColor="#94a3b8"
                    value={productDesc}
                    multiline
                    onChangeText={setProductDesc}
                  />

                  {/* HSN Code */}
                  <Text style={ui.inputLabel}>HSN / SAC Code</Text>
                  <TextInput
                    style={ui.input}
                    placeholder="e.g. 8413"
                    placeholderTextColor="#94a3b8"
                    value={productHsn}
                    onChangeText={(v) => setProductHsn(v.replace(/\D/g, "").slice(0, 8))}
                    keyboardType="number-pad"
                    maxLength={8}
                  />
                  {productHsn ? (
                    <Text style={ui.hsnHint}>
                      {productHsn.length < 4
                        ? "⚠ Too short — enter at least 4 digits"
                        : `✓ ${productHsn.length}-digit HSN/SAC`}
                    </Text>
                  ) : null}

                  {/* Unit Of Measurement */}
                  <Text style={ui.inputLabel}>Unit of Measurement (UoM)</Text>
                  {/* Quick Unit Pills */}
                  <View style={ui.unitPillsRow}>
                    {COMMON_UNITS.slice(0, 6).map((u) => {
                      const isSel = productMoU === u;
                      return (
                        <TouchableOpacity
                          key={u}
                          onPress={() => setProductMoU(u)}
                          style={[ui.unitPill, isSel && ui.unitPillActive]}
                        >
                          <Text style={[ui.unitPillText, isSel && ui.unitPillTextActive]}>{u}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={ui.pickerBox}>
                    <Picker
                      selectedValue={productMoU}
                      onValueChange={(val) => setProductMoU(val)}
                      style={{ height: 48, color: "#1e293b" }}
                    >
                      <Picker.Item label="-- More Units --" value="" />
                      {COMMON_UNITS.map((u, i) => (
                        <Picker.Item key={i} label={u} value={u} />
                      ))}
                    </Picker>
                  </View>

                  {/* Unit Price & GST Rate */}
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={ui.inputLabel}>Unit Price (₹)</Text>
                      <TextInput
                        style={ui.input}
                        placeholder="e.g. 1200"
                        placeholderTextColor="#94a3b8"
                        value={productPrice}
                        onChangeText={setProductPrice}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={ui.inputLabel}>GST Rate (%)</Text>
                      <View style={ui.pickerBox}>
                        <Picker
                          selectedValue={productTaxRate}
                          onValueChange={(val) => setProductTaxRate(val)}
                          style={{ height: 48, color: "#1e293b" }}
                        >
                          {GST_RATES.map((r) => (
                            <Picker.Item key={r} label={`${r}%`} value={String(r)} />
                          ))}
                        </Picker>
                      </View>
                    </View>
                  </View>

                  {/* Quick GST Pills */}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 4, marginBottom: 12 }}>
                    {GST_RATES.map((r) => {
                      const isSel = productTaxRate === String(r);
                      return (
                        <TouchableOpacity
                          key={r}
                          onPress={() => setProductTaxRate(String(r))}
                          style={[ui.gstChip, isSel && ui.gstChipActive]}
                        >
                          <Text style={[ui.gstChipText, isSel && ui.gstChipTextActive]}>{r}%</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* 🧾 LIVE GST TAX ENGINE BREAKDOWN CARD */}
                  <View style={ui.gstSummaryBox}>
                    <View style={ui.gstSummaryHeader}>
                      <Ionicons name="calculator-outline" size={16} color="#0284c7" />
                      <Text style={ui.gstSummaryTitle}>GST Breakdown ({gstBreakdown.rate}%)</Text>
                    </View>

                    <View style={ui.gstSummaryRow}>
                      <Text style={ui.gstLabel}>Base Taxable Price:</Text>
                      <Text style={ui.gstValue}>₹{gstBreakdown.base.toFixed(2)}</Text>
                    </View>

                    {/* Intra-State Breakdown */}
                    <View style={ui.taxTypeBox}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={ui.taxTypeTitle}>Intra-State (Within State)</Text>
                        <Text style={ui.taxTypeRate}>CGST + SGST</Text>
                      </View>
                      <View style={ui.taxTypeRow}>
                        <Text style={ui.taxTypeSub}>CGST ({gstBreakdown.cgstRate}%): ₹{gstBreakdown.cgstAmount.toFixed(2)}</Text>
                        <Text style={ui.taxTypeSub}>SGST ({gstBreakdown.sgstRate}%): ₹{gstBreakdown.sgstAmount.toFixed(2)}</Text>
                      </View>
                    </View>

                    {/* Inter-State Breakdown */}
                    <View style={[ui.taxTypeBox, { borderLeftColor: "#f59e0b" }]}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={ui.taxTypeTitle}>Inter-State (Outside State)</Text>
                        <Text style={[ui.taxTypeRate, { color: "#b45309" }]}>IGST Only</Text>
                      </View>
                      <Text style={ui.taxTypeSub}>
                        IGST ({gstBreakdown.igstRate}%): ₹{gstBreakdown.igstAmount.toFixed(2)}
                      </Text>
                    </View>

                    {/* Grand Total */}
                    <View style={ui.gstTotalRow}>
                      <Text style={ui.gstTotalLabel}>Total Amount (Gross):</Text>
                      <Text style={ui.gstTotalValue}>₹{gstBreakdown.totalWithGst.toFixed(2)}</Text>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={ui.modalActionRow}>
                    <TouchableOpacity
                      style={ui.btnCancel}
                      onPress={() => setModalVisible(false)}
                    >
                      <Text style={ui.btnCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={ui.btnSave}
                      onPress={saveProduct}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                          <Text style={ui.btnSaveText}>{editingProduct ? "Update Product" : "Save Product"}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

/* ──────────────── MODERN CLEAN STYLES ──────────────── */
const ui = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  headerAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 4,
    marginRight: 8,
  },
  headerAddBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  statsBanner: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    alignItems: "center",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNum: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  statLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#e2e8f0",
  },
  categoryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    overflow: "hidden",
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#ffffff",
  },
  catIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#e0f2fe",
    justifyContent: "center",
    alignItems: "center",
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  categorySubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
    fontWeight: "500",
  },
  categoryHsnBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  categoryHsnText: {
    fontSize: 10,
    color: "#475569",
    fontWeight: "700",
  },
  btnAddProduct: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0284c7",
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    gap: 2,
  },
  btnAddProductText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  catActionBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
  },
  categoryBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 4,
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  emptyProductsBox: {
    alignItems: "center",
    paddingVertical: 20,
  },
  emptyProductsText: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 6,
    fontWeight: "500",
  },
  btnEmptyAdd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#e0f2fe",
  },
  btnEmptyAddText: {
    color: "#0284c7",
    fontWeight: "700",
    fontSize: 12,
  },
  productCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  productCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  productTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1e293b",
  },
  productDesc: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 3,
  },
  hsnBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hsnBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
  },
  actionBtnGroup: {
    flexDirection: "row",
    gap: 6,
  },
  iconBtnEdit: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#e0f2fe",
    justifyContent: "center",
    alignItems: "center",
  },
  iconBtnDelete: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#fee2e2",
    justifyContent: "center",
    alignItems: "center",
  },
  priceBreakdownBar: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  priceCol: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 10,
    color: "#94a3b8",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  priceValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 1,
  },
  priceUnit: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "500",
  },
  taxSplitCol: {
    flex: 2,
    paddingHorizontal: 6,
  },
  gstRateTag: {
    alignSelf: "flex-start",
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  gstRateTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0284c7",
  },
  taxSplitDetail: {
    fontSize: 9,
    color: "#64748b",
    marginTop: 2,
  },
  grossCol: {
    alignItems: "flex-end",
  },
  grossValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#16a34a",
    marginTop: 1,
  },
  emptyState: {
    alignItems: "center",
    marginTop: 60,
    paddingHorizontal: 24,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#475569",
    marginTop: 12,
  },
  emptyStateDesc: {
    fontSize: 13,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  btnCreateFirst: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0284c7",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    marginTop: 16,
  },
  btnCreateFirstText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  modalHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#e0f2fe",
    justifyContent: "center",
    alignItems: "center",
  },
  modalHeading: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  modalSubHeading: {
    fontSize: 12,
    color: "#64748b",
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1e293b",
    marginBottom: 10,
  },
  hsnHint: {
    fontSize: 11,
    color: "#16a34a",
    marginTop: -6,
    marginBottom: 10,
    marginLeft: 4,
    fontWeight: "600",
  },
  pickerBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    marginBottom: 10,
    overflow: "hidden",
  },
  unitPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  unitPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  unitPillActive: {
    backgroundColor: "#0284c7",
    borderColor: "#0284c7",
  },
  unitPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  unitPillTextActive: {
    color: "#fff",
  },
  gstChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  gstChipActive: {
    backgroundColor: "#0284c7",
    borderColor: "#0284c7",
  },
  gstChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  gstChipTextActive: {
    color: "#fff",
  },
  gstSummaryBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    marginTop: 6,
    marginBottom: 16,
  },
  gstSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  gstSummaryTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0284c7",
    textTransform: "uppercase",
  },
  gstSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  gstLabel: {
    fontSize: 12,
    color: "#64748b",
  },
  gstValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  taxTypeBox: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 8,
    marginVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: "#0284c7",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  taxTypeTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1e293b",
  },
  taxTypeRate: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0284c7",
  },
  taxTypeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  taxTypeSub: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 2,
  },
  gstTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  gstTotalLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
  },
  gstTotalValue: {
    fontSize: 15,
    fontWeight: "900",
    color: "#16a34a",
  },
  modalActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },
  btnCancel: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
  },
  btnCancelText: {
    color: "#475569",
    fontWeight: "700",
    fontSize: 14,
  },
  btnSave: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#0284c7",
    shadowColor: "#0284c7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnSaveText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
