// ---------------------
// CategoryScreen.tsx (UI cleaned + style-matched)
// ---------------------
import { httpClient } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from '@react-native-picker/picker';
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { SafeAreaView } from "react-native-safe-area-context";
import { styles } from "../myscript/dashboards/styles/styles";

export default function CategoryScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"category" | "product" | null>(null);

  const [editingCategory, setEditingCategory] = useState<any | null>(null);
  const [categoryName, setCategoryName] = useState("");

  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [selectedCategoryForProduct, setSelectedCategoryForProduct] = useState<any | null>(null);
  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const units = ["SQM","SQF","RFT","RMT","PKT","BOX","PCS","KGM","LTR","BTL"];
  const [productMoU , setproductMoU] = useState("");
  const [saving, setSaving] = useState(false);

  /* ---------- Dummy Session ---------- */
 const userSession = {
  corpName: "portakabin.in",
  tagName: "Unit of Hiresh iSearch",
  userName: "Suresh Chauhan",
  userId: "6922fdef5ccd1468ac80563a", // valid ObjectId string in your DB
  CorpId: "",
  corpProfileImage: "https://ui-avatars.com/api/?name=Porta+Kabin",
  userRole: "CorpAdmin", // or "SuperAdmin", "Sales", "Project"
};

  /* ----------------------------------- */
  /*            LOAD DATA                */
  /* ----------------------------------- */
  const loadCategories = async () => {
    try {
      setLoading(true);
      const res = await httpClient.get(`/product/category`);
      setCategories(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert("Error", "Unable to load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  /* ----------------------------------- */
  /*        CATEGORY SAVE / DELETE       */
  /* ----------------------------------- */

  const openAddCategoryModal = () => {
    setModalType("category");
    setEditingCategory(null);
    setCategoryName("");
    setModalVisible(true);
  };

  const openEditCategoryModal = (cat: any) => {
    setModalType("category");
    setEditingCategory(cat);
    setCategoryName(cat.categoryName || "");
    setModalVisible(true);
  };

  const saveCategory = async () => {
    if (!categoryName.trim()) return Alert.alert("Validation", "Category name required");

    setSaving(true);
    try {
      if (editingCategory?._id) {
        await httpClient.put(`/product/category/${editingCategory._id}`, {
          categoryName: categoryName.trim(),
        });
      } else {
        await httpClient.post(`/product/category/add`, {
          categoryName: categoryName.trim(),
        });
      }
      setModalVisible(false);
      await loadCategories();
    } catch (err: any) {
      Alert.alert("Error", err?.response?.data?.error || "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = (cat: any) => {
    if (cat.products?.length > 0) {
      return Alert.alert("Cannot delete", "Category contains products. Remove products first.");
    }

    Alert.alert("Delete", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await httpClient.delete(`/product/category/${cat._id}`);
            await loadCategories();
          } catch (err: any) {
            Alert.alert("Error", err?.response?.data?.error || "Failed to delete category");
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
    setproductMoU("");
    setModalVisible(true);
  };

  const openEditProductModal = (cat: any, p: any) => {
    setModalType("product");
    setEditingProduct(p);
    setSelectedCategoryForProduct(cat);
    setProductName(p.productName || "");
    setProductDesc(p.description || "");
    setproductMoU(p.productMoU|| "");
    setModalVisible(true);
  };

  const saveProduct = async () => {
    if (!productName.trim() || !productDesc.trim() || !productMoU.trim()) return Alert.alert("Validation", "All value required!");

    const catId = selectedCategoryForProduct?._id;
    if (!catId) return Alert.alert("Validation", "No Category select, select a category!");

    setSaving(true);
    try {
      if (editingProduct?._id) {
        await httpClient.put(`/product/${catId}/${editingProduct._id}`, {
          categoryId: catId,
          productName: productName.trim(),
          description: productDesc.trim(),
          UoM: productMoU.trim(),
        });
      } else {
        console.log(`/product/add`, {
          categoryId: catId,
          productName: productName.trim(),
          description: productDesc.trim(),
          UoM: productMoU.trim(),          
        })
        await httpClient.post(`product/add`, {
          categoryId: catId,
          productName: productName.trim(),
          description: productDesc.trim(),
          UoM: productMoU.trim(),          
        });
      }
      setModalVisible(false);
      await loadCategories();
    } catch (err: any) {
      Alert.alert("Error", err?.response?.data?.error || "Failed to save product");
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
            await httpClient.delete(`/product/${catId}/${productId}`);
            await loadCategories();
          } catch (err: any) {
            console.warn(err);
            Alert.alert(
              "Error",
              err?.response?.data?.error || "Cannot delete. Product may be used in quote/invoice."
            );
          }
        },
      },
    ]);
  };

  /* ----------------------------------- */
  /*         SWIPE ACTION RENDERS        */
  /* ----------------------------------- */

  const renderCategoryActions = (cat: any) => () => (
    <View style={styles.swipeContainer}>
      <TouchableOpacity onPress={() => openEditCategoryModal(cat)} style={styles.swipeEdit}>
        <Ionicons name="create-outline" size={20} color="#fff" />
        <Text style={styles.swipeLabel}>Edit</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => deleteCategory(cat)}
        style={[styles.swipeDelete, { backgroundColor: cat.products?.length ? "#999" : "red" }]}
      >
        <Ionicons name="trash" size={20} color="#fff" />
        <Text style={styles.swipeLabel}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  const renderProductActions = (cat: any, p: any) => () => (
    <View style={styles.swipeContainer}>
      <TouchableOpacity onPress={() => openEditProductModal(cat, p)} style={styles.swipeEdit}>
        <Ionicons name="create-outline" size={18} color="#fff" />
        <Text style={styles.swipeLabel}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => deleteProduct(cat._id, p._id)} style={styles.swipeDelete}>
        <Ionicons name="trash" size={18} color="#fff" />
        <Text style={styles.swipeLabel}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  /* ----------------------------------- */
  /*          CARD COMPONENTS            */
  /* ----------------------------------- */

  const ProductCard = ({ cat, p }: any) => (
    <Swipeable overshootRight={false} renderRightActions={renderProductActions(cat, p)}>
      <View style={styles.productCard}>
        <Text style={styles.productTitle}>{p.productName}</Text>
        <Text style={styles.productDesc}>↳ {p.description || "No description"}</Text>
      </View>
    </Swipeable>
  );

  const CategoryBlock = ({ item }: any) => {
    const isExpanded = expandedCategory === item._id;

    return (
      <View style={{ marginBottom: 14 }}>
        <Swipeable overshootRight={false} renderRightActions={renderCategoryActions(item)}>
          <View style={styles.card}>
            <TouchableOpacity
              onPress={() => setExpandedCategory(isExpanded ? null : item._id)}
              style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
            >
              <Ionicons name="folder" size={20} color="#0b6cff" />
              <Text style={[styles.vendorName, { marginLeft: 8 }]}>{item.categoryName}</Text>
            </TouchableOpacity>

            {isExpanded && (
              <TouchableOpacity onPress={() => openAddProductModal(item)}>
                <Ionicons name="add" size={24} color="#0b6cff" />
              </TouchableOpacity>
            )}
          </View>
        </Swipeable>

        {isExpanded && item.products?.length > 0 && (
          <View style={styles.productList}>
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
      {/* Center title */}
                <View style={{ flex: 1, justifyContent: "center" }}>
                  <Text style={styles.headerTitle}>{userSession.corpName}</Text>
                  <Text style={styles.headersubTitle}>{userSession.tagName}</Text>
                </View>
      
      {/* Corp profile image (upload) */}
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
          <Text style={styles.toolbarTitle}>Categories</Text>
          <TouchableOpacity onPress={openAddCategoryModal} style={{ marginLeft: 8 }}>
            <Ionicons name="add-circle" size={24} color="#0b6cff" />
          </TouchableOpacity>
        </View>
      </View>

    
      {/* BODY */}
      <FlatList
        data={categories}
        keyExtractor={(i) => String(i._id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        renderItem={({ item }) => <CategoryBlock item={item} />}
      />

      {/* MODAL */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalWrapper}
        >
          <ScrollView contentContainerStyle={styles.modalCard}>
            {modalType === "category" && (
              <>
                <Text style={styles.modalTitle}>{editingCategory ? "Edit Category" : "Add Category"}</Text>
                <Text style={styles.label}>Category Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter category name"
                  value={categoryName}
                  onChangeText={setCategoryName}
                />

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#777" }]}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={styles.actionBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#0b6cff", marginLeft: 12 }]}
                    onPress={saveCategory}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.actionBtnText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {modalType === "product" && (
              <>
                <Text style={styles.modalTitle}>
                  {editingProduct
                    ? "Edit Product"
                    : `New Product (${selectedCategoryForProduct?.categoryName})`}
                </Text>

                <Text style={styles.label}>Product Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter product name"
                  value={productName}
                  onChangeText={setProductName}
                />

                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, { minHeight: 80 }]}
                  placeholder="Enter description"
                  value={productDesc}
                  multiline
                  onChangeText={setProductDesc}
                />
                <Text style={styles.label}>Unit Of measurement</Text>
                <Picker
                    selectedValue={productMoU}
                    onValueChange={(value) => setproductMoU(value)}
                    style={[styles.input, { height: 50 }]}
                >
                    <Picker.Item label="Select Unit" value="" />
                    {units.map((u, i) => (
                      <Picker.Item key={i} label={u} value={u} />
                    ))}
                </Picker>

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#777" }]}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={styles.actionBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#0b6cff", marginLeft: 12 }]}
                    onPress={saveProduct}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.actionBtnText}>{editingProduct ? "Update" : "Save"}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* FOOTER */}
      <SafeAreaView style={styles.footerSafe} edges={["bottom"]}>
              <View style={styles.footer}>
                <Text style={styles.footerText}>© 2026 Hiresh iSearch</Text>
                <Text style={styles.footerSubText}>Version 1.0.0</Text>
              </View>
            </SafeAreaView>
    </SafeAreaView>
  );
}
