import { useAuthContext } from "@/context/AuthContext";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, Alert, BackHandler, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SignoutScreen() {
  const router = useRouter();
  const { logout, loading } = useAuthContext();

  useEffect(() => {
    // We use a small delay to ensure the UI transition is smooth
    const timer = setTimeout(() => {
      showSignoutAlert();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  const showSignoutAlert = () => {
    Alert.alert(
      "Confirm Action",
      "Would you like to logout or exit the app?",
      [
        { 
          text: "Cancel", 
          style: "cancel", 
          onPress: () => router.back() 
        },
        {
          text: "Logout",
          onPress: async () => {
            try {
              // 1. Calling logout will wipe AsyncStorage and set user to null.
              // 2. The Root Layout (_layout.tsx) will automatically redirect to Signin.
              await logout();
            } catch (error) {
              Alert.alert("Error", "Failed to logout safely.");
            }
          },
        },
        // Platform specific Exit option
        ...(Platform.OS === "android"
          ? [
              { 
                text: "Exit App", 
                style: "destructive" as const, 
                onPress: () => BackHandler.exitApp() 
              }
            ]
          : []),
      ],
      { cancelable: false }
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Shows loader if logout is processing or while alert is pending */}
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, justifyContent: "center", alignItems: "center" },
});