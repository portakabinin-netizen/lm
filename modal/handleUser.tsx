import { CorporateData, CorporateSchema, userModalProps } from "@/hooks/interface";
import { COLORS, getThemeStyles, mkShadow, styles } from "@/styles/stylesIndex";
import { appService } from "@/UtilServices/appHelper";
import { StatePicker } from "@/UtilServices/StatePicker";
import { DistrictPicker } from "@/UtilServices/DistrictPicker";
import { getStateCodeByName } from "@/UtilServices/gstConstants";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { SafeAreaView } from "react-native-safe-area-context";

interface UserModalExtendedProps extends userModalProps {
  onSelect?: (mode: "camera" | "gallery") => void;
  previewUri?: string | null;
  onUpload?: () => void;
  onClear?: () => void;
  uploading?: boolean;
}

const UserModal: React.FC<UserModalExtendedProps> = ({
  visible, onClose, type, onSave, onSelect, previewUri, onUpload, onClear, uploading
}) => {
  const isDark = useColorScheme() === "dark";
  const dynamic = getThemeStyles(isDark);
  const [corp, setCorp] = useState<Partial<CorporateData>>({});
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statePickerVisible, setStatePickerVisible] = useState(false);
  const [districtPickerVisible, setDistrictPickerVisible] = useState(false);

  React.useEffect(() => {
    if (visible && type === "search") {
      handleSearch("");
    }
  }, [visible, type]);

  const handleInputChange = (key: keyof CorporateData, value: string) => {
    let cleaned = value;

    if (key === "corporatePAN") {
      // Remove spaces and force uppercase
      cleaned = value.replace(/\s/g, "").toUpperCase();
    } else if (key === "corporateEmail") {
      // Remove spaces and force lowercase
      cleaned = value.replace(/\s/g, "").toLowerCase();
    }

    setCorp((prev) => ({ ...prev, [key]: cleaned }));
  };

  const handleSave = () => {
    const result = CorporateSchema.safeParse(corp);
    if (!result.success) {
      const firstError = result.error.issues[0];
      const fieldName = String(firstError.path[0] || "Field");
      const errorMessage = firstError.message;
      return appService.showToast(`${fieldName}: ${errorMessage}`, "Error");
    }
    onSave?.(result.data);
  };

  const handleSearch = async (text: string) => {
    setSearch(text);
    if (text.length > 0 && text.length < 3) return;
    setLoading(true);
    try {
      const res = await appService.httpClient.post("auth/search", { query: text });
      setResults(res.data?.data || []);
    } catch (err) {
      appService.showToast("Search failed", "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", paddingTop: Platform.OS === "ios" ? 60 : 30, paddingHorizontal: 12 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ backgroundColor: isDark ? "#1e293b" : "#fff", borderRadius: 24, maxHeight: type === "search" ? "75%" : "90%", overflow: "hidden" }}
        >
          {/* Drag indicator */}
          <View style={{ width: 40, height: 5, backgroundColor: "#ccc", borderRadius: 10, alignSelf: "center", marginVertical: 10 }} />

          <View style={{ padding: 24 } as any}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 20, alignItems: 'center' } as any}>
              <Text style={[styles.modalTitle, dynamic.cardTitle, { fontSize: 20, marginBottom: 0 }] as any}>
                {type === "camera" ? "Update Photo" : type === "corporate" ? "Register Company" : "Search Company"}
              </Text>
              <TouchableOpacity onPress={onClose}><Ionicons name="close-circle" size={30} color={COLORS.danger} /></TouchableOpacity>
            </View>

            <View style={{ flex: 0, minHeight: 200 } as any}>
              {type === "camera" ? (
                previewUri ? (
                  <View style={{ paddingBottom: 10, alignItems: 'center', gap: 30 }}>
                    <Image
                      source={{ uri: previewUri } as any}
                      style={{ width: 240, height: 240, borderRadius: 120, borderWidth: 4, borderColor: COLORS.primary } as any}
                    />
                    <View style={{ flexDirection: 'row', gap: 40, alignItems: 'center' } as any}>
                      <TouchableOpacity
                        style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.success, justifyContent: 'center', alignItems: 'center', ...mkShadow(10) } as any}
                        onPress={onUpload}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Ionicons name="checkmark" size={36} color="#fff" />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.danger, justifyContent: 'center', alignItems: 'center', ...mkShadow(10) } as any}
                        onPress={onClear}
                        disabled={uploading}
                      >
                        <Ionicons name="close" size={36} color="#fff" />
                      </TouchableOpacity>
                    </View>
                    <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '600', marginTop: -10 }}>Confirm Upload?</Text>
                  </View>
                ) : (
                  <View style={{ paddingBottom: 10, gap: 15 }}>
                    <TouchableOpacity
                      style={[styles.primaryButton, { flexDirection: 'row', gap: 12, backgroundColor: COLORS.primary }] as any}
                      onPress={() => onSelect?.("camera")}
                    >
                      <Ionicons name="camera" size={24} color="#fff" />
                      <Text style={[styles.primaryButtonText, { fontSize: 16 }] as any}>Capture with Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryButton, { flexDirection: 'row', gap: 12, backgroundColor: COLORS.info }] as any}
                      onPress={() => onSelect?.("gallery")}
                    >
                      <Ionicons name="image" size={24} color="#fff" />
                      <Text style={[styles.primaryButtonText, { fontSize: 16 }] as any}>Upload from Devices</Text>
                    </TouchableOpacity>
                  </View>
                )
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1, maxHeight: 600 } as any}>
                  {type === "corporate" ? (
                    <View style={{ paddingBottom: 40 } as any}>
                      {[
                        { k: "corporateName", p: "Company Name *", i: "business" },
                        { k: "corporateEmail", p: "Email *", i: "mail", kb: "email-address" },
                        { k: "corporatePAN", p: "PAN (Uppercase) *", i: "card", max: 10 },
                        { k: "corporateAddress", p: "Address *", i: "home", m: true },
                        { k: "corporateCity", p: "City *", i: "location" },
                        { k: "corporateDistrict", p: "District *", i: "navigate" },
                        { k: "corporateState", p: "State *", i: "map" },
                        { k: "corporatePin", p: "PIN Code *", i: "pin", kb: "number-pad", max: 6 },
                        { k: "corporateGST", p: "GST (Optional)", i: "receipt", max: 15 },
                      ].map((f) => (
                        f.k === "corporateState" ? (
                          <TouchableOpacity
                            key={f.k}
                            style={[styles.inputWrapperAuth, dynamic.inputWrapper, { marginBottom: 15, justifyContent: 'center' }] as any}
                            onPress={() => setStatePickerVisible(true)}
                          >
                            <Text style={{
                              color: corp.corporateState ? dynamic.text.color as string : dynamic.placeholder,
                              paddingLeft: 15,
                              fontSize: 15
                            } as any}>
                              {corp.corporateState || "Select State *"}
                            </Text>
                          </TouchableOpacity>
                        ) : f.k === "corporateDistrict" ? (
                          <TouchableOpacity
                            key={f.k}
                            style={[styles.inputWrapperAuth, dynamic.inputWrapper, { marginBottom: 15, justifyContent: 'center' }] as any}
                            onPress={() => setDistrictPickerVisible(true)}
                          >
                            <Text style={{
                              color: corp.corporateDistrict ? dynamic.text.color as string : dynamic.placeholder,
                              paddingLeft: 15,
                              fontSize: 15
                            } as any}>
                              {corp.corporateDistrict || "Select District *"}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <TextInput
                            key={f.k}
                            placeholder={f.p}
                            placeholderTextColor={dynamic.placeholder}
                            keyboardType={f.kb as any || "default"}
                            maxLength={f.max}
                            multiline={f.m}

                            /* Critical for preventing character jumping/repetition */
                            autoCapitalize={f.k === "corporatePAN" ? "characters" : f.k === "corporateEmail" ? "none" : "sentences"}
                            autoCorrect={false}
                            spellCheck={false}

                            /* Fixes text alignment on Android for the Address field */
                            textAlignVertical={f.m ? "top" : "center"}

                            /* Native Autofill support */
                            textContentType={f.k === "corporateEmail" ? "emailAddress" : "none"}

                            /* Controlled value from state */
                            value={(corp as any)[f.k] || ""}

                            /* Styles: Combines your external styles + dynamic theme + layout overrides */
                            style={[
                              styles.textInput,
                              dynamic.textInput,
                              {
                                flex: 1,
                                paddingTop: f.m ? 12 : 0,
                                minHeight: f.m ? 80 : 55 // Ensures the box matches the wrapper height
                              }
                            ] as any}

                            /* The logic handler */
                            onChangeText={(v) => handleInputChange(f.k as keyof CorporateData, v)}
                          />
                        )
                      ))}
                      <TouchableOpacity style={styles.primaryButton as any} onPress={handleSave}>
                        <Text style={styles.primaryButtonText as any}>Verify Details</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ minHeight: 300, paddingBottom: 40 } as any}>
                      <View style={[styles.inputWrapperAuth, dynamic.inputWrapper, { marginBottom: 15 }] as any}>
                        <Ionicons name="search" size={18} color={dynamic.placeholder} style={{ marginLeft: 15 }} />
                        <TextInput
                          placeholder="Search company name..."
                          placeholderTextColor={dynamic.placeholder}
                          style={[styles.flex1, { marginLeft: 12, fontSize: 16, color: dynamic.textInput.color }] as any}
                          onChangeText={handleSearch}
                        />
                      </View>
                      {loading && <ActivityIndicator color="#2563eb" style={{ margin: 20 } as any} />}
                      {results.map((item, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={{ padding: 18, borderBottomWidth: 1, borderColor: isDark ? "#334455" : "#e2e8f0", borderRadius: 10, marginBottom: 5, backgroundColor: isDark ? "#ffffff05" : "#f8fafc" } as any}
                          onPress={() => onSave?.(item)}
                        >
                          <Text style={[dynamic.text, { fontWeight: 'bold' }] as any}>{item.corporateName}</Text>
                          <Text style={[dynamic.text, { fontSize: 13, color: COLORS.primary, marginBottom: 2 }] as any}>Admin: {item.adminName || "N/A"}</Text>
                          <Text style={[dynamic.text, { fontSize: 12, opacity: 0.6 }] as any}>{item.corporateCity}, {item.corporateState}</Text>
                        </TouchableOpacity>
                      ))}
                      {!loading && search.length >= 3 && results.length === 0 && (
                        <Text style={{ textAlign: 'center', color: COLORS.textMuted, marginVertical: 20 }}>No companies found matching "{search}"</Text>
                      )}
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
      <StatePicker
        visible={statePickerVisible}
        onClose={() => setStatePickerVisible(false)}
        onSelect={(name) => {
            handleInputChange("corporateState", name);
            handleInputChange("corporateCity", "");
            handleInputChange("corporateDistrict", "");
        }}
      />
      <DistrictPicker 
        visible={districtPickerVisible} 
        onClose={() => setDistrictPickerVisible(false)} 
        onSelect={v => {
            handleInputChange("corporateDistrict", v);
        }}
        stateCode={getStateCodeByName(corp.corporateState)}
      />
    </Modal>
  );
};

export default UserModal;