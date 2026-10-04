// ─── OtherUserEditor.tsx 
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useGPSCoordinates } from '@/hooks/useGPSCoordinates';
import { useRouter } from "expo-router";
import { appService } from "@/UtilServices/appHelper";
import { useUserContext } from "@/context/AuthContext";
import { C, useTheme } from "@/hooks/Theme";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
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
import { styles as G } from "@/styles/stylesIndex";
import * as Location from 'expo-location';

const getInitials = (displayName?: string) => {
    const name = displayName || "";
    const parts = name.trim().split(/\s+/);
    if (!name.trim()) return "?";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

interface OtherUserStub {
    _id: string;
    userDisplayName: string;
    userRole: string;
    userMobile: string;
    userEmail?: string;
    userActive: boolean;
    userProfileImage?: string;
}

interface OtherForm {
    userDisplayName?: string;
    userEmail?: string;
    userMobile?: string;
    userAadhar?: string;
    userDoB?: string;
    userActive: boolean;
    accessAllow: boolean;
    corporateIds: string[];
    userRole: string;
    locationId?: string;
    userProfileImage?: string;
    newPassword?: string;
    confirmPassword?: string;
    addresses?: {
        permanent?: { line1?: string; city?: string; district?: string; state?: string; pincode?: string; lat?: number; long?: number; };
        local?: { line1?: string; city?: string; district?: string; state?: string; pincode?: string; lat?: number; long?: number; };
    };
    dutyShift?: {
        startFrom?: string;
        durationHrs?: number;
        groupName?: string;
        shiftName?: string;
    };
    allowCashFlow?: boolean;
    location?: { district?: string; lat?: number; long?: number; };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Small helpers
// ─────────────────────────────────────────────────────────────────────────────

const formatToDDMMYYYY = (dateStr: string | undefined | null): string => {
    if (!dateStr) return "";
    const clean = dateStr.trim();
    const parts = clean.split("-");
    if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return clean;
};

const parseToYYYYMMDD = (dateStr: string | undefined | null): string => {
    if (!dateStr) return "";
    const clean = dateStr.trim();
    const parts = clean.split("-");
    if (parts.length === 3 && parts[0].length === 2) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return clean;
};

const roleIcon = (role: string) => (role === "Sales" ? "briefcase" : "construct");
const roleBg = (role: string, active?: boolean) =>
    active
        ? (role === "Sales" ? C.primary + "20" : C.success + "20")
        : C.danger + "15";

const PasswordMatchHint: React.FC<{ newPwd?: string; confirmPwd?: string }> = ({ newPwd, confirmPwd }) => {
    if (!newPwd || !confirmPwd) return null;
    const match = newPwd === confirmPwd;
    return (
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, paddingHorizontal: 4 }}>
            <Ionicons name={match ? "checkmark-circle" : "close-circle"} size={14} color={match ? C.success : C.danger} style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: match ? C.success : C.danger }}>
                {match ? "Passwords match" : "Passwords do not match"}
            </Text>
        </View>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
//  User list modal
// ─────────────────────────────────────────────────────────────────────────────

