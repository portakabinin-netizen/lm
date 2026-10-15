import { useAuthContext } from '@/context/AuthContext';
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
  const [checkingRegistration, setCheckingRegistration] = useState(false);
  const [showHostPicker, setShowHostPicker] = useState(false);
  const [customHost, setCustomHost] = useState(appService.httpClient.defaults.baseURL || '');
  const [hostList, setHostList] = useState<string[]>(appService.getBaseURLs());
  const [manualHost, setManualHost] = useState('');
  // null = unchecked, true = live, false = unreachable, 'checking' = in progress
  const [hostStatus, setHostStatus] = useState<null | boolean | 'checking'>(null);

  // Show live and active hosts in dropdown
  const displayHosts = React.useMemo(() => {
    const live = appService.getLiveURLs();
    if (live.length > 0) {
      const set = new Set<string>(live);
      if (customHost) set.add(customHost);
      return Array.from(set);
    }
    const active = customHost || appService.getCurrentBaseURL();
    return active ? [active] : (hostList.length > 0 ? [hostList[0]] : []);
  }, [hostList, customHost, hostStatus]);

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
      setCheckingRegistration(true);
      try {
        const res = await appService.httpClient.post('/auth/check-unique', { userMobile: clean });
        setIsGuest(res.data?.exists === false);
      } catch (e) {
        setIsGuest(false);
      } finally {
        setCheckingRegistration(false);
      }
    } else {
      setIsGuest(null);
      setCheckingRegistration(false);
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
        router.replace('/');
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
                  {displayHosts.map((url, i) => {
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
                          {url}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {/* Manual entry */}
                  <View style={[G.inputWrapperAuth, dynamic.inputWrapper, { margin: 8, flex: undefined }] as any}>
                    <Ionicons name="link-outline" size={16} color={COLORS.textMuted} />
                    <TextInput
                      style={[G.flex1, G.ml12, { fontSize: 12, color: dynamic.textInput.color }] as any}
                      placeholder="Enter custom URL…"
                      placeholderTextColor={dynamic.placeholder}
                      value={manualHost}
                      onChangeText={setManualHost}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {manualHost.length > 5 && (
                      <TouchableOpacity onPress={() => applyHost(manualHost)} style={{ padding: 4 }}>
                        <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </View>

            <Text style={[G.modalTitle, dynamic.cardTitle, G.centerText] as any}>Sign In</Text>

            {/* MOBILE INPUT */}
            <View style={G.mb12 as any}>
              <Text style={[G.label, dynamic.inputLabel] as any}>Mobile Number</Text>
              <View style={[G.inputWrapperAuth, dynamic.inputWrapper] as any}>
                <Ionicons
                  name="call-outline"
                  size={20}
                  color={isDark ? COLORS.textMuted : COLORS.secondary}
                />
                <TextInput
                  style={[G.flex1, G.ml12, G.fs16, { color: dynamic.textInput.color }] as any}
                  placeholder="Mobile Number"
                  placeholderTextColor={dynamic.placeholder}
                  keyboardType="phone-pad"
                  value={mobile}
                  onChangeText={(val) => {
                    setMobile(val);
                    checkRegistration(val);
                  }}
                  maxLength={10}
                />
              </View>
              {checkingRegistration ? (
                <Text
                  style={{
                    fontSize: 11,
                    color: COLORS.textMuted,
                    fontWeight: '600',
                    marginTop: 4,
                    marginLeft: 4,
                  }}
                >
                  Checking mobile number…
                </Text>
              ) : isGuest === true ? (
                <Text
                  style={{
                    fontSize: 11,
                    color: COLORS.accent,
                    fontWeight: '800',
                    marginTop: 4,
                    marginLeft: 4,
                  }}
                >
                  ✨ Unregistered User — Enter Reference Mobile
                </Text>
              ) : isGuest === false ? (
                <Text
                  style={{
                    fontSize: 11,
                    color: COLORS.success,
                    fontWeight: '700',
                    marginTop: 4,
                    marginLeft: 4,
                  }}
                >
                  ✓ Registered User — Enter your password
                </Text>
              ) : null}
            </View>

            {/* PASSWORD / REFERENCE MOBILE — only after full 10-digit mobile entered */}
            {mobile.replace(/\D/g, '').slice(-10).length === 10 && (
              <View style={G.mb12 as any}>
                <Text style={[G.label, dynamic.inputLabel] as any}>
                  {isGuest ? 'Reference Mobile' : 'Password'}
                </Text>
                <View style={[G.inputWrapperAuth, dynamic.inputWrapper] as any}>
                  <Ionicons
                    name={isGuest ? 'people-outline' : 'lock-closed-outline'}
                    size={20}
                    color={isDark ? COLORS.textMuted : COLORS.secondary}
                  />
                  <TextInput
                    style={[G.flex1, G.ml12, G.fs16, { color: dynamic.textInput.color }] as any}
                    placeholder={isGuest ? 'Enter Reference Mobile' : 'Enter your password'}
                    placeholderTextColor={dynamic.placeholder}
                    secureTextEntry={!isGuest}
                    keyboardType={isGuest ? 'phone-pad' : 'default'}
                    value={password}
                    onChangeText={setPassword}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            )}

            <TouchableOpacity
              style={G.primaryButton as any}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={G.primaryButtonText as any}>Sign In</Text>
              )}
            </TouchableOpacity>

            <View style={G.iconRow as any}>
              <TouchableOpacity
                style={G.actionBtn as any}
                onPress={() => router.push('/resetPassword')}
              >
                <View style={[G.iconCircleAuth, dynamic.iconCircle] as any}>
                  <Ionicons name="key-outline" size={20} color={COLORS.accent} />
                </View>
                <Text style={[G.iconLabel, dynamic.iconLabel] as any}>Forgot</Text>
              </TouchableOpacity>

              <TouchableOpacity style={G.actionBtn as any} onPress={() => router.push('/Signup')}>
                <View style={[G.iconCircleAuth, dynamic.iconCircle] as any}>
                  <Ionicons name="person-add-outline" size={20} color={COLORS.success} />
                </View>
                <Text style={[G.iconLabel, dynamic.iconLabel] as any}>New User</Text>
              </TouchableOpacity>

              <TouchableOpacity style={G.actionBtn as any} onPress={() => BackHandler.exitApp()}>
                <View style={[G.iconCircleAuth, dynamic.iconCircle] as any}>
                  <Ionicons name="exit-outline" size={20} color={COLORS.danger} />
                </View>
                <Text style={[G.iconLabel, { color: COLORS.danger }] as any}>Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default LoginScreen;
