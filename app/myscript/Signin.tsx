import { regex } from "@/backend/middleware/validateAuth";
import { httpClient, useAuthContext } from "@/context/AuthContext";
import { showGlobalToast } from "@/hooks/commomFunction";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const LoginScreen = () => {
  const router = useRouter();
  const { login } = useAuthContext();
  const passwordRef = useRef<TextInput | null>(null);

  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ mobile?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotValue, setForgotValue] = useState("");
  const [forgotRole, setForgotRole] = useState<"Admin" | "User">("User");

  const validateField = (field: "mobile" | "password", value: string) => {
    let error = "";
    if (field === "mobile") {
      if (!value.trim()) error = "Mobile number is required";
      else if (!regex.mobile.test(value)) error = "Enter a valid 10-digit mobile number";
    }
    if (field === "password") {
      if (!value.trim()) error = "Password is required";
    }
    setErrors((prev) => ({ ...prev, [field]: error }));
    return !error;
  };

  const handleInputChange = (field: "mobile" | "password", value: string) => {
    setErrors((prev) => ({ ...prev, [field]: "" }));
    if (field === "mobile") setMobile(value);
    else setPassword(value);
  };

  const checkMobileExists = async (m: string) => {
    if (!m || !regex.mobile.test(m)) return false;
    
    try {
      console.log(httpClient.post(`/auth/check-unique`, { userMobile: m }));
      const res = await httpClient.post(`/auth/check-unique`, { userMobile: m });
      console.log(res);
      const exists = res.data?.exists;
      if (!exists) {
        Alert.alert("User not found", "Mobile number not registered.", [
          { text: "Cancel", style: "cancel" },
          { text: "Register", onPress: () => router.push("/myscript/Signup") }
        ]);
        return false;
      }
      passwordRef.current?.focus();
      return true;
    } catch (err) {
      showGlobalToast("Could not verify mobile number", "Error");
      return false;
    }
  };

  const handleLogin = async () => {
    if (!validateField("mobile", mobile) || !validateField("password", password)) return;
    setLoading(true);
    try {
      const res = await httpClient.post(`/auth/login`, { mobile, password });
      
      if (res.data.success) {
        const { token, userSession } = res.data;
        // The context handles sanitization and state updates
        await login({ token, ...userSession });
        showGlobalToast("Login Successful", "Success");
        // Navigation is handled automatically by _layout.tsx
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || "Invalid credentials";
      showGlobalToast(errorMsg, "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Image source={require("../../assets/images/icon.png")} style={styles.logo} />
            <Text style={styles.headerTitle}>MIS Report Management</Text>
          </View>
          
          <View style={styles.middleContainer}>
            {!forgotMode ? (
              <>
                <Text style={styles.title}>User Login</Text>
                <TextInput
                  style={[styles.input, errors.mobile && styles.inputError]}
                  placeholder="Mobile Number"
                  keyboardType="number-pad"
                  value={mobile}
                  maxLength={10}
                  onChangeText={(text) => handleInputChange("mobile", text)}
                  onBlur={() => checkMobileExists(mobile)}
                />
                <TextInput
                  ref={passwordRef}
                  style={[styles.input, errors.password && styles.inputError]}
                  placeholder="Password"
                  secureTextEntry
                  value={password}
                  onChangeText={(t) => handleInputChange("password", t)}
                />
                
                <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
                </TouchableOpacity>

                <View style={styles.iconRow}>
                  <TouchableOpacity onPress={() => setForgotMode(true)} style={styles.iconButton}>
                    <Ionicons name="key-outline" size={18} color="#9a5644" />
                    <Text style={styles.iconButtonText}>Forgot</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push("/myscript/Signup")} style={styles.iconButton}>
                    <Ionicons name="person-add-outline" size={18} color="#2563eb" />
                    <Text style={styles.iconButtonText}>New User</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconButton} onPress={() => BackHandler.exitApp()}>
                    <Ionicons name="exit-outline" size={18} color="#ef4444" />
                    <Text style={[styles.iconButtonText, { color: "#ef4444" }]}>Exit</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.forgotBox}>
                <Text style={styles.title}>Forgot Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder={forgotRole === "Admin" ? "Enter PAN" : "Enter Aadhaar"}
                  value={forgotValue}
                  onChangeText={setForgotValue}
                />
                <TouchableOpacity style={styles.button} onPress={() => {}}>
                  <Text style={styles.buttonText}>Submit Request</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setForgotMode(false)} style={{ marginTop: 20 }}>
                  <Text style={{ color: "#2563eb", fontWeight: '600' }}>Back to Login</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default LoginScreen; 