import CallStatusManager from '@/components/CallStatusManager';
import VisitingCardGenerator from '@/components/VisitingCardGenerator';
import { AuthProvider, useUserContext } from '@/context/AuthContext';
import { appService } from '@/UtilServices/appHelper';
import '@/UtilServices/BackgroundTasks';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Image,
  LogBox,
  StyleSheet,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// 🚀 Keep native splash screen visible until JS is ready to take over
SplashScreen.preventAutoHideAsync().catch(() => {
  /* ignore error */
});

import { StatusBar } from 'expo-status-bar';

import ActivityModal from '@/modal/ActivityModal';
import BroadcastAlertModal from '@/modal/BroadcastAlertModal';
import LeadModal from '@/modal/LeadModal';
import CorporateSwitchOverlay from '@/components/CorporateSwitchOverlay';
LogBox.ignoreLogs([
  'Require cycle',
  'setLayoutAnimationEnabledExperimental is currently a no-op in the New Architecture.',
  'Header Image Fetch Error',
  'User Image Fetch Error',
  'Analytics fetch',
]);

import { requestAllAppPermissions } from '@/hooks/unifiedPermissions';

// ─── Permissions — runs once on mount only ────────────────────────────────────
const requestAllPermissions = async (): Promise<boolean> => {
  await requestAllAppPermissions();
  return true; // We don't block the UI, just notify via alerts in the helper
};

// ─── ProtectedStack ───────────────────────────────────────────────────────────
const ProtectedStack = React.memo(function ProtectedStack() {
  const { user, loading } = useUserContext();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading && !user) return;
    const inAuth =
      segments[0] === 'Signin' || segments[0] === 'Signup' || segments[0] === 'resetPassword';
    if (!user && !inAuth) router.replace('/Signin');
    if (user && inAuth) router.replace('/');

    // 🚀 Tell RootLayout that Auth is settled
    DeviceEventEmitter.emit('AUTH_READY');
  }, [user, loading, segments, router]);

  if (loading && !user) return null; // Splash is handled by global overlay only for initial boot

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="Signin" />
      <Stack.Screen name="Signup" />
      <Stack.Screen name="resetPassword" />
    </Stack>
  );
});

// ─── OverlayModals ────────────────────────────────────────────────────────────
const OverlayModals = React.memo(function OverlayModals() {
  const [leadVisible, setLeadVisible] = useState(false);
  const [activityVisible, setActivityVisible] = useState(false);
  const phoneRef = useRef('');

  const handleSpam = useCallback((number: string) => {
    Alert.alert('Confirm Spam', `Mark ${number} as spam?`, [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Block', onPress: () => console.log('Blocked:', number) },
    ]);
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onOverlayAction', (data) => {
      const rawPhone = data.phoneNumber || data.mobile || '';
      const formatted = appService.formatMobile(rawPhone);
      const cleanPhone = formatted ? formatted.plain : rawPhone.replace(/\D/g, '').slice(-10);
      phoneRef.current = cleanPhone;

      if (data.action === 'OPEN_LEAD_MODAL' || data.action === 'OPEN_CREATE_LEAD_MODAL')
        setLeadVisible(true);
      else if (data.action === 'OPEN_ACTIVITY_MODAL') setActivityVisible(true);
      else if (data.action === 'BLOCK_SPAM') handleSpam(cleanPhone);
    });
    return () => sub.remove();
  }, [handleSpam]);

  return (
    <>
      <LeadModal
        visible={leadVisible}
        mobile={phoneRef.current}
        type="addLead"
        onClose={useCallback(() => setLeadVisible(false), [])}
      />
      <ActivityModal
        visible={activityVisible}
        phoneNumber={phoneRef.current}
        onClose={useCallback(() => setActivityVisible(false), [])}
      />
    </>
  );
});

// ─── RootLayout ───────────────────────────────────────────────────────────────
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);


  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('AUTH_READY', () => setAuthReady(true));
    setReady(true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // 🚀 Only hide once EVERY loading condition is met
    if (ready && authReady) {
      setTimeout(async () => {
        try {
          await SplashScreen.hideAsync();
          requestAllPermissions();
        } catch (e) {}
      }, 100);
    }
  }, [ready, authReady]);

  // Fail-safe timer
  useEffect(() => {
    const timer = setTimeout(() => {
      setReady(true);
      setAuthReady(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  const isActuallyReady = ready && authReady;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar style="auto" />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
          {ready && <CallStatusManager />}
          <ProtectedStack />
          <OverlayModals />
          {/* 📢 Global Broadcast: receives admin:broadcast from Socket.IO for ALL users */}
          <BroadcastAlertModal />
          {/* 💳 Digital Visiting Card Generator: runs once per session */}
          <VisitingCardGenerator />
          {/* 🏢 Corporate Switching Spinner & Live Timer Overlay */}
          <CorporateSwitchOverlay />
        </AuthProvider>
      </GestureHandlerRootView>

      {/* 🚀 Single persistent splash overlay */}
      {!isActuallyReady && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#b00401b8' }]}>
          <Image
            source={require('../assets/splash.png')}
            style={[StyleSheet.absoluteFill, { resizeMode: 'contain' }]}
          />
          <View
            style={{ position: 'absolute', bottom: 80, left: 0, right: 0, alignItems: 'center' }}
          >
            <ActivityIndicator size="large" color="#4f46e5" />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
});

