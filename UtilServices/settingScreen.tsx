import { AdminUserEditor } from "@/app/basicAdminUser";
import { CorporateEditor } from "@/app/basicCorporate";
import { useGPSCoordinates } from "@/hooks/useGPSCoordinates";
import { OtherUserEditor } from "@/app/basicOtherUser";
import { C, useTheme } from "@/hooks/Theme";
import React, { useState } from "react";
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

type Section = "corporate" | "adminUser" | "otherUser";

interface SettingsScreenProps {
    isDark: boolean;
    token: string;
    // navigation is injected automatically by React Navigation; mark optional
    // so TypeScript doesn't force callers to pass it.
    navigation?: {
        goBack: () => void;
        [key: string]: any;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Section definitions
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_OPTIONS: {
    key: Section;
    label: string;
    icon: string;
    description: string;
}[] = [
        { key: "corporate", label: "Corporate", icon: "🏢", description: "Company info, bank, tax & API" },
        { key: "adminUser", label: "My Profile", icon: "👤", description: "Personal details & password" },
        { key: "otherUser", label: "Other Users", icon: "👥", description: "Manage Sales & Project users" },
    ];

// ─────────────────────────────────────────────────────────────────────────────
//  SettingsScreen
// ─────────────────────────────────────────────────────────────────────────────

const SettingsScreen: React.FC<SettingsScreenProps> = ({ isDark, token, navigation }) => {
    const th = useTheme(isDark);
    const [section, setSection] = useState<Section>("corporate");
    const [showSectionPicker, setShowSectionPicker] = useState(false);
    const { refresh: refreshGPS } = useGPSCoordinates();

    const current = SECTION_OPTIONS.find(s => s.key === section)!;

    // Safe back — works whether navigation is injected or missing
    const goBack = () => {
        if (navigation?.goBack) {
            navigation.goBack();
        }
        // else: no-op; avoids the crash in isolated renders
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: th.bg }}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
            >
                {/* ── Header ─────────────────────────────────────────────────── */}
                <View style={{
                    flexDirection: "row", alignItems: "center",
                    backgroundColor: th.card,
                    borderBottomWidth: 1, borderBottomColor: th.border,
                    paddingHorizontal: 14, paddingVertical: 12,
                }}>
                    {/* Back button */}
                    <TouchableOpacity
                        onPress={goBack}
                        activeOpacity={0.7}
                        style={{
                            width: 36, height: 36, borderRadius: 18,
                            backgroundColor: th.inputBg,
                            borderWidth: 1, borderColor: th.border,
                            justifyContent: "center", alignItems: "center",
                            marginRight: 12,
                        }}
                    >
                        <Text style={{ fontSize: 20, color: th.txt, lineHeight: 24, marginLeft: -2 }}>‹</Text>
                    </TouchableOpacity>

                    {/* Title */}
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: "700", color: th.txt }}>Settings</Text>
                        <Text style={{ fontSize: 10, color: th.txtSec, marginTop: 1 }}>
                            {current.description}
                        </Text>
                    </View>

                    {/* Section switcher pill */}
                    <TouchableOpacity
                        onPress={() => setShowSectionPicker(true)}
                        activeOpacity={0.8}
                        style={{
                            flexDirection: "row", alignItems: "center",
                            backgroundColor: C.primary + "15",
                            borderWidth: 1, borderColor: C.primary + "40",
                            borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
                            gap: 5,
                        }}
                    >
                        <Text style={{ fontSize: 14 }}>{current.icon}</Text>
                        <Text style={{ fontSize: 12, color: C.primary, fontWeight: "700" }}>
                            {current.label}
                        </Text>
                        <Text style={{ fontSize: 10, color: C.primary }}>▾</Text>
                    </TouchableOpacity>
                </View>

                {/* ── Section picker modal ──────────────────────────────────── */}
                <Modal
                    visible={showSectionPicker}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowSectionPicker(false)}
                >
                    <TouchableOpacity
                        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-start" }}
                        activeOpacity={1}
                        onPress={() => setShowSectionPicker(false)}
                    >
                        <View style={{
                            marginTop: 68, marginHorizontal: 16,
                            backgroundColor: th.card,
                            borderRadius: 16, borderWidth: 1, borderColor: th.border,
                            overflow: "hidden",
                            shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: 0.25, shadowRadius: 16, elevation: 12,
                        }}>
                            {SECTION_OPTIONS.map((opt, idx) => (
                                <TouchableOpacity
                                    key={opt.key}
                                    onPress={() => { setSection(opt.key); setShowSectionPicker(false); }}
                                    activeOpacity={0.75}
                                    style={{
                                        flexDirection: "row", alignItems: "center",
                                        padding: 14,
                                        borderBottomWidth: idx < SECTION_OPTIONS.length - 1 ? 1 : 0,
                                        borderBottomColor: th.border,
                                        backgroundColor: section === opt.key ? C.primary + "12" : "transparent",
                                    }}
                                >
                                    <View style={{
                                        width: 38, height: 38, borderRadius: 10,
                                        backgroundColor: section === opt.key ? C.primary + "20" : th.inputBg,
                                        justifyContent: "center", alignItems: "center",
                                        marginRight: 12,
                                        borderWidth: 1,
                                        borderColor: section === opt.key ? C.primary + "40" : th.border,
                                    }}>
                                        <Text style={{ fontSize: 17 }}>{opt.icon}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{
                                            fontSize: 13,
                                            fontWeight: section === opt.key ? "700" : "500",
                                            color: section === opt.key ? C.primary : th.txt,
                                        }}>
                                            {opt.label}
                                        </Text>
                                        <Text style={{ fontSize: 11, color: th.txtSec, marginTop: 1 }}>
                                            {opt.description}
                                        </Text>
                                    </View>
                                    {section === opt.key && (
                                        <Text style={{ color: C.primary, fontSize: 16 }}>✓</Text>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </TouchableOpacity>
                </Modal>

                {/* ── Active sub-screen ─────────────────────────────────────── */}
                <View style={{ flex: 1 }}>
                    {section === "corporate" && <CorporateEditor isDark={isDark} token={token} refreshGPS={refreshGPS} />}
                    {section === "adminUser" && <AdminUserEditor isDark={isDark} token={token} />}
                    {section === "otherUser" && <OtherUserEditor isDark={isDark} token={token} />}
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default SettingsScreen;