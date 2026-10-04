import { Ionicons } from "@expo/vector-icons";
import React, { useState, useMemo } from "react";
import {
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useColorScheme
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GST_STATES } from "./gstConstants";

type StatePickerProps = {
    visible: boolean;
    onClose: () => void;
    onSelect: (stateName: string, stateCode: string) => void;
    title?: string;
};

export const StatePicker: React.FC<StatePickerProps> = ({ visible, onClose, onSelect, title = "Select State" }) => {
    const isDark = useColorScheme() === "dark";
    const [search, setSearch] = useState("");

    const filteredStates = useMemo(() => {
        if (!search.trim()) return GST_STATES;
        const q = search.toLowerCase();
        return GST_STATES.filter(s => 
            s.name.toLowerCase().includes(q) || 
            s.code.includes(q)
        );
    }, [search]);

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={[styles.root, isDark && styles.rootDark]}>
                <View style={[styles.header, isDark && styles.headerDark]}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Ionicons name="close" size={24} color={isDark ? "#fff" : "#1e293b"} />
                    </TouchableOpacity>
                    <Text style={[styles.title, isDark && styles.titleDark]}>{title}</Text>
                    <View style={{ width: 40 }} />
                </View>

                <View style={[styles.searchBox, isDark && styles.searchBoxDark]}>
                    <Ionicons name="search" size={20} color="#64748b" style={{ marginRight: 10 }} />
                    <TextInput
                        placeholder="Search state name or code..."
                        placeholderTextColor="#94a3b8"
                        style={[styles.searchInput, isDark && styles.searchInputDark]}
                        value={search}
                        onChangeText={setSearch}
                        autoFocus
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch("")}>
                            <Ionicons name="close-circle" size={18} color="#94a3b8" />
                        </TouchableOpacity>
                    )}
                </View>

                <FlatList
                    data={filteredStates}
                    keyExtractor={item => item.code}
                    renderItem={({ item }) => (
                        <TouchableOpacity 
                            style={[styles.item, isDark && styles.itemDark]}
                            onPress={() => {
                                onSelect(item.name, item.code);
                                onClose();
                                setSearch("");
                            }}
                        >
                            <View style={[styles.codeBadge, isDark && styles.codeBadgeDark]}>
                                <Text style={styles.codeText}>{item.code}</Text>
                            </View>
                            <Text style={[styles.itemName, isDark && styles.itemNameDark]}>{item.name}</Text>
                        </TouchableOpacity>
                    )}
                    contentContainerStyle={{ paddingBottom: 40 }}
                />
            </SafeAreaView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "#f8fafc" },
    rootDark: { backgroundColor: "#0f172a" },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#e2e8f0",
        backgroundColor: "#fff"
    },
    headerDark: { backgroundColor: "#1e293b", borderBottomColor: "#334155" },
    closeBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
    title: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
    titleDark: { color: "#fff" },
    searchBox: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fff",
        margin: 16,
        paddingHorizontal: 16,
        height: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#e2e8f0",
    },
    searchBoxDark: { backgroundColor: "#1e293b", borderColor: "#334155" },
    searchInput: { flex: 1, fontSize: 15, color: "#1e293b" },
    searchInputDark: { color: "#fff" },
    item: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fff",
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#f1f5f9"
    },
    itemDark: { backgroundColor: "#1e293b", borderBottomColor: "#334155" },
    codeBadge: {
        width: 32,
        height: 24,
        backgroundColor: "#f1f5f9",
        borderRadius: 4,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12
    },
    codeBadgeDark: { backgroundColor: "#334155" },
    codeText: { fontSize: 12, fontWeight: "700", color: "#64748b" },
    itemName: { fontSize: 16, color: "#1e293b" },
    itemNameDark: { color: "#f1f5f9" }
});
