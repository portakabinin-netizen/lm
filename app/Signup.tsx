import { RegisterSchema, type FormData } from '@/hooks/interface';
import { AadharScanner } from '@/modal/AadharScanner';
import UserModal from '@/modal/handleUser';
import { COLORS, styles as G, getThemeStyles } from '@/styles/stylesIndex';
import { appService } from '@/UtilServices/appHelper';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
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

const UserRegistration = () => {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const dynamic = useMemo(() => getThemeStyles(isDark), [isDark]);

  const [step, setStep] = useState<'mobile' | 'otp' | 'form'>('mobile');
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isAadharScanned, setIsAadharScanned] = useState(false);
  const [otp, setOtp] = useState('');
  const [displayCompanyName, setDisplayCompanyName] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);

  const [form, setForm] = useState<Partial<FormData>>({
    userRole: 'Sales',
    userMobile: '',
    userAadhar: '',
    userEmail: '',
    userPassword: '',
    confirmPassword: '',
    userDoB: undefined,
  });

  const updateField = (field: keyof FormData, value: string) => {
    let cleaned = value;
    if (field === 'userEmail') cleaned = value.toLowerCase().replace(/\s/g, '');
    if (field === 'userAadhar') cleaned = value.replace(/\D/g, '');
    setForm((prev) => ({ ...prev, [field]: cleaned }));
  };

  const handleSendOtp = async () => {
    if (form.userMobile?.length !== 10) return appService.showToast('Invalid Mobile', 'Error');
    setLoading(true);
    try {
      const res = await appService.httpClient.post('/auth/send-otp', {
        mobile: form.userMobile,
        dbName: form.dbName,
        purpose: 'register',
      });
      appService.showToast(res.data.message || 'OTP sent', 'Success');
      LayoutAnimation.easeInEaseOut();
      setStep('otp');
    } catch (err: any) {
      appService.showToast(err.response?.data?.error || 'OTP Failed', 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return appService.showToast('Enter 6-digit code', 'Error');
    setLoading(true);
    try {
      const res = await appService.httpClient.post('/auth/verify-otp', {
        mobile: form.userMobile,
        otp,
      });
      if (res.data.success) {
        LayoutAnimation.spring();
        setStep('form');
        appService.showToast('Verified Successfully', 'Success');
      }
    } catch (err: any) {
      appService.showToast(err.response?.data?.error || 'Invalid OTP', 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalSubmit = async () => {
    // 1. Basic check
    if (form.userPassword !== form.confirmPassword)
      return appService.showToast('Passwords mismatch', 'Error');
    if (!displayCompanyName) return appService.showToast('Link a company first', 'Error');

    // 2. Validate with Zod
    const result = RegisterSchema.safeParse(form);

    if (!result.success) {
      const firstError = result.error.issues[0];
      const fieldName = firstError.path.length > 0 ? String(firstError.path[0]) : 'Field';
      return appService.showToast(`${fieldName}: ${firstError.message}`, 'Error');
    }

    setLoading(true);
    try {
      // result.data now contains the CLEAN, NESTED object from .transform()
      const res = await appService.httpClient.post('/auth/register', result.data);

      if (res.data.success) {
        appService.showToast('Registration Successful', 'Success');
        router.replace('/Signin');
      }
    } catch (err: any) {
      appService.showToast(err.response?.data?.message || 'Registration Failed', 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[G.safeArea, dynamic.safeArea]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={G.flex1}>
        <ScrollView contentContainerStyle={G.scrollContainer} keyboardShouldPersistTaps="handled">
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
            <Text style={[G.modalTitle, dynamic.cardTitle, G.centerText, G.mb4]}>New User</Text>
            <Text style={[G.fs14, G.centerText, G.mb20, { color: dynamic.brandSubtitle.color }]}>
              Register today to enjoy App
            </Text>
            {step === 'mobile' && (
              <View>
                <View style={G.mb12}>
                  <Text style={[G.label, dynamic.inputLabel]}>Mobile Number</Text>
                  <View style={[G.inputWrapperAuth, dynamic.inputWrapper]}>
                    <Ionicons name="call-outline" size={20} color={dynamic.placeholder} />
                    <TextInput
                      placeholder="Mobile Number"
                      placeholderTextColor={dynamic.placeholder}
                      keyboardType="phone-pad"
                      maxLength={10}
                      style={[G.flex1, G.ml12, G.fs16, { color: dynamic.textInput.color }]}
                      onChangeText={(v) => updateField('userMobile', v)}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={G.primaryButton}
                  onPress={handleSendOtp}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={G.primaryButtonText}>Send OTP</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {step === 'otp' && (
              <View>
                <View style={G.mb12}>
                  <Text style={[G.label, dynamic.inputLabel, G.centerText]}>Verification Code</Text>
                  <View style={[G.inputWrapperAuth, dynamic.inputWrapper]}>
                    <TextInput
                      placeholder="000000"
                      placeholderTextColor={dynamic.placeholder}
                      keyboardType="number-pad"
                      maxLength={6}
                      style={[
                        G.flex1,
                        G.ml12,
                        G.fs16,
                        G.centerText,
                        { color: dynamic.textInput.color, letterSpacing: 12 },
                      ]}
                      onChangeText={setOtp}
                    />
                  </View>
                </View>
                <TouchableOpacity style={G.primaryButton} onPress={handleVerifyOtp}>
                  <Text style={G.primaryButtonText}>Verify & Continue</Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 'form' && (
              <View>
                <View style={G.mb12}>
                  <Text style={[G.label, dynamic.inputLabel]}>Full Name</Text>
                  <View style={[G.inputWrapperAuth, dynamic.inputWrapper]}>
                    <Ionicons name="person-outline" size={20} color={dynamic.placeholder} />
                    <TextInput
                      placeholder="Full Name"
                      placeholderTextColor={dynamic.placeholder}
                      style={[
                        G.flex1,
                        G.ml12,
                        G.fs16,
                        { color: dynamic.textInput.color, opacity: isAadharScanned ? 0.6 : 1 },
                      ]}
                      onChangeText={(v) => updateField('userDisplayName', v)}
                      value={form.userDisplayName}
                      editable={!isAadharScanned}
                    />
                  </View>
                </View>

                <View style={G.mb12}>
                  <Text style={[G.label, dynamic.inputLabel]}>Email Address</Text>
                  <View style={[G.inputWrapperAuth, dynamic.inputWrapper]}>
                    <Ionicons name="mail-outline" size={20} color={dynamic.placeholder} />
                    <TextInput
                      placeholder="Email ID"
                      placeholderTextColor={dynamic.placeholder}
                      style={[G.flex1, G.ml12, G.fs16, { color: dynamic.textInput.color }]}
                      onChangeText={(v) => updateField('userEmail', v)}
                      value={form.userEmail}
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <View style={G.mb12}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-end',
                      marginBottom: 5,
                    }}
                  >
                    <Text style={[G.label, dynamic.inputLabel, { marginBottom: 0 }]}>
                      Aadhar Card
                    </Text>
                    <TouchableOpacity
                      onPress={() => setScannerVisible(true)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Ionicons name="qr-code-outline" size={16} color={COLORS.primary} />
                      <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '700' }}>
                        SCAN QR
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[G.inputWrapperAuth, dynamic.inputWrapper]}>
                    <Ionicons name="card-outline" size={20} color={dynamic.placeholder} />
                    <TextInput
                      placeholder="Aadhar Number"
                      placeholderTextColor={dynamic.placeholder}
                      keyboardType="number-pad"
                      maxLength={12}
                      style={[
                        G.flex1,
                        G.ml12,
                        G.fs16,
                        { color: dynamic.textInput.color, opacity: isAadharScanned ? 0.6 : 1 },
                      ]}
                      onChangeText={(v) => updateField('userAadhar', v)}
                      value={form.userAadhar}
                      editable={!isAadharScanned}
                    />
                  </View>
                </View>

                <View style={G.mb12}>
                  <Text style={[G.label, dynamic.inputLabel]}>Date of Birth</Text>
                  <TouchableOpacity
                    style={[
                      G.inputWrapperAuth,
                      dynamic.inputWrapper,
                      G.center,
                      { opacity: isAadharScanned ? 0.6 : 1 },
                    ]}
                    onPress={() => !isAadharScanned && setShowDatePicker(true)}
                    disabled={isAadharScanned}
                  >
                    <Text
                      style={{
                        color: form.userDoB ? (dynamic.text.color as string) : dynamic.placeholder,
                      }}
                    >
                      {form.userDoB instanceof Date ? form.userDoB.toDateString() : 'Date of Birth'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={G.mb12}>
                  <Text style={[G.label, dynamic.inputLabel]}>User Role</Text>
                  <View
                    style={[
                      G.inputWrapperAuth,
                      dynamic.inputWrapper,
                      { paddingHorizontal: 0, overflow: 'hidden' },
                    ]}
                  >
                    <Picker
                      selectedValue={form.userRole}
                      onValueChange={(v) => {
                        setForm((p) => ({ ...p, userRole: v }));
                        setDisplayCompanyName('');
                      }}
                      style={{ color: dynamic.text.color as string, width: '100%' }}
                    >
                      <Picker.Item label="Sales Team" value="Sales" />
                      <Picker.Item label="Project Manager" value="Project" />
                      <Picker.Item label="Corporate Admin" value="CorpAdmin" />
                      <Picker.Item label="Admin" value="userAdmin" />
                      <Picker.Item label="Finance" value="Finance" />
                    </Picker>
                  </View>
                </View>

                <View style={G.mb12}>
                  <Text style={[G.label, dynamic.inputLabel]}>Company Link</Text>
                  <TouchableOpacity
                    style={[
                      G.primaryButton,
                      { backgroundColor: displayCompanyName ? COLORS.success : COLORS.accent },
                    ]}
                    onPress={() => setModalVisible(true)}
                  >
                    <Text style={G.primaryButtonText}>{displayCompanyName || 'Link Company'}</Text>
                  </TouchableOpacity>
                </View>

                <View style={G.mb12}>
                  <Text style={[G.label, dynamic.inputLabel]}>Password</Text>
                  <View style={[G.inputWrapperAuth, dynamic.inputWrapper]}>
                    <Ionicons name="lock-closed-outline" size={20} color={dynamic.placeholder} />
                    <TextInput
                      placeholder="Password"
                      secureTextEntry
                      placeholderTextColor={dynamic.placeholder}
                      style={[G.flex1, G.ml12, G.fs16, { color: dynamic.textInput.color }]}
                      onChangeText={(v) => updateField('userPassword', v)}
                    />
                  </View>
                </View>

                <View style={G.mb12}>
                  <Text style={[G.label, dynamic.inputLabel]}>Confirm Password</Text>
                  <View style={[G.inputWrapperAuth, dynamic.inputWrapper]}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={20}
                      color={dynamic.placeholder}
                    />
                    <TextInput
                      placeholder="Confirm Password"
                      secureTextEntry
                      placeholderTextColor={dynamic.placeholder}
                      style={[G.flex1, G.ml12, G.fs16, { color: dynamic.textInput.color }]}
                      onChangeText={(v) => updateField('confirmPassword', v)}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[G.primaryButton, { backgroundColor: COLORS.bgDark, marginTop: 10 }]}
                  onPress={handleFinalSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={G.primaryButtonText}>Create Account</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <View style={G.iconRow}>
              <TouchableOpacity style={G.actionBtn} onPress={() => router.replace('/Signin')}>
                <View style={[G.iconCircleAuth, dynamic.iconCircle]}>
                  <Ionicons name="log-in-outline" size={22} color={COLORS.success} />
                </View>
                <Text style={[G.iconLabel, dynamic.iconLabel]}>Sign In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={G.actionBtn}
                onPress={() => {
                  setStep('mobile');
                  setIsAadharScanned(false);
                }}
              >
                <View style={[G.iconCircleAuth, dynamic.iconCircle]}>
                  <Ionicons name="refresh-outline" size={22} color={COLORS.info} />
                </View>
                <Text style={[G.iconLabel, dynamic.iconLabel]}>Reset</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {showDatePicker && (
          <DateTimePicker
            value={form.userDoB instanceof Date ? form.userDoB : new Date(2000, 0, 1)}
            mode="date"
            onChange={(e, d) => {
              setShowDatePicker(false);
              if (d) setForm((p) => ({ ...p, userDoB: d }));
            }}
          />
        )}

        <UserModal
          visible={modalVisible}
          type={form.userRole === 'CorpAdmin' ? 'corporate' : 'search'}
          onClose={() => setModalVisible(false)}
          onSave={(data: any) => {
            if (form.userRole === 'CorpAdmin') {
              // For Admin: Spread all corporate fields (PAN, GST, etc) into the root
              setForm((prev) => ({ ...prev, ...data }));
            } else {
              // FOR NON-ADMIN: Populate root fields, Schema transform will handle the rest
              setForm((prev) => ({
                ...prev,
                dbName: data.dbName,
                corporatePAN: data.corporatePAN,
              }));
            }
            setDisplayCompanyName(data.corporateName);
            setModalVisible(false);
          }}
        />

        <AadharScanner
          visible={scannerVisible}
          onClose={() => setScannerVisible(false)}
          onScanned={(data) => {
            setForm((prev) => ({
              ...prev,
              userDisplayName: data.name,
              userAadhar: data.uid,
              userDoB: data.dob ? new Date(data.dob) : prev.userDoB,
            }));
            setIsAadharScanned(true); // 🔒 Lock fields
            appService.showToast('Verified Aadhar details locked!', 'Success');
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default UserRegistration;
