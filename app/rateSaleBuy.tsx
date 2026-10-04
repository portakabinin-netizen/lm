import { AppHeader } from "@/components/AppHeader";
import { styles as G, COLORS } from "@/styles/stylesIndex";
import { appService } from "@/UtilServices/appHelper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import GridForm, { GridFormRef } from "./priceGridForm";

interface Vendor {
  _id: string;
  vendorName: string;
  name?: string;
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
      const res = await appService.httpClient.get(`service/parties/suppliers`);
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
    <SafeAreaView style={G.safeContainer as ViewStyle} edges={["top"]}>
      <AppHeader 
        title="Vendors" 
        onBackPress={() => router.back()} 
        rightAction={() => (
          <TouchableOpacity onPress={loadAll} style={{ padding: 4, marginRight: 8 }}>
            <Ionicons name="refresh" size={28} color="#fff" />
          </TouchableOpacity>
        )}
      />

      {/* VENDOR LIST */}
      <FlatList
        data={vendors}
        keyExtractor={(v) => v._id}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        ListEmptyComponent={
          !loading ? (
            <View style={{ marginTop: 80, alignItems: "center" }}>
              <Ionicons name="storefront-outline" size={64} color="#CBD5E1" />
              <Text style={{ marginTop: 16, fontSize: 16, fontWeight: "600", color: "#64748B" }}>
                No product add for pricing
              </Text>
              <Text style={{ marginTop: 4, color: "#94A3B8", textAlign: "center", paddingHorizontal: 40 }}>
                You need vendors before you can manage purchase rates. Please add a vendor from the Vendor management menu.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item: vendor }) => (
          <View style={{ marginBottom: 18 }}>
            <TouchableOpacity
              style={G.card as ViewStyle}
              onPress={() => openVendorModal(vendor)}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{
                  backgroundColor: COLORS.primary + "10",
                  width: 44, height: 44, borderRadius: 22,
                  justifyContent: 'center', alignItems: 'center',
                  marginRight: 12
                }}>
                  <Ionicons name="business" size={24} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={G.vendorName as TextStyle}>{vendor.name || vendor.vendorName}</Text>
                  <Text style={[G.fs12, G.txtSec] as any}>Tap to manage rates</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
              </View>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* MODAL */}
      <Modal visible={showModal} animationType="fade">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#3a3131ff" }}>
          <GridForm
            ref={gridFormRef}
            vendorId={selectedVendor?._id ?? ""}
            vendorName={selectedVendor?.name ?? selectedVendor?.vendorName ?? ""}
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
