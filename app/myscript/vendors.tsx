// VendorScreen.tsx
import { httpClient } from "@/context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";
import { styles } from "../../styles/stylesIndex";

const sanitizePhone = (num) => (num ? String(num).replace(/[^\d+]/g, "") : "");

export default function VendorScreen() {
  // Vendors list + loading
  const [vendors, setVendors] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(false);

  // Modal & form
  const [modalVisible, setModalVisible] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    contactPerson: "",
    mobileNo: "",
    vendorName: "",
    vendorGST: "",
    vendorAddress: "",
  });

  // Contacts & suggestions
  const [contacts, setContacts] = useState([]); // grouped by name with unique numbers
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [showNumberOptions, setShowNumberOptions] = useState(false);

  const typingTimeout = useRef(null);

  // ---------------------------
  // Load vendors from server
  // ---------------------------
  const loadVendors = async () => {
    try {
      setLoadingVendors(true);
      const res = await httpClient.get(`/product/vendor`);
      // Expect array in res.data (Purchase.vendors)
      setVendors(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.log("loadVendors err", err?.response?.data || err.message);
      Alert.alert("Error", "Failed to load vendors.");
    } finally {
      setLoadingVendors(false);
    }
  };

  useEffect(() => {
    loadVendors();
  }, []);

  // ---------------------------
  // Load device contacts (unique numbers) and group by name
  // ---------------------------
  const loadContacts = async () => {
    if (contactsLoaded || loadingContacts) return;
    setLoadingContacts(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Please allow contacts permission to pick from phonebook.");
        setLoadingContacts(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        pageSize: 3000,
        sort: Contacts.SortTypes.FirstName,
      });

      // Build number -> names map to dedupe numbers across sources
      const numberToNames = new Map(); // number -> Set(names)
      (data || []).forEach((c) => {
        const name = c.name || (c.firstName ? `${c.firstName} ${c.lastName || ""}` : "Unknown");
        (c.phoneNumbers || []).forEach((pn) => {
          const n = sanitizePhone(pn.number || "");
          if (!n) return;
          if (!numberToNames.has(n)) numberToNames.set(n, new Set());
          numberToNames.get(n).add(name);
        });
      });

      // Group numbers by a representative name (choose first seen name)
      // We want an array of { id: name, name, numbers: [uniqueNumbers...] }
      const nameToNums = {};
      for (const [num, namesSet] of numberToNames) {
        const names = Array.from(namesSet);
        // pick primary name (first)
        const name = names[0] || "Unknown";
        if (!nameToNums[name]) nameToNums[name] = { id: name, name, numbers: [] };
        if (!nameToNums[name].numbers.includes(num)) nameToNums[name].numbers.push(num);
      }

      const grouped = Object.values(nameToNums).map((g) => ({
        ...g,
        // sort numbers so deterministic
        numbers: g.numbers.sort(),
      }));

      // sort contacts alphabetically
      grouped.sort((a, b) => a.name.localeCompare(b.name));

      setContacts(grouped);
      setContactsLoaded(true);
    } catch (err) {
      console.log("loadContacts err", err);
      Alert.alert("Contacts error", "Failed to load contacts.");
    } finally {
      setLoadingContacts(false);
    }
  };

  // ---------------------------
  // Contact-person input (live suggestions)
  // ---------------------------
  const onContactPersonChange = (text) => {
    setForm((p) => ({ ...p, contactPerson: text }));
    setShowNumberOptions(false);
    setSelectedNumbers([]);

    if (!contactsLoaded) loadContacts();

    if (!text || text.trim().length === 0) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      const q = text.trim().toLowerCase();
      const filtered = contacts.filter((c) => {
        const nameMatch = (c.name || "").toLowerCase().includes(q);
        const numberMatch = c.numbers.some((n) => n.includes(q));
        return nameMatch || numberMatch;
      }).slice(0, 50);
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    }, 180);
  };

  const onSuggestionPress = (contact) => {
    setForm((p) => ({ ...p, contactPerson: contact.name }));

    if (!contact.numbers || contact.numbers.length === 0) {
      setForm((p) => ({ ...p, mobileNo: "" }));
      setShowNumberOptions(false);
      setSelectedNumbers([]);
      setShowSuggestions(false);
      return;
    }

    if (contact.numbers.length === 1) {
      setForm((p) => ({ ...p, mobileNo: sanitizePhone(contact.numbers[0]) }));
      setShowNumberOptions(false);
      setSelectedNumbers([]);
      setShowSuggestions(false);
    } else {
      // multiple numbers, ask user to pick
      setSelectedNumbers(contact.numbers.map((n) => sanitizePhone(n)));
      setShowNumberOptions(true);
      setShowSuggestions(false);
    }
  };

  const onPickNumberFromDropdown = (number) => {
    setForm((p) => ({ ...p, mobileNo: sanitizePhone(number) }));
    setShowNumberOptions(false);
    setSelectedNumbers([]);
  };

  // ---------------------------
  // API: Add vendor
  // POST /api/vendor/add
  // ---------------------------
  const addVendorApi = async (payload) => {
    setSaving(true);
    try {
      await httpClient.post(`/product/vendor/add`, payload);
      await loadVendors();
      Alert.alert("Success", "Vendor added.");
      setModalVisible(false);
    } catch (err) {
      console.log("addVendor err", err?.response?.data || err.message);
      Alert.alert("Error adding vendor", String(err?.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------
  // API: Update vendor
  // PUT /api/vendor/:id
  // ---------------------------
  const updateVendorApi = async (id, payload) => {
    setSaving(true);
    try {
      await httpClient.put(`/product/vendor/${id}`, payload);
      await loadVendors();
      Alert.alert("Success", "Vendor updated.");
      setModalVisible(false);
      setEditingVendor(null);
    } catch (err) {
      console.log("updateVendor err", err?.response?.data || err.message);
      Alert.alert("Error updating vendor", String(err?.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------
  // API: Delete vendor
  // DELETE /api/vendor/:id
  // ---------------------------
  const deleteVendorApi = async (id) => {
    Alert.alert("Confirm Delete", "Are you sure you want to remove this vendor?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await httpClient.delete(`/product/vendor/${id}`);
            await loadVendors();
            Alert.alert("Deleted", "Vendor removed.");
          } catch (err) {
            console.log("deleteVendor err", err?.response?.data || err.message);
            Alert.alert("Error", "Failed to delete vendor.");
          }
        },
      },
    ]);
  };

  // ---------------------------
  // Open add/edit modal
  // ---------------------------
  const openAddModal = () => {
    setEditingVendor(null);
    setForm({
      contactPerson: "",
      mobileNo: "",
      vendorName: "",
      vendorGST: "",
      vendorAddress: "",
    });
    setSelectedNumbers([]);
    setShowNumberOptions(false);
    setModalVisible(true);
  };

  const openEditModal = (item) => {
    setEditingVendor(item);
    setForm({
      contactPerson: item.contactPerson || item.vendorName || "",
      mobileNo: item.mobileNo || "",
      vendorName: item.vendorName || "",
      vendorGST: item.vendorGST || "",
      vendorAddress: item.vendorAddress || "",
    });
    setSelectedNumbers([]);
    setShowNumberOptions(false);
    setModalVisible(true);
  };

  // ---------------------------
  // Handle save (add / update)
  // ---------------------------
  const handleSave = async () => {
    if (!form.contactPerson || !form.mobileNo || !form.vendorName) {
      Alert.alert("Validation", "Please fill Contact Person, Mobile No and Vendor's Trade Name.");
      return;
    }

    const payload = {
      vendorName: form.vendorName,
      contactPerson: form.contactPerson,
      mobileNo: sanitizePhone(form.mobileNo),
      vendorGST: form.vendorGST || null,
      vendorAddress: form.vendorAddress || null,
    };

    if (editingVendor && (editingVendor._id || editingVendor.id)) {
      const id = editingVendor._id || editingVendor.id;
      await updateVendorApi(id, payload);
    } else {
      await addVendorApi(payload);
    }
  };

  // ---------------------------
  // Swipeable right actions (Edit / Delete)
  // ---------------------------
  const renderRightActions = (item) => (
    <View style={{ flexDirection: "row", height: "100%" }}>
      <TouchableOpacity
        onPress={() => openEditModal(item)}
        style={{ backgroundColor: "#0b6cff", width: 78, justifyContent: "center", alignItems: "center" }}
      >
        <Ionicons name="create" size={20} color="#fff" />
        <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", marginTop: 4 }}>Edit</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => deleteVendorApi(item._id || item.id)}
        style={{ backgroundColor: "#dc3545", width: 78, justifyContent: "center", alignItems: "center" }}
      >
        <Ionicons name="trash" size={20} color="#fff" />
        <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", marginTop: 4 }}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  // ---------------------------
  // Render
  // ---------------------------
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Vendors</Text>
          <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
            <Ionicons name="person-add" size={18} color="#fff" />
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* Vendor list */}
        {loadingVendors ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <FlatList
            data={vendors}
            keyExtractor={(item) => String(item._id || item.id || item.vendorId || Math.random())}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item }) => (
              <Swipeable overshootRight={false} renderRightActions={() => renderRightActions(item)}>
                <View style={styles.card}>
                  <View style={styles.avatar}>
                    <Ionicons name="business" size={20} color="#0b6cff" />
                  </View>

                  <View style={styles.info}>
                    <Text style={styles.vendorName}>{item.vendorName}</Text>
                    <Text style={styles.contactText}>{item.contactPerson}</Text>
                    <Text style={styles.mobileText}>{item.mobileNo}</Text>
                  </View>
                </View>
              </Swipeable>
            )}
            ListEmptyComponent={<Text style={{ padding: 12, color: "#666" }}>No vendors yet.</Text>}
          />
        )}

        {/* Add / Edit Modal */}
        <Modal visible={modalVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrapper}>
            <ScrollView contentContainerStyle={styles.modalCard} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>{editingVendor ? "Edit Vendor" : "Add Vendor"}</Text>

              {/* Contact Person (search) */}
              <Text style={styles.label}>Contact Person</Text>
              <TextInput
                style={styles.input}
                placeholder="Type contact name or number"
                value={form.contactPerson}
                onChangeText={onContactPersonChange}
                onFocus={loadContacts}
                autoCorrect={false}
              />

              {/* Suggestions */}
              {showSuggestions && suggestions && suggestions.length > 0 && (
                <View style={styles.suggestionsBox}>
                  <ScrollView style={{ maxHeight: 260 }}>
                    {suggestions.map((c) => (
                      <TouchableOpacity key={c.id} onPress={() => onSuggestionPress(c)} style={styles.suggestionRow}>
                        <Text style={{ fontWeight: "700" }}>{c.name}</Text>
                        <Text style={{ color: "#555", marginTop: 6 }}>{c.numbers.join(" | ")}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Number options when contact has multiple numbers */}
              {showNumberOptions && selectedNumbers && selectedNumbers.length > 0 && (
                <View style={styles.suggestionsBox}>
                  {selectedNumbers.map((n, idx) => (
                    <TouchableOpacity key={idx} onPress={() => onPickNumberFromDropdown(n)} style={styles.suggestionRow}>
                      <Text>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Mobile No */}
              <Text style={styles.label}>Mobile No</Text>
              <TextInput
                style={styles.input}
                placeholder="Mobile number"
                value={form.mobileNo}
                onChangeText={(v) => setForm((p) => ({ ...p, mobileNo: sanitizePhone(v) }))}
                keyboardType="phone-pad"
              />

              {/* Vendor's Trade Name */}
              <Text style={styles.label}>Vendor's Trade Name</Text>
              <TextInput style={styles.input} placeholder="Trade name" value={form.vendorName} onChangeText={(v) => setForm((p) => ({ ...p, vendorName: v }))} />

              {/* GST */}
              <Text style={styles.label}>GST</Text>
              <TextInput style={styles.input} placeholder="GST No" value={form.vendorGST} onChangeText={(v) => setForm((p) => ({ ...p, vendorGST: v.toUpperCase() }))} />

              {/* Address */}
              <Text style={styles.label}>Address</Text>
              <TextInput style={[styles.input, { height: 84 }]} placeholder="Address" value={form.vendorAddress} onChangeText={(v) => setForm((p) => ({ ...p, vendorAddress: v }))} multiline />

              {/* Actions */}
              <View style={styles.actionsRow}>
                <TouchableOpacity onPress={() => { setModalVisible(false); setEditingVendor(null); }} style={[styles.actionBtn, { backgroundColor: "#6c757d" }]}>
                  <Text style={styles.actionBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleSave} style={[styles.actionBtn, { backgroundColor: "#0b6cff", marginLeft: 12 }]}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>{editingVendor ? "Update" : "Save"}</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </GestureHandlerRootView>
  );
}

// ---------------- STYLES ----------------
/*
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F6F8" },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, paddingHorizontal: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderColor: "#eee" },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#111" },
  addButton: { backgroundColor: "#0b6cff", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, flexDirection: "row", alignItems: "center" },
  addButtonText: { color: "#fff", marginLeft: 8, fontWeight: "700" },

  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", padding: 12, borderRadius: 10, marginBottom: 10, elevation: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#eaf4ff", justifyContent: "center", alignItems: "center", marginRight: 12 },
  info: { flex: 1 },
  vendorName: { fontSize: 16, fontWeight: "700", color: "#111" },
  contactText: { fontSize: 13, color: "#444", marginTop: 4 },
  mobileText: { fontSize: 13, color: "#6b7280", marginTop: 2 },

  center: { padding: 20, alignItems: "center" },

  // modal
  modalWrapper: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center" },
  modalCard: { padding: 18, backgroundColor: "#fff", borderRadius: 12, margin: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },

  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 10, backgroundColor: "#fafafa" },

  actionsRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16 },
  actionBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  actionBtnText: { color: "#fff", fontWeight: "700" },

  // suggestions
  suggestionsBox: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, backgroundColor: "#fff", marginTop: 6, marginBottom: 6, maxHeight: 260 },
  suggestionRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
});
*/