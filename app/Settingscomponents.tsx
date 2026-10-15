import { C } from "@/hooks/Theme";
import type { Theme } from "@/hooks/Theme";
import React from "react";
import {
    ActivityIndicator,
    Platform,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Image,
    StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUserContext } from "@/context/AuthContext";
import { useRouter } from "expo-router";
import { styles as G, COLORS, mkShadow } from "@/styles/stylesIndex";

// ── SectionCard ───────────────────────────────────────────────────────────────
export const SectionCard: React.FC<{ children: React.ReactNode; th: Theme }> =
    ({ children, th }) => (
        <View style={[
            G.br24, G.pv14, G.ph16, G.mb12,
            {
                backgroundColor: th.card,
                borderColor: th.border,
                borderWidth: 1,
                ...StyleSheet.flatten(mkShadow(th.isDark ? 0 : 4))
            }
        ] as any}>
            {children}
        </View>
    );

// ── SectionTitle ──────────────────────────────────────────────────────────────
export const SectionTitle: React.FC<{ label: string; th: Theme; icon?: string }> =
    ({ label, th, icon }) => (
        <View style={[G.rowCenter, G.mb12] as any}>
            {icon && (
                    <View style={[
                        G.center, G.mr8,
                        {
                            width: 32, height: 32, borderRadius: 16,
                            backgroundColor: th.accent + (th.isDark ? "30" : "15"),
                        }
                    ] as any}>
                       <Text style={G.fs16 as any}>{icon}</Text>
                    </View>
            )}
            <Text style={[
                G.fs13, G.bold800, G.uppercase, G.letter1_8,
                { color: th.txt }
            ] as any}>
                {label}
            </Text>
            <View style={[G.flex1, G.ml12, G.opacity06, { height: 1.5, backgroundColor: th.border }] as any} />
        </View>
    );

// ── Field ─────────────────────────────────────────────────────────────────────
export interface FieldProps {
    label: string;
    value: string | undefined;
    onChange: (v: string | undefined) => void;
    th: Theme;
    placeholder?: string;
    keyboardType?: any;
    autoCapitalize?: any;
    secureTextEntry?: boolean;
    half?: boolean;
    editable?: boolean;
    icon?: string;
    multiline?: boolean;
    numberOfLines?: number;
}

export const Field: React.FC<FieldProps> = ({
    label, value, onChange, th,
    placeholder, keyboardType, autoCapitalize,
    secureTextEntry, half, editable = true, icon,
    multiline, numberOfLines = 1
}) => (
    <View style={[half ? G.w48 : G.w100, G.mb16] as any}>
        <Text style={[
            G.fs13, G.bold700, G.mb10, G.ml4,
            { color: th.txtSec }
        ] as any}>
            {label}
        </Text>
        <View style={[
            multiline ? G.p12 : G.rowCenter, G.ph16, G.minH56, G.br14,
            multiline && G.minH80,
            {
                backgroundColor: editable ? th.inputBg : (th.isDark ? "#0f172a" : "#f1f5f9"),
                borderWidth: 1.5,
                borderColor: th.border,
            }
        ] as any}>
            {icon && !multiline && (
                <View style={[G.alignCenter, G.mr12, { width: 24 }] as any}>
                    <Ionicons name={icon as any} size={20} color={th.txtSec} />
                </View>
            )}
            <TextInput
                multiline={multiline}
                numberOfLines={numberOfLines}
                value={value ?? ""}
                onChangeText={v => onChange(v === "" ? undefined : v)}
                placeholder={placeholder ?? label}
                placeholderTextColor={th.isDark ? "#4b5563" : "#9ca3af"}
                keyboardType={keyboardType ?? "default"}
                autoCapitalize={autoCapitalize ?? "none"}
                secureTextEntry={secureTextEntry}
                editable={editable}
                style={[
                    G.flex1, G.fs16, G.bold700,
                    {
                        color: editable ? th.txt : th.txtSec,
                        paddingVertical: Platform.OS === 'ios' ? 12 : 8,
                    }
                ] as any}
            />
        </View>
    </View>
);

// ── SelectField ──────────────────────────────────────────────────────────────
export interface SelectFieldProps {
    label: string;
    value: string | undefined;
    onPress: () => void;
    th: Theme;
    placeholder?: string;
    half?: boolean;
    icon?: string;
    editable?: boolean;
}

export const SelectField: React.FC<SelectFieldProps> = ({
    label, value, onPress, th,
    placeholder, half, icon, editable = true
}) => (
    <TouchableOpacity 
        onPress={editable ? onPress : undefined}
        activeOpacity={0.7}
        style={[half ? G.w48 : G.w100, G.mb16] as any}
    >
        <Text style={[
            G.fs13, G.bold700, G.mb10, G.ml4,
            { color: th.txtSec }
        ] as any}>
            {label}
        </Text>
        <View style={[
            G.rowCenter, G.ph16, G.minH56, G.br14,
            {
                backgroundColor: editable ? th.inputBg : (th.isDark ? "#0f172a" : "#f1f5f9"),
                borderWidth: 1.5,
                borderColor: th.border,
            }
        ] as any}>
            <View style={[G.alignCenter, G.mr12, { width: 24 }] as any}>
                <Ionicons name={icon as any || "chevron-down-circle"} size={20} color={th.txtSec} />
            </View>
            <Text style={[
                G.flex1, G.fs16, G.bold700,
                { color: value ? th.txt : (th.isDark ? "#4b5563" : "#9ca3af") }
            ] as any}>
                {value || placeholder || `Select ${label}`}
            </Text>
            {editable && <Ionicons name="chevron-forward" size={18} color={th.txtSec} />}
        </View>
    </TouchableOpacity>
);

