import { useAuthContext } from '@/context/AuthContext';
import { api_url, local_api_url } from '@/backend/routes/base_url';
import { COLORS, styles as G, getThemeStyles } from '@/styles/stylesIndex';
import { appService } from '@/UtilServices/appHelper';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  DeviceEventEmitter,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LoginScreen = () => {
  const router = useRouter();
  const { login, user } = useAuthContext();


  const theme = useColorScheme();

  // Initialize dynamic theme colors based on system theme
  const isDark = theme === 'dark';
  const dynamic = getThemeStyles(isDark);

  const [loading, setLoading] = useState(false);
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [isGuest, setIsGuest] = useState<boolean | null>(null);
  const [showHostPicker, setShowHostPicker] = useState(false);
  const [customHost, setCustomHost] = useState(appService.httpClient.defaults.baseURL || '');
  const [hostList, setHostList] = useState<string[]>(appService.getBaseURLs());
  const [manualHost, setManualHost] = useState('');
  // null = unchecked, true = live, false = unreachable, 'checking' = in progress
  const [hostStatus, setHostStatus] = useState<null | boolean | 'checking'>(null);

  // Use centralized host list that respects isLocalMachine
  const buildHostList = () => {
    return appService.getHostList();
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setHostStatus('checking');
      const active = typeof appService?.loadPersistedHost === 'function'
        ? await appService.loadPersistedHost()
        : appService.getCurrentBaseURL();
      if (!isMounted) return;
      setCustomHost(active);
      setHostList(appService.getHostList());
      const result = await appService.isSystemLive();
      if (!isMounted) return;
      setHostStatus(result.available);
      const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
      if (cleanMobile.length === 10) {
        checkRegistration(cleanMobile);
      }
    })();

    const subHost = DeviceEventEmitter.addListener('api_host_changed', (newHost: string) => {
      if (isMounted && newHost) {
        setCustomHost(newHost);
        setHostList(appService.getHostList());
        setHostStatus('checking');
        appService.isSystemLive().then((res) => {
          if (isMounted) setHostStatus(res.available);
        });
      }
    });

    return () => {
      isMounted = false;
      subHost.remove();
    };
  }, []);

  // Switch host, persist it, then immediately validate the new endpoint
  const applyHost = async (url: string) => {
    await appService.updateHost(url);
    setCustomHost(url);
    setShowHostPicker(false);
    setManualHost('');
    setHostStatus('checking');

    // 🚀 Notify all other screens/components
    DeviceEventEmitter.emit('api_host_changed', url);

    const result = await appService.isSystemLive();
    setHostStatus(result.available);
    if (!result.available) {
      appService.showToast(result.error || 'Host unreachable', 'Warning');
    }
    // Re-check registration on newly selected host if mobile number is entered
    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    if (cleanMobile.length === 10) {
      checkRegistration(cleanMobile);
    }
  };

  const checkRegistration = async (val: string) => {
    const clean = val.replace(/\D/g, '').slice(-10);
    if (clean.length === 10) {
      try {
        const res = await appService.httpClient.post('/auth/check-unique', { userMobile: clean });
        setIsGuest(!res.data?.exists);
      } catch (e) {
        setIsGuest(null);
      }
    } else {
      setIsGuest(null);
    }
  };

  const handleLogin = async () => {
    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    if (cleanMobile.length !== 10) return appService.showToast('Invalid Mobile Number', 'Error');
    setLoading(true);
    try {
      let res;
      let loggedInAsGuest = false;

      // ── Step 1: Always try standard login first ────────────────────────────
      // Even if check-unique flagged this as a guest, the user may actually be
      // registered in usermaster — so standard login always gets priority.
      try {
        res = await appService.httpClient.post(`/auth/login`, { mobile: cleanMobile, password });
      } catch (loginErr: any) {
        res = loginErr.response;
      }

      // ── Step 2: Fallback → unregistered/guest login ────────────────────────
      // Try if: standard login failed AND either check-unique said guest OR
      // password looks like a 10-digit reference mobile number.
      if (!res?.data?.success) {
        const looksLikeGuestPassword = password.length === 10 && !isNaN(Number(password));
        if (isGuest || looksLikeGuestPassword) {
          try {
            const resUnreg = await appService.httpClient.post(`/auth/unregistered-login`, {
              mobile: cleanMobile,
              password,
            });
            if (resUnreg?.data?.success) {
              res = resUnreg;
              loggedInAsGuest = true;
            }
          } catch (e: any) {
            if (e.response) res = e.response;
          }
        }
      }

      if (res?.data?.success) {
        await login({
          token: res.data.token,
          mobile: res.data.userSession?.mobile || cleanMobile,
          ...res.data.userSession,
        });
        appService.showToast(loggedInAsGuest ? 'Guest Access Granted' : 'Welcome Back', 'Success');
      } else {
        throw new Error(res?.data?.message || 'Invalid credentials');
      }
    } catch (error: any) {
      const baseURL = appService.httpClient.defaults.baseURL || 'unknown backend';
      const errorMessage = error.response?.data?.message || `${error.message || 'Login failed'} (${baseURL})`;
      appService.showToast(errorMessage, 'Error');
      setShowHostPicker(true); // auto-expand host picker on login failure
    } finally {
      setLoading(false);
    }
  };

  return (
    // 1. Dynamic background for the safe area
    <SafeAreaView
      style={[G.safeArea, { backgroundColor: dynamic.safeArea.backgroundColor }] as any}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={G.flex1 as any}
      >
        <ScrollView
          contentContainerStyle={G.scrollContainer as any}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[G.authCard, dynamic.card] as any}>
            <Image
              source={require('../assets/icon.png')}
              style={{
                width: 120,
                height: 120,
                borderRadius: 20,
                alignSelf: 'center',
                marginBottom: 12,
                resizeMode: 'contain',
              }}
            />

            {/* ── API HOST URL — just above "Sign In" title ── */}
            <View style={{ marginBottom: 10 }}>
              {/* Compact chip: tap to expand dropdown */}
              <TouchableOpacity
                onPress={() => setShowHostPicker(p => !p)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  backgroundColor:
                    hostStatus === true  ? (isDark ? '#1a2a1a' : '#e8f5e9') :
                    hostStatus === false ? (isDark ? '#2a1a1a' : '#fdecea') :
                    (isDark ? '#1a1a2a' : '#f0f0ff'),
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  {hostStatus === 'checking' ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <Ionicons
                      name={
                        hostStatus === true  ? 'checkmark-circle' :
                        hostStatus === false ? 'close-circle' :
                        'ellipse-outline'
                      }
                      size={15}
                      color={
                        hostStatus === true  ? COLORS.success :
                        hostStatus === false ? COLORS.danger  :
                        COLORS.textMuted
                      }
                    />
                  )}
                  <Text
                    style={{
                      marginLeft: 6,
                      fontSize: 12,
                      fontWeight: '600',
                      flex: 1,
                      color:
                        hostStatus === true  ? COLORS.success :
                        hostStatus === false ? COLORS.danger  :
                        (isDark ? COLORS.textLight : COLORS.textDark),
                    }}
                    numberOfLines={1}
                  >
                    {customHost || 'No host set'}
                  </Text>
                  <Text style={{
                    fontSize: 9,
                    fontWeight: '800',
                    marginLeft: 4,
                    color:
                      hostStatus === true  ? COLORS.success :
                      hostStatus === false ? COLORS.danger  :
                      COLORS.textMuted,
                  }}>
                    {hostStatus === 'checking' ? 'Checking…' :
                     hostStatus === true  ? '● Live' :
                     hostStatus === false ? '● Down' : ''}
                  </Text>
                </View>
                <Ionicons
                  name={showHostPicker ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color={COLORS.primary}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>

              {/* Expanded dropdown list */}
              {showHostPicker && (
                <View
                  style={[
                    dynamic.card,
                    { borderRadius: 10, marginTop: 4, overflow: 'hidden' },
                  ] as any}
                >
                  {hostList.map((url, i) => {
                    const isActive = url === customHost;
                    return (
                      <TouchableOpacity
                        key={i}
                        onPress={() => applyHost(url)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: 10,
                          borderBottomWidth: i < hostList.length - 1 ? 0.5 : 0,
                          borderBottomColor: isDark ? '#333' : '#ddd',
                          backgroundColor: isActive
                            ? (isDark ? '#1a3a2a' : '#e8f5e9')
                            : 'transparent',
                        }}
                      >
                        <Ionicons
                          name={isActive ? 'radio-button-on' : 'radio-button-off'}
                          size={16}
                          color={isActive ? COLORS.success : COLORS.textMuted}
                        />
                        <Text
                          style={{
                            marginLeft: 10,
                            fontSize: 12,
                            color: isActive ? COLORS.success : (isDark ? COLORS.textLight : COLORS.textDark),
                            fontWeight: isActive ? '700' : '400',
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
{
  "name": "hibiz",
  "main": "expo-router/entry",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "expo start --dev-client",
    "clean": "node scripts/clean-cache.js",
    "reset-project": "node ./scripts/reset-project.js",
    "android": "npm run pre-android && npx expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "lint": "expo lint",
    "postinstall": "npx --package patch-package patch-package --patch-dir app/patches && npx --package jetifier jetifier",
    "pre-android": "node restore-native.js"
  },
  "dependencies": {
    "@babel/plugin-proposal-optional-chaining": "^7.21.0",
    "@expo/vector-icons": "^15.0.2",
    "@react-native-async-storage/async-storage": "2.2.0",
    "@react-native-community/datetimepicker": "8.6.0",
    "@react-native-picker/picker": "2.11.4",
    "@react-navigation/bottom-tabs": "^7.0.0",
    "@react-navigation/elements": "^2.0.0",
    "@react-navigation/native": "^7.0.0",
    "@shopify/flash-list": "2.0.2",
    "@types/pako": "^2.0.4",
    "axios": "^1.7.2",
    "bcryptjs": "^2.4.3",
    "cloudinary": "^2.4.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "expo": "~55.0.26",
    "expo-asset": "^55.0.17",
    "expo-audio": "~55.0.18",
    "expo-build-properties": "~55.0.14",
    "expo-camera": "~55.0.19",
    "expo-checkbox": "~55.0.4",
    "expo-constants": "^55.0.16",
    "expo-contacts": "~55.0.14",
    "expo-crypto": "~55.0.15",
    "expo-document-picker": "~55.0.13",
    "expo-file-system": "~55.0.22",
    "expo-font": "~55.0.8",
    "expo-gl": "~55.0.14",
    "expo-haptics": "~55.0.14",
    "expo-image": "~55.0.11",
    "expo-image-manipulator": "~55.0.17",
    "expo-image-picker": "~55.0.20",
    "expo-intent-launcher": "~55.0.12",
    "expo-keep-awake": "~55.0.8",
    "expo-linear-gradient": "~55.0.14",
    "expo-linking": "^55.0.15",
    "expo-location": "~55.1.10",
    "expo-mail-composer": "~55.0.14",
    "expo-print": "~55.0.15",
    "expo-router": "~55.0.16",
    "expo-sharing": "~55.0.20",
    "expo-sms": "~55.0.14",
    "expo-splash-screen": "^55.0.21",
// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
