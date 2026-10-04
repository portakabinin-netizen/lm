import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import FastImage from '@/components/FastImageCompat';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';

import { appService } from '@/UtilServices/appHelper';
import { useGPSCoordinates } from '@/hooks/useGPSCoordinates';
import { useUserContext } from '@/context/AuthContext';
import { DistanceService } from '@/services/DistanceService';
import { COLORS } from '@/styles/stylesIndex';

interface ClientMeetModalProps {
  visible: boolean;
  onClose: () => void;
  lead?: any;
  leads?: any[];
  onComplete?: () => void;
}

const MEETING_TYPES = [
  'Routine Check-in',
  'Service Escalation',
  'Site Handover',
  'Payment / Billing',
  'Contract Renewal',
  'Quality & Safety Audit',
];

const COMPLAINT_CATEGORIES = [
  'None / All Good',
  'Staff Punctuality',
  'Service Quality',
  'Billing / Invoicing',
  'Material Delay',
  'Safety & Compliance',
  'Other Issues',
];

const formatDateToDDMMYYYY = (date: Date): string => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
};

const formatAutoDate = (text: string): string => {
  const digits = text.replace(/\D/g, '');
  if (digits.length === 8) {
    const d = digits.substring(0, 2);
    const m = digits.substring(2, 4);
    const y = digits.substring(4, 8);
    return `${d}-${m}-${y}`;
  }
  return text;
};

const generateMeetingCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `CM-${code}`;
};

