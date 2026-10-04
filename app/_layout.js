import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { Stack, useRootNavigationState, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, LogBox, StyleSheet, View } from "react-native";

LogBox.ignoreLogs(['Requirement cycle']);

function ProtectedStack() {
  const { user, loading } = useAuthContext();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const [isNavigationReady, setIsNavigationReady] = useState(false);

  useEffect(() => {
    if (navigationState?.key) {
      setIsNavigationReady(true);
    }
  }, [navigationState?.key]);

  useEffect(() => {
    if (loading || !isNavigationReady) return;

    const currentPath = segments.join("/");
    const isAuthPage = 
      currentPath.toLowerCase().includes("signin") || 
      currentPath.toLowerCase().includes("signup");

    // Guard Logic
    if (!user && !isAuthPage) {
       // Timeout ensures the router is ready for the transition
       const timer = setTimeout(() => router.replace("/myscript/Signin"), 1);
       return () => clearTimeout(timer);
    } else if (user && isAuthPage) {
       const timer = setTimeout(() => router.replace("/myscript/"), 1);
       return () => clearTimeout(timer);
    }
  }, [user, loading, isNavigationReady, segments]);

  if (loading || !isNavigationReady) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="myscript/index" />
      <Stack.Screen name="myscript/Signin" />
      <Stack.Screen name="myscript/Signup" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ProtectedStack />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loaderContainer: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center", 
    backgroundColor: "#fff" 
  },
});