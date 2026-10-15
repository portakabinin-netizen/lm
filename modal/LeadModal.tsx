import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  DeviceEventEmitter,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";

import { leadModalProps, ManualLeadData, ManualLeadSchema } from "@/hooks/interface";
import { appService } from "@/UtilServices/appHelper"; // ← merged from getDataProcess
import { COLORS } from "@/styles/stylesIndex";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from "react-native-safe-area-context";

// --- Form Initial State ---
const INITIAL_STATE: ManualLeadData = {
  product_name: "",
  sender_name: "",
  sender_city: "",
  sender_state: "",
  sender_mobile: "",
  sender_email: "",
  source: "Other",
  status: "Engaged",
  displayName: "",
  products: [],
};

// ================= FLOATING INPUT =================
interface FloatingInputProps {
  label: string;
  value: string;
  onChange: (text: string) => void;
  keyboardType?: "default" | "number-pad" | "email-address";
  isDark: boolean;
  multiline?: boolean;
  maxLength?: number;
}

const FloatingInput: React.FC<FloatingInputProps> = ({
  label, value, onChange, keyboardType = "default", isDark, multiline = false, maxLength
}) => {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;

  return (
    <View style={{ marginBottom: 18 }}>
      <Text
        style={{
          position: "absolute",
          left: 14,
          top: active ? -8 : 16,
          fontSize: active ? 11 : 14,
          color: active ? "#22c55e" : isDark ? "#94a3b8" : "#64748b",
          backgroundColor: isDark ? "#1e293b" : "#fff",
          paddingHorizontal: 4,
          zIndex: 10,
        }}
      >
        {label}
      </Text>

      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        multiline={multiline}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
        style={{
          borderWidth: 1.5,
          borderColor: focused ? "#22c55e" : isDark ? "#334155" : "#cbd5e1",
          borderRadius: 14,
          minHeight: 54,
          paddingHorizontal: 14,
          paddingTop: multiline ? 12 : 0,
          color: isDark ? "#fff" : "#000",
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
};

// ================= MAIN MODAL =================
const LeadModal: React.FC<leadModalProps> = ({ visible, onClose, mobile }) => {
  const isDark = useColorScheme() === "dark";
  const [loading, setLoading] = useState(false);
  const [leadData, setLeadData] = useState<ManualLeadData>(INITIAL_STATE);
  const [newProduct, setNewProduct] = useState({
    productName: "",
    qty: "",
    rate: "",
    gstPercent: "",
    gstType: "Intrastate" as "Interstate" | "Intrastate",
  });

  // 1. Listen for native overlay events (e.g. incoming call screen)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      "onOverlayAction",
      (event: { action: string; phoneNumber?: string; mobile?: string; name?: string }) => {
        if (event.action === "OPEN_LEAD_MODAL" || event.action === "OPEN_CREATE_LEAD_MODAL") {
          const rawPhone = event.phoneNumber || event.mobile || "";
          const name = (event.name === "Contact" || event.name === " ") ? "" : (event.name || "");

          // 🚀 NORMALIZE: Ensure numbers are consistently cleaned
          const formatted = appService.formatMobile(rawPhone);
          const cleanPhone = formatted ? formatted.plain : rawPhone.replace(/\D/g, "").slice(-10);

          setLeadData(prev => ({ ...prev, sender_mobile: cleanPhone, sender_name: name }));
        }
      }
    );
    return () => sub.remove();
  }, []);

  // 2. Sync mobile prop when modal opens manually from a list
  useEffect(() => {
    if (visible && mobile) {
      // 🚀 NORMALIZE: Sync and clean manual property if passed
      const formatted = appService.formatMobile(mobile);
      const cleanPhone = formatted ? formatted.plain : mobile.replace(/\D/g, "").slice(-10);
      setLeadData(prev => ({ ...prev, sender_mobile: cleanPhone || prev.sender_mobile }));
    }
  }, [visible, mobile]);

  // Reset state on close
  const handleClose = useCallback(() => {
    setLeadData(INITIAL_STATE);
    onClose?.();
  }, [onClose]);

  // Save lead
  const handleSaveLead = async () => {
    if (loading) return;

    const result = ManualLeadSchema.safeParse(leadData);
    if (!result.success) return appService.showToast(result.error.issues[0].message, "Error");

    try {
      setLoading(true);
      await appService.saveManualLead(result.data);  // ← now via appService
      handleClose();
    } catch {
      // error toast already handled inside saveManualLead
    } finally {
      setLoading(false);
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: "#fff", paddingTop: insets.top }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
            {/* Header */}
            <View style={{ height: 60, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 }}>
              <TouchableOpacity onPress={handleClose} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff' }}>Add New Lead</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '800' }}>Create a new enquiry</Text>
              </View>
              <TouchableOpacity onPress={handleSaveLead} disabled={loading} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name={loading ? "hourglass" : "checkmark"} size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: 8, paddingBottom: 20, paddingHorizontal: 20 }}
            >
              {[
                { k: "sender_mobile", p: "Mobile *", kb: "number-pad", max: 10 },
                { k: "sender_name", p: "Name *", kb: "default" },
                { k: "displayName", p: "Display Name of Site", kb: "default" },
                { k: "sender_city", p: "City", kb: "default" },
                { k: "sender_state", p: "State", kb: "default" },
                { k: "sender_email", p: "Email", kb: "email-address" },
              ].map((f) => (
                <FloatingInput
                  key={f.k}
                  label={f.p}
                  value={(leadData as any)[f.k]}
                  keyboardType={f.kb as any}
                  isDark={isDark}
                  multiline={(f as any).multiline}
                  maxLength={f.max}
                  onChange={(v) => {
                    const clean = f.k === "sender_mobile" ? v.replace(/\D/g, "").slice(-10) : v;
                    setLeadData(prev => ({ ...prev, [f.k]: clean }));
                  }}
                />
              ))}

              {/* Products Section */}
              <View style={{ marginTop: 10, padding: 10, backgroundColor: isDark ? "#334155" : "#f1f5f9", borderRadius: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: isDark ? "#fff" : "#000", marginBottom: 10 }}>Products</Text>
                
                {/* Existing Products List */}
                {leadData.products?.map((p, index) => (
                  <View key={index} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <Text style={{ fontSize: 12, color: isDark ? "#e2e8f0" : "#475569" }}>{p.productName} ({p.qty} x {p.rate})</Text>
                    <TouchableOpacity onPress={() => {
                      setLeadData(prev => ({ ...prev, products: prev.products?.filter((_, i) => i !== index) }));
                    }}>
                      <Ionicons name="trash" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Add New Product Form */}
                <TextInput
                  placeholder="Product Name"
                  placeholderTextColor="#94a3b8"
                  value={newProduct.productName}
                  onChangeText={(v) => setNewProduct(prev => ({ ...prev, productName: v }))}
                  style={{ borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 8, marginBottom: 8, color: isDark ? "#fff" : "#000" }}
                />
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                  <TextInput
                    placeholder="QTY"
                    placeholderTextColor="#94a3b8"
                    keyboardType="number-pad"
                    value={newProduct.qty}
                    onChangeText={(v) => setNewProduct(prev => ({ ...prev, qty: v }))}
                    style={{ flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 8, color: isDark ? "#fff" : "#000" }}
                  />
                  <TextInput
                    placeholder="Rate"
                    placeholderTextColor="#94a3b8"
                    keyboardType="number-pad"
                    value={newProduct.rate}
                    onChangeText={(v) => setNewProduct(prev => ({ ...prev, rate: v }))}
                    style={{ flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 8, color: isDark ? "#fff" : "#000" }}
                  />
                  <TextInput
                    placeholder="GST%"
                    placeholderTextColor="#94a3b8"
                    keyboardType="number-pad"
                    value={newProduct.gstPercent}
                    onChangeText={(v) => setNewProduct(prev => ({ ...prev, gstPercent: v }))}
                    style={{ flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 8, color: isDark ? "#fff" : "#000" }}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                  <TouchableOpacity
                    style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: newProduct.gstType === "Interstate" ? "#22c55e" : "#e2e8f0", alignItems: "center" }}
                    onPress={() => setNewProduct(prev => ({ ...prev, gstType: "Interstate" }))}
                  >
                    <Text style={{ fontSize: 11, color: newProduct.gstType === "Interstate" ? "#fff" : "#475569" }}>Interstate (IGST)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: newProduct.gstType === "Intrastate" ? "#22c55e" : "#e2e8f0", alignItems: "center" }}
                    onPress={() => setNewProduct(prev => ({ ...prev, gstType: "Intrastate" }))}
                  >
                    <Text style={{ fontSize: 11, color: newProduct.gstType === "Intrastate" ? "#fff" : "#475569" }}>Intrastate (SGST+CGST)</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: "#22c55e", padding: 10, borderRadius: 8, alignItems: "center" }}
                  onPress={() => {
                    if (!newProduct.productName || !newProduct.qty || !newProduct.rate) {
                      appService.showToast("Please fill product name, QTY and Rate", "Error");
                      return;
                    }
                    setLeadData(prev => ({
                      ...prev,
                      products: [...(prev.products || []), {
                        productName: newProduct.productName,
                        qty: parseFloat(newProduct.qty),
                        rate: parseFloat(newProduct.rate),
                        gstPercent: parseFloat(newProduct.gstPercent || "0"),
                        gstType: newProduct.gstType,
                      }]
                    }));
                    setNewProduct({ productName: "", qty: "", rate: "", gstPercent: "", gstType: "Intrastate" });
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>Add Product</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

export default LeadModal;