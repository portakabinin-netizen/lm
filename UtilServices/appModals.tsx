// ═══════════════════════════════════════════════════════════════════════════════
// AppModal.tsx — imports ONLY from ./appModal.interface (single source of truth)
// ═══════════════════════════════════════════════════════════════════════════════

import { getThemeStyles, HEADER_HEIGHT, styles } from "@/styles/stylesIndex";
import { useUserContext } from "@/context/AuthContext";
import { appService } from "@/UtilServices/appHelper";
import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import React, { useEffect, useRef, useState } from "react";
import { StatePicker } from "@/UtilServices/StatePicker";
import { DistrictPicker } from "@/UtilServices/DistrictPicker";
import { getStateCodeByName } from "@/UtilServices/gstConstants";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  EmitterSubscription,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  // ── Base modal types ─────────────────────────────────────────────────────────
  ActivityModalState,
  // ── Inferred types ───────────────────────────────────────────────────────────
  AppModalProps,
  // ── Utility ──────────────────────────────────────────────────────────────────
  cleanNum,
  // ── Maps & configs ───────────────────────────────────────────────────────────
  CORP_FIELDS,
  CorporateData,
  // ── Schemas ──────────────────────────────────────────────────────────────────
  CorporateSchema,
  ExtendedModalChangeCallback,
  ExtendedModalType,
  FloatingInputProps,
  // ── Initial states ───────────────────────────────────────────────────────────
  INITIAL_ACTIVITY,
  INITIAL_LEAD,
  INITIAL_STATUS,
  INITIAL_USER,
  INITIAL_VENDOR,
  LEAD_FIELDS,
  LeadModalState,
  ManualLeadData,
  ManualLeadSchema,
  ModalChangeCallback,
  ModalType,
  OpenActivityOptions,
  OpenLeadOptions,
  OpenUserOptions,
  OpenVendorOptions,
  ShellProps,
  STATUS_COLOR,
  STATUS_TRANSITIONS,
  StatusModalState,
  UserModalState,
  UserModalType,
  VendorForm,
  VendorModalState,
} from "@/hooks/appModal.interface";

// ─── Re-export so existing consumers keep working without path changes ─────────
export { CorporateSchema, ManualLeadSchema, STATUS_COLOR };
export type {
  ActivityModalState,
  AppModalProps,
  CorporateData,
  ExtendedModalChangeCallback,
  ExtendedModalType,
  FloatingInputProps,
  LeadModalState,
  ManualLeadData,
  ModalChangeCallback,
  ModalType,
  OpenActivityOptions,
  OpenLeadOptions,
  OpenUserOptions,
  OpenVendorOptions,
  ShellProps,
  StatusModalState,
  UserModalState,
  UserModalType,
  VendorForm,
  VendorModalState
};