interface UserPickerProps {
    visible: boolean;
    onClose: () => void;
    users: OtherUserStub[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    isDark: boolean;
}

const UserPickerModal: React.FC<UserPickerProps> = ({
    visible, onClose, users, selectedId, onSelect, isDark,
}) => {
    const th = useTheme(isDark);
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        return q
            ? users.filter(u =>
                u.userDisplayName.toLowerCase().includes(q) ||
                u.userMobile.includes(q) ||
                u.userRole.toLowerCase().includes(q)
            )
            : users;
    }, [users, search]);

    useEffect(() => {
        if (!visible) setSearch("");
    }, [visible]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.8)" }}
                activeOpacity={1}
                onPress={onClose}
            >
                <View
                    style={{
                        position: "absolute",
                        bottom: 0, left: 0, right: 0,
                        backgroundColor: th.card,
                        borderTopLeftRadius: 32, borderTopRightRadius: 32,
                        maxHeight: "80%",
                        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
                    }}
                    onStartShouldSetResponder={() => true}
                >
                    {/* Header */}
                    <View style={{ padding: 24, paddingBottom: 16 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                            <View>
                                <Text style={{ fontSize: 22, fontWeight: "800", color: th.txt }}>Team Directory</Text>
                                <Text style={{ fontSize: 13, color: th.txtSec, marginTop: 4, fontWeight: "500" }}>
                                    {users.length} registered members
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={onClose}
                                style={{
                                    width: 40, height: 40, borderRadius: 20,
                                    backgroundColor: th.isDark ? "#1e293b" : "#f1f5f9",
                                    justifyContent: "center", alignItems: "center",
                                }}
                            >
                                <Ionicons name="close" size={24} color={th.txt} />
                            </TouchableOpacity>
                        </View>

                        {/* Search Bar */}
                        <View style={{
                            flexDirection: "row", alignItems: "center",
                            backgroundColor: th.isDark ? "#020617" : "#f8fafc",
                            borderWidth: 1.5, borderColor: th.border,
                            borderRadius: 16, paddingHorizontal: 16,
                            minHeight: 56,
                        }}>
                            <Ionicons name="search" size={20} color={th.txtSec} style={{ marginRight: 12 }} />
                            <TextInput
                                value={search}
                                onChangeText={setSearch}
                                placeholder="Search by name or role…"
                                placeholderTextColor={th.isDark ? "#4b5563" : "#9ca3af"}
                                style={{ flex: 1, color: th.txt, fontSize: 16, fontWeight: "500", paddingVertical: Platform.OS === 'ios' ? 12 : 8 }}
                                autoCapitalize="none"
                            />
                        </View>
                    </View>

                    {/* Filters */}
                    <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 24, marginBottom: 16 }}>
                        {["All", "Sales", "Project"].map(role => {
                            const active = role === "All" ? !["Sales", "Project"].includes(search) : search === role;
                            return (
                                <TouchableOpacity
                                    key={role}
                                    onPress={() => setSearch(role === "All" ? "" : role)}
                                    style={{
                                        paddingHorizontal: 16, paddingVertical: 8,
                                        borderRadius: 12,
                                        backgroundColor: active ? C.primary : (th.isDark ? "#1e293b" : "#f1f5f9"),
                                        borderWidth: 1,
                                        borderColor: active ? C.primary : th.border,
                                    }}
                                >
                                    <Text style={{ fontSize: 12, fontWeight: "700", color: active ? "#fff" : th.txtSec }}>
                                        {role}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* List */}
                    <ScrollView style={{ paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
                        {filtered.map(u => {
                            const isSelected = selectedId === u._id;
                            return (
                                <TouchableOpacity
                                    key={u._id}
                                    onPress={() => onSelect(u._id)}
                                    activeOpacity={0.7}
                                    style={{
                                        padding: 16,
                                        borderRadius: 20,
                                        marginBottom: 10,
                                        flexDirection: "row", alignItems: "center",
                                        backgroundColor: isSelected ? C.primary + "15" : (th.isDark ? "transparent" : "#fff"),
                                        borderWidth: 1.5,
                                        borderColor: isSelected ? C.primary : "transparent",
                                    }}
                                >
                                    <View style={{
                                        width: 50, height: 50, borderRadius: 25,
                                        backgroundColor: roleBg(u.userRole, u.userActive),
                                        justifyContent: "center", alignItems: "center",
                                        marginRight: 16,
                                        overflow: "hidden",
                                    }}>
                                        {u.userProfileImage ? (
                                            <Image 
                                                source={{ uri: u.userProfileImage }} 
                                                style={{ width: 50, height: 50 }} 
                                                resizeMode="cover" 
                                            />
                                        ) : (
                                            <Text style={{ fontSize: 18, fontWeight: "800", color: u.userActive ? (u.userRole === "Sales" ? C.primary : C.success) : C.danger }}>
                                                {getInitials(u.userDisplayName)}
                                            </Text>
                                        )}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 16, color: th.txt, fontWeight: "700" }}>{u.userDisplayName}</Text>
                                        <Text style={{ fontSize: 13, color: th.txtSec, marginTop: 2, fontWeight: "500" }}>
                                            {u.userRole}  ·  {u.userMobile}
                                        </Text>
                                    </View>
                                    {isSelected && <Ionicons name="checkmark-circle" size={24} color={C.primary} />}
                                </TouchableOpacity>
                            );
                        })}
                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </TouchableOpacity>
        </Modal>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
//  OtherUserEditor
// ─────────────────────────────────────────────────────────────────────────────

export const OtherUserEditor: React.FC<{ isDark?: boolean; token?: string }> = ({ isDark: propDark, token: propToken }) => {
    const { user } = useUserContext();
  const { refresh: refreshGPS } = useGPSCoordinates();
    const systemDark = useColorScheme() === "dark";
    const isDark = propDark ?? systemDark;
    const th = useTheme(isDark);
    const token = propToken ?? (user?.token || "");
    const router = useRouter();
    const corporateId = user?.corporateId;
    const corpAdminId = user?.corpAdminId;

    const [users, setUsers] = useState<OtherUserStub[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showPicker, setShowPicker] = useState(false);
    const [showRolePicker, setShowRolePicker] = useState(false);
    const [showGroupPicker, setShowGroupPicker] = useState(false);
    const [showShiftNamePicker, setShowShiftNamePicker] = useState(false);
    const [form, setForm] = useState<OtherForm>({ userActive: true, accessAllow: false, corporateIds: [], userRole: "Sales" });
    const [listLoading, setListLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [locations, setLocations] = useState<any[]>([]);

    const [permStateVisible, setPermStateVisible] = useState(false);
    const [permDistrictVisible, setPermDistrictVisible] = useState(false);
    const [localStateVisible, setLocalStateVisible] = useState(false);
    const [localDistrictVisible, setLocalDistrictVisible] = useState(false);
    const [ledgerLoading, setLedgerLoading] = useState(false);

    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const set = useCallback((k: keyof OtherForm, v: any) =>
        setForm(p => ({ ...p, [k]: v })), []);

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

    const setShift = useCallback((k: string, v: any) => {
        let val = v;
        if (k === "startFrom" && typeof v === "string") {
            const currentVal = form.dutyShift?.startFrom || "";
            let clean = v.replace(/[^0-9]/g, '');
            if (clean.length > 2) {
                val = clean.slice(0, 2) + ':' + clean.slice(2, 4);
            } else if (clean.length === 2 && v.length > currentVal.length) {
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
                [k]: val
            }
        }));
    }, [form.dutyShift?.startFrom]);

    useEffect(() => {
        (async () => {
            setListLoading(true);
            try {
                const [r, l] = await Promise.all([
                    appService.httpClient.get("/setting/update/other-user", {
                        params: { corporateId, corpAdminId },
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                    appService.httpClient.get("/setting/update/corporate", {
                        params: { corporateId, corpAdminId },
                        headers: { Authorization: `Bearer ${token}` }
                    })
                ]);
                setUsers(r.data?.data ?? []);
                setLocations(l.data?.data?.accessCorporate?.locations || []);
            } catch (e: any) {
                setError(e?.response?.data?.message || e.message);
            } finally {
                setListLoading(false);
            }
        })();
    }, [token, corporateId]);

    const loadUser = async (id: string) => {
        setLoading(true);
        setError(null);
        try {
            const r = await appService.httpClient.get(`/setting/update/other-user/${id}`, {
                params: { corporateId, corpAdminId },
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = r.data?.data ?? {};
            setForm({
                userDisplayName: str(d.userDisplayName),
                userEmail: str(d.userEmail),
                userMobile: str(d.userMobile),
                userAadhar: str(d.userAadhar),
                userDoB: d.userDoB ? formatToDDMMYYYY(new Date(d.userDoB).toISOString().slice(0, 10)) : undefined,
                userActive: typeof d.userActive === "boolean" ? d.userActive : true,
                accessAllow: (() => {
                    const links = d.accessCorporate;
                    if (!Array.isArray(links)) return false;
                    return links.some((lc: any) => lc.dbName === user?.dbName && lc.isActive);
                })(),
                corporateIds: (() => {
                    const links = d.accessCorporate;
                    if (!Array.isArray(links)) return [];
                    return links.filter((lc: any) => lc.isActive).map((lc: any) => String(lc.dbName));
                })(),
                userRole: d.userRole || "Sales",
                locationId: d.accessCorporate?.locationId,
                userProfileImage: str(d.userProfileImage),
                addresses: d.addresses || { permanent: {}, local: {} },
                dutyShift: d.dutyShift || { startFrom: "", durationHrs: 8, groupName: "MANG", shiftName: "General" },
                allowCashFlow: typeof d.allowCashFlow === "boolean" ? d.allowCashFlow : false,
            });
        } catch (e: any) {
            setError(e?.response?.data?.message || e.message);
        } finally {
            setLoading(false);
        }
    };

    const selectUser = (id: string) => {
        setSelectedId(id);
        setShowPicker(false);
        setSaved(false);
        loadUser(id);
    };

    const save = async () => {
        if (!selectedId) { appService.showToast("Please select a team member.", "Error"); return; }
        setSaving(true);
        setError(null);
        try {
            const payload: any = {
                userDisplayName: form.userDisplayName,
                userEmail: form.userEmail,
                userMobile: form.userMobile,
                userAadhar: form.userAadhar,
                userDoB: parseToYYYYMMDD(form.userDoB),
                userActive: form.userActive,
                accessAllow: form.accessAllow,
                corporateIds: form.corporateIds,
                userRole: form.userRole,
                locationId: form.locationId,
                location: form.location,
                userProfileImage: form.userProfileImage,
                addresses: form.addresses,
                dutyShift: form.dutyShift,
                allowCashFlow: form.allowCashFlow,
            };
            if (form.newPassword) payload.newPassword = form.newPassword;

            await appService.httpClient.put(`/setting/update/other-user/${selectedId}`, payload, {
                params: { corporateId, corpAdminId },
                headers: { Authorization: `Bearer ${token}` }
            });

            setSaved(true);
            clearTimeout(timer.current!);
            timer.current = setTimeout(() => setSaved(false), 3000);
            setForm(p => ({ ...p, newPassword: undefined, confirmPassword: undefined }));
        } catch (e: any) {
            setError(e?.response?.data?.message || e.message);
            appService.showToast(e?.response?.data?.message || e.message, "Error");
        } finally {
            setSaving(false);
        }
    };

    const handleCreateLedger = async () => {
        if (!selectedId) return;
        const sUser = users.find(u => u._id === selectedId);
        if (!sUser) return;

        setLedgerLoading(true);
        try {
            const res = await appService.httpClient.get("finance/master", {
                params: { corporateId },
                headers: { Authorization: `Bearer ${token}` }
            });
            const ledgers = res.data?.data?.ledgers || [];
            
            const expectedName = `${sUser.userDisplayName} (Salary)`;
            const existing = ledgers.find((l: any) => 
                (l.refId === selectedId && l.refType === "RUL") ||
                l.ledgerName?.toLowerCase() === expectedName.toLowerCase()
            );

            if (existing) {
                appService.showToast(`Ledger already exists: ${existing.ledgerName}`, "Info");
                setLedgerLoading(false);
                return;
            }

            const payload = {
                corporateId,
                ledgerName: `${sUser.userDisplayName} (Salary)`,
                groupName: "Account Payables",
                openingBalance: 0,
                refId: selectedId,
                refType: "RUL"
            };

            const createRes = await appService.httpClient.post("finance/ledgers", payload, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (createRes.data?.success) {
                appService.showToast("Salary Ledger created successfully", "Success");
            } else {
                appService.showToast("Failed to create ledger", "Error");
            }
        } catch (e: any) {
            appService.showToast(e?.response?.data?.message || e.message, "Error");
        } finally {
            setLedgerLoading(false);
        }
    };

    const selectedUser = users.find(u => u._id === selectedId);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }} edges={["top", "bottom"]}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
                <AppHeader title="Team Access" onBackPress={() => router.back()} />

                {/* User Selector */}
                <View style={[G.p16, { backgroundColor: th.card, borderBottomWidth: 1, borderBottomColor: th.border }] as any}>
                    <TouchableOpacity
                        onPress={() => setShowPicker(true)}
                        activeOpacity={0.8}
                        style={[
                            G.rowCenter, G.br18, G.p14,
                            {
                                backgroundColor: th.isDark ? "#020617" : "#f8fafc",
                                borderWidth: 1.5, borderColor: th.border,
                            }
                        ] as any}
                    >
                        {listLoading ? <ActivityIndicator size="small" color={C.primary} /> : (
                            <View style={[G.flex1, G.rowCenter] as any}>
                                <View style={{
                                    width: 70, height: 70, borderRadius: 35,
                                    backgroundColor: selectedUser ? C.primary + "20" : (th.isDark ? "#1e293b" : "#e2e8f0"),
                                    justifyContent: "center", alignItems: "center", marginRight: 18,
                                    borderWidth: 2, borderColor: selectedUser ? C.primary + "40" : th.border,
                                    overflow: "hidden"
                                }}>
                                    {selectedUser ? (
                                        (form.userProfileImage || selectedUser.userProfileImage) ? (
                                            <Image 
                                                source={{ uri: form.userProfileImage || selectedUser.userProfileImage }} 
                                                style={{ width: 70, height: 70 }} 
                                                resizeMode="cover" 
                                            />
                                        ) : (
                                            <Text style={{ fontSize: 24, fontWeight: "800", color: C.primary }}>
                                                {getInitials(form.userDisplayName || selectedUser.userDisplayName)}
                                            </Text>
                                        )
                                    ) : (
                                        <Ionicons name="people" size={28} color={th.txtSec} />
                                    )}
                                </View>
                                <View style={[G.flex1] as any}>
                                    <Text style={{ fontSize: 18, fontWeight: "800", color: th.txt }}>
                                        {selectedUser ? (form.userDisplayName || selectedUser.userDisplayName) : "Select Team Member"}
                                    </Text>
                                    {!selectedUser && (
                                        <Text style={{ fontSize: 12, color: th.txtSec, fontWeight: "600", marginTop: 2 }}>
                                            Tap to browse directory
                                        </Text>
                                    )}
                                </View>
                            </View>
                        )}
                        <Ionicons name="chevron-down" size={20} color={th.txtSec} style={{ marginLeft: 8 }} />
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                        <ActivityIndicator size="large" color={C.primary} />
                    </View>
                ) : selectedId ? (
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                        <ErrorBanner message={error} />

                        <SectionCard th={th}>
                            <SectionTitle label="Member Information" icon="👤" th={th} />
                            <Field label="Display Name" value={form.userDisplayName} onChange={v => set("userDisplayName", v)} th={th} icon="person-outline" />
                            <Field label="Email" value={form.userEmail} onChange={v => set("userEmail", v)} th={th} keyboardType="email-address" icon="mail-outline" />
                            <Field label="Mobile" value={form.userMobile} onChange={v => set("userMobile", v)} th={th} keyboardType="phone-pad" icon="call-outline" />
                            <Field label="Aadhar No." value={form.userAadhar} onChange={v => set("userAadhar", v)} th={th} keyboardType="numeric" icon="card-outline" />
                            <Field label="DOB" value={form.userDoB} onChange={v => set("userDoB", v)} th={th} placeholder="DD-MM-YYYY" icon="calendar-outline" />

                            {/* Role & Location Assignment */}
                            <View style={[G.mt12, G.pt12, { borderTopWidth: 1, borderTopColor: th.border }]}>
                                <Text style={[G.fs12, G.bold700, G.mb12, { color: th.txtSec }]}>ACCESS LEVEL & BRANCH</Text>
                                <View style={G.mb12}>
                                    <SelectField 
                                        label="User Role" 
                                        value={form.userRole} 
                                        onPress={() => setShowRolePicker(true)} 
                                        th={th} 
                                        icon="shield-outline" 
                                    />
                                </View>

                                <View>
                                    <Text style={[G.fs11, G.bold700, G.mb8, { color: th.txtSec }]}>ASSIGNED OFFICE / BRANCH</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        {locations.map(loc => (
                                            <TouchableOpacity 
                                                key={loc._id}
                                                onPress={() => set("locationId", loc._id)}
                                                style={[G.pv10, G.ph14, G.br12, G.mr8, { backgroundColor: form.locationId === loc._id ? C.success + "20" : th.inputBg, borderWidth: 1.5, borderColor: form.locationId === loc._id ? C.success : th.border }]}
                                            >
                                                <Text style={{ fontSize: 11, fontWeight: "800", color: form.locationId === loc._id ? C.success : th.txt }}>{loc.locationName.toUpperCase()}</Text>
                                                <Text style={{ fontSize: 9, fontWeight: "600", color: th.txtSec, marginTop: 2 }}>{loc.locationType} | {loc.address?.state}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>

                                    <View style={[G.mt12, G.p12, G.br8, { backgroundColor: th.inputBg, borderWidth: 1, borderColor: th.border }]}>
                                        <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                                            <Text style={[G.fs11, G.bold600, { color: th.txtSec, flex: 1 }]}>
                                                {form.location?.lat && form.location?.long 
                                                    ? `📍 Tagged: ${form.location.lat}, ${form.location.long}` 
                                                    : `📍 Base / Remote Site (Untagged)`}
                                            </Text>
                                            <TouchableOpacity 
                                                style={[{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: C.primary + "15" }]}
                                                onPress={async () => {
                                                    try {
                                                        appService.showToast("Fetching coordinates...", "Info");
                                                        const loc = await refreshGPS();
                                                        if (loc && loc.latitude && loc.longitude) {
                                                            const newLoc = { ...form.location, lat: loc.latitude, long: loc.longitude };
                                                            set("location", newLoc);
                                                            appService.showToast("Location tagged successfully!", "Success");
                                                        } else {
                                                            Alert.alert("Error", "Could not fetch GPS location. Make sure GPS is enabled.");
                                                        }
                                                    } catch (e: any) {
                                                        Alert.alert("Error", "Could not fetch GPS location.");
                                                    }
                                                }}
                                            >
                                                <Text style={[G.fs12, G.bold600, { color: C.primary }]}>Tag Location</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>

                                <View style={G.mt12}>
                                    <Text style={[G.fs11, G.bold700, G.mb8, { color: th.txtSec }]}>SHIFT TIMING</Text>
                                    <Row>
                                        <Field label="Start From" value={form.dutyShift?.startFrom || ""} onChange={(v: any) => setShift("startFrom", v)} th={th} placeholder="HH:MM" half icon="time-outline" editable={user?.userRole === "CorpAdmin" || user?.userRole === "userAdmin"} />
                                        <Field label="Duration (Hrs)" value={form.dutyShift?.durationHrs?.toString() || ""} onChange={(v: any) => setShift("durationHrs", parseInt(v) || 0)} th={th} keyboardType="numeric" half icon="hourglass-outline" editable={user?.userRole === "CorpAdmin" || user?.userRole === "userAdmin"} />
                                    </Row>
                                    <View style={[G.mt8, G.mb12]}>
                                        <SelectField 
                                            label="Shift Group" 
                                            value={form.dutyShift?.groupName || "MANG"} 
                                            onPress={() => (user?.userRole === "CorpAdmin" || user?.userRole === "userAdmin") ? setShowGroupPicker(true) : null} 
                                            th={th} 
                                            icon="layers-outline" 
                                        />
                                    </View>
                                    <View style={[G.mb12]}>
                                        <SelectField 
                                            label="Shift Name" 
                                            value={form.dutyShift?.shiftName || "General"} 
                                            onPress={() => (user?.userRole === "CorpAdmin" || user?.userRole === "userAdmin") ? setShowShiftNamePicker(true) : null} 
                                            th={th} 
                                            icon="sunny-outline" 
                                        />
                                    </View>
                                </View>
                            </View>
                        </SectionCard>

                        <SectionCard th={th}>
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
                        </SectionCard>

                        <SectionCard th={th}>
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

                        <SectionCard th={th}>
                            <SectionTitle label="Privileges & Status" icon="🛡️" th={th} />
                            <Toggle label="Account Active" description="Member can login and perform assigned tasks" value={form.userActive} onChange={v => set("userActive", v)} th={th} />
                            <Toggle label="Master Access" description="Allow member to access systems of this administrator" value={form.accessAllow} onChange={v => set("accessAllow", v)} th={th} />
                            <Toggle label="Allow Cash Flow" description="Member can manage received & payment transactions" value={!!form.allowCashFlow} onChange={v => set("allowCashFlow", v)} th={th} />
                        </SectionCard>

                        <SectionCard th={th}>
                            <SectionTitle label="Ledger & Finance" icon="💰" th={th} />
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 4 }}>
                                <View style={{ flex: 1, paddingRight: 16 }}>
                                    <Text style={{ fontSize: 15, fontWeight: "700", color: th.txt }}>Salary Ledger</Text>
                                    <Text style={{ fontSize: 12, color: th.txtSec, marginTop: 4 }}>Create a ledger account for salary processing</Text>
                                </View>
                                <TouchableOpacity 
                                    onPress={handleCreateLedger} 
                                    disabled={ledgerLoading}
                                    style={{ backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}>
                                    {ledgerLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>Create Ledger</Text>}
                                </TouchableOpacity>
                            </View>
                        </SectionCard>

                        {form.accessAllow && (
                            <SectionCard th={th}>
                                <SectionTitle label="Business Assignments" icon="🏢" th={th} />
                                <Text style={[G.fs13, G.mb16, { color: th.txtSec, paddingHorizontal: 4 }] as any}>
                                    Select which companies this member can view:
                                </Text>
                                {(user?.accessCorporate || []).map((corp: any) => {
                                    const isAssigned = form.corporateIds.includes(String(corp._id));
                                    return (
                                        <TouchableOpacity
                                            key={corp._id}
                                            onPress={() => {
                                                const current = form.corporateIds;
                                                const updated = isAssigned 
                                                    ? current.filter(id => id !== String(corp._id))
                                                    : [...current, String(corp._id)];
                                                set("corporateIds", updated);
                                            }}
                                            style={[
                                                G.rowCenter, G.p14, G.br16, G.mb8,
                                                {
                                                    backgroundColor: isAssigned ? C.primary + (th.isDark ? "30" : "10") : (th.isDark ? "#020617" : "#f8fafc"),
                                                    borderWidth: 1.5,
                                                    borderColor: isAssigned ? C.primary : th.border
                                                }
                                            ] as any}
                                        >
                                            <View style={[
                                                G.center, G.mr12,
                                                { width: 40, height: 40, borderRadius: 20, backgroundColor: isAssigned ? C.primary : (th.isDark ? "#1e293b" : "#e2e8f0") }
                                            ] as any}>
                                                <Ionicons name="business" size={20} color={isAssigned ? "#fff" : th.txtSec} />
                                            </View>
                                            <View style={G.flex1 as any}>
                                                <Text style={[G.fs15, G.bold700, { color: isAssigned ? (th.isDark ? C.primarySoft : C.primary) : th.txt }] as any}>
                                                    {corp.corporateName}
                                                </Text>
                                                <Text style={[G.fs12, G.bold800, G.uppercase, { color: th.txtSec }] as any}>
                                                    {corp.corporatePAN || "No PAN"}
                                                </Text>
                                            </View>
                                            <Ionicons 
                                                name={isAssigned ? "checkbox" : "square-outline"} 
                                                size={24} 
                                                color={isAssigned ? C.primary : th.txtSec} 
                                            />
                                        </TouchableOpacity>
                                    );
                                })}
                            </SectionCard>
                        )}

                        <SectionCard th={th}>
                            <SectionTitle label="Reset Credentials" icon="🔐" th={th} />
                            <Row>
                                <Field label="New Password" value={form.newPassword} onChange={v => set("newPassword", v)} th={th} secureTextEntry half icon="lock-closed-outline" />
                                <Field label="Confirm Password" value={form.confirmPassword} onChange={v => set("confirmPassword", v)} th={th} secureTextEntry half icon="shield-checkmark-outline" />
                            </Row>
                            <PasswordMatchHint newPwd={form.newPassword} confirmPwd={form.confirmPassword} />
                        </SectionCard>

                        <SaveButton onPress={save} saving={saving} saved={saved} label="Update Member Access" />
                    </ScrollView>
                ) : (
                    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 40 }}>
                        <Ionicons name="people-outline" size={64} color={th.isDark ? "#1e293b" : "#e2e8f0"} style={{ marginBottom: 20 }} />
                        <Text style={{ fontSize: 18, fontWeight: "800", color: th.txt }}>Directory Empty</Text>
                        <Text style={{ fontSize: 14, color: th.txtSec, textAlign: "center", marginTop: 8, lineHeight: 22 }}>Please select a team member from the selector above to manage their account details.</Text>
                    </View>
                )}

                <UserPickerModal
                    visible={showPicker}
                    onClose={() => setShowPicker(false)}
                    users={users}
                    selectedId={selectedId}
                    onSelect={selectUser}
                    isDark={isDark}
                />

                <GenericPicker
                    visible={showRolePicker}
                    onClose={() => setShowRolePicker(false)}
                    onSelect={item => set("userRole", item.value)}
                    options={[
                        { label: "USERADMIN", value: "userAdmin" },
                        { label: "SALES", value: "Sales" },
                        { label: "PROJECT", value: "Project" },
                        { label: "FINANCE", value: "Finance" },
                    ]}
                    title="Select User Role"
                    th={th}
                />

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
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default OtherUserEditor;