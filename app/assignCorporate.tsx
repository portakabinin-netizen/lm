import { appService } from "@/UtilServices/appHelper";
import { AppHeader } from "@/components/AppHeader";
import { useUserContext } from "@/context/AuthContext";
import { C, useTheme } from "@/hooks/Theme";
import { styles as G } from "@/styles/stylesIndex";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Keyboard,
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
    Row,
    SaveButton,
    SectionCard,
    SectionTitle,
    Toggle
} from "./Settingscomponents";

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

interface FoundUser {
    _id: string;
    userDisplayName: string;
    userRole: string;
    userMobile: string;
    userAadhar?: string;
    userEmail?: string;
    userActive: boolean;
    accessCorporate?: Array<{ corporateName: string; corporatePAN: string; dbName: string; locationId?: string; isActive: boolean }>;
}

interface AssignForm {
    userActive: boolean;
    accessAllow: boolean;
    corporateIds: string[];
    newPassword?: string;
    confirmPassword?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  AssignCorporate Component
// ─────────────────────────────────────────────────────────────────────────────

const AssignCorporate: React.FC = () => {
    const { user } = useUserContext();
    const isDark = useColorScheme() === "dark";
    const th = useTheme(isDark);
    const token = user?.token || "";
    const router = useRouter();
    const corpAdminId = user?.corpAdminId || user?._id;

    const [searchQuery, setSearchQuery] = useState("");
    const [searching, setSearching] = useState(false);
    const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
    const [form, setForm] = useState<AssignForm>({ userActive: true, accessAllow: false, corporateIds: [] });
    const [saving, setSaving] = useState(false);
    const [unlinking, setUnlinking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const set = useCallback((k: keyof AssignForm, v: any) =>
        setForm(p => ({ ...p, [k]: v })), []);

    const onSearch = async () => {
        if (searchQuery.trim().length < 4) {
            appService.showToast("Please enter at least 4 characters", "Info");
            return;
        }
        Keyboard.dismiss();
        setSearching(true);
        setError(null);
        setFoundUser(null);
        try {
            const r = await appService.httpClient.get("/setting/search/user", {
                params: { query: searchQuery.trim() },
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = r.data?.data;
            if (d) {
                setFoundUser(d);
                // Pre-fill form from user's current access
                const links = d.accessCorporate || [];
                const isLinkedToMe = Array.isArray(links) && links.some((l: any) => l.dbName === user?.dbName);

                setForm({
                    userActive: typeof d.userActive === "boolean" ? d.userActive : true,
                    accessAllow: isLinkedToMe,
                    corporateIds: isLinkedToMe ? links.filter((l: any) => l.isActive).map((l: any) => l.dbName) : [],
                });
            }
        } catch (e: any) {
            setError(e?.response?.data?.message || "User search failed. Please try again.");
            appService.showToast(e?.response?.data?.message || "User not found", "Error");
        } finally {
            setSearching(false);
        }
    };

    const onSave = async () => {
        if (!foundUser) return;
        setSaving(true);
        setError(null);
        try {
            await appService.httpClient.put(`/setting/assign-corporate/${foundUser._id}`, {
                userActive: form.userActive,
                accessAllow: form.accessAllow,
                corporateIds: form.corporateIds,
                newPassword: form.newPassword,
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            appService.showToast("Permissions updated successfully", "Success");
            // Refresh local state
            onSearch();
        } catch (e: any) {
            setError(e?.response?.data?.message || e.message);
            appService.showToast(e?.response?.data?.message || e.message, "Error");
        } finally {
            setSaving(false);
        }
    };

    const onUnlink = () => {
        if (!foundUser) return;
        Alert.alert(
            "Unlink User",
            `Are you sure you want to remove ${foundUser.userDisplayName} from your administration?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Unlink",
                    style: "destructive",
                    onPress: async () => {
                        setUnlinking(true);
                        try {
                            await appService.httpClient.delete(`/setting/assign-corporate/${foundUser._id}`, {
                                headers: { Authorization: `Bearer ${token}` }
                            });
                            appService.showToast("User unlinked successfully", "Success");
                            setFoundUser(null);
                            setSearchQuery("");
                        } catch (e: any) {
                            appService.showToast(e?.response?.data?.message || e.message, "Error");
                        } finally {
                            setUnlinking(false);
                        }
                    }
                }
            ]
        );
    };

    const isLinkedToMe = Array.isArray(foundUser?.accessCorporate) && foundUser.accessCorporate.some(c => c.dbName === user?.dbName);

    return (
        <SafeAreaView style={[G.safeRoot, { backgroundColor: C.primary }] as any} edges={["top"]}>
            <AppHeader title="Assign Corporate" onBackPress={() => router.back()} />
            <View style={[G.body, { backgroundColor: th.bg }] as any}>
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                >

                    {/* Search Header */}
                    <View style={[G.p16, { backgroundColor: th.card, borderBottomWidth: 1, borderBottomColor: th.border }] as any}>
                        <Text style={[G.fs13, G.bold700, G.mb12, { color: th.txtSec }] as any}>FIND USER TO ASSIGN</Text>
                        <View style={{
                            flexDirection: "row", alignItems: "center",
                            backgroundColor: th.isDark ? "#020617" : "#f8fafc",
                            borderWidth: 1.5, borderColor: th.border,
                            borderRadius: 16, paddingHorizontal: 16,
                            minHeight: 56,
                        }}>
                            <Ionicons name="search" size={20} color={th.txtSec} style={{ marginRight: 12 }} />
                            <TextInput
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder="Mobile / Aadhar no"
                                placeholderTextColor={th.isDark ? "#4b5563" : "#9ca3af"}
                                style={{ flex: 1, color: th.txt, fontSize: 16, fontWeight: "600", paddingVertical: Platform.OS === 'ios' ? 12 : 8 }}
                                autoCapitalize="none"
                                keyboardType="numeric"
                                onSubmitEditing={onSearch}
                            />
                            {searching ? (
                                <ActivityIndicator size="small" color={C.primary} />
                            ) : (
                                <TouchableOpacity onPress={onSearch}>
                                    <Text style={{ color: C.primary, fontWeight: "800" }}>SEARCH</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                        <ErrorBanner message={error} />

                        {foundUser ? (
                            <>
                                {/* User Profile Card */}
                                <SectionCard th={th}>
                                    <SectionTitle label="Profile Found" th={th} />
                                    <View style={[G.rowCenter, G.mb8] as any}>
                                        <View style={[
                                            G.center, G.mr12,
                                            { width: 48, height: 48, borderRadius: 24, backgroundColor: foundUser.userActive ? C.primary + "20" : C.danger + "20" }
                                        ] as any}>
                                            <Ionicons name="person" size={24} color={foundUser.userActive ? C.primary : C.danger} />
                                        </View>
                                        <View style={G.flex1 as any}>
                                            <Text style={[G.fs16, G.bold800, { color: th.txt }] as any}>{foundUser.userDisplayName}</Text>
                                            <Text style={[G.fs13, G.bold700, { color: th.txtSec }] as any}>{foundUser.userRole} · {foundUser.userMobile}</Text>
                                        </View>
                                        <View style={[G.br8, { backgroundColor: foundUser.userActive ? C.success + "20" : C.danger + "20", padding: 6, paddingHorizontal: 10 }] as any}>
                                            <Text style={{ color: foundUser.userActive ? C.success : C.danger, fontWeight: "800", fontSize: 10 }}>{foundUser.userActive ? "ACTIVE" : "INACTIVE"}</Text>
                                        </View>
                                    </View>

                                    {foundUser.userAadhar && (
                                        <View style={[G.rowCenter, G.p12, G.br12, { backgroundColor: th.isDark ? "#020617" : "#f1f5f9" }] as any}>
                                            <Ionicons name="card-outline" size={18} color={th.txtSec} style={{ marginRight: 10 }} />
                                            <Text style={{ color: th.txt, fontWeight: "600" }}>Aadhar: {foundUser.userAadhar}</Text>
                                        </View>
                                    )}
                                </SectionCard>

                                {/* Access Privileges */}
                                <SectionCard th={th}>
                                    <SectionTitle label="Privileges & Status" icon="🛡️" th={th} />
                                    <Toggle
                                        label="Account Active"
                                        description="User can login and perform assigned tasks"
                                        value={form.userActive}
                                        onChange={v => set("userActive", v)}
                                        th={th}
                                    />
                                    <Toggle
                                        label="Master Access"
                                        description="Allow user to access systems of this administrator"
                                        value={form.accessAllow}
                                        onChange={v => set("accessAllow", v)}
                                        th={th}
                                    />
                                </SectionCard>

                                {/* Reset Credentials */}
                                <SectionCard th={th}>
                                    <SectionTitle label="Reset Credentials" icon="🔐" th={th} />
                                    <Row>
                                        <Field 
                                            label="New Password" 
                                            value={form.newPassword} 
                                            onChange={v => set("newPassword", v)} 
                                            th={th} 
                                            secureTextEntry 
                                            half 
                                            icon="lock-closed-outline" 
                                        />
                                        <Field 
                                            label="Confirm" 
                                            value={form.confirmPassword} 
                                            onChange={v => set("confirmPassword", v)} 
                                            th={th} 
                                            secureTextEntry 
                                            half 
                                            icon="shield-checkmark-outline" 
                                        />
                                    </Row>
                                    {form.newPassword && form.confirmPassword && (
                                        <View style={[G.rowCenter, G.mb8, { paddingHorizontal: 4 }] as any}>
                                            <Ionicons 
                                                name={form.newPassword === form.confirmPassword ? "checkmark-circle" : "close-circle"} 
                                                size={14} 
                                                color={form.newPassword === form.confirmPassword ? C.success : C.danger} 
                                                style={{ marginRight: 6 }} 
                                            />
                                            <Text style={{ fontSize: 12, fontWeight: "600", color: form.newPassword === form.confirmPassword ? C.success : C.danger }}>
                                                {form.newPassword === form.confirmPassword ? "Passwords Match" : "Passwords Do Not Match"}
                                            </Text>
                                        </View>
                                    )}
                                </SectionCard>

                                {/* Business Assignments */}
                                {form.accessAllow && (
                                    <SectionCard th={th}>
                                        <SectionTitle label="Business Assignments" th={th} />
                                        <Text style={[G.fs13, G.mb16, { color: th.txtSec, paddingHorizontal: 4 }] as any}>
                                            Select which companies this user can view:
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

                                {/* Action Buttons */}
                                <SaveButton 
                                    onPress={onSave} 
                                    saving={saving} 
                                    saved={false} 
                                    label={isLinkedToMe ? "UPDATE ASSIGNMENTS" : "LINK TO CORPORATE"} 
                                    icon="link-outline"
                                />

                                {isLinkedToMe && (
                                    <TouchableOpacity
                                        onPress={onUnlink}
                                        disabled={unlinking}
                                        activeOpacity={0.7}
                                        style={[
                                            G.rowCenter, G.center, G.mb12, G.br16,
                                            {
                                                height: 58,
                                                backgroundColor: "transparent",
                                                borderWidth: 2,
                                                borderColor: C.danger,
                                            }
                                        ] as any}
                                    >
                                        {unlinking ? (
                                            <ActivityIndicator color={C.danger} />
                                        ) : (
                                            <>
                                                <Ionicons name="trash-outline" size={20} color={C.danger} style={G.mr10 as any} />
                                                <Text style={[G.fs16, G.bold700, { color: C.danger }] as any}>UNLINK FROM MY ADMINISTRATION</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                )}
                            </>
                        ) : (
                            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 40, marginTop: 60 }}>
                                <Ionicons name="search-outline" size={80} color={th.isDark ? "#1e293b" : "#e2e8f0"} style={{ marginBottom: 20 }} />
                                <Text style={{ fontSize: 20, fontWeight: "800", color: th.txt, textAlign: "center" }}>Search for a User</Text>
                                <Text style={{ fontSize: 14, color: th.txtSec, textAlign: "center", marginTop: 12, lineHeight: 22 }}>
                                    Enter a mobile number or Aadhar ID to find a registered user and assign them to your corporates.
                                </Text>
                            </View>
                        )}
                    </ScrollView>
                </KeyboardAvoidingView>
            </View>
        </SafeAreaView>
    );
};

export default AssignCorporate;