// Utility to create subtle shadows
const mkShadow = (opacity: number) => ({
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: opacity / 100,
  shadowRadius: 4,
  elevation: Math.ceil(opacity / 2),
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — AppModals CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class AppModals {

  private _lead:     LeadModalState     = { visible: false, loading: false, data: { ...INITIAL_LEAD } };
  private _activity: ActivityModalState = { ...INITIAL_ACTIVITY };
  private _user:     UserModalState     = { ...INITIAL_USER };
  private _status:   StatusModalState   = { ...INITIAL_STATUS };
  private _vendor:   VendorModalState   = { ...INITIAL_VENDOR };

  private _subscribers: ExtendedModalChangeCallback[] = [];
  private _overlay:     EmitterSubscription | null     = null;

  // ── 1. Profile / User Logic (from handleUser) ──────────────────────────────
  private _onUserSelect?: (mode: "camera" | "gallery") => void;
  private _onUserUpload?: () => void;
  private _onUserClear?:  () => void;

  constructor() { this._bindOverlay(); }

  // ── 1a. Native overlay ─────────────────────────────────────────────────────
  private _bindOverlay(): void {
    this._overlay = DeviceEventEmitter.addListener(
      "onOverlayAction",
      (e: { action: string; phoneNumber?: string; mobile?: string; name?: string }) => {
        const rawPhone = e.phoneNumber || e.mobile || "";
        const name     = (e.name === "Contact" || !e.name?.trim()) ? "" : e.name;
        
        // 🚀 NORMALIZE: Ensure floating panel numbers are cleaned before opening modals
        const formatted = appService.formatMobile(rawPhone);
        const cleanPhone = formatted ? formatted.plain : rawPhone.replace(/\D/g, "").slice(-10);

        if (e.action === "OPEN_LEAD_MODAL" || e.action === "OPEN_CREATE_LEAD_MODAL")
          this.openLead({ mobile: cleanPhone, name });
        if (e.action === "OPEN_ACTIVITY_MODAL")
          this.openActivity({ phoneNumber: cleanPhone, name });
      },
    );
  }

  public destroy(): void {
    this._overlay?.remove();
    this._overlay     = null;
    this._subscribers = [];
  }

  // ── 1b. Subscriber pattern ─────────────────────────────────────────────────
  public subscribe(cb: ExtendedModalChangeCallback): () => void {
    this._subscribers.push(cb);
    return () => { this._subscribers = this._subscribers.filter(s => s !== cb); };
  }

  private _emit(type: ExtendedModalType): void {
    const state =
      type === "lead"     ? this._lead     :
      type === "activity" ? this._activity :
      type === "status"   ? this._status   :
      type === "vendor"   ? this._vendor   :
                            this._user;
    this._subscribers.forEach(cb => cb(type, state as any));
  }

  // ── 1c. Getters ────────────────────────────────────────────────────────────
  get lead():     Readonly<LeadModalState>     { return this._lead;     }
  get activity(): Readonly<ActivityModalState> { return this._activity; }
  get user():     Readonly<UserModalState>     { return this._user;     }
  get status():   Readonly<StatusModalState>   { return this._status;   }
  get vendor():   Readonly<VendorModalState>   { return this._vendor;   }

  get onUserSelect() { return this._onUserSelect; }
  get onUserUpload() { return this._onUserUpload; }
  get onUserClear()  { return this._onUserClear;  }

  get anyOpen(): boolean {
    return (
      this._lead.visible || this._activity.visible ||
      this._user.visible || this._status.visible   ||
      this._vendor.visible
    );
  }

  // ── 1d. Open ───────────────────────────────────────────────────────────────
  public openLead({ mobile = "", name = "", onComplete }: OpenLeadOptions = {}): void {
    this._lead = {
      visible: true, loading: false,
      data: { ...INITIAL_LEAD, sender_mobile: mobile, sender_name: name },
      onComplete,
    };
    this._emit("lead");
  }

  public openActivity({
    phoneNumber = "", name = "", itemId = "", token = "", note = "", onComplete,
  }: OpenActivityOptions = {}): void {
    this._activity = { ...INITIAL_ACTIVITY, visible: true, phoneNumber, name, itemId, token, note, onComplete };
    this._emit("activity");
  }

  public openUser({ type = "corporate", previewUri = null, onSelect, onUpload, onClear, profileType = "user" }: OpenUserOptions & { profileType?: "user" | "corp" } = {}): void {
    this._user = { ...INITIAL_USER, visible: true, type, previewUri, profileType };
    this._onUserSelect = onSelect;
    this._onUserUpload = onUpload;
    this._onUserClear  = onClear;
    this._emit("user");
  }

  public openStatus(
    itemId: string, currentStatus: string, token: string, onDone: () => void,
  ): void {
    this._status = {
      visible: true, itemId, currentStatus, token, onDone,
      transitions: STATUS_TRANSITIONS[currentStatus] ?? [],
    };
    this._emit("status");
  }

  /** Open vendor modal for add or edit.
   *  Pass editVendor (with _id) to pre-fill for edit; omit for add-new. */
  public openVendor({ editVendor, onDone = () => {} }: OpenVendorOptions = {}): void {
    if (editVendor) {
      const { _id, ...form } = editVendor;
      this._vendor = { visible: true, loading: false, form, editId: _id, onDone };
    } else {
      this._vendor = { ...INITIAL_VENDOR, visible: true, onDone };
    }
    this._emit("vendor");
  }

  // ── 1e. Close ──────────────────────────────────────────────────────────────
  public close(type: ExtendedModalType): void {
    if      (type === "lead")     this._lead     = { visible: false, loading: false, data: { ...INITIAL_LEAD } };
    else if (type === "activity") this._activity = { ...INITIAL_ACTIVITY };
    else if (type === "status")   this._status   = { ...INITIAL_STATUS };
    else if (type === "vendor")   this._vendor   = { ...INITIAL_VENDOR };
    else {
      this._user = { ...INITIAL_USER };
      this._onUserSelect = undefined;
      this._onUserUpload = undefined;
      this._onUserClear  = undefined;
    }
    this._emit(type);
  }

  public closeAll(): void {
    if (this._lead.visible)     this.close("lead");
    if (this._activity.visible) this.close("activity");
    if (this._user.visible)     this.close("user");
    if (this._status.visible)   this.close("status");
    if (this._vendor.visible)   this.close("vendor");
  }

  // ── 1f. Lead mutations ─────────────────────────────────────────────────────
  public updateLeadField(key: keyof ManualLeadData, value: string): void {
    const clean = key === "sender_mobile"
      ? value.replace(/[^0-9]/g, "").slice(-10)
      : value;
    this._lead = { ...this._lead, data: { ...this._lead.data, [key]: clean } };
    this._emit("lead");
  }

  public async saveLead(): Promise<boolean> {
    if (this._lead.loading) return false;
    const r = ManualLeadSchema.safeParse(this._lead.data);
    if (!r.success) { appService.showToast(r.error.issues[0].message, "Error"); return false; }
    this._lead = { ...this._lead, loading: true };
    this._emit("lead");
    try {
      await appService.saveManualLead(r.data);
      this.close("lead");
      this._lead.onComplete?.();
      return true;
    } catch {
      return false;
    } finally {
      this._lead = { ...this._lead, loading: false };
      this._emit("lead");
    }
  }

  // ── 1g. Activity mutations ─────────────────────────────────────────────────
  public updateActivityNote(note: string): void {
    this._activity = { ...this._activity, note };
    this._emit("activity");
  }

  public updateActivityPhone(phoneNumber: string): void {
    this._activity = { ...this._activity, phoneNumber };
    this._emit("activity");
  }

  public updateActivityName(name: string): void {
    this._activity = { ...this._activity, name };
    this._emit("activity");
  }

  public async saveActivity(): Promise<boolean> {
    const { note, itemId, token, onComplete } = this._activity;
    this._activity = { ...this._activity, loading: true };
    this._emit("activity");
    try {
      return await appService.leadFollowUp({ itemId, action: note, token });
    } finally {
      this._activity = { ...this._activity, loading: false };
      this._emit("activity");
      onComplete?.();
      this.close("activity");
    }
  }

  get activityHeaderLabel(): string {
    const { name, phoneNumber } = this._activity;
    return name ? `${name} (${phoneNumber})` : phoneNumber;
  }

  // ── 1h. Status mutations ───────────────────────────────────────────────────
  public async updateStatus(newStatus: string): Promise<void> {
    const { itemId, token, onDone } = this._status;
    try {
      const res = await appService.httpClient.put(
        `service/leads/${itemId}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.data?.success || res.status === 200) {
        appService.showToast(`Status → ${newStatus}`, "Success");
        this.close("status");
        onDone();
      } else {
        appService.showToast("Failed to update status", "Error");
      }
    } catch (e: any) {
      appService.showToast(`Update Failed: ${e.message}`, "Error");
    }
  }

  // ── 1i. Vendor mutations ───────────────────────────────────────────────────
  public updateVendorField(key: keyof VendorForm, value: string): void {
    const v = key === "mobileNo"  ? cleanNum(value).slice(-10) :
              key === "vendorGST" ? value.toUpperCase() :
              key === "vendorPAN" ? value.toUpperCase() : value;
    this._vendor = { ...this._vendor, form: { ...this._vendor.form, [key]: v } };
    this._emit("vendor");
  }

  public async saveVendor(): Promise<boolean> {
    const { form, editId, onDone } = this._vendor;
    if (!form.vendorName || !form.mobileNo) {
      appService.showToast("Vendor & Mobile required", "Error");
      return false;
    }
    this._vendor = { ...this._vendor, loading: true };
    this._emit("vendor");
    const body = {
      name:           form.vendorName,
      contact_person: form.contactPerson,
      mobile:         cleanNum(form.mobileNo),
      gst:            form.vendorGST,
      pan:            form.vendorPAN,
      billingAddress: {
        line1:    form.vendorAddress,
        city:     form.vendorCity,
        district: form.vendorDistrict,
        state:    form.vendorState,
      },
    };
    try {
      if (editId) await appService.httpClient.put(`service/parties/suppliers/${editId}`, body);
      else        await appService.httpClient.post(`service/parties/suppliers`, body);
      appService.showToast(editId ? "Vendor Updated Successfully" : "Vendor Created Successfully", "Success");
      this.close("vendor");
      onDone();
      return true;
    } catch (e: any) {
      const msg = e.response?.data?.error || e.response?.data?.message || "Request Failed";
      appService.showToast(String(msg), "Error");
      return false;
    } finally {
      this._vendor = { ...this._vendor, loading: false };
      this._emit("vendor");
    }
  }

  // ── 1j. User / Corporate mutations ─────────────────────────────────────────
  public updateCorpField(key: keyof CorporateData, value: string): void {
    let v = value;
    if (key === "corporatePAN")   v = value.replace(/\s/g, "").toUpperCase();
    if (key === "corporateEmail") v = value.replace(/\s/g, "").toLowerCase();
    this._user = { ...this._user, corp: { ...this._user.corp, [key]: v } };
    this._emit("user");
  }

  public async searchCompany(query: string): Promise<void> {
    this._user = { ...this._user, search: query };
    if (query.length < 3) {
      this._user = { ...this._user, results: [] };
      this._emit("user");
      return;
    }
    this._user = { ...this._user, loading: true };
    this._emit("user");
    try {
      const res = await appService.httpClient.post(`auth/search?q=${query}`);
      this._user = { ...this._user, results: res.data || [] };
    } catch {
      appService.showToast("Search failed", "Error");
      this._user = { ...this._user, results: [] };
    } finally {
      this._user = { ...this._user, loading: false };
      this._emit("user");
    }
  }

  public validateAndSaveCorp(): CorporateData | null {
    const r = CorporateSchema.safeParse(this._user.corp);
    if (!r.success) {
      const i = r.error.issues[0];
      appService.showToast(`${String(i.path[0] || "Field")}: ${i.message}`, "Error");
      return null;
    }
    return r.data;
  }

  // ── 1k. Profile Mutations ──────────────────────────────────────────────────
  public updateUserUploading(l: boolean): void {
    this._user = { ...this._user, uploading: l };
    this._emit("user");
  }

  public updateUserPreview(uri: string | null): void {
    this._user = { ...this._user, previewUri: uri, activeTab: uri ? "preview" : "options" };
    this._emit("user");
  }

  public updateActiveTab(tab: "options" | "history" | "preview"): void {
    this._user = { ...this._user, activeTab: tab };
    this._emit("user");
  }

  public async fetchHistory(userId: string, type: "user" | "corp"): Promise<void> {
    this._user = { ...this._user, loading: true };
    this._emit("user");
    try {
      const res = await appService.httpClient.get(`auth/get-profile-history`, {
        params: { userId, type }
      });
      this._user = { ...this._user, history: res.data.resources || [] };
    } catch (e: any) {
      appService.showToast("Failed to fetch history", "Error");
    } finally {
      this._user = { ...this._user, loading: false };
      this._emit("user");
    }
  }

  public async deleteHistoryImage(publicId: string, url: string): Promise<void> {
    this._user = { ...this._user, loading: true };
    this._emit("user");
    try {
      const res = await appService.httpClient.post(`auth/delete-profile-image`, { publicId, url });
      if (res.data?.success) {
        const newHistory = this._user.history?.filter(img => img.public_id !== publicId && img.url !== url) || [];
        this._user = { ...this._user, history: newHistory };
        appService.showToast("Image deleted", "Success");
      } else {
        appService.showToast("Failed to delete", "Error");
      }
    } catch (e: any) {
      appService.showToast(e.response?.data?.error || e.message || "Failed to delete image", "Error");
    } finally {
      this._user = { ...this._user, loading: false };
      this._emit("user");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

export const appModules = new AppModals();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — useAppModals HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useAppModals() {
  const [, setTick] = useState(0);
  useEffect(() => appModules.subscribe(() => setTick(t => t + 1)), []);
  return appModules;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — FloatingInput
// ═══════════════════════════════════════════════════════════════════════════════

class FloatingInput extends React.PureComponent<FloatingInputProps, { focused: boolean }> {
  state = { focused: false };

  render() {
    const {
      label, value, onChange, isDark,
      accent         = "#4F46E5",
      keyboardType   = "default",
      autoCapitalize = "sentences",
      multiline      = false,
      maxLength,
    } = this.props;
    const { focused } = this.state;
    const active = focused || value.length > 0;

    return (
      <View style={{ marginBottom: 18 }}>
        <Text style={{
          position: "absolute", left: 14, top: active ? -9 : 17,
          fontSize: active ? 11 : 14, fontWeight: active ? "600" : "400",
          color: active ? accent : isDark ? "#64748b" : "#94a3b8",
          backgroundColor: isDark ? "#1e293b" : "#ffffff",
          paddingHorizontal: 4, zIndex: 10,
        }}>
          {label}
        </Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          spellCheck={false}
          multiline={multiline}
          maxLength={maxLength}
          textAlignVertical={multiline ? "top" : "center"}
          onFocus={() => this.setState({ focused: true })}
          onBlur={() => this.setState({ focused: false })}
          placeholderTextColor={isDark ? "#475569" : "#cbd5e1"}
          style={{
            borderWidth: 1.5,
            borderColor: focused ? accent : isDark ? "#334155" : "#e2e8f0",
            borderRadius: 14,
            minHeight: multiline ? 110 : 54,
            paddingHorizontal: 14,
            paddingTop: multiline ? 14 : 0,
            fontSize: 15,
            color: isDark ? "#f1f5f9" : "#1e293b",
            backgroundColor: isDark ? "rgba(15,23,42,0.13)" : "#f8fafc",
          }}
        />
      </View>
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — ModalShell
// ═══════════════════════════════════════════════════════════════════════════════

const ModalShell: React.FC<ShellProps> = ({
  visible, onClose, onSave, title, subtitle,
  saveIcon  = "checkmark-circle-outline",
  saveColor = "#4F46E5",
  loading   = false,
  isDark,
  centered  = false,
  children,
}) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <View style={{
      flex: 1,
      backgroundColor:   "rgba(0,0,0,0.65)",
      justifyContent:    centered ? "center" : "flex-start",
      paddingHorizontal: 22,
      paddingTop:        centered ? 0 : HEADER_HEIGHT + 10,
    }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : (centered ? "height" : "padding")}
        keyboardVerticalOffset={centered ? 0 : 20}
        style={{
          backgroundColor:         isDark ? "#1e293b" : "#ffffff",
          borderTopLeftRadius:     24,
          borderTopRightRadius:    24,
          borderBottomLeftRadius:  24,
          borderBottomRightRadius: 24,
          maxHeight: "92%",
          overflow:  "hidden",
          elevation: 24,
          shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 20,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        {/* Header */}
        <View style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 22,
          paddingTop:        centered ? 22 : 18,
          paddingBottom:     16,
          borderBottomWidth: 1,
          borderBottomColor: isDark ? "#334155" : "#f1f5f9",
        }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: isDark ? "#f1f5f9" : "#0f172a", letterSpacing: -0.3 }}>
              {title}
            </Text>
            {subtitle
              ? <Text style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{subtitle}</Text>
              : null}
          </View>

          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <TouchableOpacity
              onPress={onSave} disabled={loading} activeOpacity={0.7}
              style={{ backgroundColor: saveColor + "25", borderRadius: 12, padding: 7 }}
            >
              <Ionicons name={(loading ? "hourglass-outline" : saveIcon) as any} size={26} color={saveColor} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClose} activeOpacity={0.7}
              style={{ backgroundColor: "rgba(239,68,68,0.12)", borderRadius: 12, padding: 7 }}
            >
              <Ionicons name="close" size={26} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Body */}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 22, paddingBottom: 60, flexGrow: 1 }}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  </Modal>
);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — VendorModalBody
// ═══════════════════════════════════════════════════════════════════════════════

const VendorModalBody: React.FC<{ form: VendorForm; isDark: boolean }> = ({ form, isDark }) => {
  const [contacts,      setContacts]      = useState<any[]>([]);
  const [suggestions,   setSuggestions]   = useState<any[]>([]);
  const [numberOptions, setNumberOptions] = useState<string[]>([]);
  const [showSuggest,   setShowSuggest]   = useState(false);
  const typeDelay = useRef<any>(null);

  const [vendorStateVisible, setVendorStateVisible] = useState(false);
  const [vendorDistrictVisible, setVendorDistrictVisible] = useState(false);

  const accent = "#0b6cff";

  const loadContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") return;
    const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
    const store: any = {};
    data.forEach(c => {
      if (!c.phoneNumbers) return;
      if (!store[c.name]) store[c.name] = { name: c.name, numbers: [] };
      c.phoneNumbers.forEach((p: any) => {
        const num = cleanNum(p.number || "");
        if (num && !store[c.name].numbers.includes(num)) store[c.name].numbers.push(num);
      });
    });
    setContacts(Object.values(store));
  };

  const handleContactSearch = (t: string) => {
    appModules.updateVendorField("contactPerson", t);
    if (!t.trim()) return setShowSuggest(false);
    if (typeDelay.current) clearTimeout(typeDelay.current);
    typeDelay.current = setTimeout(() => {
      loadContacts();
      const s = t.toLowerCase();
      const result = contacts.filter(c =>
        c.name.toLowerCase().includes(s) || c.numbers.some((n: string) => n.includes(s))
      );
      setSuggestions(result.slice(0, 25));
      setShowSuggest(true);
    }, 250);
  };

  const chooseContact = (c: any) => {
    setShowSuggest(false);
    appModules.updateVendorField("contactPerson", c.name);
    if (c.numbers.length === 1) {
      appModules.updateVendorField("mobileNo", c.numbers[0]);
    } else {
      setNumberOptions(c.numbers);
    }
  };

  const selectNumber = (n: string) => {
    appModules.updateVendorField("mobileNo", n);
    setNumberOptions([]);
  };

  const inputStyle = {
    borderWidth: 1.5,
    borderColor: isDark ? "#334155" : "#e2e8f0",
    borderRadius: 14,
    height: 54,
    paddingHorizontal: 14,
    fontSize: 15,
    color: isDark ? "#f1f5f9" : "#1e293b",
    backgroundColor: isDark ? "rgba(15,23,42,0.13)" : "#f8fafc",
    marginBottom: 14,
  };

  const labelStyle = {
    fontSize: 12, fontWeight: "600" as const,
    color: isDark ? "#94a3b8" : "#64748b",
    marginBottom: 4,
  };

  const suggestRowStyle = {
    padding: 12, borderRadius: 10, marginBottom: 6,
    borderWidth: 1, borderColor: isDark ? "#334155" : "#e2e8f0",
    backgroundColor: isDark ? "rgba(15,23,42,0.2)" : "#f8fafc",
  };

  return (
    <>
      <Text style={labelStyle}>Contact Person</Text>
      <TextInput
        style={inputStyle}
        placeholder="Contact Person"
        placeholderTextColor={isDark ? "#475569" : "#cbd5e1"}
        value={form.contactPerson}
        onFocus={loadContacts}
        onChangeText={handleContactSearch}
      />

      {showSuggest && suggestions.map(s => (
        <TouchableOpacity key={s.name} onPress={() => chooseContact(s)} style={suggestRowStyle}>
          <Text style={{ fontWeight: "700", color: isDark ? "#f1f5f9" : "#1e293b" }}>{s.name}</Text>
          <Text style={{ color: "#64748b", fontSize: 12 }}>{s.numbers.join(", ")}</Text>
        </TouchableOpacity>
      ))}

      {numberOptions.map(n => (
        <TouchableOpacity key={n} onPress={() => selectNumber(n)} style={suggestRowStyle}>
          <Text style={{ fontSize: 17, color: accent, fontWeight: "700" }}>{n}</Text>
        </TouchableOpacity>
      ))}

      <Text style={labelStyle}>Mobile Number</Text>
      <TextInput
        style={inputStyle}
        placeholder="Mobile Number"
        placeholderTextColor={isDark ? "#475569" : "#cbd5e1"}
        value={form.mobileNo}
        keyboardType="number-pad"
        onChangeText={v => appModules.updateVendorField("mobileNo", cleanNum(v))}
      />

      <Text style={labelStyle}>Vendor / Shop Name</Text>
      <TextInput
        style={inputStyle}
        placeholder="Vendor Name"
        placeholderTextColor={isDark ? "#475569" : "#cbd5e1"}
        value={form.vendorName}
        onChangeText={v => appModules.updateVendorField("vendorName", v)}
      />

      <Text style={labelStyle}>GST Number</Text>
      <TextInput
        style={inputStyle}
        placeholder="GST Number"
        placeholderTextColor={isDark ? "#475569" : "#cbd5e1"}
        maxLength={15}
        value={form.vendorGST}
        onChangeText={v => appModules.updateVendorField("vendorGST", v.toUpperCase())}
      />

      <Text style={labelStyle}>PAN Number</Text>
      <TextInput
        style={inputStyle}
        placeholder="PAN Number"
        placeholderTextColor={isDark ? "#475569" : "#cbd5e1"}
        maxLength={10}
        value={form.vendorPAN}
        onChangeText={v => appModules.updateVendorField("vendorPAN", v.toUpperCase())}
      />

      <Text style={labelStyle}>Vendor Address</Text>
      <TextInput
        style={[inputStyle, { height: 80, paddingTop: 14, textAlignVertical: "top" }] as any}
        multiline
        placeholder="Address"
        placeholderTextColor={isDark ? "#475569" : "#cbd5e1"}
        value={form.vendorAddress}
        onChangeText={v => appModules.updateVendorField("vendorAddress", v)}
      />

      <Text style={labelStyle}>Vendor State</Text>
      <TouchableOpacity 
        style={[inputStyle, { justifyContent: "center", minHeight: 54 }] as any} 
        onPress={() => setVendorStateVisible(true)}
      >
        <Text style={{ fontSize: 15, color: form.vendorState ? (isDark ? "#f1f5f9" : "#1e293b") : (isDark ? "#475569" : "#cbd5e1") }}>
          {form.vendorState || "Select State"}
        </Text>
      </TouchableOpacity>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>District</Text>
          <TouchableOpacity 
            style={[inputStyle, { justifyContent: "center", minHeight: 54 }] as any} 
            onPress={() => setVendorDistrictVisible(true)}
          >
            <Text style={{ fontSize: 15, color: form.vendorDistrict ? (isDark ? "#f1f5f9" : "#1e293b") : (isDark ? "#475569" : "#cbd5e1") }} numberOfLines={1}>
              {form.vendorDistrict || "Select District"}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={labelStyle}>City</Text>
          <TextInput
            style={inputStyle}
            placeholder="City"
            placeholderTextColor={isDark ? "#475569" : "#cbd5e1"}
            value={form.vendorCity}
            onChangeText={v => appModules.updateVendorField("vendorCity", v)}
          />
        </View>
      </View>

      <StatePicker 
        visible={vendorStateVisible} 
        onClose={() => setVendorStateVisible(false)} 
        onSelect={v => {
            appModules.updateVendorField("vendorState", v);
            appModules.updateVendorField("vendorCity", "");
        }}
      />
      <DistrictPicker
        visible={vendorDistrictVisible}
        onClose={() => setVendorDistrictVisible(false)}
        onSelect={v => appModules.updateVendorField("vendorDistrict", v)}
        stateCode={getStateCodeByName(form.vendorState)}
      />
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — AppModal CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class AppModal extends React.Component<AppModalProps> {

  private renderLeadBody(data: ManualLeadData, isDark: boolean, onStatePress: () => void): React.ReactNode {
    return LEAD_FIELDS.map(f => (
      f.key === "sender_state" ? (
        <React.Fragment key={f.key}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: isDark ? "#94a3b8" : "#64748b", marginBottom: 6, marginLeft: 4 }}>State</Text>
          <TouchableOpacity 
            style={{ 
              borderWidth: 1.5, borderColor: isDark ? "#334155" : "#e2e8f0", borderRadius: 14, 
              minHeight: 54, paddingHorizontal: 14, justifyContent: "center", marginBottom: 18,
              backgroundColor: isDark ? "rgba(15,23,42,0.13)" : "#f8fafc"
            }} 
            onPress={onStatePress}
          >
            <Text style={{ fontSize: 15, color: data.sender_state ? (isDark ? "#f1f5f9" : "#1e293b") : (isDark ? "#475569" : "#cbd5e1") }}>
              {data.sender_state || "Select State"}
            </Text>
          </TouchableOpacity>
        </React.Fragment>
      ) : f.key === "sender_city" ? (
        <React.Fragment key={f.key}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: isDark ? "#94a3b8" : "#64748b", marginBottom: 6, marginLeft: 4 }}>City / District</Text>
          <TouchableOpacity 
            style={{ 
              borderWidth: 1.5, borderColor: isDark ? "#334155" : "#e2e8f0", borderRadius: 14, 
              minHeight: 54, paddingHorizontal: 14, justifyContent: "center", marginBottom: 18,
              backgroundColor: isDark ? "rgba(15,23,42,0.13)" : "#f8fafc"
            }} 
            onPress={() => DeviceEventEmitter.emit("show_lead_district_picker")}
          >
            <Text style={{ fontSize: 15, color: data.sender_city ? (isDark ? "#f1f5f9" : "#1e293b") : (isDark ? "#475569" : "#cbd5e1") }}>
              {data.sender_city || "Select City/District"}
            </Text>
          </TouchableOpacity>
        </React.Fragment>
      ) : (
        <FloatingInput
          key={f.key}
          label={f.label}
          value={(data as any)[f.key] ?? ""}
          keyboardType={f.kb}
          autoCapitalize={f.cap}
          accent="#22c55e"
          isDark={isDark}
          onChange={v => appModules.updateLeadField(f.key, v)}
        />
      )
    ));
  }

  private renderActivityBody(note: string, isDark: boolean): React.ReactNode {
    return (
      <>
        <FloatingInput
          label="Conversation Details *"
          value={note}
          onChange={v => appModules.updateActivityNote(v)}
          isDark={isDark}
          accent="#3b82f6"
          multiline
        />
        <Text style={{ fontSize: 12, color: "#64748b", textAlign: "center", fontStyle: "italic", marginTop: 4 }}>
          This note will be added to the lead activity history.
        </Text>
      </>
    );
  }

  private renderCorpRegisterBody(
    corp:    Partial<CorporateData>,
    isDark:  boolean,
    loading: boolean,
    onSave:  () => void,
  ): React.ReactNode {
    return (
      <>
        {CORP_FIELDS.map(f => (
          f.key === "corporateState" ? (
            <React.Fragment key={f.key}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: isDark ? "#94a3b8" : "#64748b", marginBottom: 6, marginLeft: 4 }}>State</Text>
              <TouchableOpacity 
                style={{ 
                  borderWidth: 1.5, borderColor: isDark ? "#334155" : "#e2e8f0", borderRadius: 14, 
                  minHeight: 54, paddingHorizontal: 14, justifyContent: "center", marginBottom: 18,
                  backgroundColor: isDark ? "rgba(15,23,42,0.13)" : "#f8fafc"
                }} 
                onPress={() => DeviceEventEmitter.emit("show_user_state_picker")}
              >
                <Text style={{ fontSize: 15, color: corp.corporateState ? (isDark ? "#f1f5f9" : "#1e293b") : (isDark ? "#475569" : "#cbd5e1") }}>
                  {corp.corporateState || "Select State"}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ) : f.key === "corporateCity" ? (
            <React.Fragment key={f.key}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: isDark ? "#94a3b8" : "#64748b", marginBottom: 6, marginLeft: 4 }}>City / District</Text>
              <TouchableOpacity 
                style={{ 
                  borderWidth: 1.5, borderColor: isDark ? "#334155" : "#e2e8f0", borderRadius: 14, 
                  minHeight: 54, paddingHorizontal: 14, justifyContent: "center", marginBottom: 18,
                  backgroundColor: isDark ? "rgba(15,23,42,0.13)" : "#f8fafc"
                }} 
                onPress={() => DeviceEventEmitter.emit("show_user_district_picker")}
              >
                <Text style={{ fontSize: 15, color: corp.corporateCity ? (isDark ? "#f1f5f9" : "#1e293b") : (isDark ? "#475569" : "#cbd5e1") }}>
                  {corp.corporateCity || "Select City/District"}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ) : (
            <FloatingInput
              key={f.key}
              label={f.label}
              value={(corp as any)[f.key] ?? ""}
              keyboardType={f.kb ?? "default"}
              autoCapitalize={f.cap ?? "sentences"}
              accent="#4F46E5"
              maxLength={f.max}
              multiline={f.multi}
              isDark={isDark}
              onChange={v => appModules.updateCorpField(f.key, v)}
            />
          )
        ))}
        <TouchableOpacity
          style={[styles.primaryButton, { marginTop: 4, opacity: loading ? 0.7 : 1 }] as any}
          onPress={onSave}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText as any}>Verify & Save</Text>
        </TouchableOpacity>
      </>
    );
  }

  private renderUserBody(m: UserModalState, isDark: boolean): React.ReactNode {
    if (m.type === "camera") {
      const accent = "#4F46E5";
      
      // ── Sub-View: Preview ──
      if (m.activeTab === "preview" && m.previewUri) {
        return (
          <View style={{ alignItems: "center", gap: 30, paddingVertical: 10 }}>
            <Image
              source={{ uri: m.previewUri }}
              style={{ width: 220, height: 220, borderRadius: 110, borderWidth: 4, borderColor: accent } as any}
            />
            <View style={{ flexDirection: "row", gap: 40, alignItems: "center" }}>
              <TouchableOpacity
                onPress={() => appModules.onUserUpload?.()}
                disabled={m.uploading}
                style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#22c55e", justifyContent: "center", alignItems: "center", ...mkShadow(10), opacity: m.uploading ? 0.7 : 1 }}
              >
                {m.uploading ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark" size={36} color="#fff" />}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => appModules.updateUserPreview(null)}
                disabled={m.uploading}
                style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#ef4444", justifyContent: "center", alignItems: "center", ...mkShadow(10) }}
              >
                <Ionicons name="close" size={36} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text style={{ color: "#64748b", fontSize: 13, fontWeight: "600" }}>Confirm Upload?</Text>
          </View>
        );
      }

      // ── Sub-View: History / Gallery ──
      if (m.activeTab === "history") {
        return (
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
              <TouchableOpacity onPress={() => appModules.updateActiveTab("options")} style={{ padding: 4 }}>
                <Ionicons name="arrow-back" size={24} color={isDark ? "#f1f5f9" : "#0f172a"} />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: "800", marginLeft: 10, color: isDark ? "#f1f5f9" : "#0f172a" }}>Select from History</Text>
            </View>
            {m.loading ? (
              <ActivityIndicator color={accent} style={{ marginTop: 40 }} />
            ) : (
              <ScrollView>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {(m.history || []).map((img, i) => (
                    <View key={i} style={{ width: "31%", aspectRatio: 1, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: isDark ? "#334155" : "#e2e8f0" }}>
                      <TouchableOpacity 
                        onPress={() => appModules.updateUserPreview(img.url)}
                        style={{ width: "100%", height: "100%" }}
                      >
                        <Image source={{ uri: img.url }} style={{ width: "100%", height: "100%" }} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert("Delete Image", "Are you sure you want to delete this image?", [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => appModules.deleteHistoryImage(img.public_id, img.url) }
                          ]);
                        }}
                        style={{
                          position: "absolute", top: 4, right: 4,
                          backgroundColor: "rgba(0,0,0,0.5)",
                          padding: 4, borderRadius: 12,
                        }}
                      >
                        <Ionicons name="trash" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
                {(!m.history || m.history.length === 0) && (
                  <Text style={{ textAlign: "center", color: "#64748b", marginTop: 40 }}>No previous uploads found.</Text>
                )}
              </ScrollView>
            )}
          </View>
        );
      }

      // ── Sub-View: Main Options ──
      return (
        <View style={{ gap: 16, paddingVertical: 10 }}>
          <TouchableOpacity
            onPress={() => appModules.onUserSelect?.("camera")}
            style={{ 
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
              padding: 16, borderRadius: 16, backgroundColor: accent, ...mkShadow(6)
            }}
          >
            <Ionicons name="camera" size={24} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Live Capture</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => appModules.onUserSelect?.("gallery")}
            style={{ 
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
              padding: 16, borderRadius: 16, backgroundColor: isDark ? "#334155" : "#e2e8f0"
            }}
          >
            <Ionicons name="image" size={24} color={isDark ? "#f1f5f9" : "#0f172a"} />
            <Text style={{ color: isDark ? "#f1f5f9" : "#0f172a", fontSize: 16, fontWeight: "700" }}>Upload from Device</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => DeviceEventEmitter.emit("req_profile_history")}
            style={{ 
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
              padding: 16, borderRadius: 16, backgroundColor: isDark ? "#1e293b" : "#f8fafc",
              borderWidth: 1.5, borderColor: isDark ? "#334155" : "#e2e8f0"
            }}
          >
            <Ionicons name="grid-outline" size={24} color={accent} />
            <Text style={{ color: isDark ? "#f1f5f9" : "#0f172a", fontSize: 16, fontWeight: "700" }}>Select from Existing</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  }

  private renderCorpSearchBody(
    search:   string,
    results:  any[],
    loading:  boolean,
    isDark:   boolean,
    dynamic:  ReturnType<typeof getThemeStyles>,
    onSelect: (item: any) => void,
  ): React.ReactNode {
    return (
      <>
        <View style={[
          styles.inputWrapperAuth, dynamic.inputWrapper,
          { marginBottom: 16, flexDirection: "row", alignItems: "center" },
        ] as any}>
          <Ionicons name="search-outline" size={18} color="#64748b" style={{ marginLeft: 14 }} />
          <TextInput
            placeholder="Search company name..."
            placeholderTextColor={dynamic.placeholder}
            style={[styles.textInput, dynamic.textInput, { flex: 1 }] as any}
            value={search}
            onChangeText={t => appModules.searchCompany(t)}
          />
        </View>

        {loading && <ActivityIndicator color="#4F46E5" style={{ marginVertical: 20 }} />}

        {!loading && results.length === 0 && search.length >= 3 && (
          <Text style={{ color: "#64748b", textAlign: "center", marginTop: 20 }}>
            No companies found.
          </Text>
        )}

        {results.map((item, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() => onSelect(item)}
            activeOpacity={0.75}
            style={{
              padding: 16, borderRadius: 12, marginBottom: 8,
              borderWidth: 1, borderColor: isDark ? "#334155" : "#e2e8f0",
              backgroundColor: isDark ? "rgba(15,23,42,0.2)" : "#f8fafc",
            }}
          >
            <Text style={{ fontWeight: "700", color: isDark ? "#f1f5f9" : "#0f172a", fontSize: 14 }}>
              {item.corporateName}
            </Text>
            <Text style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
              {item.corporateCity}, {item.corporateState}
            </Text>
          </TouchableOpacity>
        ))}
      </>
    );
  }

  private renderStatusBody(transitions: string[], isDark: boolean): React.ReactNode {
    if (transitions.length === 0) {
      return (
        <Text style={{ color: "#64748b", textAlign: "center", marginTop: 8 }}>
          No transitions available
        </Text>
      );
    }
    return transitions.map(s => (
      <TouchableOpacity
        key={s}
        onPress={() => appModules.updateStatus(s)}
        activeOpacity={0.75}
        style={{
          padding: 16, borderRadius: 14, marginBottom: 10,
          borderWidth: 1.5,
          borderColor:     STATUS_COLOR[s] ? STATUS_COLOR[s] + "55" : (isDark ? "#334155" : "#e2e8f0"),
          backgroundColor: STATUS_COLOR[s] ? STATUS_COLOR[s] + "12" : (isDark ? "rgba(15,23,42,0.2)" : "#f8fafc"),
          flexDirection: "row", alignItems: "center", gap: 10,
        }}
      >
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: STATUS_COLOR[s] ?? "#64748b" }} />
        <Text style={{ fontWeight: "700", fontSize: 15, color: STATUS_COLOR[s] ?? (isDark ? "#f1f5f9" : "#0f172a") }}>
          {s}
        </Text>
      </TouchableOpacity>
    ));
  }

  render() {
    return <AppModalInner parent={this} onCorpSelect={this.props.onCorpSelect} />;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — AppModalInner
// ═══════════════════════════════════════════════════════════════════════════════

interface InnerProps {
  parent:        AppModal;
  onCorpSelect?: (item: any) => void;
}

const AppModalInnerExtra: React.FC<{ leadData: any; corpData: any }> = ({ leadData, corpData }) => {
  const [v, setV] = useState(false);
  const [vd, setVd] = useState(false);
  const [ld, setLd] = useState(false);

  useEffect(() => {
    const s1 = DeviceEventEmitter.addListener("show_user_state_picker", () => setV(true));
    const s2 = DeviceEventEmitter.addListener("show_user_district_picker", () => setVd(true));
    const s3 = DeviceEventEmitter.addListener("show_lead_district_picker", () => setLd(true));
    return () => { s1.remove(); s2.remove(); s3.remove(); };
  }, []);

  return (
    <>
      <StatePicker 
        visible={v} 
        onClose={() => setV(false)} 
        onSelect={v => {
          appModules.updateCorpField("corporateState", v);
          appModules.updateCorpField("corporateCity", "");
        }}
        title="Select Company State"
      />
      <DistrictPicker
        visible={vd}
        onClose={() => setVd(false)}
        onSelect={v => appModules.updateCorpField("corporateCity", v)}
        stateCode={getStateCodeByName(corpData.corporateState)}
      />
      <DistrictPicker
        visible={ld}
        onClose={() => setLd(false)}
        onSelect={v => appModules.updateLeadField("sender_city", v)}
        stateCode={getStateCodeByName(leadData.sender_state)}
      />
    </>
  );
};

const AppModalInner: React.FC<InnerProps> = ({ parent, onCorpSelect }) => {
  const isDark  = useColorScheme() === "dark";
  const dynamic = getThemeStyles(isDark);
  const m       = useAppModals();
  const { user } = useUserContext();
  const [userTab, setUserTab] = useState<UserModalType>("corporate");
  const [leadStateVisible, setLeadStateVisible] = useState(false);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("req_profile_history", () => {
      if (user) {
        const type = m.user.profileType || "user";
        appModules.updateActiveTab("history");
        appModules.fetchHistory(user.userId, type);
      }
    });
    return () => sub.remove();
  }, [user, m.user.previewUri]);

  useEffect(() => { setUserTab(m.user.type); }, [m.user.type]);

  const handleCorpSave = () => {
    const validated = appModules.validateAndSaveCorp();
    if (validated) appModules.close("user");
  };

  const handleCorpSelect = (item: any) => {
    onCorpSelect?.(item);
    appModules.close("user");
  };

  return (
    <>
      {/* ── Lead Modal ── */}
      <ModalShell
        visible={m.lead.visible}
        isDark={isDark}
        title="New Lead"
        saveIcon="checkmark-circle-outline"
        saveColor="#22c55e"
        loading={m.lead.loading}
        onSave={() => appModules.saveLead()}
        onClose={() => appModules.close("lead")}
      >
        {parent["renderLeadBody"](m.lead.data, isDark, () => setLeadStateVisible(true))}
      </ModalShell>

      <StatePicker 
        visible={leadStateVisible} 
        onClose={() => setLeadStateVisible(false)} 
        onSelect={v => {
            appModules.updateLeadField("sender_state", v);
            appModules.updateLeadField("sender_city", "");
        }}
        title="Select Lead State"
      />

      {/* ── Activity Modal ── */}
      <ModalShell
        visible={m.activity.visible}
        isDark={isDark}
        centered
        title="User Action"
        subtitle={appModules.activityHeaderLabel}
        saveIcon="checkmark-circle-outline"
        saveColor="#22c55e"
        loading={m.activity.loading}
        onSave={() => appModules.saveActivity()}
        onClose={() => appModules.close("activity")}
      >
        {parent["renderActivityBody"](m.activity.note, isDark)}
      </ModalShell>

      {/* ── Status Modal ── */}
      <ModalShell
        visible={m.status.visible}
        isDark={isDark}
        centered
        title="Change Status"
        subtitle={`Current: ${m.status.currentStatus}`}
        onSave={() => {}}
        onClose={() => appModules.close("status")}
      >
        {parent["renderStatusBody"](m.status.transitions, isDark)}
      </ModalShell>

      {/* ── Vendor Modal ── */}
      <ModalShell
        visible={m.vendor.visible}
        isDark={isDark}
        title={m.vendor.editId ? "Edit Vendor" : "Add Vendor"}
        saveIcon="checkmark-circle-outline"
        saveColor="#0b6cff"
        loading={m.vendor.loading}
        onSave={() => appModules.saveVendor()}
        onClose={() => appModules.close("vendor")}
      >
        <VendorModalBody form={m.vendor.form} isDark={isDark} />
      </ModalShell>

      {/* ── User / Corporate Modal ── */}
      <ModalShell
        visible={m.user.visible}
        isDark={isDark}
        centered
        title={m.user.type === "camera" ? "Update Photo" : m.user.type === "corporate" ? "Register Company" : "Search Company"}
        saveIcon={m.user.type === "corporate" ? "shield-checkmark-outline" : "search-outline"}
        saveColor="#4F46E5"
        loading={m.user.loading}
        onSave={m.user.type === "corporate" ? handleCorpSave : () => {}}
        onClose={() => appModules.close("user")}
      >
        {m.user.type !== "camera" && (
          <View style={{
            flexDirection: "row",
            backgroundColor: isDark ? "#0f172a" : "#f1f5f9",
            borderRadius: 12, padding: 4, marginBottom: 22,
          }}>
            {(["corporate", "search"] as UserModalType[]).map(tab => (
              <TouchableOpacity
                key={tab}
                onPress={() => { setUserTab(tab); appModules.openUser({ type: tab }); }}
                activeOpacity={0.8}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                  backgroundColor: userTab === tab ? (isDark ? "#1e293b" : "#ffffff") : "transparent",
                  ...(userTab === tab ? {
                    elevation: 2, shadowColor: "#000", shadowOpacity: 0.08,
                    shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
                  } : {}),
                }}
              >
                <Ionicons
                  name={tab === "corporate" ? "business-outline" : "search-outline"}
                  size={15}
                  color={userTab === tab ? "#4F46E5" : "#64748b"}
                  style={{ marginBottom: 2 }}
                />
                <Text style={{
                  fontSize: 12,
                  fontWeight: userTab === tab ? "700" : "500",
                  color: userTab === tab ? "#4F46E5" : "#64748b",
                  textTransform: "capitalize",
                }}>
                  {tab === "corporate" ? "Register" : "Search"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
          {m.user.type === "camera" 
            ? parent["renderUserBody"](m.user, isDark)
            : userTab === "corporate"
              ? parent["renderCorpRegisterBody"](m.user.corp, isDark, m.user.loading, handleCorpSave)
              : parent["renderCorpSearchBody"](m.user.search, m.user.results, m.user.loading, isDark, dynamic, handleCorpSelect)
          }
        </SafeAreaView>
      </ModalShell>

      <AppModalInnerExtra leadData={m.lead.data} corpData={m.user.corp} />
    </>
  );
};

export default AppModal;
