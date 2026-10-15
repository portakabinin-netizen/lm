import { httpClient, useAuthContext } from "@/context/AuthContext";
import SectionsItems from "@/context/RoleBaseMenu.json";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  LayoutAnimation,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { DRAWER_WIDTH, styles } from "./dashboards/styles/styles";

// Import Role Dashboards
import AdminDashboard from "./dashboards/AdminDashboard";
import FinanceDashboard from "./dashboards/FinanceDashboard";
import SalesDashboard from "./dashboards/SalesDashboard";

const ROLE_MAP: Record<string, keyof typeof SectionsItems> = {
  corpadmin: "CorpAdmin",
  "corp admin": "CorpAdmin",
  sales: "Sales",
  finance: "Finance",
};

const DynamicHomeScreen: React.FC = () => {
  const { user, loading, logout } = useAuthContext();
  const router = useRouter();
  
  const [isSystemOnline, setIsSystemOnline] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const drawerX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  // --- 1. CLEANER HEALTH CHECK LOGIC ---
  // Using httpClient means we don't need to manually grab the token or set headers
  const checkStatus = async () => {
    try {
      const response = await httpClient.get(`/auth/health-check`, { timeout: 5000 });
      setIsSystemOnline(response.status === 200);
    } catch (error) {
      setIsSystemOnline(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // 30s is more efficient
    return () => clearInterval(interval);
  }, []);

  // --- 2. DRAWER & ROLE LOGIC ---
  const roleKey = user?.userRole?.toLowerCase() ?? "";
  const resolvedRole = ROLE_MAP[roleKey] || user?.userRole || "Guest";

  const toggleDrawer = (open?: boolean) => {
    const toValue = open ? 0 : -DRAWER_WIDTH;
    Animated.timing(drawerX, { toValue, duration: 250, useNativeDriver: true }).start(() => setDrawerOpen(toValue === 0));
  };

  const toggleSection = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExternalLink = async (item: any) => {
    if (!item.url) return Alert.alert("Error", "URL is missing");
    try {
      if (item.isOpenApp && item.appScheme) {
        const canOpen = await Linking.canOpenURL(item.appScheme);
        if (canOpen) return await Linking.openURL(item.appScheme);
      }
      await WebBrowser.openBrowserAsync(item.url);
    } catch (error) {
      await WebBrowser.openBrowserAsync(item.url);
    }
  };

  const drawerMenu = SectionsItems[resolvedRole as keyof typeof SectionsItems] ?? { sections: [] };
  const sections = useMemo(() => {
    return (drawerMenu.sections || []).map((s: any, index: number) => ({
      key: s.key || `${resolvedRole}-section-${index}`,
      title: s.title,
      items: s.items || [],
    }));
  }, [drawerMenu, resolvedRole]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;

  return (
    <SafeAreaView style={styles.safeContainer}>
      {/* ================= HEADER ================= */}
      <View style={[styles.header, { backgroundColor: isSystemOnline ? "#dcfce7" : "#fee2e2" }]}>
        <TouchableOpacity onPress={() => toggleDrawer(true)}>
          <Ionicons name="menu" size={28} color="#1e3a8a" />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 15 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            <View style={[localStyles.dot, { backgroundColor: isSystemOnline ? "#22c55e" : "#ef4444" }]} />
            {" "}{user?.corporateName}
          </Text>
          <Text style={styles.panGSTHdr}>PAN: {user?.corporatePAN} | GST: {user?.corporateGST}</Text>
        </View>

        <View style={styles.imageContainer}>
          <Image 
            source={{ uri: user?.CorpProfileImage || "https://img.icons8.com/?size=100&id=E6RfmLvxU30R&format=png" }} 
            style={styles.menuImage} 
          />
        </View>
      </View>

      {/* ================= BODY ================= */}
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        {resolvedRole === "CorpAdmin" && <AdminDashboard user={user} />}
        {resolvedRole === "Sales" && <SalesDashboard user={user} />}
        {resolvedRole === "Finance" && <FinanceDashboard user={user} />}
        {!["CorpAdmin", "Sales", "Finance"].includes(resolvedRole) && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text>Welcome, {user?.userDisplayName}</Text>
            <Text style={{ color: 'gray' }}>Dashboard for {resolvedRole} is under construction.</Text>
          </View>
        )}
      </View>

      {/* ================= DRAWER OVERLAY ================= */}
      {drawerOpen && <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => toggleDrawer(false)} />}

      {/* ================= DRAWER MENU ================= */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX: drawerX }] }]}>
        <View style={styles.drawerHeader}>
          <Image source={{ uri: user?.userProfileImage || "https://api.dicebear.com/7.x/micah/png" }} style={styles.menuImage} />
          <TouchableOpacity onPress={() => toggleDrawer(false)}>
            <Ionicons name="close-outline" size={32} color="#dc2626" />
          </TouchableOpacity>
        </View>
        
        <Text style={[styles.panGSTHdr, { paddingHorizontal: 15, marginBottom: 10 }]}>
          {user?.userDisplayName} ({user?.userRole})
        </Text>

        <View style={{ marginTop: 10 }}>
          {sections.map((section) => (
            <View key={section.key}>
              <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection(section.key)}>
                <Text style={styles.drawerSectionTitle}>{section.title}</Text>
                <Ionicons name={openSections[section.key] ? "chevron-up" : "chevron-down"} size={16} color="#666" />
              </TouchableOpacity>

              {openSections[section.key] && section.items.map((item: any, idx: number) => (
                <TouchableOpacity
                  key={`${section.key}-${idx}`}
                  style={styles.drawerItem}
                  onPress={async () => {
                    toggleDrawer(false);
                    if (item.label === "Signout" || item.label === "Logout") return logout();
                    if (item.isOpenApp || item.isOpenWeb) return handleExternalLink(item);
                    if (item.route) router.push(item.route);
                  }}
                >
                  <Ionicons name={item.icon || "ellipse-outline"} size={20} color="#4b5563" />
                  <Text style={styles.drawerItemText}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </Animated.View>
      <Toast />
    </SafeAreaView>
  );
};

const localStyles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 5 },
});

export default DynamicHomeScreen;