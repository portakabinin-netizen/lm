import { regex } from "@/backend/middleware/validateAuth";
import { registerCorpAdmin, registerNonAdmin } from "@/hooks/userQueries";
import { httpClient } from "@/context/AuthContext"; // Use our standardized client
import { sendGlobalSMS, showGlobalToast } from "@/hooks/commomFunction";
import { FormData } from "@/hooks/interface";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const UserRegistration = () => {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otp, setOtp] = useState("");
  const [timer, setTimer] = useState(0);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    userDisplayName: "",
    userEmail: "",
    userMobile: "",
    userPassword: "",
    userRole: "",
    userAadhar: "",
    userDoB: "",
    corporateName: "",
    corporateEmail: "",
    corporateAddress: "",
    corporateCity: "",
    corporateDistrict: "",
    corporateState: "",
    corporatePin: "",
    corporatePAN: "",
    corporateGST: "",
    corporateId: "",
  });

  const handleChange = (key: keyof FormData, value: string) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  /* -------------------------------- TIMER -------------------------------- */
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  /* --------------------------- VALIDATION LOGIC --------------------------- */
  const checkMobile = async () => {
    if (!regex.mobile.test(formData.userMobile)) {
      showGlobalToast("Invalid Mobile: Enter 10-digit mobile!", "Error");
      return;
    }
    try {
      // httpClient already knows the baseURL
      const res = await httpClient.post(`/auth/check-unique`, { userMobile: formData.userMobile });
      if (res.data?.exists) {
        showGlobalToast("Mobile Number already registered", "Info");
        handleChange("userMobile", "");
      } else {
        await sendOtp();
      }
    } catch (err: any) {
      showGlobalToast("Could not verify mobile connection", "Error");
    }
  };

  const sendOtp = async () => {
    try {
      const res = await httpClient.post(`/auth/send-otp`, { mobile: formData.userMobile });
      // Send the confirmation SMS via your hook
      sendGlobalSMS(formData.userMobile, "Verification code for Lead Manager Registration.");
      
      if (res.data?.success) {
        setOtpSent(true);
        setTimer(60);
        showGlobalToast("OTP sent successfully", "Info");
      }
    } catch (err: any) {
      showGlobalToast("Failed to send OTP", "Error");
    }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) return;
    try {
      const res = await httpClient.post(`/auth/verify-otp`, { mobile: formData.userMobile, otp });
      if (res.data?.success) {
        setOtpVerified(true);
        showGlobalToast("OTP Verified", "Success");
      } else {
        showGlobalToast("Invalid OTP entered", "Error");
      }
    } catch (err: any) {
      showGlobalToast("Verification failed", "Error");
    }
  };

  /* --------------------------- DATE PICKER --------------------------- */
  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      const today = new Date();
      const minAgeDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());

      if (date > minAgeDate) {
        showGlobalToast("Minimum age requirement is 18 years.", "Error");
        return;
      }
      const formatted = date.toISOString().split("T")[0];
      handleChange("userDoB", formatted);
    }
  };

  /* --------------------------- FINAL REGISTER --------------------------- */
  const handleRegister = async () => {
    if (!formData.userDoB) {
      showGlobalToast("Please provide Date of Birth", "Error");
      return;
    }

    setLoading(true);
    try {
      let res;
      // These functions should also be updated to use httpClient inside userQueries.ts
      if (formData.userRole === "CorpAdmin") {
        res = await registerCorpAdmin(formData);
      } else {
        res = await registerNonAdmin(formData);
      }

      if (res?.success) {
        showGlobalToast("Account Created Successfully!", "Success");
        // Redirect to sign in after success
        setTimeout(() => router.replace("/myscript/Signin"), 1500);
      } else {
        showGlobalToast(res?.message || "Registration failed", "Error");
      }
    } catch (err: any) {
      showGlobalToast("Server error during registration", "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f9fafb" }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          
          <View style={styles.header}>
            <Image source={require("../../assets/icon.png")} style={styles.logo} />
            <Text style={styles.headerTitle}>Lead Manager</Text>
            <Text style={styles.headerSubtitle}>Create Your Account</Text>
          </View>

          <View style={styles.body}>
            {/* MOBILE INPUT */}
            <TextInput
              style={[styles.input, otpSent && { backgroundColor: "#f3f4f6", color: "#6b7280" }]}
              placeholder="Mobile Number"
              keyboardType="number-pad"
              editable={!otpSent}
              value={formData.userMobile}
              maxLength={10}
              onChangeText={(t) => handleChange("userMobile", t)}
            />

            {!otpSent ? (
              <TouchableOpacity style={styles.btnBlue} onPress={checkMobile}>
                <Text style={styles.btnText}>Send OTP</Text>
              </TouchableOpacity>
            ) : !otpVerified ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Enter 6-digit OTP"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={setOtp}
                />
                <TouchableOpacity style={styles.btnGreen} onPress={verifyOtp}>
                  <Text style={styles.btnText}>Verify OTP</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={timer > 0} onPress={sendOtp} style={{alignItems: 'center', marginTop: 15}}>
                  <Text style={{ color: timer > 0 ? "#9ca3af" : "#2563eb", fontWeight: '500' }}>
                    {timer > 0 ? `Resend OTP in ${timer}s` : "Resend OTP"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={22} color="#10b981" />
                <Text style={{ color: "#10b981", fontWeight: "700" }}>Mobile Verified</Text>
              </View>
            )}

            {/* FULL REGISTRATION FORM */}
            {otpVerified && (
              <View style={{ marginTop: 10 }}>
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  value={formData.userDisplayName}
                  onChangeText={(t) => handleChange("userDisplayName", t)}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Email Address"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={formData.userEmail}
                  onChangeText={(t) => handleChange("userEmail", t)}
                />

                <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={20} color="#4b5563" />
                  <Text style={{marginLeft: 10, color: formData.userDoB ? "#1f2937" : "#9ca3af"}}>
                    {formData.userDoB ? `Date of Birth: ${formData.userDoB}` : "Select Date of Birth (18+)"}
                  </Text>
                </TouchableOpacity>

                {showDatePicker && (
                  <DateTimePicker
                    value={formData.userDoB ? new Date(formData.userDoB) : new Date(new Date().getFullYear() - 18, 0, 1)}
                    mode="date"
                    maximumDate={new Date(new Date().getFullYear() - 18, new Date().getMonth(), new Date().getDate())}
                    onChange={onDateChange}
                  />
                )}

                <TextInput
                  style={styles.input}
                  placeholder="Aadhaar Number (12 Digits)"
                  keyboardType="number-pad"
                  maxLength={12}
                  value={formData.userAadhar}
                  onChangeText={(t) => handleChange("userAadhar", t)}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  secureTextEntry
                  value={formData.userPassword}
                  onChangeText={(t) => handleChange("userPassword", t)}
                />

                <View style={styles.pickerContainer}>
                    <Picker 
                        selectedValue={formData.userRole} 
                        onValueChange={(v) => handleChange("userRole", v)}
                    >
                        <Picker.Item label="Select Your Role" value="" color="#9ca3af" />
                        <Picker.Item label="Corporate Admin" value="CorpAdmin" />
                        <Picker.Item label="Sales & Marketing" value="Sales" />
                        <Picker.Item label="Project Management" value="Project" />
                    </Picker>
                </View>

                {formData.userRole === "CorpAdmin" && (
                  <View style={styles.corpSection}>
                    <Text style={styles.sectionTitle}>Company Information</Text>
                    <TextInput style={styles.input} placeholder="Registered Company Name" onChangeText={(t) => handleChange("corporateName", t)} />
                    <TextInput style={styles.input} placeholder="GST Number" autoCapitalize="characters" onChangeText={(t) => handleChange("corporateGST", t)} />
                  </View>
                )}

                <TouchableOpacity 
                  style={[styles.btnBlue, {marginTop: 20}, loading && {opacity: 0.7}]} 
                  onPress={handleRegister} 
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Register Now</Text>}
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={{ marginTop: 25, alignItems: 'center' }} onPress={() => router.replace("/myscript/Signin")}>
               <Text style={{ color: "#2563eb", fontWeight: "600" }}>Already have an account? Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default UserRegistration;

// Styles remain the same as your provided code
const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: "#f9fafb" },
  header: { alignItems: "center", marginBottom: 20 },
  logo: { width: 60, height: 60, borderRadius: 12, marginBottom: 10 },
  headerTitle: { fontSize: 22, fontWeight: "700", color: "#1e3a8a" },
  headerSubtitle: { fontSize: 14, color: "#6b7280" },
  body: { width: "100%" },
  input: {
    width: "100%",
    height: 50,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderColor: "#d1d5db",
    borderWidth: 1,
  },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 15, justifyContent: 'center' },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
    marginBottom: 12,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    backgroundColor: "#fff",
    marginBottom: 12,
    overflow: 'hidden'
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10, color: "#1e3a8a" },
  btnBlue: { backgroundColor: "#2563eb", padding: 16, borderRadius: 12, alignItems: "center" },
  btnGreen: { backgroundColor: "#10b981", padding: 16, borderRadius: 12, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  corpSection: { backgroundColor: "#eff6ff", padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: "#bfdbfe" }
});