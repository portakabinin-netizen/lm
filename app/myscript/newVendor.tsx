// =============== newVendor.tsx (FULLY FIXED – NO TEXT STRING ERROR) ===============

import { httpClient } from "@/context/AuthContext";
import { showGlobalToast } from "@/hooks/commomFunction";
import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Linking,
  Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { SafeAreaView } from "react-native-safe-area-context";
import { styles } from "../../styles/stylesIndex";

const clean = (n:string)=>n.replace(/[^\d]/g,"");

export default function VendorScreen(){

  const router=useRouter();

  const [vendors,setVendors]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);

  const [modal,setModal]=useState(false);
  const [edit,setEdit]=useState<any>(null);

  const [form,setForm]=useState({
    vendorName:"",contactPerson:"",mobileNo:"",vendorGST:"",vendorAddress:""
  });

  const [contacts,setContacts]=useState<any[]>([]);
  const [suggestions,setSuggestions]=useState<any[]>([]);
  const [numberOptions,setNumberOptions]=useState<string[]>([]);
  const [showSuggest,setShowSuggest]=useState(false);
  const typeDelay=useRef<any>(null);

  // ---------- LOAD VENDORS ----------
  const loadVendors=async()=>{
    try{
      setLoading(true);
      const r=await httpClient.get(`/product/vendor`);
      setVendors(r.data||[]);
    }catch{
      showGlobalToast("Failed Loading vendors","Error");
    }finally{ setLoading(false); }
  };
  useEffect(()=>{ loadVendors(); },[]);

  // ---------- FETCH CONTACTS ----------
  const loadContacts=async()=>{
    const {status}=await Contacts.requestPermissionsAsync();
    if(status!=="granted")return;

    const {data}=await Contacts.getContactsAsync({fields:[Contacts.Fields.PhoneNumbers]});
    const store:any={};

    data.forEach(c=>{
      if(!c.phoneNumbers)return;
      if(!store[c.name]) store[c.name]={name:c.name,numbers:[]};
      c.phoneNumbers.forEach(p=>{
        const num=clean(p.number||"");
        if(num && !store[c.name].numbers.includes(num)) store[c.name].numbers.push(num);
      });
    });
    setContacts(Object.values(store));
  };

  // ---------- CONTACT SEARCH ----------
  const handleContactSearch=(t:string)=>{
    setForm(f=>({...f,contactPerson:t}));
    if(!t.trim()) return setShowSuggest(false);

    if(typeDelay.current) clearTimeout(typeDelay.current);
    typeDelay.current=setTimeout(()=>{
      loadContacts();
      const s=t.toLowerCase();
      const result=contacts.filter(c=>
        c.name.toLowerCase().includes(s) || c.numbers.some((n:string)=>n.includes(s))
      );
      setSuggestions(result.slice(0,25));
      setShowSuggest(true);
    },250);
  };

  const chooseContact=(c:any)=>{
    setShowSuggest(false);
    setForm(f=>({...f,contactPerson:c.name}));
    if(c.numbers.length===1) return setForm(f=>({...f,mobileNo:c.numbers[0]}));
    setNumberOptions(c.numbers);
  };

  const selectNumber=(n:string)=>{ setForm(f=>({...f,mobileNo:n})); setNumberOptions([]); };

  // ---------- SAVE ----------
  const saveVendor=async()=>{
    if(!form.vendorName||!form.mobileNo)
      return showGlobalToast("Vendor & Mobile required","Error");

    const body={vendorName:form.vendorName,contactPerson:form.contactPerson,
      mobileNo:clean(form.mobileNo),vendorGST:form.vendorGST,vendorAddress:form.vendorAddress,corporateId:"hipk2025"};

    try{
      if(edit) await httpClient.put(`product/vendor/${edit._id}`,body);
      else     await httpClient.post(`/product/vendor/add`,body);
      showGlobalToast("Vendor Updated","Success");
      closeModal(); loadVendors();
    }catch(e:any){
      showGlobalToast(e.response?.data+"Request Failed","Error");
    }
  };

  const deleteVendor=(id:string)=>{
    Alert.alert("Delete Vendor?","This will remove permanently",[
      {text:"Cancel"},
      {text:"Delete",style:"destructive",onPress:async()=>{
        await httpClient.delete(`/product/vendor/${id}`);
        loadVendors();
      }}
    ]);
  };

  const addVendor=()=>{ setEdit(null);
    setForm({vendorName:"",contactPerson:"",mobileNo:"",vendorGST:"",vendorAddress:""});
    setModal(true);
  };
  const openEdit=(v:any)=>{ setEdit(v); setForm(v); setModal(true); };
  const closeModal=()=>{ setModal(false); setEdit(null); };

  return(
<GestureHandlerRootView style={{flex:1}}>

  {/* ---------- HEADER ---------- */}
  <SafeAreaView style={styles.headerSafe} edges={["top"]}>
    <View style={styles.header}>
      <View style={{flex:1}}>
        <Text style={styles.headerTitle}>portakabin.in</Text>
        <Text style={styles.headersubTitle}>Unit of Hiresh iSearch</Text>
      </View>
      <Image source={{uri:"https://ui-avatars.com/api/?name=Porta+Kabin"}} style={styles.menuImage}/>
    </View>
  </SafeAreaView>

  {/* ---------- TOOLBAR ---------- */}
  <View style={styles.toolbar}>
    <TouchableOpacity onPress={()=>router.back()}>
      <Ionicons name="arrow-back" size={24} color="#0b6cff"/>
    </TouchableOpacity>

    <View style={{flexDirection:"row",alignItems:"center"}}>
      <Text style={styles.toolbarTitle}>Vendors</Text>
      <TouchableOpacity onPress={addVendor} style={{marginLeft:20}}>
        <Ionicons name="add-circle" size={32} color="#0d047fff"/>
      </TouchableOpacity>
    </View>
  </View>

  {/* ---------- LIST ---------- */}
  {loading?(
    <ActivityIndicator size="large" style={{marginTop:40}}/>
  ):(
    <FlatList
      data={vendors}
      contentContainerStyle={{padding:14,paddingBottom:120}}
      keyExtractor={i=>i._id}
      renderItem={({item,index})=>(
      <View style={{marginTop:index===0?8:0}}>
      <Swipeable renderRightActions={()=>(
        <View style={{flexDirection:"row"}}>
          <TouchableOpacity onPress={()=>openEdit(item)} style={{backgroundColor:"#0a62ff",width:60,justifyContent:"center",alignItems:"center"}}>
            <Ionicons name="create" size={22} color="#fff"/>
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>deleteVendor(item._id)} style={{backgroundColor:"red",width:60,justifyContent:"center",alignItems:"center"}}>
            <Ionicons name="trash" size={22} color="#fff"/>
          </TouchableOpacity>
        </View>
      )}>
        
       <View style={{backgroundColor:"#fff",padding:14,borderRadius:14,marginBottom:12,flexDirection:"row",alignItems:"center",elevation:2}}>

  {/* Left Icon */}
  <View style={{backgroundColor:"#eaf2ff",width:46,height:46,borderRadius:30,alignItems:"center",justifyContent:"center",marginRight:14}}>
    <Ionicons name="business" size={22} color="#4f20a7ff"/>
  </View>

  {/* Vendor Info Block */}
  <View style={{flex:1}}>

    {/* Row: Vendor Name + Cost Icon */}
    <View style={{flexDirection:"column",justifyContent:"space-between",alignItems:"flex-end" }}>
      <TouchableOpacity
        onPress={() => router.push({ pathname: "./purchaseRate", params:{  id: item._id } })}
          style={{
            backgroundColor:"#eaf2ff",
            width:36,height:36,
            borderRadius:18,
            alignItems:"center",
            justifyContent:"center"
          }}
        >
        <Ionicons name="pricetag-outline" size={18} color="#4f20a7ff"/>
      </TouchableOpacity>
    </View>
    <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}>
      
      <Text style={{fontSize:16,fontWeight:"800",color:"#222"}}>
        {item.vendorName}
      </Text>    

    </View>

    {/* Contact Person */}
    <Text style={{fontSize:18,marginTop:3,color:"#640101ff" , fontWeight: "800"}}>
    {item.contactPerson || "—"}
    </Text>

    {/* Mobile Clickable */}
    <TouchableOpacity onPress={()=>Linking.openURL(`tel:${item.mobileNo}`)}>
      <Text style={{
        fontSize:16,
        fontWeight:"700",
        color:"#0b6cff",
        marginTop:3,
      }}>
        {item.mobileNo || ""}
      </Text>
    </TouchableOpacity>

  </View>
</View>

        
      </Swipeable>
      </View>
      )}
    />
  )}

  {/* ---------- MODAL ---------- */}
  <Modal visible={modal} animationType="slide" transparent>
    <KeyboardAvoidingView behavior={Platform.OS=="ios"?"padding":undefined}
      style={{flex:1,justifyContent:"center",padding:20,backgroundColor:"rgba(0,0,0,0.4)"}}>

      <ScrollView style={{backgroundColor:"#fff",padding:20,borderRadius:14,maxHeight:"85%"}}
        keyboardShouldPersistTaps="handled">

        <Text style={{fontSize:20,fontWeight:"800",marginBottom:12}}>
          {edit?"Edit Vendor":"Add Vendor"}
        </Text>

        <Text style={styles.label}>Contact Person</Text>
        <TextInput style={styles.input} placeholder="Contact Person"
          value={form.contactPerson} onFocus={loadContacts} onChangeText={handleContactSearch}/>

        {showSuggest && suggestions.map(s=>(
          <TouchableOpacity key={s.name} onPress={()=>chooseContact(s)} style={styles.suggestRow}>
            <Text style={{fontWeight:"700"}}>{s.name}</Text>
            <Text>{s.numbers.join(", ")}</Text>
          </TouchableOpacity>
        ))}

        {numberOptions.map(n=>(
          <TouchableOpacity key={n} onPress={()=>selectNumber(n)} style={styles.suggestRow}>
            <Text style={{fontSize:17}}>{n}</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Mobile Number</Text>
        <TextInput style={styles.input} placeholder="Mobile Number"
          value={form.mobileNo} keyboardType="number-pad"
          onChangeText={v=>setForm(f=>({...f,mobileNo:clean(v)}))}/>

        <Text style={styles.label}>Vendor / Shop Name</Text>
        <TextInput style={styles.input} placeholder="Vendor Name"
          value={form.vendorName}  onChangeText={v=>setForm(f=>({...f,vendorName:v}))}/>

        <Text style={styles.label}>GST Number</Text>
        <TextInput style={styles.input} placeholder="GST Number" maxLength={15}
          value={form.vendorGST} onChangeText={v=>setForm(f=>({...f,vendorGST:v.toUpperCase()}))}/>

        <Text style={styles.label}>Vendor Address</Text>
        <TextInput style={[styles.input,{height:80}]} multiline placeholder="Address"
          value={form.vendorAddress} onChangeText={v=>setForm(f=>({...f,vendorAddress:v}))}/>

        <View style={{flexDirection:"row",marginTop:10}}>
          <TouchableOpacity onPress={closeModal} style={[styles.btn,{backgroundColor:"#555"}]}>
            <Text style={styles.btnTxt}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={saveVendor} style={[styles.btn,{backgroundColor:"#0b6cff"}]}>
            <Text style={styles.btnTxt}>{edit?"Update":"Save"}</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>
</GestureHandlerRootView>
  );
}

