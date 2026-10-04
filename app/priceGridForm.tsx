// priceGridForm.tsx
import { useUserContext } from "@/context/AuthContext";
import { appService } from "@/UtilServices/appHelper";
import { styles as G, COLORS } from "@/styles/stylesIndex";
import { AppHeader } from "@/components/AppHeader";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
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
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  TextStyle,
  ViewStyle
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export interface GridFormRef {
  savePrices: () => void;
}

interface GridFormProps {
  vendorId: string;
  vendorName?: string;
  onSaved?: () => void; 
  onClose?:() => void;

}

const GridForm = forwardRef<GridFormRef, GridFormProps>(
  ({ vendorId, vendorName, onSaved , onClose }, ref) => {
    const { user } = useUserContext();
    const corporateId = user?.corporateId || "";
    const corpAdminId = user?.corpAdminId || "";
    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState<any[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>( null);
    const [groupedProducts, setGroupedProducts] = useState<any[]>([]);
    const [priceState, setPriceState] = useState<Record<string, { buy: number | string}>>({});
    const [saving, setSaving] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [existingRates, setExistingRates] = useState<any[]>([]);

    useEffect(() => {
      loadCategories();
    }, []);

    const loadCategories = async () => {
      try {
        setLoading(true);
        const res = await appService.httpClient.get(`product/category`, {
           params: { corporateId, corpAdminId }
        });
        const data = res.data;
        const cats: any[] = Array.isArray(data)
          ? data
          : data?.categories ?? [];
        setCategories(cats);
      } catch (err) {
        appService.showToast("Unable to load categories","Error");
      } finally {
        setLoading(false);
      }
    };

    const onCategorySelect = async (id: string | null) => {
      setSelectedCategoryId(id);
      if (!id) {
        setGroupedProducts([]);
        setPriceState({});
        setExistingRates([]);
        return;
      }

      const cat = categories.find((c) => c._id === id);
      const prods = Array.isArray(cat?.products) ? cat.products : [];

      const map: Record<string, any[]> = {};
      prods.forEach((p: any) => {
        const name = p.productName ?? "Unnamed";
        if (!map[name]) map[name] = [];
        map[name].push(p);
      });

      const grouped = Object.keys(map).map((name) => ({
        productName: name,
        items: map[name],
      }));

      setGroupedProducts(grouped);

      // Fetch existing rates
      let ratesMap: Record<string, number> = {};
      try {
        setFetching(true);
        const res = await appService.httpClient.get(`product/rate/vendor/${vendorId}/category/${id}`, {
           params: { corporateId, corpAdminId }
        });
        const data = res.data;
        if (data && Array.isArray(data.products)) {
          data.products.forEach((rp: any) => {
            ratesMap[rp.productId] = rp.price;
          });
          setExistingRates(data.products);
        }
      } catch (err) {
        console.warn("No existing rates or error:", err);
      } finally {
        setFetching(false);
      }

      const init: Record<string, any> = {};
      prods.forEach((p: any, i: number) => {
        const pid = String(p._id ?? `${p.productName}_${i}`);
        // If existing rate found, use it, else default to 0 or empty (user can modify)
        init[pid] = { buy: ratesMap[p._id] !== undefined ? String(ratesMap[p._id]) : "" };
      });
      setPriceState(init);
    };

    const updatePrice = (pid: string, field: "buy" , value: string | number) => {
      setPriceState((prev) => ({
        ...prev,
        [pid]: {
          ...(prev[pid] || { buy: "" }),
          [field]: value,
        },
      }));
    };

  const savePrices = async () => {
  if (!selectedCategoryId) {
    appService.showToast("Select a category","Info");
    return;
  }

  if (!vendorId) {
    appService.showToast("Vendor not found", "Error");
    return;
  }

  const payload: any[] = [];

  groupedProducts.forEach((group) => {
    group.items.forEach((p: any, idx: number) => {
      
      const pid = String(p._id ?? `${p.productName}_${idx}`);
      const buy = priceState[pid]?.buy 
          ? Number(String(priceState[pid].buy).replace(/,/g, "")) 
          : null;

      if (buy === null) return;

      payload.push({
        corporateId,
        corpAdminId,
        vendorId,
        categoryId: selectedCategoryId,
        categoryName: group.categoryName,   
        productId: p._id,                  
        productName: p.productName,
        description: p.description,
        UoM: p.UoM ?? "SQM",
        price: buy
      });

    });
  });

  if (!payload.length) {
    appService.showToast("Enter at least one price","Info");
    return;
  }

  try {
    setSaving(true);
   
    const res = await appService.httpClient.post(`product/rate/add`, payload);
   
    if (res?.status === 201 || res?.status === 200) {
      appService.showToast("Prices saved sucessfully","Success");
      setTimeout(() => onSaved?.(), 600);
    } else {
      appService.showToast("Save failed","Error");
    }

  } catch {
    appService.showToast("Save failed","Error");
  } finally {
    setSaving(false);
  }
};


    // expose method to parent
    useImperativeHandle(ref, () => ({
      savePrices,
    }));

    if (loading) {
      return (
        <View style={G.center as ViewStyle}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }

    return (
      <SafeAreaView style={G.safeContainer as ViewStyle} edges={["top"]}>
        <AppHeader 
          title={vendorName || "Price Grid"} 
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
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <FlatList
          data={groupedProducts}
          keyExtractor={(_, index) => `group_${index}`}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              <Text style={G.pgLabel as TextStyle}>Select Category</Text>
              <View style={G.pgPickerWrapper as ViewStyle}>
                <Picker
                  selectedValue={selectedCategoryId}
                  onValueChange={onCategorySelect}
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
                <View style={{ padding: 40, alignItems: "center" }}>
                  <ActivityIndicator color={COLORS.primary} />
                  <Text style={[G.fs13, G.txtSec, G.mt8] as any}>Fetching existing rates...</Text>
                </View>
              )}
            </>
          }
          ListEmptyComponent={
            !fetching && selectedCategoryId ? (
              <View style={{ marginTop: 40, alignItems: "center" }}>
                <Ionicons name="layers-outline" size={64} color="#CBD5E1" />
                <Text style={{ marginTop: 16, fontSize: 16, fontWeight: "600", color: "#64748B" }}>
                  No product add for pricing
                </Text>
              </View>
            ) : !fetching && !selectedCategoryId ? (
              <View style={{ marginTop: 60, alignItems: "center" }}>
                <Ionicons name="pricetags-outline" size={64} color="#CBD5E1" />
                <Text style={{ marginTop: 16, fontSize: 16, fontWeight: "600", color: "#64748B" }}>
                  Select Category First
                </Text>
                <Text style={{ marginTop: 4, color: "#94A3B8", textAlign: "center", paddingHorizontal: 40 }}>
                  Choose a category from the dropdown to start managing purchase rates for {vendorName || "this vendor"}.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item: group }) => (
            <View style={G.pgGroupBox as ViewStyle}>
              <View style={G.pgGroupHeader as ViewStyle}>
                <Text style={G.pgGroupTitle as TextStyle}>{group.productName}</Text>
              </View>

              <View style={G.pgRowHeader as ViewStyle}>
                <Text style={[G.pgHText, G.pgHCol1] as any}>Description</Text>
                <Text style={[G.pgHText, G.pgHCol2] as any}>Buy Price</Text>
                <Text style={[G.pgHText, G.pgHCol3] as any}>UoM</Text>
              </View>

              {group.items.map((p: any, idx: number) => {
                const pid = String(p._id ?? `${group.productName}_${idx}`);
                return (
                  <View key={pid} style={G.pgDataRow as ViewStyle}>
                    <Text style={G.pgColDesc as TextStyle}>{p.description}</Text>
                    <TextInput
                      style={G.pgInput as any}
                      keyboardType="numeric"
                      value={priceState[pid]?.buy?.toString() ?? ""}
                      onChangeText={(v) => updatePrice(pid, "buy", v)}
                      placeholder="0.00"
                      placeholderTextColor="#CBD5E1"
                    />
                    <Text style={G.pgColUom as TextStyle}>{p.UoM ?? "PCS"}</Text>
                  </View>
                );
              })}
            </View>
          )}
        />
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }
);

export default GridForm;