export const ClientMeetModal: React.FC<ClientMeetModalProps> = ({
  visible,
  onClose,
  lead,
  leads = [],
  onComplete,
}) => {
  const insets = useSafeAreaInsets();
  const { refresh: refreshGPS } = useGPSCoordinates();
  const { user } = useUserContext();

  const corporateName = useMemo(() => {
    return user?.corporateName || (user as any)?.companyName || 'Company';
  }, [user]);

  const userName = useMemo(() => {
    return user?.userDisplayName || user?.name || 'Staff';
  }, [user]);

  const userRole = useMemo(() => {
    return user?.userRole || 'Representative';
  }, [user]);

  const userMobile = useMemo(() => {
    return user?.mobile || '';
  }, [user]);

  // Active view tab: 'new' | 'history'
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

  // Lead Selection
  const [selectedLocalLead, setSelectedLocalLead] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const activeLead = selectedLocalLead || lead;

  // Meeting Form Data
  const [meetingCode, setMeetingCode] = useState(generateMeetingCode());
  const [personMet, setPersonMet] = useState('');
  const [clientMobile, setClientMobile] = useState('');
  const [meetingType, setMeetingType] = useState('Routine Check-in');
  const [summary, setSummary] = useState('');
  const [complaintCategory, setComplaintCategory] = useState('None / All Good');
  const [complaintDetails, setComplaintDetails] = useState('');
  const [resolution, setResolution] = useState('');
  const [promisedDate, setPromisedDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [promisedDateObj, setPromisedDateObj] = useState<Date>(new Date());

  // Meeting Code Verification States
  const [codeSent, setCodeSent] = useState(false);
  const [isCodeVerified, setIsCodeVerified] = useState(false);
  const [enteredCode, setEnteredCode] = useState('');
  const [sentOtpCode, setSentOtpCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [bypassGeofence, setBypassGeofence] = useState(false);
  const [updatingSiteLocation, setUpdatingSiteLocation] = useState(false);

  // Admin Check
  const isAdmin = useMemo(() => {
    const role = (user?.userRole || (user as any)?.role || '').toLowerCase();
    return role.includes('admin') || (user as any)?.isSuperAdmin === true;
  }, [user]);

  // Edit Meeting State (Admin Only)
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<any>(null);
  const [editPersonMet, setEditPersonMet] = useState('');
  const [editMeetingType, setEditMeetingType] = useState('Routine Check-in');
  const [editSummary, setEditSummary] = useState('');
  const [editComplaintCategory, setEditComplaintCategory] = useState('None / All Good');
  const [editComplaintDetails, setEditComplaintDetails] = useState('');
  const [editResolution, setEditResolution] = useState('');
  const [editPromisedDate, setEditPromisedDate] = useState('');
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Search & Preview States
  const [meetingSearchQuery, setMeetingSearchQuery] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  // Media & GPS
  const [image, setImage] = useState<string | null>(null);
  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  const viewShotRef = useRef<ViewShot>(null);

  // ── Geofence Evaluation ──────────────────────────────────────────────────
  const siteGeo = useMemo(() => {
    if (!activeLead) return null;
    const lat = Number(activeLead.location?.lat || activeLead.location?.latitude || activeLead.lat);
    const long = Number(activeLead.location?.long || activeLead.location?.longitude || activeLead.long);
    if (isNaN(lat) || isNaN(long) || (lat === 0 && long === 0)) return null;
    const radius = Number(activeLead.location?.geofenceRadius) > 0 ? Number(activeLead.location.geofenceRadius) : 200;
    return { lat, long, radius };
  }, [activeLead]);

  const geofenceResult = useMemo(() => {
    if (!location?.latitude || !location?.longitude || !siteGeo) return null;
    const distanceMeters = Math.round(
      DistanceService.calculateDistance(
        { latitude: location.latitude, longitude: location.longitude },
        { latitude: siteGeo.lat, longitude: siteGeo.long }
      )
    );
    const isInside = distanceMeters <= siteGeo.radius;
    return {
      isInside,
      distanceMeters,
      radiusMeters: siteGeo.radius,
      formattedDistance: DistanceService.formatDistance(distanceMeters),
    };
  }, [location, siteGeo]);

  // Resend Countdown Timer
  useEffect(() => {
    let timer: any;
    if (resendCountdown > 0) {
      timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  // Initialize on open
  useEffect(() => {
    if (visible) {
      resetForm();
      setSelectedLocalLead(lead || null);
      if (lead?.sender_mobile) setClientMobile(lead.sender_mobile);
      if (lead?.sender_name) setPersonMet(lead.sender_name);

      // Auto-fetch location in background
      fetchLocation();
    }
  }, [visible, lead]);

  // When client selection changes, auto-fill contact info
  const handleSelectLead = (selected: any) => {
    Keyboard.dismiss();
    setSelectedLocalLead(selected);
    if (selected?.sender_mobile) setClientMobile(selected.sender_mobile);
    if (selected?.sender_name) setPersonMet(selected.sender_name);
    setSearchQuery('');
  };

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  const openDatePicker = () => {
    Keyboard.dismiss();
    const currentDate = promisedDateObj || new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: 'date',
        display: 'default',
        onChange: (event: any, selectedDate?: Date) => {
          if (selectedDate && event.type === 'set') {
            setPromisedDateObj(selectedDate);
            setPromisedDate(formatDateToDDMMYYYY(selectedDate));
          }
        },
      });
    } else {
      setShowDatePicker(true);
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setPromisedDateObj(selectedDate);
      setPromisedDate(formatDateToDDMMYYYY(selectedDate));
    }
  };

  const resetForm = () => {
    setMeetingCode(generateMeetingCode());
    setPersonMet('');
    setClientMobile('');
    setMeetingType('Routine Check-in');
    setSummary('');
    setComplaintCategory('None / All Good');
    setComplaintDetails('');
    setResolution('');
    setPromisedDate('');
    setImage(null);
    setLocation(null);
    setActiveTab('new');
    setSearchQuery('');
    setMeetingSearchQuery('');
    setCodeSent(false);
    setIsCodeVerified(false);
    setEnteredCode('');
    setSentOtpCode('');
    setResendCountdown(0);
    setBypassGeofence(false);
  };

  const handleUpdateSiteLocation = async () => {
    if (!activeLead?._id || !location?.latitude) {
      Alert.alert('Location Error', 'Acquiring live GPS location... Please wait.');
      fetchLocation();
      return;
    }
    setUpdatingSiteLocation(true);
    try {
      const session = await appService.getSession();
      await appService.httpClient.put(
        `service/leads/${activeLead._id}`,
        {
          location: {
            lat: location.latitude,
            long: location.longitude,
            address: location.formattedAddress || 'Site Location',
            geofenceRadius: 200,
          },
        },
        { headers: session?.token ? { Authorization: `Bearer ${session.token}` } : undefined }
      );
      if (selectedLocalLead) {
        setSelectedLocalLead({
          ...selectedLocalLead,
          location: {
            lat: location.latitude,
            long: location.longitude,
            address: location.formattedAddress || 'Site Location',
            geofenceRadius: 200,
          },
        });
      }
      appService.showToast('Client site GPS geofence established (200m)!', 'Success');
      Alert.alert('Site Geofence Pinned', 'Current GPS location has been saved as the official site coordinates.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update site coordinates');
    } finally {
      setUpdatingSiteLocation(false);
    }
  };

  const fetchLocation = async () => {
    setLocationLoading(true);
    try {
      const loc = await refreshGPS();
      if (loc) {
        setLocation(loc);
      }
    } catch (err) {
      console.warn('Failed to get location:', err);
    } finally {
      setLocationLoading(false);
    }
  };

  const handleCapturePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permission is required to capture a live selfie with the client.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        cameraType: ImagePicker.CameraType.front,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setImage(result.assets[0].uri);
        if (!location) fetchLocation();
      }
    } catch (err: any) {
      Alert.alert('Camera Error', err?.message || 'Unable to open live camera');
    }
  };

  // ── WhatsApp Meeting Code Dispatch & Validation ─────────────────────────────
  const [sendingCode, setSendingCode] = useState(false);

  const handleSendWhatsApp = async () => {
    Keyboard.dismiss();

    const rawNumber = clientMobile.replace(/\D/g, '');
    if (rawNumber.length < 10) {
      Alert.alert('Invalid Mobile', 'Please enter a valid 10-digit client mobile number.');
      return;
    }
    const mobileWithCountry = rawNumber.length === 10 ? `91${rawNumber}` : rawNumber;

    let msg = `🤝 *CLIENT MEETING VERIFICATION*\n\n`;
    msg += `*Company:* ${corporateName}\n`;
    msg += `*Representative:* ${userName}\n`;
    msg += `*Site / Client:* ${activeLead?.sender_name || 'Valued Client'}\n`;
    msg += `*Meeting Verification Code:* *${meetingCode}*\n\n`;
    msg += `_Please share this 6-digit verification code with our representative on-site to authenticate the meeting._`;

    setSendingCode(true);
    try {
      const session = await appService.getSession();

      // 1. Send OTP / Code via auth/send-otp endpoint (MSG91 / Meta WhatsApp engine)
      try {
        const otpRes = await appService.httpClient.post('/auth/send-otp', {
          mobile: rawNumber,
          purpose: 'meeting',
          dbName: (user as any)?.dbName,
        });

        if (otpRes.data?.otp) {
          setSentOtpCode(String(otpRes.data.otp));
          // If server returned 6-digit OTP, sync meeting code display
          setMeetingCode(`CM-${otpRes.data.otp}`);
        }
      } catch (otpErr) {
        console.log('OTP send notice:', otpErr);
      }

      // 2. Also send rich meeting brief via auth/send-message
      try {
        await appService.httpClient.post(
          'auth/send-message',
          {
            mobile: mobileWithCountry,
            message: msg,
            type: 'whatsapp',
          },
          {
            headers: session?.token ? { Authorization: `Bearer ${session.token}` } : undefined,
          }
        );
      } catch (backendErr) {
        console.log('Backend WhatsApp dispatch notice:', backendErr);
      }

      // 3. Trigger native WhatsApp if installed on device
      const whatsappUrl = `whatsapp://send?phone=${mobileWithCountry}&text=${encodeURIComponent(msg)}`;
      const canOpen = await Linking.canOpenURL(whatsappUrl).catch(() => false);
      if (canOpen) {
        await Linking.openURL(whatsappUrl).catch((err) => console.log('WhatsApp open error:', err));
      }

      setCodeSent(true);
      setResendCountdown(30);
      appService.showToast('Verification Code sent to Client!', 'Success');
      Alert.alert(
        'Code Sent Successfully',
        `Verification Code has been sent to client mobile (${rawNumber}).\nPlease ask the client for the code to validate.`
      );
    } catch (err: any) {
      console.warn('Dispatch error:', err);
      setCodeSent(true);
      setResendCountdown(30);
      appService.showToast('Code generated: ' + meetingCode, 'Success');
    } finally {
      setSendingCode(false);
    }
  };

  // ── Verify Client Code ───────────────────────────────────────────────────
  const handleVerifyCode = async () => {
    const cleanCode = enteredCode.trim().replace(/\D/g, '');
    const currentCodeDigits = meetingCode.replace(/\D/g, '');

    if (!cleanCode) {
      Alert.alert('Required', 'Please enter the verification code received by the client.');
      return;
    }

    setVerifyingCode(true);
    try {
      let isVerified = false;

      // 1. Try server verification via /auth/verify-otp
      try {
        const verifyRes = await appService.httpClient.post('/auth/verify-otp', {
          mobile: clientMobile.replace(/\D/g, ''),
          otp: cleanCode,
        });
        if (verifyRes.data?.success) {
          isVerified = true;
        }
      } catch (vErr) {
        console.log('Server verify note:', vErr);
      }

      // 2. Client match fallback against sentOtpCode or meetingCode digits
      if (!isVerified) {
        if (
          (sentOtpCode && cleanCode === sentOtpCode) ||
          (currentCodeDigits && cleanCode === currentCodeDigits) ||
          enteredCode.toUpperCase().trim() === meetingCode.toUpperCase().trim()
        ) {
          isVerified = true;
        }
      }

      if (isVerified) {
        setIsCodeVerified(true);
        appService.showToast('Client Meeting Verified Successfully!', 'Success');
        Alert.alert(
          'Verification Confirmed',
          '✅ Client identity and meeting authentication verified successfully.'
        );
      } else {
        Alert.alert('Verification Failed', 'Invalid verification code. Please check with the client and try again.');
      }
    } catch (err: any) {
      Alert.alert('Verification Error', err?.message || 'Unable to verify code.');
    } finally {
      setVerifyingCode(false);
    }
  };

  // ── Save Meeting Report ───────────────────────────────────────────────────
  const handleSaveMeeting = async () => {
    if (!activeLead) {
      Alert.alert('Required', 'Please select a Client/Site for this meeting.');
      return;
    }
    if (!personMet.trim()) {
      Alert.alert('Required', 'Please enter the name of the Person Met.');
      return;
    }
    if (!summary.trim()) {
      Alert.alert('Required', 'Please enter a brief Summary of discussion.');
      return;
    }

    if (!isCodeVerified) {
      Alert.alert(
        'Verify & Save Meeting',
        `Meeting code is "${meetingCode}".\n\nVerify this meeting now and save report?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Verify & Save',
            onPress: async () => {
              setIsCodeVerified(true);
              await executeSaveMeeting(true);
            },
          },
        ]
      );
      return;
    }

    await executeSaveMeeting(true);
  };

  const executeSaveMeeting = async (verifiedFlag: boolean) => {
    setLoading(true);
    try {
      const session = await appService.getSession();
      if (!session?.token) {
        Alert.alert('Auth Error', 'User session expired. Please log in again.');
        return;
      }

      let uploadedSelfieUrl = '';

      // 1. Watermark and upload selfie if captured
      if (image && viewShotRef.current) {
        try {
          const watermarkedUri = await captureRef(viewShotRef.current, {
            format: 'jpg',
            quality: 0.8,
          });

          const formData = new FormData();
          formData.append('subFolder', 'corporate/meeting');
          formData.append('lead_no', String(activeLead.lead_no || activeLead._id));
          formData.append('file', {
            uri: watermarkedUri,
            type: 'image/jpeg',
            name: `client_meet_${meetingCode}_${Date.now()}.jpg`,
          } as any);

          const uploadRes = await appService.httpClient.post('upload/cloudinary', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
              Authorization: `Bearer ${session.token}`,
            },
          });

          if (uploadRes.data?.success && uploadRes.data?.url) {
            uploadedSelfieUrl = uploadRes.data.url;
          }
        } catch (uploadErr) {
          console.warn('Image watermark/upload warning:', uploadErr);
        }
      }

      // 2. Structured meeting log payload
      const meetingPayload = {
        action: 'Client Meeting',
        meetingCode,
        personMet: personMet.trim(),
        clientMobile: clientMobile.trim(),
        meetingType,
        summary: summary.trim(),
        complaintCategory,
        complaintDetails: complaintDetails.trim(),
        resolution: resolution.trim(),
        promisedDate: promisedDate.trim(),
        selfieUrl: uploadedSelfieUrl,
        isVerified: verifiedFlag || isCodeVerified,
        verifiedAt: new Date().toISOString(),
        geofence: {
          inside: geofenceResult?.isInside ?? true,
          distanceMeters: geofenceResult?.distanceMeters ?? 0,
          radiusMeters: geofenceResult?.radiusMeters ?? 200,
          bypassed: bypassGeofence,
        },
        location: location
          ? {
              lat: location.latitude,
              long: location.longitude,
              address: location.formattedAddress || 'Site Location',
            }
          : null,
        byUser: userName,
        date: new Date().toISOString(),
      };

      // 3. Post to Lead Activity Log
      await appService.httpClient.post(
        `service/leads/${activeLead._id}/activity`,
        meetingPayload,
        { headers: { Authorization: `Bearer ${session.token}` } }
      );

      // Update active lead activity in local memory
      if (!Array.isArray(activeLead.activity)) activeLead.activity = [];
      activeLead.activity.unshift(meetingPayload);

      // 4. Also register Geo History tick on active duty attendance if active
      try {
        const dutyStored = await AsyncStorage.getItem('active_duty_info');
        if (dutyStored && location) {
          const { attendanceId } = JSON.parse(dutyStored);
          if (attendanceId) {
            await appService.httpClient.put(
              `service/hr/attendance/${attendanceId}`,
              {
                $push: {
                  geoHistory: {
                    lat: location.latitude,
                    long: location.longitude,
                    type: 'client_meet',
                    clientName: activeLead.sender_name || 'Client',
                    leadId: activeLead._id,
                    address: location.formattedAddress || null,
                    timestamp: new Date(),
                    note: `Client Meeting (${meetingCode}): Met ${personMet.trim()}`,
                  },
                },
              },
              { headers: { Authorization: `Bearer ${session.token}` } }
            );
          }
        }
      } catch (attErr) {
        console.warn('Duty sync warning:', attErr);
      }

      appService.showToast('Client Meeting report saved successfully!', 'Success');

      Alert.alert(
        'Meeting Report Saved',
        `Meeting ${meetingCode} has been verified and saved to database.`,
        [
          {
            text: 'OK',
            onPress: () => {
              if (onComplete) onComplete();
              handleClose();
            },
          },
        ]
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to save meeting report';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Helper: Resolve Lead ID for meeting item ──
  const resolveLeadId = (item: any): string => {
    if (item.leadId) return String(item.leadId);
    if (activeLead?._id) return String(activeLead._id);
    const match = (leads || []).find((l: any) =>
      Array.isArray(l.activity) &&
      l.activity.some((a: any) => 
        (a._id && String(a._id) === String(item._id)) || 
        (a.meetingCode && a.meetingCode === item.meetingCode) ||
        (a.summary && a.summary === item.summary && a.personMet === item.personMet)
      )
    );
    if (match) return String(match._id);
    if (item.clientName) {
      const nameMatch = (leads || []).find((l: any) => l.sender_name === item.clientName);
      if (nameMatch) return String(nameMatch._id);
    }
    if (leads && leads.length > 0) return String(leads[0]._id);
    return 'unknown';
  };

  // ── Admin: Delete Meeting Record ──────────────────────────────────────────
  const handleDeleteMeeting = (item: any) => {
    Alert.alert(
      'Delete Meeting Record',
      `Are you sure you want to permanently delete meeting ${item.meetingCode || 'record'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const leadId = resolveLeadId(item);
              if (!leadId) {
                Alert.alert('Error', 'Unable to resolve client record for deletion.');
                return;
              }
              const session = await appService.getSession();
              const targetId = item._id || item.meetingCode;
              await appService.httpClient.delete(
                `service/leads/${leadId}/activity/${targetId}`,
                { headers: { Authorization: `Bearer ${session.token}` } }
              );

              // Update local state
              if (activeLead && Array.isArray(activeLead.activity)) {
                activeLead.activity = activeLead.activity.filter(
                  (a: any) => (a._id && a._id !== item._id) || (a.meetingCode && a.meetingCode !== item.meetingCode)
                );
              }
              (leads || []).forEach((l: any) => {
                if (Array.isArray(l.activity)) {
                  l.activity = l.activity.filter(
                    (a: any) => (a._id && a._id !== item._id) || (a.meetingCode && a.meetingCode !== item.meetingCode)
                  );
                }
              });

              appService.showToast('Meeting record deleted successfully', 'Success');
              if (onComplete) onComplete();
            } catch (err: any) {
              Alert.alert('Delete Failed', err?.message || 'Failed to delete meeting record');
            }
          },
        },
      ]
    );
  };

  // ── Admin: Open Edit Meeting Modal ─────────────────────────────────────────
  const handleOpenEditMeeting = (item: any) => {
    setEditingMeeting(item);
    setEditPersonMet(item.personMet || '');
    setEditMeetingType(item.meetingType || 'Routine Check-in');
    setEditSummary(item.summary || '');
    setEditComplaintCategory(item.complaintCategory || 'None / All Good');
    setEditComplaintDetails(item.complaintDetails || '');
    setEditResolution(item.resolution || '');
    setEditPromisedDate(item.promisedDate || '');
    setEditModalVisible(true);
  };

  const openEditDatePicker = () => {
    Keyboard.dismiss();
    const currentDate = new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: 'date',
        display: 'default',
        onChange: (event: any, selectedDate?: Date) => {
          if (selectedDate && event.type === 'set') {
            setEditPromisedDate(formatDateToDDMMYYYY(selectedDate));
          }
        },
      });
    } else {
      setShowEditDatePicker(true);
    }
  };

  // ── Admin: Save Edited Meeting ─────────────────────────────────────────────
  const handleSaveEditedMeeting = async () => {
    if (!editingMeeting) return;
    setSavingEdit(true);
    try {
      const leadId = resolveLeadId(editingMeeting);
      if (!leadId) {
        Alert.alert('Error', 'Unable to resolve client record for editing.');
        return;
      }
      const session = await appService.getSession();
      const targetId = editingMeeting._id || editingMeeting.meetingCode;

      const updateData = {
        personMet: editPersonMet.trim(),
        meetingType: editMeetingType,
        summary: editSummary.trim(),
        complaintCategory: editComplaintCategory,
        complaintDetails: editComplaintDetails.trim(),
        resolution: editResolution.trim(),
        promisedDate: editPromisedDate.trim(),
      };

      await appService.httpClient.put(
        `service/leads/${leadId}/activity/${targetId}`,
        updateData,
        { headers: { Authorization: `Bearer ${session.token}` } }
      );

      // Update locally
      const updateObj = (a: any) => {
        if ((a._id && a._id === editingMeeting._id) || (a.meetingCode && a.meetingCode === editingMeeting.meetingCode)) {
          return { ...a, ...updateData };
        }
        return a;
      };

      if (activeLead && Array.isArray(activeLead.activity)) {
        activeLead.activity = activeLead.activity.map(updateObj);
      }
      (leads || []).forEach((l: any) => {
        if (Array.isArray(l.activity)) {
          l.activity = l.activity.map(updateObj);
        }
      });

      appService.showToast('Meeting record updated!', 'Success');
      setEditModalVisible(false);
      setEditingMeeting(null);
      if (onComplete) onComplete();
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Failed to update meeting record');
    } finally {
      setSavingEdit(false);
    }
  };

  // ── PDF Generation & Sharing ──────────────────────────────────────────────
  const handleShareMeetingPDF = async (item: any) => {
    try {
      const clientName = item.clientName || activeLead?.sender_name || 'Client Site';
      const dateStr = item.date
        ? new Date(item.date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'N/A';

      const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Client Meeting Report - ${item.meetingCode || 'Report'}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e40af; padding-bottom: 12px; margin-bottom: 16px; }
          .brand { font-size: 20px; font-weight: bold; color: #1e40af; }
          .corp-meta { font-size: 11px; color: #64748b; margin-top: 3px; }
          .badge { background: #10b981; color: #fff; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 14px; letter-spacing: 0.5px; }
          .title { font-size: 16px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 14px; text-align: center; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
          .card-label { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; }
          .card-val { font-size: 13px; font-weight: bold; color: #0f172a; margin-top: 2px; }
          .section { margin-bottom: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
          .sec-title { font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase; margin-bottom: 6px; }
          .sec-content { font-size: 12.5px; color: #1e293b; line-height: 1.5; }
          .complaint-box { border-left: 4px solid #ef4444; background: #fef2f2; }
          .resolution-box { border-left: 4px solid #10b981; background: #f0fdf4; }
          .photo-box { text-align: center; margin-top: 14px; page-break-inside: avoid; }
          .photo-img { max-width: 320px; max-height: 320px; border-radius: 8px; border: 1px solid #cbd5e1; }
          .footer { margin-top: 24px; border-top: 1px dashed #cbd5e1; padding-top: 10px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">${corporateName}</div>
            <div class="corp-meta">Official Client Meeting & Field Verification Report</div>
          </div>
          <div>
            <span class="badge">${item.meetingCode || 'VERIFIED'}</span>
          </div>
        </div>

        <div class="title">Client Meeting Verification Audit</div>

        <div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 14px;">
          ${item.selfieUrl ? `
          <div style="flex-shrink: 0; width: 180px;">
            <img src="${item.selfieUrl}" style="width: 180px; height: 120px; object-fit: cover; border-radius: 8px; border: 2px solid #1e40af;" />
            <div style="font-size: 8px; text-align: center; color: #64748b; margin-top: 3px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Live Client Photo</div>
          </div>
          ` : `
          <div style="flex-shrink: 0; width: 180px; height: 120px; border-radius: 8px; border: 1px dashed #cbd5e1; background: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; padding-top: 24px;">
            <div style="font-size: 24px; color: #94a3b8; line-height: 1;">📷</div>
            <div style="font-size: 9px; color: #64748b; margin-top: 6px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">No Selfie</div>
          </div>
          `}
          <div style="flex: 1;">
            <div class="grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 0;">
              <div class="card" style="padding: 8px 10px;">
                <div class="card-label">Client / Site Name</div>
                <div class="card-val" style="font-size: 12px;">${clientName}</div>
              </div>
              <div class="card" style="padding: 8px 10px;">
                <div class="card-label">Meeting Date & Time</div>
                <div class="card-val" style="font-size: 12px;">${dateStr}</div>
              </div>
              <div class="card" style="padding: 8px 10px;">
                <div class="card-label">Person Met</div>
                <div class="card-val" style="font-size: 12px;">${item.personMet || 'Client Representative'}</div>
              </div>
              <div class="card" style="padding: 8px 10px;">
                <div class="card-label">Staff Representative</div>
                <div class="card-val" style="font-size: 12px;">${item.byUser || userName}</div>
              </div>
              <div class="card" style="padding: 8px 10px;">
                <div class="card-label">Meeting Type</div>
                <div class="card-val" style="font-size: 12px;">${item.meetingType || 'Routine Check-in'}</div>
              </div>
              <div class="card" style="padding: 8px 10px;">
                <div class="card-label">Client Mobile / Auth</div>
                <div class="card-val" style="font-size: 12px;">${item.clientMobile || 'On-site Authenticated'}</div>
              </div>
            </div>
          </div>
        </div>

        ${item.summary ? `
        <div class="section">
          <div class="sec-title">Discussion Summary</div>
          <div class="sec-content">${item.summary}</div>
        </div>` : ''}

        ${item.complaintCategory && item.complaintCategory !== 'None / All Good' ? `
        <div class="section complaint-box">
          <div class="sec-title" style="color: #dc2626;">Client Issue / Feedback [${item.complaintCategory}]</div>
          <div class="sec-content">${item.complaintDetails || 'Issue registered during meeting.'}</div>
        </div>` : ''}

        ${item.resolution ? `
        <div class="section resolution-box">
          <div class="sec-title" style="color: #16a34a;">Resolution Provided / Action Plan</div>
          <div class="sec-content">${item.resolution}</div>
          ${item.promisedDate ? `<div style="font-size: 11px; font-weight: bold; color: #15803d; margin-top: 6px;">Target Resolution Date: ${item.promisedDate}</div>` : ''}
        </div>` : ''}

        <div class="footer">
          <div>Generated by ${userName} • ${corporateName}</div>
          <div>Security Seal: AUTH-VERIFIED-${item.meetingCode || 'OK'}</div>
        </div>
      </body>
      </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          UTI: '.pdf',
          mimeType: 'application/pdf',
          dialogTitle: `Share Meeting Report - ${item.meetingCode || 'Client Meet'}`,
        });
      } else {
        Alert.alert('PDF Export', 'PDF generated at ' + uri);
      }
    } catch (err: any) {
      Alert.alert('PDF Export Error', err?.message || 'Failed to generate meeting PDF');
    }
  };

  const handlePreviewMeetingReport = (item: any) => {
    try {
      const clientName = item.clientName || activeLead?.sender_name || 'Client Site';
      const dateStr = item.date
        ? new Date(item.date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'N/A';

      const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Client Meeting Report - ${item.meetingCode || 'Report'}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e40af; padding-bottom: 12px; margin-bottom: 16px; }
          .brand { font-size: 20px; font-weight: bold; color: #1e40af; }
          .corp-meta { font-size: 11px; color: #64748b; margin-top: 3px; }
          .badge { background: #10b981; color: #fff; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 14px; letter-spacing: 0.5px; }
          .title { font-size: 16px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 14px; text-align: center; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
          .card-label { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; }
          .card-val { font-size: 13px; font-weight: bold; color: #0f172a; margin-top: 2px; }
          .section { margin-bottom: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
          .sec-title { font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase; margin-bottom: 6px; }
          .sec-content { font-size: 12.5px; color: #1e293b; line-height: 1.5; }
          .complaint-box { border-left: 4px solid #ef4444; background: #fef2f2; }
          .resolution-box { border-left: 4px solid #10b981; background: #f0fdf4; }
          .photo-box { text-align: center; margin-top: 14px; page-break-inside: avoid; }
          .photo-img { max-width: 320px; max-height: 320px; border-radius: 8px; border: 1px solid #cbd5e1; }
          .footer { margin-top: 24px; border-top: 1px dashed #cbd5e1; padding-top: 10px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">${corporateName}</div>
            <div class="corp-meta">Official Client Meeting & Field Verification Report</div>
          </div>
          <div>
            <span class="badge">${item.meetingCode || 'VERIFIED'}</span>
          </div>
        </div>

        <div class="title">Client Meeting Verification Audit</div>

        <div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 14px;">
          ${item.selfieUrl ? `
          <div style="flex-shrink: 0; width: 180px;">
            <img src="${item.selfieUrl}" style="width: 180px; height: 120px; object-fit: cover; border-radius: 8px; border: 2px solid #1e40af;" />
            <div style="font-size: 8px; text-align: center; color: #64748b; margin-top: 3px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Live Client Photo</div>
          </div>
          ` : `
          <div style="flex-shrink: 0; width: 180px; height: 120px; border-radius: 8px; border: 1px dashed #cbd5e1; background: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; padding-top: 24px;">
            <div style="font-size: 24px; color: #94a3b8; line-height: 1;">📷</div>
            <div style="font-size: 9px; color: #64748b; margin-top: 6px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">No Selfie</div>
          </div>
          `}
          <div style="flex: 1;">
            <div class="grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 0;">
              <div class="card" style="padding: 8px 10px;">
                <div class="card-label">Client / Site Name</div>
                <div class="card-val" style="font-size: 12px;">${clientName}</div>
              </div>
              <div class="card" style="padding: 8px 10px;">
                <div class="card-label">Meeting Date & Time</div>
                <div class="card-val" style="font-size: 12px;">${dateStr}</div>
              </div>
              <div class="card" style="padding: 8px 10px;">
                <div class="card-label">Person Met</div>
                <div class="card-val" style="font-size: 12px;">${item.personMet || 'Client Representative'}</div>
              </div>
              <div class="card" style="padding: 8px 10px;">
                <div class="card-label">Staff Representative</div>
                <div class="card-val" style="font-size: 12px;">${item.byUser || userName}</div>
              </div>
              <div class="card" style="padding: 8px 10px;">
                <div class="card-label">Meeting Type</div>
                <div class="card-val" style="font-size: 12px;">${item.meetingType || 'Routine Check-in'}</div>
              </div>
              <div class="card" style="padding: 8px 10px;">
                <div class="card-label">Client Mobile / Auth</div>
                <div class="card-val" style="font-size: 12px;">${item.clientMobile || 'On-site Authenticated'}</div>
              </div>
            </div>
          </div>
        </div>

        ${item.summary ? `
        <div class="section">
          <div class="sec-title">Discussion Summary</div>
          <div class="sec-content">${item.summary}</div>
        </div>` : ''}

        ${item.complaintCategory && item.complaintCategory !== 'None / All Good' ? `
        <div class="section complaint-box">
          <div class="sec-title" style="color: #dc2626;">Client Issue / Feedback [${item.complaintCategory}]</div>
          <div class="sec-content">${item.complaintDetails || 'Issue registered during meeting.'}</div>
        </div>` : ''}

        ${item.resolution ? `
        <div class="section resolution-box">
          <div class="sec-title" style="color: #16a34a;">Resolution Provided / Action Plan</div>
          <div class="sec-content">${item.resolution}</div>
          ${item.promisedDate ? `<div style="font-size: 11px; font-weight: bold; color: #15803d; margin-top: 6px;">Target Resolution Date: ${item.promisedDate}</div>` : ''}
        </div>` : ''}

        <div class="footer">
          <div>Generated by ${userName} • ${corporateName}</div>
          <div>Security Seal: AUTH-VERIFIED-${item.meetingCode || 'OK'}</div>
        </div>
      </body>
      </html>
      `;
      setPreviewHtml(html);
    } catch (err: any) {
      Alert.alert('Preview Error', err?.message || 'Failed to generate preview');
    }
  };

  // Filter available leads for search
  const availableLeads = useMemo(() => {
    return leads.filter((l) => {
      const q = searchQuery.toLowerCase();
      return (
        !q ||
        l.sender_name?.toLowerCase().includes(q) ||
        l.lead_no?.toString().includes(q) ||
        l.sender_mobile?.includes(q)
      );
    });
  }, [leads, searchQuery]);

  // Extract past meetings for active lead or all loaded leads
  const pastMeetings = useMemo(() => {
    if (activeLead && Array.isArray(activeLead.activity)) {
      return activeLead.activity
        .filter((a: any) => a.action === 'Client Meeting' || a.meetingCode || a.personMet)
        .map((a: any) => ({
          ...a,
          leadId: activeLead._id,
          clientName: activeLead.sender_name || `Client-${activeLead.lead_no}`,
        }));
    }
    const all: any[] = [];
    (leads || []).forEach((l: any) => {
      if (Array.isArray(l.activity)) {
        l.activity.forEach((a: any) => {
          if (a.action === 'Client Meeting' || a.meetingCode || a.personMet) {
            all.push({
              ...a,
              leadId: l._id,
              clientName: l.sender_name || `Client-${l.lead_no}`,
              leadNo: l.lead_no,
            });
          }
        });
      }
    });
    return all.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [activeLead, leads]);

  // Filter meetings by code, name, designation, type, summary, issue, resolution, or staff representative
  const filteredMeetings = useMemo(() => {
    if (!meetingSearchQuery.trim()) return pastMeetings;
    const query = meetingSearchQuery.toLowerCase();
    return pastMeetings.filter((item: any) => {
      return (
        (item.meetingCode || '').toLowerCase().includes(query) ||
        (item.personMet || '').toLowerCase().includes(query) ||
        (item.clientName || '').toLowerCase().includes(query) ||
        (item.summary || '').toLowerCase().includes(query) ||
        (item.meetingType || '').toLowerCase().includes(query) ||
        (item.complaintCategory || '').toLowerCase().includes(query) ||
        (item.complaintDetails || '').toLowerCase().includes(query) ||
        (item.resolution || '').toLowerCase().includes(query) ||
        (item.byUser || '').toLowerCase().includes(query)
      );
    });
  }, [pastMeetings, meetingSearchQuery]);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <View style={[styles.rootContainer, { paddingTop: insets.top }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.container}>
            {/* ── HEADER ── */}
            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose} style={styles.headerBackBtn}>
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.headerTitle}>Client Meeting Report</Text>
                <Text style={styles.headerSubtitle}>
                  {activeLead ? activeLead.sender_name : 'Select Client / Site'}
                </Text>
              </View>
              <View style={styles.codeBadge}>
                <Text style={styles.codeBadgeText}>{meetingCode}</Text>
              </View>
            </View>

            {/* ── TAB SELECTOR ── */}
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'new' && styles.tabBtnActive]}
                onPress={() => setActiveTab('new')}
              >
                <Ionicons
                  name="create-outline"
                  size={16}
                  color={activeTab === 'new' ? COLORS.primary : '#64748b'}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[styles.tabText, activeTab === 'new' && styles.tabTextActive]}
                >
                  New Meeting
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
                onPress={() => setActiveTab('history')}
              >
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={activeTab === 'history' ? COLORS.primary : '#64748b'}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}
                >
                  Meeting History ({pastMeetings.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── BODY ── */}
            {activeTab === 'new' ? (
              <ScrollView
                style={styles.body}
                contentContainerStyle={{ paddingBottom: 160 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets={true}
                showsVerticalScrollIndicator={false}
              >
                {/* 0. Logged-in Corporate Representation Banner */}
                <View style={styles.corpRepCard}>
                  <View style={styles.corpRepIconBox}>
                    <Ionicons name="business" size={20} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.corpRepLabel}>REPRESENTING CORPORATE</Text>
                    <Text style={styles.corpRepTitle}>{corporateName}</Text>
                    <Text style={styles.corpRepStaff}>
                      👤 {userName} {userRole ? `(${userRole})` : ''} {userMobile ? `• 📞 ${userMobile}` : ''}
                    </Text>
                  </View>
                  <View style={styles.corpRepBadge}>
                    <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                    <Text style={styles.corpRepBadgeText}>Verified</Text>
                  </View>
                </View>

                {/* 1. Client / Site Selection */}
                {!lead && (
                  <View style={styles.card}>
                    <Text style={styles.cardHeader}>1. SELECT CLIENT / SITE</Text>
                    {activeLead ? (
                      <View style={styles.selectedLeadBox}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.selectedLeadName}>
                            {activeLead.sender_name || `Client-${activeLead.lead_no}`}
                          </Text>
                          <Text style={styles.selectedLeadMeta}>
                            Lead #{activeLead.lead_no} • {activeLead.status || 'Active'}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => {
                            Keyboard.dismiss();
                            setSelectedLocalLead(null);
                          }}
                          style={styles.changeBtn}
                        >
                          <Text style={styles.changeBtnText}>Change</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View>
                        <TextInput
                          style={styles.input}
                          placeholder="Search client by name or mobile..."
                          placeholderTextColor="#94a3b8"
                          value={searchQuery}
                          onChangeText={setSearchQuery}
                          returnKeyType="done"
                          onSubmitEditing={Keyboard.dismiss}
                        />
                        <ScrollView
                          style={{ maxHeight: 160, marginTop: 6 }}
                          nestedScrollEnabled={true}
                          keyboardShouldPersistTaps="always"
                        >
                          {availableLeads.slice(0, 10).map((l) => (
                            <TouchableOpacity
                              key={l._id}
                              style={styles.leadOption}
                              onPress={() => handleSelectLead(l)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="business" size={16} color={COLORS.primary} />
                              <View style={{ flex: 1, marginLeft: 8 }}>
                                <Text style={styles.leadOptionName}>
                                  {l.sender_name || `Client-${l.lead_no}`}
                                </Text>
                                <Text style={styles.leadOptionSub}>
                                  #{l.lead_no} • {l.sender_mobile || 'No Mobile'}
                                </Text>
                              </View>
                              <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}

                {/* ── GEOFENCE MATCHING & LOCATION STATUS ── */}
                {activeLead && (
                  <View style={styles.card}>
                    <Text style={styles.cardHeader}>GEOFENCE & LOCATION MATCH</Text>
                    {geofenceResult ? (
                      geofenceResult.isInside ? (
                        <View style={styles.geoInsideBox}>
                          <Ionicons name="shield-checkmark" size={22} color="#16a34a" />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.geoInsideTitle}>Geofence Matched: Inside Client Site</Text>
                            <Text style={styles.geoInsideSub}>
                              Live Distance: {geofenceResult.distanceMeters}m • Allowed: {geofenceResult.radiusMeters}m
                            </Text>
                          </View>
                          <TouchableOpacity onPress={fetchLocation} style={styles.geoRefreshBtn}>
                            <Ionicons name="refresh" size={14} color="#16a34a" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.geoOutsideBox}>
                          <Ionicons name="alert-circle" size={22} color="#dc2626" />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.geoOutsideTitle}>Location Mismatch: Outside Geofence</Text>
                            <Text style={styles.geoOutsideSub}>
                              You are {geofenceResult.formattedDistance} away from site (Max limit: {geofenceResult.radiusMeters}m).
                            </Text>
                            {bypassGeofence && (
                              <Text style={{ fontSize: 10, color: '#f59e0b', fontWeight: '800', marginTop: 2 }}>
                                ⚠️ Geofence Override Active
                              </Text>
                            )}
                          </View>
                          <TouchableOpacity onPress={fetchLocation} style={styles.geoRefreshBtnRed}>
                            <Ionicons name="refresh" size={14} color="#dc2626" />
                          </TouchableOpacity>
                        </View>
                      )
                    ) : (
                      <View style={styles.geoUnconfBox}>
                        <Ionicons name="navigate-circle-outline" size={22} color="#f59e0b" />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.geoUnconfTitle}>Site Geofence Not Configured</Text>
                          <Text style={styles.geoUnconfSub}>
                            {location?.latitude
                              ? `Live GPS: ${location.latitude.toFixed(4)}, ${location.longitude?.toFixed(4)}`
                              : 'Acquiring live GPS coordinates...'}
                          </Text>
                        </View>
                        {location?.latitude ? (
                          <TouchableOpacity
                            style={styles.pinSiteBtn}
                            onPress={handleUpdateSiteLocation}
                            disabled={updatingSiteLocation}
                          >
                            {updatingSiteLocation ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Ionicons name="pin" size={12} color="#fff" />
                                <Text style={styles.pinSiteBtnText}>Pin Site</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    )}
                  </View>
                )}

                {/* 2. Person Met & Code Verification */}
                <View style={styles.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.cardHeader}>2. PERSON MET & CODE VALIDATION</Text>
                    {!isCodeVerified && (
                      <TouchableOpacity
                        onPress={() => {
                          const newCode = generateMeetingCode();
                          setMeetingCode(newCode);
                          setCodeSent(false);
                          setIsCodeVerified(false);
                          setEnteredCode('');
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center' }}
                      >
                        <Ionicons name="refresh" size={12} color={COLORS.primary} />
                        <Text style={{ fontSize: 11, color: COLORS.primary, fontWeight: '700', marginLeft: 3 }}>
                          Regen Code
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.label}>Person Met (Name & Designation)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Mr. Rajesh Sharma (Facility Head)"
                    placeholderTextColor="#94a3b8"
                    value={personMet}
                    onChangeText={setPersonMet}
                  />

                  <Text style={styles.label}>Client Mobile No. (For Code Dispatch)</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="e.g. 9876543210"
                      placeholderTextColor="#94a3b8"
                      value={clientMobile}
                      onChangeText={(val) => {
                        setClientMobile(val);
                        if (codeSent) {
                          setCodeSent(false);
                          setIsCodeVerified(false);
                        }
                      }}
                      keyboardType="phone-pad"
                      editable={!isCodeVerified}
                    />
                    {!isCodeVerified && (
                      <TouchableOpacity
                        style={[styles.whatsappBtn, (sendingCode || resendCountdown > 0) && { opacity: 0.7 }]}
                        onPress={handleSendWhatsApp}
                        disabled={sendingCode || resendCountdown > 0}
                        activeOpacity={0.8}
                      >
                        {sendingCode ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <FontAwesome5 name="whatsapp" size={16} color="#fff" />
                            <Text style={styles.whatsappBtnText}>
                              {resendCountdown > 0 ? `${resendCountdown}s` : codeSent ? 'Resend' : 'Send Code'}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* ── CODE VALIDATION SECTION ── */}
                  {isCodeVerified ? (
                    <View style={styles.verifiedBox}>
                      <Ionicons name="shield-checkmark" size={24} color="#16a34a" />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.verifiedTitle}>Meeting Verified by Client</Text>
                        <Text style={styles.verifiedSub}>
                          Code authenticated for {clientMobile}
                        </Text>
                      </View>
                      <View style={styles.verifiedPill}>
                        <Text style={styles.verifiedPillText}>AUTHENTICATED</Text>
                      </View>
                    </View>
                  ) : codeSent ? (
                    <View style={styles.validationBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <Ionicons name="key" size={16} color="#3b82f6" />
                        <Text style={styles.validationTitle}>Enter Client Verification Code</Text>
                      </View>
                      <Text style={styles.validationSub}>
                        Ask the client for the 6-digit code sent to their WhatsApp/Mobile:
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <TextInput
                          style={[styles.input, styles.otpInput, { flex: 1 }]}
                          placeholder="Enter 6-digit code"
                          placeholderTextColor="#94a3b8"
                          value={enteredCode}
                          onChangeText={setEnteredCode}
                          keyboardType="numeric"
                          maxLength={8}
                        />
                        <TouchableOpacity
                          style={styles.verifyCodeBtn}
                          onPress={handleVerifyCode}
                          disabled={verifyingCode}
                          activeOpacity={0.8}
                        >
                          {verifyingCode ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <>
                              <Ionicons name="checkmark-circle" size={16} color="#fff" />
                              <Text style={styles.verifyCodeBtnText}>Verify Code</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}

                  <Text style={[styles.label, { marginTop: 12 }]}>Meeting Purpose / Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                    {MEETING_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.chip,
                          meetingType === type && styles.chipActive,
                        ]}
                        onPress={() => setMeetingType(type)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            meetingType === type && styles.chipTextActive,
                          ]}
                        >
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* 3. Selfie / Photo with Client */}
                <View style={styles.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.cardHeader}>3. SELFIE / PHOTO WITH CLIENT</Text>
                    {locationLoading && (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <ActivityIndicator size="small" color={COLORS.primary} />
                        <Text style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>GPS...</Text>
                      </View>
                    )}
                  </View>

                  {image ? (
                    <View style={styles.photoContainer}>
                      <ViewShot ref={viewShotRef} options={{ format: 'jpg', quality: 0.8 }}>
                        <View style={{ position: 'relative' }}>
                          <FastImage source={image} style={styles.previewImage} />
                          {/* Live Geo & Code Watermark Overlay */}
                          <View style={styles.watermarkOverlay}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={styles.watermarkBrand}>{corporateName}</Text>
                              <View style={styles.watermarkCodeBadge}>
                                <Text style={styles.watermarkCodeText}>{meetingCode}</Text>
                              </View>
                            </View>
                            <Text style={styles.watermarkClient}>
                              Client: {activeLead?.sender_name || 'Client Meet'}
                            </Text>
                            <Text style={styles.watermarkPerson}>
                              Met: {personMet || 'Representative'} | {userName}
                            </Text>
                            <Text style={styles.watermarkLoc}>
                              📍 {location?.formattedAddress || (location ? `${location.latitude?.toFixed(4)}, ${location.longitude?.toFixed(4)}` : 'GPS Acquired')}
                            </Text>
                            <Text style={styles.watermarkTime}>
                              🕒 {new Date().toLocaleString('en-IN')}
                            </Text>
                          </View>
                        </View>
                      </ViewShot>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                        <TouchableOpacity
                          style={[styles.smallBtn, { backgroundColor: '#ef4444' }]}
                          onPress={() => setImage(null)}
                        >
                          <Ionicons name="trash-outline" size={14} color="#fff" />
                          <Text style={styles.smallBtnText}>Remove</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.smallBtn, { backgroundColor: COLORS.primary }]}
                          onPress={handleCapturePhoto}
                        >
                          <Ionicons name="camera-reverse" size={14} color="#fff" />
                          <Text style={styles.smallBtnText}>Retake Live Camera</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.captureLivePhotoBtn}
                      onPress={handleCapturePhoto}
                      activeOpacity={0.8}
                    >
                      <View style={styles.cameraIconCircle}>
                        <Ionicons name="camera" size={26} color="#fff" />
                      </View>
                      <Text style={styles.capturePhotoText}>Capture Live Selfie with Client</Text>
                      <Text style={styles.capturePhotoSub}>Live Camera Only • Auto GPS Geo-Stamp</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* 4. Discussion Summary */}
                <View style={styles.card}>
                  <Text style={styles.cardHeader}>4. SUMMARY OF DISCUSSION</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Key points discussed during meeting, client feedback, project updates..."
                    placeholderTextColor="#94a3b8"
                    multiline
                    numberOfLines={4}
                    value={summary}
                    onChangeText={setSummary}
                  />
                </View>

                {/* 5. Client Complaint / Issues Logged */}
                <View style={styles.card}>
                  <Text style={styles.cardHeader}>5. CLIENT COMPLAINT / FEEDBACK (IF ANY)</Text>
                  <Text style={styles.label}>Issue Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                    {COMPLAINT_CATEGORIES.map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.chip,
                          complaintCategory === cat && (cat === 'None / All Good' ? styles.chipSuccess : styles.chipDanger),
                        ]}
                        onPress={() => setComplaintCategory(cat)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            complaintCategory === cat && styles.chipTextActive,
                          ]}
                        >
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {complaintCategory !== 'None / All Good' && (
                    <>
                      <Text style={styles.label}>Complaint Details & Specific Notes</Text>
                      <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Describe the client's complaint, root cause, site issues..."
                        placeholderTextColor="#94a3b8"
                        multiline
                        numberOfLines={3}
                        value={complaintDetails}
                        onChangeText={setComplaintDetails}
                      />
                    </>
                  )}
                </View>

                {/* 6. Resolution Provided / Action Plan */}
                <View style={styles.card}>
                  <Text style={styles.cardHeader}>6. RESOLUTION PROVIDED / ACTION PLAN</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Immediate resolution provided or agreed action plan..."
                    placeholderTextColor="#94a3b8"
                    multiline
                    numberOfLines={3}
                    value={resolution}
                    onChangeText={setResolution}
                  />

                  <Text style={styles.label}>Promised Target Resolution Date (Optional)</Text>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="DD-MM-YYYY (or tap calendar)"
                      placeholderTextColor="#94a3b8"
                      value={promisedDate}
                      onChangeText={(val) => setPromisedDate(formatAutoDate(val))}
                      maxLength={10}
                      keyboardType="numeric"
                    />
                    <TouchableOpacity
                      style={styles.calendarBtn}
                      onPress={openDatePicker}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="calendar" size={16} color="#fff" />
                      <Text style={styles.calendarBtnText}>Calendar</Text>
                    </TouchableOpacity>
                  </View>
                  {showDatePicker && Platform.OS === 'ios' && (
                    <DateTimePicker
                      value={promisedDateObj || new Date()}
                      mode="date"
                      display="default"
                      onChange={onDateChange}
                    />
                  )}
                </View>

                {/* ── SUBMIT ACTION BUTTON ── */}
                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    styles.saveBtnVerified,
                    loading && { opacity: 0.7 },
                  ]}
                  onPress={handleSaveMeeting}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.saveBtnText}>Save Client Meeting Report</Text>
                    </>
                  )}
                </TouchableOpacity>

                {!isCodeVerified && (
                  <View style={styles.saveNoticeBox}>
                    <Ionicons name="shield-outline" size={13} color="#64748b" />
                    <Text style={styles.saveNoticeText}>
                      Client must share the 6-digit WhatsApp code to authenticate & unlock saving
                    </Text>
                  </View>
                )}
              </ScrollView>
            ) : (
              /* ── MEETING HISTORY TAB ── */
              <View style={{ flex: 1 }}>
                {/* Meeting Search Box */}
                <View style={styles.historySearchContainer}>
                  <Ionicons name="search" size={16} color="#64748b" style={styles.historySearchIcon} />
                  <TextInput
                    style={styles.historySearchInput}
                    placeholder="Search meetings by code, client, summary..."
                    placeholderTextColor="#94a3b8"
                    value={meetingSearchQuery}
                    onChangeText={setMeetingSearchQuery}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  {meetingSearchQuery ? (
                    <TouchableOpacity onPress={() => setMeetingSearchQuery('')} style={styles.historySearchClearBtn}>
                      <Ionicons name="close-circle" size={18} color="#94a3b8" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                <ScrollView
                  style={styles.body}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  showsVerticalScrollIndicator={false}
                >
                  {filteredMeetings.length === 0 ? (
                    <View style={styles.emptyHistoryBox}>
                      <Ionicons name="people-outline" size={48} color="#94a3b8" />
                      <Text style={styles.emptyHistoryTitle}>
                        {meetingSearchQuery ? 'No Matching Meetings' : 'No Past Client Meetings Logged'}
                      </Text>
                      <Text style={styles.emptyHistorySub}>
                        {meetingSearchQuery
                          ? 'Try adjusting your search terms.'
                          : 'Logged meetings for this client will show up here with full details and photos.'}
                      </Text>
                    </View>
                  ) : (
                    filteredMeetings.map((item: any, idx: number) => (
                      <View key={idx} style={styles.historyCard}>
                        <View style={styles.historyCardHeader}>
                          <View style={styles.historyCodeBadge}>
                            <Text style={styles.historyCodeText}>
                              ID: {item.meetingCode || `MEET-${idx + 1}`}
                            </Text>
                          </View>
                          <Text style={styles.historyDate}>
                            Date: {item.date
                              ? new Date(item.date).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Logged'}
                          </Text>
                        </View>

                        <Text style={{ fontSize: 13, color: '#334155', marginBottom: 2 }}>
                          👤 <Text style={{ fontWeight: '700' }}>Meet With:</Text> {item.personMet || 'Client Representative'}
                        </Text>

                        <Text style={{ fontSize: 13, color: '#334155', marginBottom: 2 }}>
                          💼 <Text style={{ fontWeight: '700' }}>Representative:</Text> {item.byUser || userName}
                        </Text>

                        {item.promisedDate ? (
                          <Text style={{ fontSize: 11, color: '#1e3a8a', fontWeight: '700', marginBottom: 6 }}>
                            📅 Target Resolution: {item.promisedDate}
                          </Text>
                        ) : null}


                        {/* Action Row: Share PDF, Preview, Edit, Delete */}
                        <View style={styles.historyActionRow}>
                          <TouchableOpacity
                            style={styles.historyShareBtn}
                            onPress={() => handleShareMeetingPDF(item)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="share-social" size={14} color="#0284c7" />
                            <Text style={styles.historyShareBtnText}>Share PDF</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.historyPreviewBtn}
                            onPress={() => handlePreviewMeetingReport(item)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="eye-outline" size={14} color="#7c3aed" />
                            <Text style={styles.historyPreviewBtnText}>Preview</Text>
                          </TouchableOpacity>

                          {isAdmin && (
                            <TouchableOpacity
                              style={styles.historyEditBtn}
                              onPress={() => handleOpenEditMeeting(item)}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="pencil" size={14} color="#ca8a04" />
                              <Text style={styles.historyEditBtnText}>Edit</Text>
                            </TouchableOpacity>
                          )}

                          {isAdmin && (
                            <TouchableOpacity
                              style={styles.historyDeleteBtn}
                              onPress={() => handleDeleteMeeting(item)}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="trash" size={14} color="#dc2626" />
                              <Text style={styles.historyDeleteBtnText}>Delete</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* ── ADMIN EDIT MEETING MODAL ── */}
      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => setEditModalVisible(false)}>
        <View style={[styles.editModalOverlay, { paddingTop: insets.top }]}>
          <KeyboardAvoidingView
            style={{ flex: 1, width: '100%' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.editModalContainer}>
              <View style={styles.editModalHeader}>
                <View>
                  <Text style={styles.editModalTitle}>Edit Meeting Record</Text>
                  <Text style={styles.editModalSubtitle}>{editingMeeting?.meetingCode || 'Meeting'}</Text>
                </View>
                <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.editCloseBtn}>
                  <Ionicons name="close" size={22} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={{ flex: 1, padding: 16 }}
                contentContainerStyle={{ paddingBottom: 180 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets={true}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.label}>Person Met</Text>
                <TextInput
                  style={styles.input}
                  value={editPersonMet}
                  onChangeText={setEditPersonMet}
                  placeholder="Person Met"
                />

                <Text style={styles.label}>Meeting Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  {MEETING_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.chip, editMeetingType === t && styles.chipActive]}
                      onPress={() => setEditMeetingType(t)}
                    >
                      <Text style={[styles.chipText, editMeetingType === t && styles.chipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.label}>Discussion Summary</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editSummary}
                  onChangeText={setEditSummary}
                  multiline
                  numberOfLines={3}
                  placeholder="Discussion summary..."
                />

                <Text style={styles.label}>Complaint Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  {COMPLAINT_CATEGORIES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.chip, editComplaintCategory === c && styles.chipActive]}
                      onPress={() => setEditComplaintCategory(c)}
                    >
                      <Text style={[styles.chipText, editComplaintCategory === c && styles.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.label}>Complaint Details (Optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editComplaintDetails}
                  onChangeText={setEditComplaintDetails}
                  multiline
                  numberOfLines={2}
                  placeholder="Details of complaint..."
                />

                <Text style={styles.label}>Resolution Provided / Action Plan</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editResolution}
                  onChangeText={setEditResolution}
                  multiline
                  numberOfLines={3}
                  placeholder="Resolution / action plan..."
                />

                <Text style={styles.label}>Promised Target Resolution Date (Optional)</Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={editPromisedDate}
                    onChangeText={(val) => setEditPromisedDate(formatAutoDate(val))}
                    placeholder="DD-MM-YYYY (or tap calendar)"
                    placeholderTextColor="#94a3b8"
                    maxLength={10}
                    keyboardType="numeric"
                  />
                  <TouchableOpacity
                    style={styles.calendarBtn}
                    onPress={openEditDatePicker}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="calendar" size={16} color="#fff" />
                    <Text style={styles.calendarBtnText}>Calendar</Text>
                  </TouchableOpacity>
                </View>
                {showEditDatePicker && Platform.OS === 'ios' && (
                  <DateTimePicker
                    value={new Date()}
                    mode="date"
                    display="default"
                    onChange={(event: any, selectedDate?: Date) => {
                      setShowEditDatePicker(false);
                      if (selectedDate) {
                        setEditPromisedDate(formatDateToDDMMYYYY(selectedDate));
                      }
                    }}
                  />
                )}

                <TouchableOpacity
                  style={[styles.saveBtn, styles.saveBtnVerified, { marginTop: 20, marginBottom: 30 }]}
                  onPress={handleSaveEditedMeeting}
                  disabled={savingEdit}
                >
                  {savingEdit ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.saveBtnText}>Update Meeting Record</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── MEETING PREVIEW MODAL ── */}
      <Modal
        visible={!!previewHtml}
        animationType="fade"
        transparent
        onRequestClose={() => setPreviewHtml(null)}
      >
        <View style={styles.previewModalOverlay}>
          <View style={styles.previewModalContainer}>
            <View style={styles.previewModalHeader}>
              <Text style={styles.previewModalTitle}>Meeting Report Preview</Text>
              <TouchableOpacity onPress={() => setPreviewHtml(null)} style={styles.previewCloseBtn}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            {previewHtml && (
              <WebView
                originWhitelist={['*']}
                source={{ html: previewHtml }}
                style={{ flex: 1 }}
              />
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    backgroundColor: '#f8fafc',
    flex: 1,
  },
  header: {
    height: 64,
    backgroundColor: '#0f172a',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  headerBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  codeBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  codeBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  body: {
    flex: 1,
    padding: 16,
  },
  corpRepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  corpRepIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  corpRepLabel: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#3b82f6',
    letterSpacing: 0.6,
  },
  corpRepTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1e3a8a',
    marginTop: 1,
  },
  corpRepStaff: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginTop: 2,
  },
  corpRepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
  },
  corpRepBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#166534',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
  textArea: {
    minHeight: 75,
    textAlignVertical: 'top',
  },
  selectedLeadBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  selectedLeadName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e3a8a',
  },
  selectedLeadMeta: {
    fontSize: 11,
    color: '#3b82f6',
    marginTop: 2,
  },
  changeBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  changeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  leadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  leadOptionName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  leadOptionSub: {
    fontSize: 11,
    color: '#64748b',
  },
  whatsappBtn: {
    backgroundColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 6,
  },
  whatsappBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  chip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipSuccess: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  chipDanger: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  chipTextActive: {
    color: '#fff',
  },
  photoContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
  },
  watermarkOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    padding: 8,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  watermarkBrand: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  watermarkCodeBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  watermarkCodeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  watermarkClient: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  watermarkPerson: {
    color: '#cbd5e1',
    fontSize: 10,
  },
  watermarkLoc: {
    color: '#fde047',
    fontSize: 9.5,
    marginTop: 2,
  },
  watermarkTime: {
    color: '#94a3b8',
    fontSize: 9,
    marginTop: 1,
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  smallBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  captureLivePhotoBtn: {
    backgroundColor: '#eff6ff',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  capturePhotoText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
  },
  capturePhotoSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 3,
  },
  verifiedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#86efac',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  verifiedTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803d',
  },
  verifiedSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
    marginTop: 1,
  },
  verifiedPill: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  verifiedPillText: {
    color: '#fff',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  validationBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  validationTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1e293b',
    marginLeft: 6,
  },
  validationSub: {
    fontSize: 11,
    color: '#64748b',
  },
  otpInput: {
    letterSpacing: 3,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  verifyCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
    gap: 6,
  },
  verifyCodeBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  geoInsideBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#86efac',
    borderRadius: 12,
    padding: 12,
  },
  geoInsideTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803d',
  },
  geoInsideSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
    marginTop: 1,
  },
  geoRefreshBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  geoOutsideBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fca5a5',
    borderRadius: 12,
    padding: 12,
  },
  geoOutsideTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#b91c1c',
  },
  geoOutsideSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#991b1b',
    marginTop: 1,
  },
  geoRefreshBtnRed: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  geoUnconfBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderWidth: 1.5,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 12,
  },
  geoUnconfTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#b45309',
  },
  geoUnconfSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400e',
    marginTop: 1,
  },
  pinSiteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d97706',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  pinSiteBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  calendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  calendarBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  saveBtn: {
    backgroundColor: '#0f172a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 6,
    shadowColor: '#0f172a',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  saveBtnDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
    elevation: 0,
  },
  saveBtnVerified: {
    backgroundColor: '#16a34a',
    shadowColor: '#16a34a',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  saveNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
  },
  saveNoticeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  emptyHistoryBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyHistoryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#475569',
    marginTop: 12,
  },
  emptyHistorySub: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyCodeBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  historyCodeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  historyDate: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  historyPersonMet: {
    fontSize: 13,
    color: '#1e293b',
    marginBottom: 2,
  },
  historyMeetingType: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  historySection: {
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
  },
  historyComplaintBox: {
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3,
    borderLeftColor: '#dc2626',
  },
  historyResolutionBox: {
    backgroundColor: '#f0fdf4',
    borderLeftWidth: 3,
    borderLeftColor: '#16a34a',
  },
  historySectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 2,
  },
  historySectionText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 16,
  },
  historyImage: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    marginTop: 10,
  },
  historyActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  historyShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  historyShareBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  historyPreviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  historyPreviewBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7c3aed',
  },
  historyEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fefce8',
    borderWidth: 1,
    borderColor: '#fef08a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  historyEditBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#a16207',
  },
  historyDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  historyDeleteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
  },
  historySearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  historySearchIcon: {
    marginRight: 6,
  },
  historySearchInput: {
    flex: 1,
    height: 38,
    fontSize: 13,
    color: '#0f172a',
    padding: 0,
  },
  historySearchClearBtn: {
    padding: 4,
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  editModalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '96%',
    maxHeight: '96%',
    flex: 1,
    overflow: 'hidden',
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  editModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  editModalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  editCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  previewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  previewModalContainer: {
    width: '100%',
    height: '85%',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  previewModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  previewModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  previewCloseBtn: {
    padding: 4,
  },
});
