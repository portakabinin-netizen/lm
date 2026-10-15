import { appService } from '@/UtilServices/appHelper';
import { COLORS, styles as G, getThemeStyles } from '@/styles/stylesIndex';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const dynamic = getThemeStyles(isDark);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  // Form States
  const [role, setRole] = useState<'CorpAdmin' | 'User'>('User');
  const [aadhaar, setAadhaar] = useState('');
  const [pan, setPan] = useState('');
  const [otp, setOtp] = useState('');
  const [mobile, setMobile] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const resetInternalState = () => {
    setStep(1);
    setAadhaar('');
    setPan('');
    setOtp('');
    setRole('User');
    router.replace('/Signin');
  };

  const handleVerifyIdentity = async () => {
    if (aadhaar.length !== 12) return appService.showToast('Invalid Aadhaar', 'Error');
    if (role === 'CorpAdmin' && pan.length !== 10)
      return appService.showToast('Invalid PAN', 'Error');

    setLoading(true);
    try {
      const res = await appService.httpClient.post(`/auth/verify-identity`, {
        role,
        aadhaar,
        pan: role === 'CorpAdmin' ? pan : undefined,
      });
      if (res.data.success) {
        setMobile(res.data.tempMobile);
        LayoutAnimation.easeInEaseOut();
        setStep(2);
        appService.showToast(res.data.message || 'OTP Sent Successfully', 'Success');
      }
    } catch (error: any) {
      appService.showToast(error.response?.data?.message || 'Verification Failed', 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return appService.showToast('Enter 6-digit OTP', 'Error');
    setLoading(true);
    try {
      const res = await appService.httpClient.post(`/auth/verify-otp`, {
        mobile,
        otp,
        purpose: 'resetPassword',
      });
      if (res.data.success) {
        LayoutAnimation.easeInEaseOut();
        setStep(3);
        appService.showToast('Verified Successfully', 'Success');
      }
    } catch (error: any) {
      appService.showToast(error.response?.data?.error || 'Invalid OTP', 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword !== confirmPassword) return appService.showToast('Passwords mismatch', 'Error');
    setLoading(true);
    try {
      const res = await appService.httpClient.post(`/auth/reset-password`, {
        aadhaar,
        newPassword,
      });
      if (res.data.success) {
        appService.showToast('Password updated.', 'Success');
        resetInternalState();
      }
    } catch (error) {
      appService.showToast('Reset failed', 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[G.safeArea, dynamic.safeArea]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={G.flex1}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={G.scrollContainer}
        >
          <View style={[G.authCard, dynamic.card]}>
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
            <Text style={[G.modalTitle, dynamic.cardTitle, G.centerText, G.mb4]}>
              Reset Password
            </Text>
            <Text style={[G.fs14, G.bold600, G.centerText, G.mb20, { color: dynamic.placeholder }]}>
              {step === 1
                ? 'Identity Verification'
                : step === 2
                  ? 'OTP Verification'
                  : 'Create New Password'}
            </Text>

            {step === 1 && (
              <View>
                <View style={G.roleSwitch}>
                  <TouchableOpacity
                    style={[G.roleTab, role === 'User' && G.roleTabActive]}
                    onPress={() => setRole('User')}
                  >
                    <Text style={[G.roleTabText, role === 'User' && G.roleTabTextActive]}>
                      User (All)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[G.roleTab, role === 'CorpAdmin' && G.roleTabActive]}
                    onPress={() => setRole('CorpAdmin')}
                  >
                    <Text style={[G.roleTabText, role === 'CorpAdmin' && G.roleTabTextActive]}>
                      Admin
                    </Text>
                  </TouchableOpacity>
                </View>

                {role === 'CorpAdmin' && (
                  <View style={G.inputGroup}>
                    <Text style={[G.label, dynamic.inputLabel]}>Corporate PAN</Text>
                    <View style={[G.inputWrapperAuth, dynamic.inputWrapper]}>
                      <Ionicons name="business-outline" size={18} color={dynamic.placeholder} />
                      <TextInput
                        style={[
                          G.flex1,
                          { marginLeft: 12, fontSize: 16, color: dynamic.textInput.color },
                        ]}
                        placeholder="ABCDE1234F"
                        placeholderTextColor={dynamic.placeholder}
                        value={pan}
                        onChangeText={(t) => setPan(t.toUpperCase())}
                        maxLength={10}
                      />
                    </View>
                  </View>
                )}

                <View style={G.inputGroup}>
                  <Text style={[G.label, dynamic.inputLabel]}>Aadhaar Number</Text>
                  <View style={[G.inputWrapperAuth, dynamic.inputWrapper]}>
                    <Ionicons name="card-outline" size={18} color={dynamic.placeholder} />
                    <TextInput
                      style={[
                        G.flex1,
                        { marginLeft: 12, fontSize: 16, color: dynamic.textInput.color },
                      ]}
                      placeholder="1234 5678 9012"
                      placeholderTextColor={dynamic.placeholder}
                      value={aadhaar}
                      onChangeText={setAadhaar}
                      keyboardType="numeric"
                      maxLength={12}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[G.primaryButton, loading && { opacity: 0.7 }]}
                  onPress={handleVerifyIdentity}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={G.primaryButtonText}>Verify Identity</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {step === 2 && (
              <View>
                <View style={G.inputGroup}>
                  <Text style={[G.label, dynamic.inputLabel]}>One Time Password</Text>
                  <Text style={[G.fs12, G.mb12, { color: dynamic.placeholder }]}>
                    Sent to registered mobile: {mobile.replace(/.(?=.{4})/g, '*')}
                  </Text>
                  <View style={[G.inputWrapperAuth, dynamic.inputWrapper]}>
                    <Ionicons name="keypad-outline" size={18} color={dynamic.placeholder} />
                    <TextInput
                      style={[
                        G.flex1,
                        { marginLeft: 12, fontSize: 16, color: dynamic.textInput.color },
                      ]}
                      placeholder="6-digit OTP"
                      placeholderTextColor={dynamic.placeholder}
                      value={otp}
                      onChangeText={setOtp}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                  </View>
                </View>
                <TouchableOpacity style={G.primaryButton} onPress={handleVerifyOtp}>
                  <Text style={G.primaryButtonText}>Verify OTP</Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 3 && (
              <View>
                <View style={G.inputGroup}>
                  <Text style={[G.label, dynamic.inputLabel]}>New Password</Text>
                  <View style={[G.inputWrapperAuth, dynamic.inputWrapper]}>
                    <Ionicons name="lock-closed-outline" size={18} color={dynamic.placeholder} />
                    <TextInput
                      style={[
                        G.flex1,
                        { marginLeft: 12, fontSize: 16, color: dynamic.textInput.color },
                      ]}
                      placeholder="New Password"
                      placeholderTextColor={dynamic.placeholder}
                      secureTextEntry
                      value={newPassword}
                      onChangeText={setNewPassword}
                    />
                  </View>
                </View>
                <View style={G.inputGroup}>
                  <Text style={[G.label, dynamic.inputLabel]}>Confirm Password</Text>
                  <View style={[G.inputWrapperAuth, dynamic.inputWrapper]}>
                    <Ionicons name="checkmark-done-outline" size={18} color={dynamic.placeholder} />
                    <TextInput
                      style={[
                        G.flex1,
                        { marginLeft: 12, fontSize: 16, color: dynamic.textInput.color },
                      ]}
                      placeholder="Confirm Password"
                      placeholderTextColor={dynamic.placeholder}
                      secureTextEntry
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                    />
                  </View>
                </View>
                <TouchableOpacity style={G.primaryButton} onPress={handleResetPassword}>
                  <Text style={G.primaryButtonText}>Update Password</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={G.iconRow}>
              <TouchableOpacity style={G.actionBtn} onPress={resetInternalState}>
                <View style={[G.iconCircleAuth, dynamic.iconCircle]}>
                  <Ionicons name="arrow-back-outline" size={22} color={COLORS.danger} />
                </View>
                <Text style={[G.iconLabel, { color: COLORS.danger }]}>Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
