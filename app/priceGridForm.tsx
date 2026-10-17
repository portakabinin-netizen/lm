// priceGridForm.tsx
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import {
  ActivityIndicator,
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
  TextStyle,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";

import { useUserContext } from "@/context/AuthContext";
import { appService } from "@/UtilServices/appHelper";
import { styles as G, COLORS } from "@/styles/stylesIndex";
import { AppHeader } from "@/components/AppHeader";

export interface GridFormRef {
  savePrices: () => void;
}

interface GridFormProps {
  vendorId: string;
  vendorName?: string;
  onSaved?: () => void;
  onClose?: () => void;
}

interface ProductItem {
  _id?: string;
  productId?: string;
  productName: string;
  description?: string;
  UoM?: string;
  price?: number;
  buyPrice?: number;
  salePrice?: number;
}

const COMMON_UOMS = ["PCS", "BOX", "SQF", "RFT", "PKT", "KGM", "LTR", "SQM", "RMT", "SET"];

const GridForm = forwardRef<GridFormRef, GridFormProps>(
  ({ vendorId, vendorName, onSaved, onClose }, ref) => {
    const { user } = useUserContext();
    const corporateId = user?.corporateId || "";
    const corpAdminId = user?.corpAdminId || user?.userId || "";

    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState<any[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [groupedProducts, setGroupedProducts] = useState<any[]>([]);
    const [priceState, setPriceState] = useState<Record<string, { buy: number | string; sale: number | string }>>({});
    const [saving, setSaving] = useState(false);
    const [fetching, setFetching] = useState(false);

    // Quick product add modal state
    const [showAddProductModal, setShowAddProductModal] = useState(false);
    const [newProductName, setNewProductName] = useState("");
    const [newProductDesc, setNewProductDesc] = useState("");
    const [newProductBuy, setNewProductBuy] = useState("");
    const [newProductSale, setNewProductSale] = useState("");
    const [newProductUom, setNewProductUom] = useState("PCS");
    const [addingProduct, setAddingProduct] = useState(false);

    useEffect(() => {
      loadCategories();
    }, []);

    const loadCategories = async () => {
      try {
        setLoading(true);
        const res = await appService.httpClient.get(`product/category`, {
          params: {
            corporateId: corporateId || undefined,
            corpAdminId: corpAdminId || undefined,
          },
        });
        const data = res.data;
        const cats: any[] = Array.isArray(data)
          ? data
          : data?.categories ?? data?.data ?? [];
        setCategories(cats);

        // Auto-select first category if available and none selected
        if (cats.length > 0 && !selectedCategoryId) {
          onCategorySelect(cats[0]._id, cats);
        }
      } catch (err) {
        appService.showToast("Unable to load categories", "Error");
      } finally {
        setLoading(false);
      }
    };

    const onCategorySelect = async (id: string | null, catList = categories) => {
      setSelectedCategoryId(id);
      if (!id) {
        setGroupedProducts([]);
        setPriceState({});
        return;
      }

      const cat = catList.find((c) => String(c._id) === String(id));
      let prods: ProductItem[] = Array.isArray(cat?.products) ? [...cat.products] : [];

      setFetching(true);
      let ratesMap: Record<string, { buy: number; sale: number }> = {};
      let vendorCategoryRates: any[] = [];

      try {
        const res = await appService.httpClient.get(
          `product/rate/vendor/${vendorId}/category/${id}`,
          {
            params: { corporateId, corpAdminId },
          }
        );
        const data = res.data;
        if (data && Array.isArray(data.products)) {
          vendorCategoryRates = data.products;
          data.products.forEach((rp: any) => {
            const b = rp.buyPrice !== undefined && rp.buyPrice !== null ? rp.buyPrice : rp.price;
            const s = rp.salePrice !== undefined && rp.salePrice !== null ? rp.salePrice : 0;
            ratesMap[String(rp.productId)] = { buy: b, sale: s };

            // If product is in existingRates but missing from category products array, include it
            const existsInProds = prods.some(
              (p) =>
                String(p._id) === String(rp.productId) ||
                (p.productName && p.productName.toLowerCase() === (rp.productName || "").toLowerCase())
            );
            if (!existsInProds) {
              prods.push({
                _id: rp.productId,
                productId: rp.productId,
                productName: rp.productName || "Product",
                description: rp.description || "",
                UoM: rp.UoM || "PCS",
                price: s,
                buyPrice: b,
                salePrice: s,
              });
            }
          });
        }
      } catch (err) {
        console.warn("No existing rates or rate fetch error:", err);
      } finally {
        setFetching(false);
      }

      // Group products by productName
      const map: Record<string, ProductItem[]> = {};
      prods.forEach((p) => {
        const name = p.productName ?? "Unnamed";
        if (!map[name]) map[name] = [];
        map[name].push(p);
      });

      const grouped = Object.keys(map).map((name) => ({
        productName: name,
        items: map[name],
      }));
      setGroupedProducts(grouped);

      // Initialize price state with buy and sale prices
      const init: Record<string, { buy: number | string; sale: number | string }> = {};
      prods.forEach((p, i) => {
        const pid = String(p._id ?? p.productId ?? `${p.productName}_${i}`);
        const rateInfo = ratesMap[String(p._id || p.productId)];
        const defaultBuy = rateInfo?.buy !== undefined ? String(rateInfo.buy) : (p.buyPrice !== undefined ? String(p.buyPrice) : "");
        const defaultSale = rateInfo?.sale !== undefined && rateInfo.sale > 0
          ? String(rateInfo.sale)
          : (p.salePrice !== undefined && p.salePrice > 0 ? String(p.salePrice) : (p.price ? String(p.price) : ""));

        init[pid] = {
          buy: defaultBuy,
          sale: defaultSale,
        };
      });
      setPriceState(init);
    };

    const updatePrice = (pid: string, field: "buy" | "sale", value: string | number) => {
      setPriceState((prev) => ({
        ...prev,
        [pid]: {
          ...(prev[pid] || { buy: "", sale: "" }),
          [field]: value,
        },
      }));
    };

    // ── Save prices ──────────────────────────────────────────────────────────
    const savePrices = async () => {
      if (!selectedCategoryId) {
        appService.showToast("Select a category", "Info");
        return;
      }

      if (!vendorId) {
        appService.showToast("Vendor not found", "Error");
        return;
      }

      const activeCat = categories.find((c) => String(c._id) === String(selectedCategoryId));
      const payload: any[] = [];

      groupedProducts.forEach((group) => {
        group.items.forEach((p: any, idx: number) => {
          const pid = String(p._id ?? p.productId ?? `${group.productName}_${idx}`);
          const rawBuy = priceState[pid]?.buy;
          const rawSale = priceState[pid]?.sale;

          const buy = rawBuy !== undefined && rawBuy !== "" ? Number(String(rawBuy).replace(/,/g, "")) : null;
          const sale = rawSale !== undefined && rawSale !== "" ? Number(String(rawSale).replace(/,/g, "")) : 0;

          if (buy === null && (!sale || sale === 0)) return;

          payload.push({
            corporateId,
            corpAdminId,
            vendorId,
            categoryId: selectedCategoryId,
            categoryName: activeCat?.categoryName || activeCat?.name || group.productName,
            productId: p._id || p.productId,
            productName: p.productName,
            description: p.description,
            UoM: p.UoM ?? "PCS",
            price: buy ?? 0,
            buyPrice: buy ?? 0,
            salePrice: sale ?? 0,
          });
        });
      });

      if (!payload.length) {
        appService.showToast("Enter at least one buy or sale price", "Info");
        return;
      }

      try {
        setSaving(true);
        const res = await appService.httpClient.post(`product/rate/add`, payload);
        if (res?.status === 201 || res?.status === 200) {
          appService.showToast("Prices saved successfully", "Success");
          setTimeout(() => onSaved?.(), 600);
        } else {
          appService.showToast("Save failed", "Error");
        }
      } catch (err: any) {
        appService.showToast(err?.response?.data?.error || "Save failed", "Error");
      } finally {
        setSaving(false);
      }
    };

    // ── Quick add product directly in Category ──────────────────────────────
    const handleQuickAddProduct = async () => {
      if (!newProductName.trim()) {
        appService.showToast("Product name is required", "Error");
        return;
      }
      if (!selectedCategoryId) {
        appService.showToast("Select a category first", "Info");
        return;
      }

      try {
        setAddingProduct(true);
        const buyNum = parseFloat(newProductBuy) || 0;
        const saleNum = parseFloat(newProductSale) || 0;

        const res = await appService.httpClient.post(`product/add`, {
          categoryId: selectedCategoryId,
          productName: newProductName.trim(),
          description: newProductDesc.trim() || newProductName.trim(),
          UoM: newProductUom,
          price: saleNum,
          buyPrice: buyNum,
          salePrice: saleNum,
          corporateId,
          corpAdminId,
        });

        appService.showToast("Product added to category", "Success");
        setShowAddProductModal(false);

        // Reset form
        setNewProductName("");
        setNewProductDesc("");
        setNewProductBuy("");
        setNewProductSale("");
        setNewProductUom("PCS");

        // Reload category & rates
        await loadCategories();
        if (selectedCategoryId) {
          await onCategorySelect(selectedCategoryId);
        }
      } catch (err: any) {
        appService.showToast(err?.response?.data?.error || "Failed to add product", "Error");
      } finally {
        setAddingProduct(false);
      }
    };

    useImperativeHandle(ref, () => ({
      savePrices,
    }));

    if (loading) {
      return (
        <View style={G.center as ViewStyle}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ marginTop: 12, color: "#64748b", fontSize: 13 }}>Loading categories...</Text>
        </View>
      );
    }

    return (
      <SafeAreaView style={G.safeContainer as ViewStyle} edges={["top"]}>
        <AppHeader
          title={vendorName ? `${vendorName}` : "Set / Edit Rates"}
          onBackPress={onClose}
          rightAction={() => (
            <TouchableOpacity
              onPress={savePrices}
              style={[G.pgSaveBtn, saving && { opacity: 0.5 }] as any}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark-done" size={26} color="#fff" />
              )}
            </TouchableOpacity>
          )}
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <FlatList
            data={groupedProducts}
            keyExtractor={(_, index) => `group_${index}`}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Text style={G.pgLabel as TextStyle}>Select Category</Text>
                  {selectedCategoryId && (
                    <TouchableOpacity
                      onPress={() => setShowAddProductModal(true)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: "#eff6ff",
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: "#bfdbfe",
                      }}
                    >
                      <Ionicons name="add-circle" size={16} color={COLORS.primary} style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 12, fontWeight: "700", color: COLORS.primary }}>
                        + Add Product
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={G.pgPickerWrapper as ViewStyle}>
                  <Picker
                    selectedValue={selectedCategoryId}
                    onValueChange={(val) => onCategorySelect(val)}
                    style={G.pgPicker as any}
                  >
                    <Picker.Item label="-- Choose Category --" value={null} />
                    {categories.map((c) => (
                      <Picker.Item
                        key={c._id}
                        label={c.categoryName ?? c.name ?? "Category"}
                        value={c._id}
                      />
                    ))}
                  </Picker>
                </View>

                {fetching && (
                  <View style={{ padding: 24, alignItems: "center" }}>
                    <ActivityIndicator color={COLORS.primary} />
                    <Text style={[G.fs13, G.txtSec, G.mt8] as any}>Fetching existing rates...</Text>
                  </View>
                )}
              </View>
            }
            ListEmptyComponent={
              !fetching && selectedCategoryId ? (
                <View style={{ marginTop: 30, alignItems: "center", paddingHorizontal: 20 }}>
                  <Ionicons name="layers-outline" size={56} color="#CBD5E1" />
                  <Text style={{ marginTop: 14, fontSize: 16, fontWeight: "700", color: "#475569" }}>
                    No products in this category yet
                  </Text>
                  <Text style={{ marginTop: 6, fontSize: 13, color: "#94A3B8", textAlign: "center" }}>
                    Add a product to this category to configure both Buy Price and Sale Price.
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowAddProductModal(true)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: COLORS.primary,
                      paddingHorizontal: 18,
                      paddingVertical: 10,
                      borderRadius: 10,
                      marginTop: 16,
                    }}
                  >
                    <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                      Add Product Now
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : !fetching && !selectedCategoryId ? (
                <View style={{ marginTop: 50, alignItems: "center", paddingHorizontal: 30 }}>
                  <Ionicons name="pricetags-outline" size={56} color="#CBD5E1" />
                  <Text style={{ marginTop: 14, fontSize: 16, fontWeight: "700", color: "#475569" }}>
                    Select Category First
                  </Text>
                  <Text style={{ marginTop: 4, color: "#94A3B8", textAlign: "center" }}>
                    Choose a category from the dropdown above to manage Buy and Sale rates.
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item: group }) => (
              <View style={G.pgGroupBox as ViewStyle}>
                <View style={[G.pgGroupHeader, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }] as any}>
                  <Text style={G.pgGroupTitle as TextStyle}>{group.productName}</Text>
                </View>

                {/* Table Header: Description | Buy Price | Sale Price | UoM */}
                <View style={[G.pgRowHeader, { paddingHorizontal: 10 }] as any}>
                  <Text style={[G.pgHText, { flex: 1.4, fontSize: 10 }]}>Description</Text>
                  <Text style={[G.pgHText, { width: 75, textAlign: "center", fontSize: 10, color: "#047857" }]}>
                    Buy (₹)
                  </Text>
                  <Text style={[G.pgHText, { width: 75, textAlign: "center", fontSize: 10, color: "#7c3aed" }]}>
                    Sale (₹)
                  </Text>
                  <Text style={[G.pgHText, { width: 45, textAlign: "right", fontSize: 10 }]}>UoM</Text>
                </View>

                {group.items.map((p: any, idx: number) => {
                  const pid = String(p._id ?? p.productId ?? `${group.productName}_${idx}`);
                  return (
                    <View
                      key={pid}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 10,
                        paddingHorizontal: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: "#f1f5f9",
                      }}
                    >
                      <View style={{ flex: 1.4, paddingRight: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: "#1e293b" }} numberOfLines={2}>
                          {p.description || p.productName}
                        </Text>
                      </View>

                      {/* Buy Price Input */}
                      <TextInput
                        style={{
                          width: 75,
                          backgroundColor: "#f0fdf4",
                          borderWidth: 1,
                          borderColor: "#bbf7d0",
                          borderRadius: 8,
                          paddingVertical: 6,
                          paddingHorizontal: 6,
                          fontSize: 13,
                          fontWeight: "700",
                          color: "#166534",
                          textAlign: "center",
                          marginRight: 6,
                        }}
                        keyboardType="numeric"
                        value={priceState[pid]?.buy?.toString() ?? ""}
                        onChangeText={(v) => updatePrice(pid, "buy", v)}
                        placeholder="0.00"
                        placeholderTextColor="#94a3b8"
                      />

                      {/* Sale Price Input */}
                      <TextInput
                        style={{
                          width: 75,
                          backgroundColor: "#faf5ff",
                          borderWidth: 1,
                          borderColor: "#e9d5ff",
                          borderRadius: 8,
                          paddingVertical: 6,
                          paddingHorizontal: 6,
                          fontSize: 13,
                          fontWeight: "700",
                          color: "#6b21a8",
                          textAlign: "center",
                          marginRight: 6,
                        }}
                        keyboardType="numeric"
                        value={priceState[pid]?.sale?.toString() ?? ""}
                        onChangeText={(v) => updatePrice(pid, "sale", v)}
                        placeholder="0.00"
                        placeholderTextColor="#94a3b8"
                      />

                      <Text style={{ width: 45, fontSize: 11, color: "#64748b", textAlign: "right", fontWeight: "700" }}>
                        {p.UoM ?? "PCS"}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          />
        </KeyboardAvoidingView>

        {/* ➕ QUICK ADD PRODUCT MODAL */}
        <Modal visible={showAddProductModal} animationType="slide" transparent>
          <View style={modalStyles.overlay}>
            <View style={modalStyles.card}>
              <View style={modalStyles.header}>
                <Text style={modalStyles.title}>Add Product to Category</Text>
                <TouchableOpacity onPress={() => setShowAddProductModal(false)}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                <Text style={modalStyles.label}>Product Name *</Text>
                <TextInput
                  style={modalStyles.input}
                  placeholder="e.g. Submersible Pump 2HP"
                  value={newProductName}
                  onChangeText={setNewProductName}
                />

                <Text style={modalStyles.label}>Description / Specification</Text>
                <TextInput
                  style={modalStyles.input}
                  placeholder="e.g. 2HP water pump copper winding"
                  value={newProductDesc}
                  onChangeText={setNewProductDesc}
                />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={modalStyles.label}>Buy Price (₹)</Text>
                    <TextInput
                      style={[modalStyles.input, { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4" }]}
                      placeholder="0.00"
                      keyboardType="numeric"
                      value={newProductBuy}
                      onChangeText={setNewProductBuy}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={modalStyles.label}>Sale Price (₹)</Text>
                    <TextInput
                      style={[modalStyles.input, { borderColor: "#e9d5ff", backgroundColor: "#faf5ff" }]}
                      placeholder="0.00"
                      keyboardType="numeric"
                      value={newProductSale}
                      onChangeText={setNewProductSale}
                    />
                  </View>
                </View>

                <Text style={modalStyles.label}>Unit of Measure (UoM)</Text>
                <View style={modalStyles.uomRow}>
                  {COMMON_UOMS.slice(0, 5).map((u) => (
                    <TouchableOpacity
                      key={u}
                      onPress={() => setNewProductUom(u)}
                      style={[modalStyles.uomChip, newProductUom === u && modalStyles.uomChipActive]}
                    >
                      <Text style={[modalStyles.uomChipText, newProductUom === u && modalStyles.uomChipTextActive]}>
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={modalStyles.footer}>
                <TouchableOpacity
                  onPress={() => setShowAddProductModal(false)}
                  style={modalStyles.cancelBtn}
                >
                  <Text style={modalStyles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleQuickAddProduct}
                  disabled={addingProduct}
                  style={[modalStyles.submitBtn, addingProduct && { opacity: 0.6 }]}
                >
                  {addingProduct ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={modalStyles.submitBtnText}>Add Product</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }
);

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1e293b",
  },
  uomRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  uomChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  uomChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  uomChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  uomChipTextActive: {
    color: "#ffffff",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 14,
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
    paddingHorizontal: 18,
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

export default GridForm;
