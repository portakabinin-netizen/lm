import { AppHeader } from "@/components/AppHeader";
import { useUserContext } from "@/context/AuthContext";
import { styles as G } from "@/styles/stylesIndex";
import { appService } from "@/UtilServices/appHelper";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from '@react-native-picker/picker';
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { SafeAreaView } from "react-native-safe-area-context";
 
 const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
   <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
     {children}
   </View>
 );

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
  const units = ["SQM", "SQF", "RFT", "RMT", "PKT", "BOX", "PCS", "KGM", "LTR", "BTL"];
  const [productMoU, setproductMoU] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productTaxRate, setProductTaxRate] = useState("18");
  const [saving, setSaving] = useState(false);

  const { user } = useUserContext();
  const corporateId = user?.corporateId || "";
  const corpAdminId = user?.corpAdminId || "";

  /* ----------------------------------- */
  /*            LOAD DATA                */
  /* ----------------------------------- */
  const loadCategories = async () => {
    if (!corporateId || !corpAdminId) return;
    try {
      setLoading(true);
      const res = await appService.httpClient.get(`product/category`, {
        params: { corporateId, corpAdminId }
      });
      setCategories(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      appService.showToast("Unable to load categories", "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (corporateId && corpAdminId) {
      loadCategories();
    }
  }, [corporateId, corpAdminId]);

  /* ----------------------------------- */
  /*            HELPERS                  */
  /* ----------------------------------- */

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
    if (!categoryName.trim()) { appService.showToast("Category name required", "Error"); return; }
    if (categoryHsn && !/^\d{4,8}$/.test(categoryHsn.trim())) {
      appService.showToast("HSN/SAC code must be 4–8 digits.", "Error"); return;
    }

    setSaving(true);
    try {
      const body = {
        categoryName: categoryName.trim(),
        hsn_sac: categoryHsn.trim(),
        corporateId,
        corpAdminId
      };
      if (editingCategory?._id) {
        await appService.httpClient.put(`product/category/${editingCategory._id}`, body);
      } else {
        await appService.httpClient.post(`product/category/add`, body);
      }
      setModalVisible(false);
      await loadCategories();
    } catch (err: any) {
      appService.showToast(err?.response?.data?.error || "Failed to save category", "Error");
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = (cat: any) => {
    if (cat.products?.length > 0) {
      appService.showToast("Category contains products. Remove products first.", "Error"); return;
    }

    Alert.alert("Delete", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await appService.httpClient.delete(`product/category/${cat._id}`, {
              params: { corporateId, corpAdminId }
            });
            await loadCategories();
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
    setProductHsn(cat.hsn_sac || "");  // inherit from category
    setproductMoU("");
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
    setproductMoU(p.UoM || p.productMoU || "");
    setProductPrice(String(p.price || ""));
    setProductTaxRate(String(p.tax_rate || "18"));
    setModalVisible(true);
  };

  const saveProduct = async () => {
    if (!productName.trim() || !productDesc.trim() || !productMoU.trim()) {
      appService.showToast("All fields required!", "Error"); return;
    }
    if (productHsn && !/^\d{4,8}$/.test(productHsn.trim())) {
      appService.showToast("HSN/SAC code must be 4–8 digits.", "Error"); return;
    }

    const catId = selectedCategoryForProduct?._id;
    if (!catId) { appService.showToast("No Category selected!", "Error"); return; }

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
    } catch (err: any) {
      appService.showToast(err?.response?.data?.error || "Failed to save product", "Error");
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = (catId: string, productId: string) => {
    Alert.alert("Delete Product", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await appService.httpClient.delete(`product/${catId}/${productId}`, {
              params: { corporateId, corpAdminId }
            });
            await loadCategories();
          } catch (err: any) {
            console.warn(err);
            appService.showToast(err?.response?.data?.error || "Cannot delete. Product may be used in quote/invoice.", "Error");
          }
        },
      },
    ]);
  };

  /* ----------------------------------- */
  /*         SWIPE ACTION RENDERS        */
  /* ----------------------------------- */

  const renderCategoryActions = (cat: any) => () => (
    <View style={G.swipeContainer as ViewStyle}>
      <TouchableOpacity onPress={() => openEditCategoryModal(cat)} style={G.swipeEdit as ViewStyle}>
        <Ionicons name="create-outline" size={20} color="#fff" />
        <Text style={G.swipeLabel as TextStyle}>Edit</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => deleteCategory(cat)}
        style={[G.swipeDelete as ViewStyle, { backgroundColor: cat.products?.length ? "#999" : "red" }]}
      >
        <Ionicons name="trash" size={20} color="#fff" />
        <Text style={G.swipeLabel as TextStyle}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  const renderProductActions = (cat: any, p: any) => () => (
    <View style={G.swipeContainer as ViewStyle}>
      <TouchableOpacity onPress={() => openEditProductModal(cat, p)} style={G.swipeEdit as ViewStyle}>
        <Ionicons name="create-outline" size={18} color="#fff" />
        <Text style={G.swipeLabel as TextStyle}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => deleteProduct(cat._id, p._id)} style={G.swipeDelete as ViewStyle}>
        <Ionicons name="trash" size={18} color="#fff" />
        <Text style={G.swipeLabel as TextStyle}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  /* ----------------------------------- */
  /*          CARD COMPONENTS            */
  /* ----------------------------------- */

  const ProductCard = ({ cat, p }: any) => (
    <Swipeable overshootRight={false} renderRightActions={renderProductActions(cat, p)}>
      <View style={G.productCard as ViewStyle}>
        <View style={G.rowBetween as ViewStyle}>
          <Text style={G.productTitle as TextStyle}>{p.productName}</Text>
          {(p.hsn_sac || cat.hsn_sac) ? (
            <View style={G.hsnBadge as ViewStyle}>
              <Text style={G.hsnBadgeTxt as TextStyle}>HSN {p.hsn_sac || cat.hsn_sac}</Text>
            </View>
          ) : null}
        </View>
        <Text style={G.productDesc as TextStyle}>↳ {p.description || "No description"}</Text>
        <View style={[G.rowBetween, G.mt2] as any}>
           <Text style={[G.fs11, G.txtSec] as any}>Unit: {p.UoM || "—"}</Text>
           <Text style={[G.fs11, G.txtSec] as any}>Price: ₹{p.price || 0} | GST: {p.tax_rate || 18}%</Text>
        </View>
      </View>
    </Swipeable>
  );

  const CategoryBlock = ({ item }: any) => {
    const isExpanded = expandedCategory === item._id;

    return (
      <View style={{ marginBottom: 14 }}>
        <Swipeable overshootRight={false} renderRightActions={renderCategoryActions(item)}>
          <View style={G.card as ViewStyle}>
            <TouchableOpacity
              onPress={() => setExpandedCategory(isExpanded ? null : item._id)}
              style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
            >
              <Ionicons name="folder" size={20} color="#0b6cff" />
              <View style={[G.ml8, G.flex1] as any}>
                <Text style={G.vendorName as TextStyle}>{item.categoryName}</Text>
                {item.hsn_sac ? (
                  <Text style={[G.fs11, G.txtSec] as any}>HSN/SAC: {item.hsn_sac}</Text>
                ) : null}
              </View>
            </TouchableOpacity>

            {isExpanded && (
              <TouchableOpacity onPress={() => openAddProductModal(item)}>
                <Ionicons name="add" size={24} color="#0b6cff" />
              </TouchableOpacity>
            )}
          </View>
        </Swipeable>

        {isExpanded && item.products?.length > 0 && (
          <View style={G.productList as ViewStyle}>
            {item.products.map((p: any) => (
              <ProductCard key={p._id} cat={item} p={p} />
            ))}
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
      <SafeAreaView style={[G.safeContainer as ViewStyle, { justifyContent: "center", alignItems: "center" }] as any}>
        <ActivityIndicator size="large" color="#0b6cff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={G.safeContainer as ViewStyle} edges={["top"]}>
      <AppHeader
        title="Categories"
        onBackPress={() => router.back()}
        rightAction={() => (
          <TouchableOpacity onPress={openAddCategoryModal} style={{ padding: 4, marginRight: 8 }}>
            <Ionicons name="add-circle" size={32} color="#fff" />
          </TouchableOpacity>
        )}
      />


      {/* BODY */}
      <FlatList
        data={categories}
        keyExtractor={(i) => String(i._id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListEmptyComponent={
          <View style={{ marginTop: 60, alignItems: "center" }}>
            <Ionicons name="folder-open-outline" size={64} color="#CBD5E1" />
            <Text style={{ marginTop: 16, fontSize: 16, fontWeight: "600", color: "#64748B" }}>
              No categories/product added
            </Text>
            <Text style={{ marginTop: 4, color: "#94A3B8", textAlign: "center", paddingHorizontal: 40 }}>
              This corporate has no product/categories yet. Click the + button to add one.
            </Text>
          </View>
        }
        renderItem={({ item }) => <CategoryBlock item={item} />}
      />

      {/* MODAL */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={G.modalWrapper as ViewStyle}
        >
          <ScrollView contentContainerStyle={G.modalCard as ViewStyle}>
            {modalType === "category" && (
              <>
                <Text style={G.modalTitle as TextStyle}>{editingCategory ? "Edit Category" : "Add Category"}</Text>

                <Text style={G.label as TextStyle}>Category Name</Text>
                <TextInput
                  style={G.input as any}
                  placeholder="Enter category name"
                  value={categoryName}
                  onChangeText={setCategoryName}
                />

                <Text style={G.label as TextStyle}>HSN / SAC Code</Text>
                <TextInput
                  style={G.input as any}
                  placeholder="6-digit code e.g. 441820"
                  value={categoryHsn}
                  onChangeText={v => setCategoryHsn(v.replace(/\D/g, "").slice(0, 8))}
                  keyboardType="number-pad"
                  maxLength={8}
                />
                {categoryHsn ? (
                  <Text style={G.hsnHintTxt as TextStyle}>
                    {categoryHsn.length < 4
                      ? "⚠ Too short — enter at least 4 digits"
                      : `✓ ${categoryHsn.length}-digit HSN/SAC will apply to all products in this category`}
                  </Text>
                ) : null}

                <View style={G.actionsRow as ViewStyle}>
                  <TouchableOpacity
                    style={[G.actionBtn as ViewStyle, { backgroundColor: "#777" }] as any}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={G.actionBtnText as TextStyle}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[G.actionBtn as ViewStyle, { backgroundColor: "#0b6cff", marginLeft: 12 }] as any}
                    onPress={saveCategory}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={G.actionBtnText as TextStyle}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {modalType === "product" && (
              <>
                <Text style={G.modalTitle as TextStyle}>
                  {editingProduct
                    ? "Edit Product"
                    : `New Product (${selectedCategoryForProduct?.categoryName})`}
                </Text>

                <Text style={G.label as TextStyle}>Product Name</Text>
                <TextInput
                  style={G.input as any}
                  placeholder="Enter product name"
                  value={productName}
                  onChangeText={setProductName}
                />

                <Text style={G.label as TextStyle}>Description</Text>
                <TextInput
                  style={[G.input as any, { minHeight: 80 }] as any}
                  placeholder="Enter description"
                  value={productDesc}
                  multiline
                  onChangeText={setProductDesc}
                />

                <Text style={G.label as TextStyle}>HSN / SAC Code</Text>
                <TextInput
                  style={G.input as any}
                  placeholder="e.g. 441820  (inherited from category)"
                  value={productHsn}
                  onChangeText={v => setProductHsn(v.replace(/\D/g, "").slice(0, 8))}
                  keyboardType="number-pad"
                  maxLength={8}
                />
                {productHsn ? (
                  <Text style={G.hsnHintTxt as TextStyle}>
                    {productHsn.length < 4
                      ? "⚠ Too short — enter at least 4 digits"
                      : `✓ ${productHsn.length}-digit HSN/SAC`}
                  </Text>
                ) : null}

                <Text style={G.label as TextStyle}>Unit Of Measurement</Text>
                <Picker
                  selectedValue={productMoU}
                  onValueChange={(value) => setproductMoU(value)}
                  style={[G.input as any, { height: 50 }] as any}
                >
                  <Picker.Item label="Select Unit" value="" />
                  {units.map((u, i) => (
                    <Picker.Item key={i} label={u} value={u} />
                  ))}
                </Picker>

                <Row>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={G.label as TextStyle}>Unit Price</Text>
                    <TextInput
                      style={G.input as any}
                      placeholder="e.g. 1200"
                      value={productPrice}
                      onChangeText={setProductPrice}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={G.label as TextStyle}>GST Rate (%)</Text>
                    <Picker
                      selectedValue={productTaxRate}
                      onValueChange={(value) => setProductTaxRate(value)}
                      style={[G.input as any, { height: 50 }] as any}
                    >
                      {[0, 5, 12, 18, 28].map(r => (
                        <Picker.Item key={r} label={`${r}%`} value={String(r)} />
                      ))}
                    </Picker>
                  </View>
                </Row>

                <View style={G.actionsRow as ViewStyle}>
                  <TouchableOpacity
                    style={[G.actionBtn as ViewStyle, { backgroundColor: "#777" }] as any}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={G.actionBtnText as TextStyle}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[G.actionBtn as ViewStyle, { backgroundColor: "#0b6cff", marginLeft: 12 }] as any}
                    onPress={saveProduct}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={G.actionBtnText as TextStyle}>{editingProduct ? "Update" : "Save"}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}