// ── Row ───────────────────────────────────────────────────────────────────────
export const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <View style={G.rowBetween as any}>
        {children}
    </View>
);

// ── Toggle ────────────────────────────────────────────────────────────────────
export const Toggle: React.FC<{
    label: string;
    value: boolean;
    onChange: (v: boolean) => void;
    th: Theme;
    description?: string;
}> = ({ label, value, onChange, th, description }) => (
    <View style={[
        G.rowCenter, G.justifyBetween, G.pv14,
        { borderBottomWidth: 1, borderBottomColor: th.border }
    ] as any}>
        <View style={[G.flex1, { paddingRight: 20 }] as any}>
            <Text style={[G.fs16, G.bold700, { color: th.txt }] as any}>{label}</Text>
            {description && (
                <Text style={[G.fs13, G.mt4, { color: th.txtSec, lineHeight: 18 }] as any}>{description}</Text>
            )}
        </View>
        <Switch
            value={value}
            onValueChange={onChange}
            trackColor={{ false: th.isDark ? "#334155" : "#e2e8f0", true: C.primary }}
            thumbColor={Platform.OS === 'ios' ? undefined : (value ? "#fff" : "#f1f5f9")}
        />
    </View>
);

// ── SaveButton ────────────────────────────────────────────────────────────────
export const SaveButton: React.FC<{
    onPress: () => void;
    saving: boolean;
    saved: boolean;
    label?: string;
    icon?: string;
}> = ({ onPress, saving, saved, label = "Save Changes", icon = "checkmark-circle" }) => (
    <TouchableOpacity
        onPress={onPress}
        disabled={saving}
        activeOpacity={0.8}
        style={[
            G.rowCenter, G.center, G.mt20, G.mb10, G.br16,
            {
                backgroundColor: saved ? C.success : C.primary,
                height: 58,
                ...StyleSheet.flatten(mkShadow(8))
            }
        ] as any}
    >
        {saving ? (
            <ActivityIndicator color="#fff" />
        ) : (
            <>
                <Ionicons name={saved ? "checkmark-done-circle" : icon as any} size={22} color="#fff" style={G.mr10 as any} />
                <Text style={[G.fs16, G.bold700, { color: "#fff", letterSpacing: 0.5 }] as any}>
                    {saved ? "Changes Saved Successfully" : label}
                </Text>
            </>
        )}
    </TouchableOpacity>
);

// ── GenericPicker ─────────────────────────────────────────────────────────────
export const GenericPicker: React.FC<{
    visible: boolean;
    onClose: () => void;
    onSelect: (item: { label: string; value: string }) => void;
    options: { label: string; value: string }[];
    title: string;
    th: Theme;
}> = ({ visible, onClose, onSelect, options, title, th }) => {
    if (!visible) return null;
    return (
        <View style={[StyleSheet.absoluteFill, { zIndex: 999, backgroundColor: "rgba(0,0,0,0.5)" }] as any}>
            <TouchableOpacity style={G.flex1} onPress={onClose} activeOpacity={1} />
            <View style={[
                G.br24, G.ph16, G.pt16, G.pb40,
                { backgroundColor: th.card, maxHeight: '60%' }
            ] as any}>
                <View style={[G.rowCenter, G.mb20] as any}>
                    <Text style={[G.fs18, G.bold800, G.flex1, { color: th.txt }] as any}>{title}</Text>
                    <TouchableOpacity onPress={onClose}>
                        <Ionicons name="close-circle" size={24} color={th.txtSec} />
                    </TouchableOpacity>
                </View>
                <View style={[G.mb12, { height: 1.5, backgroundColor: th.border, opacity: 0.5 }] as any} />
                <View>
                    {options.map((opt, i) => (
                        <TouchableOpacity 
                            key={i} 
                            onPress={() => { onSelect(opt); onClose(); }}
                            style={[G.pv16, G.ph8, G.rowCenter, { borderBottomWidth: i === options.length - 1 ? 0 : 1, borderBottomColor: th.border }]}
                        >
                            <Ionicons name="radio-button-on" size={18} color={C.primary} style={G.mr12 as any} />
                            <Text style={[G.fs16, G.bold700, { color: th.txt }] as any}>{opt.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </View>
    );
};

// ── ErrorBanner ───────────────────────────────────────────────────────────────
export const ErrorBanner: React.FC<{ message: string | null }> = ({ message }) => {
    if (!message) return null;
    return (
        <View style={[
            G.rowCenter, G.pv16, G.ph16, G.mb20, G.br14,
            { backgroundColor: C.danger + "10", borderColor: C.danger + "30", borderWidth: 1 }
        ] as any}>
            <Ionicons name="alert-circle" size={24} color={C.danger} style={G.mr12 as any} />
            <Text style={[G.fs14, G.bold700, G.flex1, { color: C.danger }] as any}>{message}</Text>
        </View>
    );
};

// ── str helper ────────────────────────────────────────────────────────────────
export const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;


import { AppHeader as MainHeader } from "@/components/AppHeader";
// ── AppHeader ─────────────────────────────────────────────────────────────────
export const AppHeader: React.FC<{ 
    title: string; 
    onBack?: () => void; 
    rightAction?: () => React.ReactNode;
}> = ({ title, onBack, rightAction }) => {
    return (
        <MainHeader 
            title={title} 
            onBackPress={onBack} 
            rightAction={rightAction} 
        />
    );
};

export default function SettingsComponentsDummy() { return null; }