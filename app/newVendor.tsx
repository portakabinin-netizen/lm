// =============== newVendor.tsx ===============

import { AppHeader } from "@/components/AppHeader";
import { useUserContext } from "@/context/AuthContext";
import { COLORS } from "@/styles/stylesIndex";
import { appService } from "@/UtilServices/appHelper";
import { appModules } from "@/UtilServices/appModals";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { SafeAreaView } from "react-native-safe-area-context";

export default function VendorScreen() {

  const router = useRouter();
  const { user } = useUserContext();
  const corporateId = user?.corporateId ?? "";
  const corpAdminId = user?.corpAdminId || user?.userId || "";
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Load vendors ────────────────────────────────────────────────────────────
  const loadVendors = useCallback(async () => {
    try {
      setLoading(true);
      const r = await appService.httpClient.get(`service/parties/suppliers`, {
        params: {
          corporateId: corporateId || undefined,
          corpAdminId: corpAdminId || undefined,
        },
      });
      const list = Array.isArray(r.data)
        ? r.data
        : (r.data?.vendors || r.data?.data || []);
      setVendors(Array.isArray(list) ? list : []);
    } catch {
      appService.showToast("Failed Loading vendors", "Error");
    } finally {
      setLoading(false);
    }
  }, [corporateId, corpAdminId]);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  // ── Add new vendor ──────────────────────────────────────────────────────────
  const addVendor = useCallback(() => {
    appModules.openVendor({
      onDone: () => {
        loadVendors();
      },
    });
  }, [loadVendors]);

  // ── Edit vendor ─────────────────────────────────────────────────────────────
  const openEdit = useCallback((v: any) => {
    appModules.openVendor({
      editVendor: {
        _id: v._id,
        vendorName: v.name || v.vendorName || "",
        contactPerson: v.contact_person || v.contactPerson || "",
        mobileNo: v.mobile || v.mobileNo || "",
        vendorGST: v.gst || v.vendorGST || "",
        vendorPAN: v.pan || v.vendorPAN || "",
        vendorAddress: v.billingAddress?.line1 || v.vendorAddress || "",
        vendorCity: v.billingAddress?.city || v.vendorCity || "",
        vendorDistrict: v.billingAddress?.district || v.vendorDistrict || "",
        vendorState: v.billingAddress?.state || v.vendorState || "",
      },
      onDone: () => {
        loadVendors();
      },
    });
  }, [loadVendors]);

  // ── Delete ──────────────────────────────────────────────────────────────────
  const deleteVendor = useCallback((id: string) => {
    Alert.alert("Delete Vendor?", "This will remove permanently", [
      { text: "Cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            await appService.httpClient.delete(`service/parties/suppliers/${id}`, {
              params: {
                corporateId: corporateId || undefined,
                corpAdminId: corpAdminId || undefined,
              }
            });
            loadVendors();
          } catch (err: any) {
            appService.showToast(err.response?.data?.error || "Delete Failed", "Error");
            setLoading(false);
          }
        },
      },
    ]);
  }, [corporateId, corpAdminId, loadVendors]);

  // ── Header Action ───────────────────────────────────────────────────────────
  const headerRight = useCallback(() => (
    <TouchableOpacity onPress={addVendor} style={{ padding: 4, marginRight: 8 }}>
      <Ionicons name="add-circle" size={32} color="#fff" />
    </TouchableOpacity>
  ), [addVendor]);

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bgLight }} edges={["top"]}>
      <AppHeader
        title="Manage Vendors"
        onBackPress={() => router.back()}
        rightAction={headerRight}
      />

      {/* LIST */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={vendors}
          contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
          keyExtractor={i => i._id}
          ListEmptyComponent={
            <View style={{ marginTop: 60, alignItems: "center" }}>
              <Ionicons name="storefront-outline" size={64} color="#CBD5E1" />
              <Text style={{ marginTop: 16, fontSize: 16, fontWeight: "600", color: "#64748B" }}>
                No vendors found
              </Text>
              <Text style={{ marginTop: 4, color: "#94A3B8", textAlign: "center", paddingHorizontal: 40 }}>
                This corporate has no vendors yet. Click the + button to add one.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Swipeable
              renderRightActions={() => (
                <View style={{ flexDirection: "row" }}>
                  <TouchableOpacity
                    onPress={() => openEdit(item)}
                    style={{ backgroundColor: COLORS.primary, width: 70, justifyContent: "center", alignItems: "center" }}
                  >
                    <Ionicons name="create" size={24} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => deleteVendor(item._id)}
                    style={{ backgroundColor: "red", width: 70, justifyContent: "center", alignItems: "center" }}
                  >
                    <Ionicons name="trash" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
            >
              <View style={{
                backgroundColor: "#fff", padding: 16, borderRadius: 16,
                marginBottom: 12, flexDirection: "row", alignItems: "center", elevation: 3,
                shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4
              }}>

                <View style={{
                  backgroundColor: "#f0f7ff", width: 50, height: 50, borderRadius: 25,
                  alignItems: "center", justifyContent: "center", marginRight: 15,
                }}>
                  <Ionicons name="business" size={24} color={COLORS.primary} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: "#1a1a1a" }}>
                    {item.name || item.vendorName}
                  </Text>

                  <Text style={{ fontSize: 14, color: "#666", marginTop: 2 }}>
                    {item.contact_person || item.contactPerson || "No Contact"}
                  </Text>

                  <TouchableOpacity
                    onPress={() => Linking.openURL(`tel:${item.mobile || item.mobileNo}`)}
                    style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}
                  >
                    <Ionicons name="call" size={14} color={COLORS.primary} style={{ marginRight: 5 }} />
                    <Text style={{ fontSize: 14, fontWeight: "600", color: COLORS.primary }}>
                      {item.mobile || item.mobileNo || "N/A"}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/purchaseRate", params: { id: item._id, name: item.name || item.vendorName } })}
                  style={{
                    backgroundColor: "#f0f7ff", width: 40, height: 40,
                    borderRadius: 20, alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Ionicons name="pricetag" size={20} color={COLORS.primary} />
                </TouchableOpacity>
              </View>
            </Swipeable>
          )}
        />
      )}

    </SafeAreaView>
  );
}