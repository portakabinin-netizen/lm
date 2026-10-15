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
import { GST_DISTRICTS } from "./gstDistricts";

type DistrictPickerProps = {
    visible: boolean;
    onClose: () => void;
    onSelect: (districtName: string) => void;
    stateCode: string;
    title?: string;
};

export const DistrictPicker: React.FC<DistrictPickerProps> = ({ 
    visible, onClose, onSelect, stateCode, title = "Select District" 
}) => {
    const isDark = useColorScheme() === "dark";
    const [search, setSearch] = useState("");

    const districts = useMemo(() => {
        return GST_DISTRICTS[stateCode] || [];
    }, [stateCode]);

    const filteredDistricts = useMemo(() => {
        if (!search.trim()) return districts;
        const q = search.toLowerCase();
        return districts.filter(d => d.toLowerCase().includes(q));
    }, [search, districts]);

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

                {!stateCode && (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                        <Text style={{ color: '#ef4444', fontWeight: '700' }}>Please select a State first!</Text>
                    </View>
                )}

                <View style={[styles.searchBox, isDark && styles.searchBoxDark]}>
                    <Ionicons name="search" size={20} color="#64748b" style={{ marginRight: 10 }} />
                    <TextInput
                        placeholder="Search district..."
                        placeholderTextColor="#94a3b8"
                        style={[styles.searchInput, isDark && styles.searchInputDark]}
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>

                <FlatList
                    data={filteredDistricts}
                    keyExtractor={item => item}
                    renderItem={({ item }) => (
                        <TouchableOpacity 
                            style={[styles.item, isDark && styles.itemDark]}
                            onPress={() => {
                                onSelect(item);
                                onClose();
                                setSearch("");
                            }}
                        >
                            <Text style={[styles.itemName, isDark && styles.itemNameDark]}>{item}</Text>
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <Text style={{ color: '#94a3b8' }}>{stateCode ? "No districts found" : "Select state to see districts"}</Text>
                        </View>
                    }
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
    itemName: { fontSize: 16, color: "#1e293b" },
    itemNameDark: { color: "#f1f5f9" }
});
