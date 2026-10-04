// ─── AdminUserEditor.tsx 
import { appService } from "@/UtilServices/appHelper";
import { useUserContext } from "@/context/AuthContext";
import { C, useTheme } from "@/hooks/Theme";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    useColorScheme,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    ErrorBanner,
    Field,
    SelectField,
    Row,
    SaveButton,
    SectionCard,
    SectionTitle,
    Toggle,
    str,
    GenericPicker,
} from "./Settingscomponents";
import { StatePicker } from "@/UtilServices/StatePicker";
import { DistrictPicker } from "@/UtilServices/DistrictPicker";
import { getStateCodeByName } from "@/UtilServices/gstConstants";
import { AppHeader } from "@/components/AppHeader";
import { Ionicons } from "@expo/vector-icons";
import { styles as GRaw } from "@/styles/stylesIndex";
const G = GRaw as any;

const getInitials = (displayName?: string) => {
    const name = displayName || "";
    const parts = name.trim().split(/\s+/);
    if (!name.trim()) return "?";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatDateToYYYYMMDD = (dateVal: any): string | undefined => {
    if (!dateVal) return undefined;
    try {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return undefined;
        return d.toISOString().slice(0, 10);
    } catch {
        return undefined;
    }
};

// ──────────
//  Types
// ───────────
interface AdminForm {
    userDisplayName?: string;
    userEmail?: string;
    userMobile?: string;
    userAadhar?: string;
    userDoB?: string;
    userActive: boolean;
    userProfileImage?: string;
    userRole?: string;
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
    addresses?: {
        permanent?: { line1?: string; city?: string; district?: string; state?: string; pincode?: string };
        local?: { line1?: string; city?: string; district?: string; state?: string; pincode?: string };
    };
    dutyShift?: {
        startFrom?: string;
        durationHrs?: number;
        groupName?: string;
        shiftName?: string;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Password match indicator
// ─────────────────────────────────────────────────────────────────────────────

const PasswordMatchHint: React.FC<{ newPwd?: string; confirmPwd?: string }> = ({ newPwd, confirmPwd }) => {
    if (!newPwd || !confirmPwd) return null;
    const match = newPwd === confirmPwd;
    return (
        <View style={[G.rowCenter, G.mb8, { paddingHorizontal: 4 }]}>
            <Ionicons name={match ? "checkmark-circle" : "close-circle"} size={14} color={match ? C.success : C.danger} style={{ marginRight: 6 }} />
            <Text style={[G.fs12, G.bold700, { color: match ? C.success : C.danger }]}>
                {match ? "Passwords match" : "Passwords do not match"}
            </Text>
        </View>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
//  AdminUserEditor
// ─────────────────────────────────────────────────────────────────────────────

export const AdminUserEditor: React.FC<{ isDark: boolean; token: string }> = ({ isDark, token }) => {
    const th = useTheme(isDark);
    const router = useRouter();
    const { user } = useUserContext();
    const corporateId = user?.corporateId;
    const corpAdminId = user?.corpAdminId;

    const [form, setForm] = useState<AdminForm>({ userActive: true });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAadharFocused, setIsAadharFocused] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [permStateVisible, setPermStateVisible] = useState(false);
    const [permDistrictVisible, setPermDistrictVisible] = useState(false);
    const [localStateVisible, setLocalStateVisible] = useState(false);
    const [localDistrictVisible, setLocalDistrictVisible] = useState(false);
    const [showGroupPicker, setShowGroupPicker] = useState(false);
    const [showShiftNamePicker, setShowShiftNamePicker] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() - 18);

    const handleDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(false);
        if (selectedDate) {
            const yyyy = selectedDate.getFullYear();
            const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const dd = String(selectedDate.getDate()).padStart(2, '0');
            set("userDoB", `${yyyy}-${mm}-${dd}`);
        }
    };

    const set = useCallback((k: keyof AdminForm, v: any) => setForm(p => ({ ...p, [k]: v })), []);

    const setAddress = useCallback((type: "permanent" | "local", field: string, value: any) => {
        setForm(p => ({
            ...p,
            addresses: {
                ...p.addresses,
                [type]: {
                    ...(p.addresses?.[type] || {}),
                    [field]: value
                }
            }
        }));
    }, []);

    const setShift = useCallback((field: keyof NonNullable<AdminForm["dutyShift"]>, value: any) => {
        let val = value;
        if (field === "startFrom" && typeof value === "string") {
            const currentVal = form.dutyShift?.startFrom || "";
            let clean = value.replace(/[^0-9]/g, '');
            if (clean.length > 2) {
                val = clean.slice(0, 2) + ':' + clean.slice(2, 4);
            } else if (clean.length === 2 && value.length > currentVal.length) {
                val = clean + ':';
            } else {
                val = clean;
            }
            val = val.slice(0, 5);
        }
        setForm(p => ({
            ...p,
            dutyShift: {
                ...(p.dutyShift || {}),
                [field]: val
            }
        }));
    }, [form.dutyShift?.startFrom]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const r = await appService.httpClient.get("/setting/update/user", {
                    params: { corporateId, corpAdminId },
                    headers: { Authorization: `Bearer ${token}` }
                });
                const d = r.data?.data?.user ?? r.data?.data ?? {};
                setForm({
                    userDisplayName: str(d.userDisplayName),
                    userEmail: str(d.userEmail),
                    userMobile: str(d.userMobile),
                    userAadhar: str(d.userAadhar),
                    userDoB: formatDateToYYYYMMDD(d.userDoB),
                    userActive: typeof d.userActive === "boolean" ? d.userActive : true,
                    userProfileImage: str(d.userProfileImage),
                    userRole: str(d.userRole),
                    addresses: d.addresses || { permanent: {}, local: {} },
                    dutyShift: d.dutyShift || { startFrom: "", durationHrs: 8, groupName: "MANG", shiftName: "General" },
                });
            } catch (e: any) {
                setError(e?.response?.data?.message || e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [token, corporateId]);

    const save = async () => {
        if (form.newPassword && form.newPassword !== form.confirmPassword) {
            return appService.showToast("Passwords do not match", "Error");
        }
        setSaving(true);
        setError(null);
        try {
            const payload: any = {
                userDisplayName: form.userDisplayName,
                userEmail: form.userEmail,
                userMobile: form.userMobile,
                userAadhar: form.userAadhar,
                userDoB: form.userDoB,
                userActive: form.userActive,
                userProfileImage: form.userProfileImage,
                addresses: form.addresses,
                dutyShift: form.dutyShift,
            };
            if (form.newPassword) {
                payload.currentPassword = form.currentPassword;
                payload.newPassword = form.newPassword;
            }

            await appService.httpClient.put("/setting/update/user", payload, {
                params: { corporateId, corpAdminId },
                headers: { Authorization: `Bearer ${token}` },
            });

            setSaved(true);
            clearTimeout(timer.current!);
            timer.current = setTimeout(() => setSaved(false), 3000);
            setForm(p => ({
                ...p,
                currentPassword: undefined,
                newPassword: undefined,
                confirmPassword: undefined,
            }));
        } catch (e: any) {
            setError(e?.response?.data?.message || e.message);
            appService.showToast(e?.response?.data?.message || e.message, "Error");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 15 }}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={{ color: th.txtSec, fontSize: 13, fontWeight: "600" }}>Loading profile…</Text>
        </View>
    );

    return (
        <View style={{ flex: 1 }}>
            {/* Fixed Profile Header */}
            <View style={{
                backgroundColor: th.card,
                borderBottomWidth: 1, borderBottomColor: th.border,
                padding: 16
            }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{
                        width: 70, height: 70, borderRadius: 35,
                        backgroundColor: C.primary + "20",
                        justifyContent: "center", alignItems: "center", marginRight: 18,
                        borderWidth: 2, borderColor: C.primary + "40",
                        overflow: "hidden"
                    }}>
                        {form.userProfileImage ? (
                            <Image 
                                source={{ uri: form.userProfileImage }} 
                                style={{ width: 70, height: 70 }} 
                                resizeMode="cover" 
                            />
                        ) : (
                            <Text style={{ fontSize: 24, fontWeight: "800", color: C.primary }}>
                                {getInitials(form.userDisplayName)}
                            </Text>
                        )}
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 20, fontWeight: "800", color: th.txt }}>
                            {form.userDisplayName ?? "User"}
                        </Text>
                    </View>
                </View>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <ErrorBanner message={error} />

            {/* Profile fields */}
            <SectionCard th={th}>
                <SectionTitle label="Shift Timing" icon="⏱️" th={th} />
                <View style={[G.p12, G.mb16, G.br14, { backgroundColor: th.inputBg, borderWidth: 1, borderColor: th.border }]}>
                    <Row>
                        <Field label="Start From" value={form.dutyShift?.startFrom || ""} onChange={(v: any) => setShift("startFrom", v)} th={th} placeholder="HH:MM" half icon="time-outline" />
                        <Field label="Duration (Hrs)" value={form.dutyShift?.durationHrs?.toString() || ""} onChange={(v: any) => setShift("durationHrs", parseInt(v) || 0)} th={th} keyboardType="numeric" half icon="hourglass-outline" />
                    </Row>
                    <View style={[G.mt8, G.mb12]}>
                        <SelectField 
                            label="Shift Group" 
                            value={form.dutyShift?.groupName || "MANG"} 
                            onPress={() => setShowGroupPicker(true)} 
                            th={th} 
                            icon="layers-outline" 
                        />
                    </View>
                    <View style={[G.mb12]}>
                        <SelectField 
                            label="Shift Name" 
                            value={form.dutyShift?.shiftName || "General"} 
                            onPress={() => setShowShiftNamePicker(true)} 
                            th={th} 
                            icon="sunny-outline" 
                        />
                    </View>
                </View>
            </SectionCard>

            <SectionCard th={th}>
                <SectionTitle label="Identity & Contact" icon="👤" th={th} />
                <Field label="Display Name" value={form.userDisplayName} onChange={v => set("userDisplayName", v)} th={th} autoCapitalize="words" icon="person-outline" />
                <Field label="Email Address" value={form.userEmail} onChange={v => set("userEmail", v)} th={th} keyboardType="email-address" icon="mail-outline" />
                <Field
                    label="Mobile Number"
                    value={form.userMobile}
                    onChange={v => {
                        const num = (v || "").replace(/[^0-9]/g, "").slice(0, 10);
                        set("userMobile", num || undefined);
                    }}
                    th={th}
                    keyboardType="phone-pad"
                    icon="call-outline"
                />
                <View style={[G.w100, G.mb16]}>
                    <Text style={[G.fs13, G.bold700, G.mb10, G.ml4, { color: th.txtSec }]}>
                        AADHAR NUMBER
                    </Text>
                    <View style={[G.rowCenter, G.ph16, G.br14, {
                        backgroundColor: th.inputBg,
                        borderWidth: 1.5,
                        borderColor: th.border,
                        minHeight: 56,
                    }]}>
                        <Ionicons name="card-outline" size={20} color={th.txtSec} style={G.mr12} />
                        <TextInput
                            value={isAadharFocused ? (form.userAadhar ?? "") : (form.userAadhar ? form.userAadhar.replace(/.(?=.{4})/g, '*') : "")}
                            onFocus={() => setIsAadharFocused(true)}
                            onBlur={() => setIsAadharFocused(false)}
                            onChangeText={v => {
                                const num = v.replace(/[^0-9]/g, "").slice(0, 12);
                                set("userAadhar", num || undefined);
                            }}
                            placeholder="12 Digit No"
                            placeholderTextColor={th.isDark ? "#4b5563" : "#9ca3af"}
                            keyboardType="numeric"
                            style={[G.flex1, { color: th.txt, fontSize: 16, fontWeight: "500", paddingVertical: Platform.OS === 'ios' ? 12 : 8 }]}
                        />
                    </View>
                </View>

                <View style={[G.w100, G.mb16]}>
                    <Text style={[G.fs13, G.bold700, G.mb10, G.ml4, { color: th.txtSec }]}>
                        DATE OF BIRTH
                    </Text>
                    <TouchableOpacity style={[G.rowCenter, G.ph16, G.br14, {
                        backgroundColor: th.inputBg,
                        borderWidth: 1.5,
                        borderColor: th.border,
                        minHeight: 56,
                    }]} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
                        <Ionicons name="calendar-outline" size={20} color={th.txtSec} style={G.mr12} />
                        <Text style={[G.fs16, { color: form.userDoB ? th.txt : (th.isDark ? "#4b5563" : "#9ca3af"), fontWeight: '600' }]}>
                            {form.userDoB ? form.userDoB.split('-').reverse().join('-') : "DD-MM-YYYY"}
                        </Text>
                    </TouchableOpacity>
                </View>
                {showDatePicker && (
                    <DateTimePicker
                        value={form.userDoB ? new Date(form.userDoB) : maxDate}
                        mode="date"
                        display="default"
                        maximumDate={maxDate}
                        onChange={handleDateChange}
                    />
                )}
                {(user?.userRole === "CorpAdmin" || user?.userRole === "userAdmin") && (
                    <Toggle
                        label="Account Active"
                        description="Maintain this admin account in the active directory"
                        value={form.userActive}
                        onChange={v => set("userActive", v)}
                        th={th}
                    />
                )}

                <SectionTitle label="Permanent Address" icon="🏠" th={th} />
                <Field label="Address Line" value={form.addresses?.permanent?.line1} onChange={v => setAddress("permanent", "line1", v)} th={th} icon="location-outline" />
                <Row>
                    <Field 
                        label="City" 
                        value={form.addresses?.permanent?.city} 
                        onChange={v => setAddress("permanent", "city", v)}
                        th={th} half icon="business-outline" 
                    />
                    <SelectField 
                        label="District" 
                        value={form.addresses?.permanent?.district} 
                        onPress={() => setPermDistrictVisible(true)} 
                        th={th} half icon="navigate-outline" 
                    />
                </Row>
                <Row>
                    <SelectField 
                        label="State" 
                        value={form.addresses?.permanent?.state} 
                        onPress={() => setPermStateVisible(true)} 
                        th={th} half icon="map-outline" 
                    />
                    <Field label="Pincode" value={form.addresses?.permanent?.pincode} onChange={v => setAddress("permanent", "pincode", v)} th={th} half keyboardType="numeric" icon="pin-outline" />
                </Row>

                <SectionTitle label="Local Address" icon="📍" th={th} />
                <Field label="Address Line" value={form.addresses?.local?.line1} onChange={v => setAddress("local", "line1", v)} th={th} icon="location-outline" />
                <Row>
                    <Field 
                        label="City" 
                        value={form.addresses?.local?.city} 
                        onChange={v => setAddress("local", "city", v)}
                        th={th} half icon="business-outline" 
                    />
                    <SelectField 
                        label="District" 
                        value={form.addresses?.local?.district} 
                        onPress={() => setLocalDistrictVisible(true)} 
                        th={th} half icon="navigate-outline" 
                    />
                </Row>
                <Row>
                    <SelectField 
                        label="State" 
                        value={form.addresses?.local?.state} 
                        onPress={() => setLocalStateVisible(true)} 
                        th={th} half icon="map-outline" 
                    />
                    <Field label="Pincode" value={form.addresses?.local?.pincode} onChange={v => setAddress("local", "pincode", v)} th={th} half keyboardType="numeric" icon="pin-outline" />
                </Row>
            </SectionCard>

            {/* Security change */}
            <SectionCard th={th}>
                <SectionTitle label="Account Security" icon="🔒" th={th} />
                <View style={[
                    G.p12,
                    G.mb16,
                    G.br12,
                    {
                        backgroundColor: th.isDark ? "#1e293b" : "#f8fafc",
                        borderLeftWidth: 4,
                        borderLeftColor: C.warning
                    }
                ]}>
                    <Text style={[G.fs12, { color: th.txtSec, lineHeight: 18, fontWeight: '600' }]}>
                        To update your password, fill in the current and new password fields. Leave empty to keep unchanged.
                    </Text>
                </View>
                <Field label="Current Password" value={form.currentPassword} onChange={v => set("currentPassword", v)} th={th} secureTextEntry icon="lock-closed-outline" />
                <Row>
                    <Field label="New Password" value={form.newPassword} onChange={v => set("newPassword", v)} th={th} secureTextEntry half icon="key-outline" />
                    <Field label="Confirm Password" value={form.confirmPassword} onChange={v => set("confirmPassword", v)} th={th} secureTextEntry half icon="shield-checkmark-outline" />
                </Row>
                <PasswordMatchHint newPwd={form.newPassword} confirmPwd={form.confirmPassword} />
            </SectionCard>

            <SaveButton onPress={save} saving={saving} saved={saved} label="Update Profile" />

        </ScrollView>

        <GenericPicker
            visible={showGroupPicker}
            onClose={() => setShowGroupPicker(false)}
            onSelect={item => setShift("groupName", item.value)}
            options={[
                { label: "MANG (8 Hrs Default)", value: "MANG" },
                { label: "DaNi (12 Hrs Default)", value: "DaNi" },
            ]}
            title="Select Shift Group"
            th={th}
        />

        <GenericPicker
            visible={showShiftNamePicker}
            onClose={() => setShowShiftNamePicker(false)}
            onSelect={item => setShift("shiftName", item.value)}
            options={[
                { label: "Morning", value: "Morning" },
                { label: "Afternoon", value: "Afternoon" },
                { label: "Night1", value: "Night1" },
                { label: "General", value: "General" },
                { label: "Day", value: "Day" },
                { label: "Night2", value: "Night2" },
            ]}
            title="Select Shift Name"
            th={th}
        />

        <StatePicker 
            visible={permStateVisible} 
            onClose={() => setPermStateVisible(false)} 
            onSelect={v => {
                setAddress("permanent", "state", v);
                setAddress("permanent", "city", "");
            }}
        />
        <DistrictPicker 
            visible={permDistrictVisible} 
            onClose={() => setPermDistrictVisible(false)} 
            onSelect={v => setAddress("permanent", "district", v)}
            stateCode={getStateCodeByName(form.addresses?.permanent?.state)}
        />

        <StatePicker 
            visible={localStateVisible} 
            onClose={() => setLocalStateVisible(false)} 
            onSelect={v => {
                setAddress("local", "state", v);
                setAddress("local", "city", "");
            }}
        />
        <DistrictPicker 
            visible={localDistrictVisible} 
            onClose={() => setLocalDistrictVisible(false)} 
            onSelect={v => setAddress("local", "district", v)}
            stateCode={getStateCodeByName(form.addresses?.local?.state)}
        />
    </View>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Main Screen Wrapper
// ─────────────────────────────────────────────────────────────────────────────


const basicAdminUser: React.FC = () => {
    const { user } = useUserContext();
    const isDark = useColorScheme() === "dark";
    const th = useTheme(isDark);
    const token = user?.token || "";
    const router = useRouter();

    return (
        <SafeAreaView style={[G.flex1, { backgroundColor: th.bg }] as any} edges={["top", "bottom"]}>
            <KeyboardAvoidingView
                style={G.flex1 as any}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
            >
                <AppHeader title="User Profile" onBackPress={() => router.back()} />

                <View style={G.flex1 as any}>
                    <AdminUserEditor isDark={isDark} token={token} />
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default basicAdminUser;