// priceGridForm.tsx
import { httpClient } from "@/context/AuthContext";
import { Picker } from "@react-native-picker/picker";
import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
  vendorId: string | null;
  vendorName: string | null;
}

const GridForm = forwardRef<GridFormRef, GridFormProps>(
({ vendorId, vendorName }, ref) => {

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [groupedProducts, setGroupedProducts] = useState<any[]>([]);
  const [priceState, setPriceState] = useState<Record<string, { buy: string; sale: string }>>({});
  const [saving, setSaving] = useState(false);

  // Load categories
  useEffect(() => { loadCategories(); }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const res = await httpClient.get(`/product/category`);
      const data = res.data;

      let cats: any[] = [];

      if (Array.isArray(data)) {
        cats = data.map((c: any, i: number) => ({
          _id: String(c._id ?? `cat_${i}`),
          categoryName: c.categoryName ?? c.name ?? `Category ${i + 1}`,
          products: Array.isArray(c.products) ? c.products : [],
        }));
      } else if (data?.categories) {
        cats = data.categories.map((c: any, i: number) => ({
          _id: String(c._id ?? `cat_${i}`),
          categoryName: c.categoryName ?? c.name ?? `Category ${i + 1}`,
          products: Array.isArray(c.products) ? c.products : [],
        }));
      }

      setCategories(cats);
    } catch {
      Alert.alert("Error", "Unable to load categories");
    } finally {
      setLoading(false);
    }
  };

  const onCategorySelect = (id: string | null) => {
    setSelectedCategoryId(id);

    if (!id) return setGroupedProducts([]), setPriceState({});

    const cat = categories.find((c) => c._id === id);
    const prods = Array.isArray(cat?.products) ? cat.products : [];

    const map: Record<string, any[]> = {};
    prods.forEach((p) => {
      const name = p.productName ?? "Unnamed";
      if (!map[name]) map[name] = [];
      map[name].push(p);
    });

    setGroupedProducts(Object.keys(map).map(name => ({ productName: name, items: map[name] })));

    const init: Record<string, any> = {};
    prods.forEach((p, i) => init[String(p._id ?? `${p.productName}_${i}`)] = { buy: "", sale: "" });
    setPriceState(init);
  };

  const updatePrice = (pid: string, field: "buy" | "sale", value: string) =>
    setPriceState(prev => ({ ...prev, [pid]: { ...(prev[pid]||{buy:"",sale:""}), [field]:value }}));

  const handleSave = async () => {
    if (!selectedCategoryId) return Alert.alert("Validation","Select a category");
    if (!vendorId) return Alert.alert("Error","Vendor not found");

    const prices:any[] = [];
    groupedProducts.forEach(group => {
      group.items.forEach((p:any,idx:number) => {
        const pid = String(p._id ?? `${p.productName}_${idx}`);
        const buy = priceState[pid]?.buy ? Number(priceState[pid].buy.replace(/,/g,"")) : null;
        const sale = priceState[pid]?.sale ? Number(priceState[pid].sale.replace(/,/g,"")) : null;
        if (buy===null && sale===null) return;

        prices.push({
          productId:p._id ?? null,
          description:p.description ?? "",
          buyPrice:buy,
          salePrice:sale,
          UoM:p.UoM ?? "",
          margin: buy!==null && sale!==null ? sale-buy : null,
        });
      });
    });

    if (!prices.length) return Alert.alert("Validation","Enter at least one price");

    setSaving(true);
    try {
      const res = httpClient.post(`/product/pricetags`,{
        vendorId,categoryId:selectedCategoryId,prices,
      });
      if(res.status===200||res.status===201) Alert.alert("Success","Prices saved successfully");
    } catch {
      Alert.alert("Error","Save failed");
    } finally { setSaving(false); }
  };

  // expose function to parent
  useImperativeHandle(ref, () => ({ savePrices: handleSave }));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large"/></View>;

  return (
    <SafeAreaView style={{flex:1,backgroundColor:"#fff"}}>
      <KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":undefined} style={{flex:1}}>
      <ScrollView contentContainerStyle={{padding:16}}>

        <Text style={[styles.label,{fontSize:18,marginBottom:10}]}>Vendor: {vendorName}</Text>

        <Text style={styles.label}>Select Category</Text>
        <View style={styles.pickerWrapper}>
          <Picker selectedValue={selectedCategoryId} onValueChange={onCategorySelect} style={styles.picker}>
            <Picker.Item label="-- Choose Category --" value={null}/>
            {categories.map(c=>(<Picker.Item key={c._id} label={c.categoryName} value={c._id}/>))}
          </Picker>
        </View>

        {groupedProducts.map((group,gIndex)=>(
          <View key={gIndex} style={styles.groupBox}>
            <View style={styles.groupHeader}><Text style={styles.groupHeaderText}>{group.productName}</Text></View>

            <View style={styles.headerRow}>
              <Text style={styles.hDesc}>Description</Text><Text style={styles.hBuy}>Buy</Text>
              <Text style={styles.hSale}>Sale</Text><Text style={styles.hUom}>UoM</Text>
            </View>

            {group.items.map((p:any,idx:number)=>{
              const pid=String(p._id ?? `${group.productName}_${idx}`);
              return(
                <View key={pid} style={styles.dataRowWrap}>
                 <View style={styles.dataRow}>

                  <Text style={styles.colDesc}>{p.description}</Text>
                  <TextInput style={styles.colInput} value={priceState[pid]?.buy??""} keyboardType="numeric"
                    onChangeText={v=>updatePrice(pid,"buy",v)} placeholder="0"/>

                  <TextInput style={styles.colInput} value={priceState[pid]?.sale??""} keyboardType="numeric"
                    onChangeText={v=>updatePrice(pid,"sale",v)} placeholder="0"/>

                  <Text style={styles.colUom}>{p.UoM??""}</Text>
                 </View>
                <View style={styles.divider}/>
                </View>
              );
            })}
          </View>
        ))}

        <TouchableOpacity onPress={handleSave} style={[styles.saveButton,saving&&{opacity:0.6}]}>
          <Text style={styles.saveButtonText}>{saving?"Saving...":"Save Prices"}</Text>
        </TouchableOpacity>

      </ScrollView></KeyboardAvoidingView>
    </SafeAreaView>
  );
});

export default GridForm;
