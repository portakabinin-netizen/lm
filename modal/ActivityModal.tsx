import { appService } from "@/UtilServices/appHelper";
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

// ================= FLOATING INPUT (Reused from LeadModal) =================
interface FloatingInputProps {
  label: string;
  value: string;
  onChange: (text: string) => void;
  isDark: boolean;
  multiline?: boolean;
}

const FloatingInput: React.FC<FloatingInputProps> = ({
  label,
  value,
  onChange,
  isDark,
  multiline = false,
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
          color: active ? "#3b82f6" : isDark ? "#94a3b8" : "#64748b",
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
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
        style={{
          borderWidth: 1.5,
          borderColor: focused ? "#3b82f6" : isDark ? "#334155" : "#cbd5e1",
          borderRadius: 14,
          minHeight: multiline ? 100 : 54,
          paddingHorizontal: 14,
          paddingTop: multiline ? 12 : 0,
          color: isDark ? "#fff" : "#000",
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
};

// ================= MAIN ACTIVITY MODAL =================
interface ActivityModalProps {
  visible: boolean;
  onClose: () => void;
  phoneNumber?: string;
  name?: string;
  itemId?: string;
}

const ActivityModal: React.FC<ActivityModalProps> = ({ visible, onClose, phoneNumber, name, itemId }) => {
  const isDark = useColorScheme() === "dark";
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [targetPhone, setTargetPhone] = useState("");
  const [targetName, setTargetName] = useState("");
  const [targetItemId, setTargetItemId] = useState("");

  // 1. LISTEN FOR NATIVE OVERLAY (When "Activity" is clicked on the Overlay)
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "onOverlayAction",
      (event: { action: string; phoneNumber?: string; mobile?: string; name?: string; itemId?: string }) => {
        
        if (event.action === "OPEN_ACTIVITY_MODAL") {
          const phone = event.phoneNumber || event.mobile || "";
          setTargetPhone(phone);
          setTargetName(event.name || "");
          setTargetItemId(event.itemId || "");
        }
      }
    );
    return () => subscription.remove();
  }, []);

  // 2. SYNC WITH PROPS (When opened manually)
  useEffect(() => {
    if (visible) {
      if (phoneNumber) setTargetPhone(phoneNumber);
      if (name) setTargetName(name);
      if (itemId) setTargetItemId(itemId);
    }
  }, [visible, phoneNumber, name, itemId]);

  const handleClose = useCallback(() => {
    setNote("");
    onClose();
  }, [onClose]);

  const handleSaveActivity = async () => {
    if (!note.trim()) {
      return appService.showToast("Please enter a note", "Error");
    }

    try {
      setLoading(true);
      const session = await appService.getSession();
      if (!session?.token) return;
      const token = session.token;
      
      await appService.leadFollowUp({ itemId: targetItemId, action: note, token });
      
      appService.showToast("Activity logged successfully", "Success");
      handleClose();
    } catch (error) {
      appService.showToast("Failed to save activity", "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", paddingHorizontal: 16 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ 
            backgroundColor: isDark ? "#1e293b" : "#fff", 
            borderRadius: 24, 
            overflow: "hidden",
            elevation: 10
          }}
        >
          {/* Header */}
          <View style={{ padding: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <View>
                <Text style={{ fontSize: 20, fontWeight: "bold", color: isDark ? "#fff" : "#000" }}>
                  Call Follow-up
                </Text>
                <Text style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                  {targetName ? `${targetName} (${targetPhone})` : targetPhone}
                </Text>
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity onPress={handleSaveActivity} disabled={loading}>
                  <Ionicons name={loading ? "hourglass" : "save"} size={30} color="#3b82f6" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleClose}>
                  <Ionicons name="close-circle" size={30} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <FloatingInput
                label="Conversation Details"
                value={note}
                onChange={setNote}
                isDark={isDark}
                multiline={true}
              />
              
              <Text style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", fontStyle: "italic" }}>
                This note will be added to the lead history.
              </Text>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

export default ActivityModal;