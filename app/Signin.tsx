import { useAuthContext } from '@/context/AuthContext';
import { COLORS, styles as G, getThemeStyles } from '@/styles/stylesIndex';
import { appService } from '@/UtilServices/appHelper';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
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
  const { login } = useAuthContext();
  const theme = useColorScheme();

  // Initialize dynamic theme colors based on system theme
  const isDark = theme === 'dark';
  const dynamic = getThemeStyles(isDark);

  const [loading, setLoading] = useState(false);
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [isGuest, setIsGuest] = useState<boolean | null>(null);

  const checkRegistration = async (val: string) => {
    if (val.length === 10) {
      try {
        const res = await appService.httpClient.post('/auth/check-unique', { userMobile: val });
        setIsGuest(!res.data.exists);
      } catch (e) {
        setIsGuest(null);
      }
    } else {
      setIsGuest(null);
    }
  };

  const handleLogin = async () => {
    if (mobile.length !== 10) return appService.showToast('Invalid Mobile Number', 'Error');
    setLoading(true);
    try {
      let res;

      if (isGuest) {
        // 🚀 GUEST LOGIN: Own mobile + Ref mobile
        try {
          res = await appService.httpClient.post(`/auth/unregistered-login`, { mobile, password });
        } catch (unregErr: any) {
          res = unregErr.response;
        }
      } else {
        // 🚀 STANDARD LOGIN
        try {
          res = await appService.httpClient.post(`/auth/login`, { mobile, password });
        } catch (loginErr: any) {
          res = loginErr.response;
        }

        // 🚀 FALLBACK: If standard failed, maybe they intended unregistered login
        if (!res?.data?.success && password.length === 10 && !isNaN(Number(password))) {
          try {
            const resUnreg = await appService.httpClient.post(`/auth/unregistered-login`, {
              mobile,
              password,
            });
            if (resUnreg.data.success) res = resUnreg;
          } catch (e: any) {
            if (e.response) res = e.response;
          }
        }
      }

      if (res?.data?.success) {
        await login({ token: res.data.token, mobile: res.data.userSession?.mobile || mobile, ...res.data.userSession });
        appService.showToast(isGuest ? 'Guest Access Granted' : 'Welcome Back', 'Success');
      } else {
        throw new Error(res?.data?.message || 'Invalid credentials');
      }
    } catch (error: any) {
      const baseURL = appService.httpClient.defaults.baseURL || 'unknown backend';
      appService.showToast(
        error.response?.data?.message ||
          `${error.message || 'Login failed'} (${baseURL})`,
        'Error'
      );
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
                marginBottom: 20,
                resizeMode: 'contain',
              }}
            />
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
              {isGuest && (
                <Text
                  style={{
                    fontSize: 11,
                    color: COLORS.accent,
                    fontWeight: '800',
                    marginTop: 4,
                    marginLeft: 4,
                  }}
                >
                  ✨ GUEST USER DETECTED
                </Text>
              )}
            </View>

            {/* PASSWORD INPUT */}
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
                  placeholder={isGuest ? 'Enter Supervisor Mobile' : 'Password'}
                  placeholderTextColor={dynamic.placeholder}
                  secureTextEntry={!isGuest}
                  keyboardType={isGuest ? 'number-pad' : 'default'}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                />
              </View>
            </View>

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
