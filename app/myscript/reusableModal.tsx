import { regex } from "@/backend/middleware/validateAuth";
import { showGlobalToast } from "@/hooks/commomFunction";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const ReusableModal = ({ visible , onClose, onSave }) => {
  const [corp, setCorp] = useState({
    corporateName: "",
    corporateEmail: "",
    corporateAddress: "",
    corporateCity: "",
    corporateDistrict: "",
    corporateState: "",
    corporatePin: "",
    corporateGST: "",
  });

  const handleSave = () => {
    if (!regex.name.test(corp.corporateName)) {
      return showGlobalToast("Invalid Corporate Name","Error");
    }
    if (!regex.email.test(corp.corporateEmail)) {
      return showGlobalToast("Invalid Email","Error");
    }
    if (!corp.corporateAddress.trim()) {
      return showGlobalToast("Address required","Error");
    }

    // Default GST if not provided
    if (!corp.corporateGST.trim()) {
      corp.corporateGST = "Unregistered";
    }

    onSave(corp);
  };

  const handleChange = (field, value) => {
    if (field === "corporateGST") value = value.toUpperCase();
    setCorp({ ...corp, [field]: value });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalContainer}
        >
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>Corporate Details</Text>

            <TextInput
              style={styles.input}
              placeholder="Corporate Name *"
              value={corp.corporateName}
              onChangeText={(t) => handleChange("corporateName", t)}
            />

            <TextInput
              style={styles.input}
              placeholder="Corporate Email *"
              value={corp.corporateEmail}
              onChangeText={(t) => handleChange("corporateEmail", t)}
              keyboardType="email-address"
            />

            <TextInput
              style={[styles.input, { height: 80 }]}
              multiline
              placeholder="Corporate Address *"
              value={corp.corporateAddress}
              onChangeText={(t) => handleChange("corporateAddress", t)}
            />

            <TextInput
              style={styles.input}
              placeholder="City"
              value={corp.corporateCity}
              onChangeText={(t) => handleChange("corporateCity", t)}
            />

            <TextInput
              style={styles.input}
              placeholder="District"
              value={corp.corporateDistrict}
              onChangeText={(t) => handleChange("corporateDistrict", t)}
            />

            <TextInput
              style={styles.input}
              placeholder="State"
              value={corp.corporateState}
              onChangeText={(t) => handleChange("corporateState", t)}
            />

            <TextInput
              style={styles.input}
              placeholder="Pin Code"
              keyboardType="number-pad"
              maxLength={6}
              value={corp.corporatePin}
              onChangeText={(t) => handleChange("corporatePin", t)}
            />

            <TextInput
              style={styles.input}
              placeholder="GST Number (Optional)"
              value={corp.corporateGST}
              onChangeText={(t) => handleChange("corporateGST", t)}
              autoCapitalize="characters"
            />

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#00000088",
    justifyContent: "center",
    padding: 16,
  },
  modalContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
  },
  scroll: {
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
    color: "#333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    marginVertical: 6,
  },
  saveBtn: {
    backgroundColor: "#007bff",
    padding: 14,
    borderRadius: 10,
    marginTop: 15,
  },
  saveText: {
    color: "#fff",
    fontWeight: "600",
    textAlign: "center",
  },
  cancelBtn: {
    marginTop: 10,
  },
  cancelText: {
    color: "#ff4444",
    textAlign: "center",
  },
});

export default ReusableModal;
