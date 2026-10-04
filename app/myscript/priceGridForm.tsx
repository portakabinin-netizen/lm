// priceGridForm.tsx
import { httpClient } from "@/context/AuthContext";
import { showGlobalToast } from "@/hooks/commomFunction";
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
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { styles } from "../myscript/dashboards/styles/styles";

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
    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState<any[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>( null);
    const [groupedProducts, setGroupedProducts] = useState<any[]>([]);
    const [priceState, setPriceState] = useState<Record<string, { buy: number | string}>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
      loadCategories();
    }, []);

    const loadCategories = async () => {
      try {
        setLoading(true);
        const res = await httpClient.get(`/product/category`);
        const data = res.data;
        const cats: any[] = Array.isArray(data)
          ? data
          : data?.categories ?? [];
        setCategories(cats);
      } catch (err) {
        showGlobalToast("Unable to load categories","Error");
      } finally {
        setLoading(false);
      }
    };

    const onCategorySelect = (id: string | null) => {
      setSelectedCategoryId(id);
      if (!id) {
        setGroupedProducts([]);
        setPriceState({});
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

      const init: Record<string, any> = {};
      prods.forEach((p: any, i: number) => {
        const pid = String(p._id ?? `${p.productName}_${i}`);
        init[pid] = { buy: 0 };
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
    showGlobalToast("Select a category","Info");
    return;
  }

  if (!vendorId) {
    showGlobalToast("Vendor not found", "Error");
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
    showGlobalToast("Enter at least one price","Info");
    return;
  }

  try {
    setSaving(true);
   
    const res = await httpClient.post(`/product/rate/add`, payload);
   
    if (res?.status === 201 || res?.status === 200) {
      showGlobalToast("Prices saved sucessfully","Success");
      setTimeout(() => onSaved?.(), 600);
    } else {
      showGlobalToast("Save failed","Error");
    }

  } catch {
    showGlobalToast("Save failed","Error");
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
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      );
    }

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
        <ScrollView contentContainerStyle={{ padding: 10 }}>
          <View style={styles.toolbar}>
            
            <Text style={[styles.label, { fontSize: 15, marginBottom: 0 }]}>{vendorName}</Text>

            <View style={[styles.buttonRow, { justifyContent: "flex-end" }]}>

              {/* SAVE BUTTON */}
              <TouchableOpacity
                onPress={savePrices}
                style={[styles.saveButton, saving && { opacity: 0.3 }]}
                disabled={saving}
              >
                {saving ? (
                  <Text style={styles.saveButtonText}>Saving...</Text>
                ) : (
                  <Ionicons name="checkmark" size={25} color="#fff" />
                )}
              </TouchableOpacity>

              {/* CLOSE BUTTON */}
               <TouchableOpacity
                onPress={onClose}
                style={[styles.closeButton, saving && { opacity: 0.3 , marginStart:10 }]}
                 >
               <Text style={styles.closeButtonText}>
                {<Ionicons name="close" size={25} color="#e3ece3ff" />}
               </Text>
            
              </TouchableOpacity>
            </View>
          </View>
           <Text style={styles.label}>Select Category</Text>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={selectedCategoryId}
              onValueChange={onCategorySelect}
              style={styles.picker}
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

          {groupedProducts.map((group, gIndex) => (
            <View key={gIndex} style={styles.groupBox}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupHeaderText}>{group.productName}</Text>
              </View>

              <View style={styles.headerRow}>
                <Text style={styles.hDesc}>Description</Text>
                <Text style={styles.hBuy}>Buy</Text>
                <Text style={styles.hUom}>UoM</Text>
              </View>

              {group.items.map((p: any, idx: number) => {
                const pid = String(p._id ?? `${group.productName}_${idx}`);
                return (
                  <View key={pid} style={styles.dataRow}>
                    <View style={styles.dataRow}>
                      <Text style={styles.colDesc}>{p.description}</Text>

                      <TextInput
                      style={styles.colInput}
                      keyboardType="numeric"
                      value={priceState[pid]?.buy?.toString() ?? ""}
                      onChangeText={(v) => updatePrice(pid, "buy", v)}
                      placeholder=""
                    />

                      <Text style={styles.colUom}>{p.UoM ?? ""}</Text>
                    </View>

                    <View style={styles.divider} />
                  </View>
                );
              })}
            </View>
          ))}
          
        </ScrollView>
      </SafeAreaView>
    );
  }
);

export default GridForm;
