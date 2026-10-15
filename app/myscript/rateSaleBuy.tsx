// VendorRatesScreen.tsx
import { httpClient } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { styles } from "../myscript/dashboards/styles/styles";
import GridForm, { GridFormRef } from "../myscript/priceGridForm";

interface Vendor {
  _id: string;
  vendorName: string;
  onSaved?: () => void;
  onClose?: () => void;
}

export default function VendorRatesScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);

  const gridFormRef = useRef<GridFormRef | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const res = await httpClient.get(`/product/vendor`);
      setVendors(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.warn(e);
      Toast.show({ type: "error", text1: "Error loading vendors" });
      //Alert.alert("Error", "Unable to load vendors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openVendorModal = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setShowModal(true);
  };

  // Called when toolbar ✓ is pressed in the modal
  const onToolbarSave = () => {
    gridFormRef.current?.savePrices();
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      {/* HEADER */}
      <SafeAreaView style={styles.headerSafe} edges={["top"]}>
        <View style={styles.header}>
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={styles.headerTitle}>portakabin.in</Text>
            <Text style={styles.headersubTitle}>Unit of Hiresh iSearch</Text>
          </View>
          <View style={{ marginRight: 10 }}>
            <Image
              source={{ uri: "https://ui-avatars.com/api/?name=Porta+Kabin" }}
              style={styles.menuImage}
            />
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
          <TouchableOpacity onPress={loadAll} style={{ marginLeft: 20 }}>
            <Ionicons name="refresh" size={30} color="#23b710ff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* VENDOR LIST */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {loading ? (
          <ActivityIndicator size="large" color="#0b6cff" />
        ) : (
          vendors.map((vendor) => (
            <View key={vendor._id} style={{ marginBottom: 18 }}>
              <TouchableOpacity
                style={styles.card}
                onPress={() => openVendorModal(vendor)}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="business" size={25} color="#86071cff" />
                  <View style={{ marginLeft: 5 }}>
                    <Text style={styles.vendorName}>{vendor.vendorName}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      {/* MODAL */}
      <Modal visible={showModal} animationType="fade">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#3a3131ff" }}>
         <GridForm
          ref={gridFormRef}
          vendorId={selectedVendor?._id ?? ""}
          vendorName={selectedVendor?.vendorName ?? ""}
          onSaved={() => {
            loadAll();          
            setShowModal(false); 
          }}
          onClose={() => {
            setShowModal(false); 
          }}
        />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
