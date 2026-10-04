import React, { useState } from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Alert, Image, KeyboardAvoidingView, Platform, Linking, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, wfStyles, styles as GS } from '@/styles/stylesIndex';
import { appService } from '@/UtilServices/appHelper';
import { AadharScanner } from './AadharScanner';
import { AadharData } from '@/UtilServices/aadharParser';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { StatePicker } from '@/UtilServices/StatePicker';
import { DistrictPicker } from '@/UtilServices/DistrictPicker';
import { useUserContext } from '@/context/AuthContext';

interface AddEmployeeModalProps {
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
  onEditComplete?: () => void;
  employee?: any; // For Edit Mode
  isStaffMode?: boolean;
}

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({
  visible, onClose, onComplete, onEditComplete, employee, isStaffMode
}) => {
  const { user } = useUserContext();
  const isAdmin = (user?.userRole as any) === 'CorpAdmin' || (user?.userRole as any) === 'userAdmin' || (user?.userRole as any) === 'Admin';
  // Duplicate isAdmin removed
  const canEditShift = (user?.userRole as any) === 'CorpAdmin' || (user?.userRole as any) === 'userAdmin' || (user?.userRole as any) === 'Project';

  const [name, setName] = useState(employee?.name || '');
  const [fatherName, setFatherName] = useState(employee?.father_name || '');
  const [mobile, setMobile] = useState(employee?.mobile || '');
  const [aadhar, setAadhar] = useState(employee?.aadhar_no || '');
  const [enrollmentNo, setEnrollmentNo] = useState(employee?.enrollment_no || '');
  const [dob, setDob] = useState<Date | null>(employee?.dob ? new Date(employee.dob) : null);
  // Resolve active employment entry (last entry where active===true, or last entry)
  const activeEmp = React.useMemo(() => {
    const hist = employee?.employmentHistory || [];
    return hist.find((e: any) => e.active) || hist[hist.length - 1] || null;
  }, [employee]);

  const [joinDate, setJoinDate] = useState<Date | null>(activeEmp?.joinDate ? new Date(activeEmp.joinDate) : (employee?.joinDate ? new Date(employee.joinDate) : new Date()));
  const [gender, setGender] = useState(employee?.gender || 'Male');
  const [role, setRole] = useState(employee?.role || 'Worker');
  const [rate, setRate] = useState(String(activeEmp?.daily_rate ?? employee?.daily_rate ?? ''));
  const [monthlyRate, setMonthlyRate] = useState(String(activeEmp?.monthly_rate ?? employee?.monthly_rate ?? ''));
  const [photo, setPhoto] = useState(employee?.photo_url || '');
  const [isActive, setIsActive] = useState<boolean>(employee ? (employee.active !== false) : true);
  const [shiftStart, setShiftStart] = useState(activeEmp?.shiftStartTime || '');
  const [shiftHours, setShiftHours] = useState(String(activeEmp?.shiftHours || '8'));
  const [groupName, setGroupName] = useState<'MANG' | 'DaNi' | ''>(activeEmp?.groupName || '');
  const [shiftName, setShiftName] = useState(activeEmp?.shiftName || '');

  const [locations, setLocations] = useState<any[]>([]);
  const [locationId, setLocationId] = useState<string | null>(employee?.locationId || null);

  // Address States
  const [pLine1, setPLine1] = useState(employee?.addresses?.permanent?.line1 || '');
  const [pCity, setPCity] = useState(employee?.addresses?.permanent?.city || '');
  const [pDistrict, setPDistrict] = useState(employee?.addresses?.permanent?.district || '');
  const [pState, setPState] = useState(employee?.addresses?.permanent?.state || '');
  const [pPin, setPPin] = useState(employee?.addresses?.permanent?.pincode || '');

  const [lLine1, setLLine1] = useState(employee?.addresses?.local?.line1 || '');
  const [lCity, setLCity] = useState(employee?.addresses?.local?.city || '');
  const [lDistrict, setLDistrict] = useState(employee?.addresses?.local?.district || '');
  const [lState, setLState] = useState(employee?.addresses?.local?.state || '');
  const [lPin, setLPin] = useState(employee?.addresses?.local?.pincode || '');

  const [sameAsPermanent, setSameAsPermanent] = useState(true);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [showJoinPicker, setShowJoinPicker] = useState(false);

  const [loading, setLoading] = useState(false);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);

  // Picker States
  const [showPStatePicker, setShowPStatePicker] = useState(false);
  const [showPDistrictPicker, setShowPDistrictPicker] = useState(false);
  const [showLStatePicker, setShowLStatePicker] = useState(false);
  const [showLDistrictPicker, setShowLDistrictPicker] = useState(false);
  const [pStateCode, setPStateCode] = useState("");
  const [lStateCode, setLStateCode] = useState("");

  const prevVisibleRef = React.useRef<boolean | null>(null);

  React.useEffect(() => {
    if (visible && prevVisibleRef.current !== true) {
      if (employee) {
        setName(employee.name || '');
        setFatherName(employee.father_name || '');
        setMobile(employee.mobile || '');
        setAadhar(employee.aadhar_no || employee.aadhar || '');
        setEnrollmentNo(employee.enrollment_no || '');
        setDob(employee.dob ? new Date(employee.dob) : null);
        const ae = (employee.employmentHistory || []).find((e: any) => e.active) ||
                    (employee.employmentHistory || []).slice(-1)[0] || null;
        setJoinDate(ae?.joinDate ? new Date(ae.joinDate) : (employee.joinDate ? new Date(employee.joinDate) : new Date()));
        setGender(employee.gender || 'Male');
        setRole(employee.role || 'Worker');
        setRate(String(ae?.daily_rate ?? employee.daily_rate ?? ''));
        setMonthlyRate(String(ae?.monthly_rate ?? employee.monthly_rate ?? ''));
        setPhoto(employee.photo_url || '');
        setShiftStart(ae?.shiftStartTime || '');
        setShiftHours(String(ae?.shiftHours || '8'));
        setGroupName(ae?.groupName || '');
        setShiftName(ae?.shiftName || '');
        setIsActive(employee.active !== false);
        
        const p = employee.addresses?.permanent || {};
        const l = employee.addresses?.local || {};
        setPLine1(p.line1 || ''); setPCity(p.city || ''); setPDistrict(p.district || ''); setPState(p.state || ''); setPPin(p.pincode || '');
        setLLine1(l.line1 || ''); setLCity(l.city || ''); setLDistrict(l.district || ''); setLState(l.state || ''); setLPin(l.pincode || '');
        setSameAsPermanent(!l.line1 || (p.line1 === l.line1 && p.pincode === l.pincode));
        setLocationId(employee.locationId || null);
      } else {
        handleClear();
      }

      // Fetch locations
      (async () => {
        try {
          const session = await appService.getSession();
          if (session?.token) {
            const res = await appService.httpClient.get("/setting/update/corporate", {
              params: { corporateId: user?.corporateId, corpAdminId: user?.corpAdminId },
              headers: { Authorization: `Bearer ${session.token}` }
            });
            const locs = res.data?.data?.accessCorporate?.locations || [];
            setLocations(locs);
            
            // Default to HO if no locationId is set
            if (employee) {
              setLocationId(employee.locationId || null);
            } else {
              const hoLoc = locs.find((l: any) => l.locationType === 'HO');
              if (hoLoc) {
                setLocationId(hoLoc._id);
              } else if (locs.length > 0) {
                setLocationId(locs[0]._id);
              } else {
                setLocationId(null);
              }
            }
          }
        } catch (err) {
          console.error("Failed to load corporate locations in AddEmployeeModal:", err);
        }
      })();
    }
    prevVisibleRef.current = visible;
  }, [visible, employee, user]);

  const ROLES = ["Worker", "Supervisor", "Electrician", "Plumber", "Welder", "Carpenter", "Painter", "Helper", "Other"];

  const handleDailyChange = (val: string) => {
    setRate(val);
    const d = parseFloat(val);
    if (!isNaN(d)) setMonthlyRate(String(Math.round(d * 30)));
    else setMonthlyRate('');
  };

  const handleMonthlyChange = (val: string) => {
    setMonthlyRate(val);
    const m = parseFloat(val);
    if (!isNaN(m)) setRate(String(Math.round(m / 30)));
    else setRate('');
  };

  const handleClear = () => {
    setName(''); setFatherName(''); setMobile(''); setAadhar(''); setEnrollmentNo(''); setRate(''); setMonthlyRate(''); setRole('Worker'); setPhoto('');
    setLocalPhotoUri(null);
    setDob(null); setJoinDate(new Date()); setPLine1(''); setPCity(''); setPDistrict(''); setPState(''); setPPin('');
    setLLine1(''); setLCity(''); setLDistrict(''); setLState(''); setLPin(''); setSameAsPermanent(true);
    setShiftStart(''); setShiftHours('8'); setGroupName(''); setShiftName('');
    setIsActive(true);
    
    // Set locationId to HO if available
    const hoLoc = locations.find((l: any) => l.locationType === 'HO');
    if (hoLoc) {
      setLocationId(hoLoc._id);
    } else if (locations.length > 0) {
      setLocationId(locations[0]._id);
    } else {
      setLocationId(null);
    }
  };

  const onChangeDob = (event: any, selectedDate?: Date) => {
    setShowDobPicker(Platform.OS === 'ios');
    if (selectedDate && event.type === 'set') {
      setDob(selectedDate);
    }
  };

  const onChangeJoinDate = (event: any, selectedDate?: Date) => {
    setShowJoinPicker(Platform.OS === 'ios');
    if (selectedDate && event.type === 'set') {
      setJoinDate(selectedDate);
    }
  };

  const openDobPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: dob || new Date(),
        mode: 'date',
        display: 'default',
        maximumDate: new Date(),
        onChange: (event: any, selectedDate?: Date) => {
          if (selectedDate && event.type === 'set') {
            setDob(selectedDate);
          }
        },
      });
    } else {
      setShowDobPicker(true);
    }
  };

  const openJoinPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: joinDate || new Date(),
        mode: 'date',
        display: 'default',
        onChange: (event: any, selectedDate?: Date) => {
          if (selectedDate && event.type === 'set') {
            setJoinDate(selectedDate);
          }
        },
      });
    } else {
      setShowJoinPicker(true);
    }
  };

  const handleAdd = async () => {
    if (!name || !mobile) {
      appService.showToast("Name and Mobile are required", "Error");
      return;
    }

    if (mobile.length !== 10) {
      appService.showToast("Enter a valid 10-digit mobile number", "Error");
      return;
    }

    if (!aadhar) {
      appService.showToast("Aadhar Number is required", "Error");
      return;
    }

    if (aadhar.length !== 12) {
      appService.showToast("Enter a valid 12-digit Aadhar number", "Error");
      return;
    }

    // Validate shift time format HH:MM
    if (shiftStart && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(shiftStart)) {
      appService.showToast('Shift Start must be HH:MM (24h), e.g. 08:00', 'Error');
      return;
    }

    setLoading(true);
    try {
      const session = await appService.getSession();
      if (!session?.token) return;

      // Build new active employment entry
      const newEntry = {
        joinDate: joinDate || new Date(),
        daily_rate: parseFloat(rate) || 0,
        monthly_rate: parseFloat(monthlyRate) || 0,
        shiftStartTime: shiftStart,
        shiftHours: parseFloat(shiftHours) || 8,
        groupName: groupName || null,
        shiftName: shiftName || null,
        active: true,
        locationId: locationId || null,
      };

      // If editing, close old active entry and append new one
      let updatedHistory: any[] = [];
      if (employee?._id) {
        const existing: any[] = employee.employmentHistory || [];
        // Deactivate previous active entry if rates/shift/location changed
        const ae = existing.find((e: any) => e.active);
        const rateChanged = ae &&
          (ae.daily_rate !== newEntry.daily_rate ||
           ae.shiftStartTime !== newEntry.shiftStartTime ||
           ae.shiftHours !== newEntry.shiftHours ||
           ae.locationId !== newEntry.locationId);
        if (rateChanged) {
          updatedHistory = existing.map((e: any) => e.active ? { ...e, active: false, endDate: new Date() } : e);
          updatedHistory.push(newEntry);
        } else {
          // No rate change — just update current active entry in-place
          updatedHistory = existing.map((e: any) => e.active ? { ...e, ...newEntry } : e);
          if (updatedHistory.length === 0) updatedHistory = [newEntry];
        }
      } else {
        updatedHistory = [newEntry];
      }

      // Derive shift code from group + shift name (for root-level selectedShift sync)
      let derivedShiftCode = '';
      if (groupName === 'MANG') {
        if (shiftName === 'Morning') derivedShiftCode = 'M';
        else if (shiftName === 'Afternoon') derivedShiftCode = 'A';
        else if (shiftName === 'Night') derivedShiftCode = 'N';
        else if (shiftName === 'General') derivedShiftCode = 'G';
      } else if (groupName === 'DaNi') {
        if (shiftName === 'Day') derivedShiftCode = 'D';
        else if (shiftName === 'Night') derivedShiftCode = 'N2';
      }

      const payload = {
        name,
        father_name: fatherName,
        mobile,
        aadhar_no: aadhar,
        enrollment_no: enrollmentNo,
        dob,
        joinDate: newEntry.joinDate,      // sync flat field for legacy compat
        daily_rate: newEntry.daily_rate,  // sync flat field
        monthly_rate: newEntry.monthly_rate,
        gender,
        role,
        photo_url: photo,
        active: isActive,
        employmentHistory: updatedHistory,
        // Sync root-level shift fields from the active employmentHistory entry
        // so all readers (useAttendance fallback, header, etc.) stay consistent
        shiftGroupName: groupName || null,
        selectedShift: derivedShiftCode || null,
        locationId: locationId || null,
        addresses: {
           permanent: { line1: pLine1, city: pCity, district: pDistrict, state: pState, pincode: pPin },
           local: sameAsPermanent ?
             { line1: pLine1, city: pCity, district: pDistrict, state: pState, pincode: pPin } :
             { line1: lLine1, city: lCity, district: lDistrict, state: lState, pincode: lPin }
        },
      };

      const endpoint = employee?._id ? `service/hr/employees/${employee._id}` : 'service/hr/employees';
      const method = employee?._id ? 'put' : 'post';

      const res = await (appService.httpClient as any)[method](endpoint, payload, {
        headers: { Authorization: `Bearer ${session.token}` }
      });

      if (res.data.success) {
        const empId = employee?._id || res.data.data._id;
        
        if (localPhotoUri) {
          setUploadingPhoto(true);
          try {
            const formData = new FormData();
            const ext = localPhotoUri.split('.').pop() || 'jpg';
            formData.append('file', {
              uri: localPhotoUri,
              name: `${empId}.${ext}`,
              type: `image/${ext}`
            } as any);
            formData.append('subFolder', 'employee');

            const uploadRes = await appService.httpClient.post('upload/cloudinary', formData, {
              headers: { 
                'Content-Type': 'multipart/form-data',
                'Authorization': `Bearer ${session.token}`
              }
            });

            if (uploadRes.data.success) {
              // Update employee with the final URL
              await appService.httpClient.put(`service/hr/employees/${empId}`, {
                photo_url: uploadRes.data.url
              }, { headers: { Authorization: `Bearer ${session.token}` } });
            }
          } catch (uploadErr) {
            console.error("Deferred photo upload failed:", uploadErr);
          } finally {
            setUploadingPhoto(false);
          }
        }

        appService.showToast(`Worker ${employee?._id ? 'updated' : 'added'} successfully!`, "Success");
        handleClear();
        onComplete();
        // Call onEditComplete if this was an edit operation
        if (employee?._id) {
          onEditComplete?.();
        }
        onClose();
      }
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.message || err.message || "Failed to add worker");
    } finally {
      setLoading(false);
    }
  };

  const handleScanned = (data: AadharData) => {
    setName(data.name || '');
    setFatherName(data.co || '');
    setAadhar(data.uid || '');
    if (data.mobile) {
      const cleanMobile = data.mobile.replace(/\D/g, '').slice(-10);
      setMobile(cleanMobile);
    }
    if (data.dob) {
      // DOB parser already returns YYYY-MM-DD
      setDob(new Date(data.dob));
    }
    if (data.gender) {
        setGender(data.gender);
    }
    
    // Auto-populate Permanent Address
    setPLine1(data.house ? `${data.house}, ${data.street || ''}` : data.street || '');
    setPCity(data.city || '');
    setPDistrict(data.district || '');
    setPState(data.state || '');
    setPPin(data.pincode || '');
    
    if (!data.uid && data.name) {
       appService.showToast("Aadhar scanned! (UID is masked for security, please enter manually)", "Success");
    } else {
       appService.showToast("Aadhar scanned successfully!", "Success");
    }
  };

  const pickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          "Permission Required",
          "Gallery permission is needed to upload photo.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() }
          ]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled) {
        setLocalPhotoUri(result.assets[0].uri);
      }
    } catch (error: any) {
      console.error("Error picking photo:", error);
      Alert.alert("Error", "Failed to select photo: " + (error.message || error));
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          "Permission Required",
          "Camera permission is needed to take a worker photo.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() }
          ]
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled) {
        setLocalPhotoUri(result.assets[0].uri);
      }
    } catch (error: any) {
      console.error("Error taking photo:", error);
      Alert.alert("Error", "Failed to launch camera: " + (error.message || error));
    }
  };

  // Removed immediate uploadPhoto function as it's now deferred to handleAdd

  const handleDelete = async () => {
    if (!employee?._id) {
      Alert.alert("Error", "Invalid employee record.");
      return;
    }

    Alert.alert(
      "Confirm Delete",
      "Are you sure you want to delete this worker? This can only be done if they have no attendance history.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            setLoading(true);
            try {
              const session = await appService.getSession();
              if (!session?.token) return;
              const res = await appService.httpClient.delete(`service/hr/employees/${employee._id}`, {
                headers: { Authorization: `Bearer ${session.token}` }
              });
              if (res.data.success) {
                appService.showToast("Worker deleted successfully", "Success");
                onComplete();
                onClose();
              }
            } catch (err: any) {
              Alert.alert("Deletion Failed", err.response?.data?.message || "Could not delete worker.");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <View style={[wfStyles.wfModalOverlayBottom, { marginTop: 0, paddingTop: insets.top }]}>
        <View style={[wfStyles.wfModalContainerBottom, { paddingBottom: 0 }]}>
          <View style={{ height: 60, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
            <TouchableOpacity onPress={onClose} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff' }}>{employee ? 'Edit Worker' : 'Add New Worker'}</Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '800' }}>{employee ? `Profile: ${employee.name}` : 'Create a new staff profile'}</Text>
            </View>
          </View>

          <ScrollView 
            style={{ flex: 1 }} 
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }} 
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Corporate Link Toggle ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: '#fca5a5', true: '#86efac' }}
                thumbColor={isActive ? '#166534' : '#991b1b'}
              />
              <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: '700', color: isActive ? '#166534' : '#991b1b' }}>
                {isActive ? 'Linked' : 'Delinked'}
              </Text>
            </View>

            {/* ── ACTION BUTTONS ROW ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginVertical: 20 }}>
               {/* Scan Aadhar */}
               <TouchableOpacity style={{ alignItems: 'center' }} onPress={() => setScannerVisible(true)}>
                  <View style={[GS.iconCircle, { width: 50, height: 50, backgroundColor: COLORS.primary + '15', borderColor: COLORS.primary }]}>
                    <Ionicons name="qr-code" size={24} color={COLORS.primary} />
                  </View>
                  <Text style={{ marginTop: 8, fontSize: 11, fontWeight: '800', color: COLORS.primary }}>SCAN AADHAR</Text>
               </TouchableOpacity>

               {/* Gallery */}
               <TouchableOpacity style={{ alignItems: 'center' }} onPress={pickPhoto} disabled={uploadingPhoto}>
                  <View style={[GS.iconCircle, { width: 50, height: 50, backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }]}>
                    <Ionicons name="images" size={24} color="#64748b" />
                  </View>
                  <Text style={{ marginTop: 8, fontSize: 11, fontWeight: '800', color: '#64748b' }}>GALLERY</Text>
               </TouchableOpacity>

               {/* Camera */}
               <TouchableOpacity style={{ alignItems: 'center' }} onPress={takePhoto} disabled={uploadingPhoto}>
                  <View style={[GS.iconCircle, { width: 50, height: 50, backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }]}>
                    <Ionicons name="camera" size={24} color="#64748b" />
                  </View>
                  <Text style={{ marginTop: 8, fontSize: 11, fontWeight: '800', color: '#64748b' }}>CAMERA</Text>
               </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 12, gap: 15 }}>
               <View style={{ flex: 1, height: 1, backgroundColor: '#eee' }} />
               <Text style={{ fontSize: 10, color: '#999', fontWeight: '800' }}>BASIC DETAILS</Text>
               <View style={{ flex: 1, height: 1, backgroundColor: '#eee' }} />
            </View>

            <View style={{ marginBottom: 24, alignItems: 'center' }}>
                <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: '#f1f5f9', borderWidth: 2, borderColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                  {(localPhotoUri || photo) ? (
                    <Image source={{ uri: localPhotoUri || photo }} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <Ionicons name="person" size={60} color="#cbd5e1" />
                  )}
                 {uploadingPhoto && (
                   <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
                     <ActivityIndicator color="#fff" />
                   </View>
                 )}
               </View>
            </View>

            <Text style={GS.inputLabel}>Worker Name *</Text>
            <TextInput
              style={wfStyles.wfFormInput}
              placeholder="Full Name as per ID"
              value={name}
              onChangeText={setName}
            />

            <Text style={[GS.inputLabel, { marginTop: 16 }]}>Father's / Husband's Name</Text>
            <TextInput
              style={wfStyles.wfFormInput}
              placeholder="Care of Name"
              value={fatherName}
              onChangeText={setFatherName}
            />

            {/* ── ROW: MOBILE & AADHAR ── */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
               <View style={{ flex: 1 }}>
                  <Text style={GS.inputLabel}>Mobile Number *</Text>
                  <TextInput
                    style={wfStyles.wfFormInput}
                    placeholder="10 digits"
                    keyboardType="phone-pad"
                    maxLength={10}
                    value={mobile}
                    onChangeText={setMobile}
                  />
               </View>
               <View style={{ flex: 1 }}>
                  <Text style={GS.inputLabel}>Aadhar Number *</Text>
                  <TextInput
                    style={wfStyles.wfFormInput}
                    placeholder="12-digit UID"
                    keyboardType="number-pad"
                    maxLength={12}
                    value={aadhar}
                    onChangeText={setAadhar}
                  />
               </View>
            </View>



            {/* ── ROW: DOB & GENDER ── */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
               <View style={{ flex: 1 }}>
                  <Text style={GS.inputLabel}>Date of Birth</Text>
                  <TouchableOpacity 
                    style={[wfStyles.wfFormInput, { justifyContent: 'center' }]} 
                    onPress={openDobPicker}
                  >
                    <Text style={{ color: dob ? '#1e293b' : '#94a3b8', fontWeight: '700' }}>
                       {dob ? appService.formatDate(dob) : 'Select Date'}
                    </Text>
                  </TouchableOpacity>
               </View>
               <View style={{ flex: 1 }}>
                  <Text style={GS.inputLabel}>Gender</Text>
                  <View style={{ flexDirection: 'row', gap: 4, height: 48, alignItems: 'center' }}>
                     {["Male", "Female", "Other"].map(g => (
                       <TouchableOpacity 
                         key={g} 
                         onPress={() => setGender(g === "Other" ? "Transgender" : g)}
                         style={{ 
                           flex: 1, 
                           height: '100%', 
                           backgroundColor: (gender === g || (g === "Other" && gender === "Transgender")) ? COLORS.primary : '#f1f5f9', 
                           borderRadius: 8, 
                           justifyContent: 'center', 
                           alignItems: 'center' 
                         }}
                       >
                         <Text style={{ fontSize: 10, fontWeight: '800', color: (gender === g || (g === "Other" && gender === "Transgender")) ? '#fff' : '#64748b' }}>
                           {g.toUpperCase()}
                         </Text>
                       </TouchableOpacity>
                     ))}
                  </View>
               </View>
            </View>

            {Platform.OS === 'ios' && showDobPicker && (
              <DateTimePicker
                value={dob || new Date()}
                mode="date"
                display="default"
                onChange={onChangeDob}
                maximumDate={new Date()}
              />
            )}

            {/* Join Date moved into Employment History section below */}
            {Platform.OS === 'ios' && showJoinPicker && (
              <DateTimePicker
                value={joinDate || new Date()}
                mode="date"
                display="default"
                onChange={onChangeJoinDate}
              />
            )}

            <View style={{ marginTop: 16 }}>
               <Text style={GS.inputLabel}>Enrollment Form Number {isStaffMode && <Text style={{ color: '#ef4444', fontSize: 10 }}>(Locked)</Text>}</Text>
               <TextInput
                 style={[wfStyles.wfFormInput, isStaffMode && { backgroundColor: '#f1f5f9', color: '#64748b' }]}
                 placeholder="Enter form number (if available)"
                 value={enrollmentNo}
                 onChangeText={setEnrollmentNo}
                 editable={!isStaffMode}
               />
            </View>

            {/* ── ASSIGNED OFFICE / BRANCH ── */}
            {locations.length > 0 && (
              <View style={{ marginTop: 24, padding: 16, backgroundColor: '#f8fafc', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0' }}>
                 <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary, marginBottom: 12 }}>ASSIGNED OFFICE / BRANCH *</Text>
                 <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {locations.map(loc => {
                      const isSelected = locationId === loc._id;
                      return (
                        <TouchableOpacity 
                          key={loc._id}
                          onPress={() => setLocationId(loc._id)}
                          style={{
                            paddingVertical: 10,
                            paddingHorizontal: 14,
                            borderRadius: 12,
                            marginRight: 8,
                            backgroundColor: isSelected ? COLORS.primary + '15' : '#fff',
                            borderWidth: 1.5,
                            borderColor: isSelected ? COLORS.primary : '#e2e8f0',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '800', color: isSelected ? COLORS.primary : '#1e293b' }}>
                            {loc.locationName.toUpperCase()}
                          </Text>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748b', marginTop: 2 }}>
                            {loc.locationType} | {loc.address?.state || ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                 </ScrollView>
              </View>
            )}

            {/* Address Sections */}
            <View style={{ marginTop: 24, padding: 16, backgroundColor: '#f8fafc', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0' }}>
               <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary, marginBottom: 12 }}>PERMANENT ADDRESS</Text>
               <TextInput style={[wfStyles.wfFormInput, { backgroundColor: '#fff', marginBottom: 10 }]} placeholder="Street / House No" value={pLine1} onChangeText={setPLine1} />
               <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput style={[wfStyles.wfFormInput, { flex: 1, backgroundColor: '#fff' }]} placeholder="City" value={pCity} onChangeText={setPCity} />
                  <TouchableOpacity 
                    style={[wfStyles.wfFormInput, { flex: 1, backgroundColor: '#fff', justifyContent: 'center' }]} 
                    onPress={() => setShowPDistrictPicker(true)}
                  >
                    <Text style={{ color: pDistrict ? '#1e293b' : '#94a3b8', fontSize: 13 }}>{pDistrict || "District"}</Text>
                  </TouchableOpacity>
               </View>
               <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <TouchableOpacity 
                    style={[wfStyles.wfFormInput, { flex: 1, backgroundColor: '#fff', justifyContent: 'center' }]} 
                    onPress={() => setShowPStatePicker(true)}
                  >
                    <Text style={{ color: pState ? '#1e293b' : '#94a3b8', fontSize: 13 }}>{pState || "State"}</Text>
                  </TouchableOpacity>
                  <TextInput style={[wfStyles.wfFormInput, { flex: 1, backgroundColor: '#fff' }]} placeholder="Pincode" keyboardType="numeric" value={pPin} onChangeText={setPPin} />
               </View>
            </View>

            <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
               <TouchableOpacity 
                 onPress={() => setSameAsPermanent(!sameAsPermanent)}
                 style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: COLORS.primary, backgroundColor: sameAsPermanent ? COLORS.primary : 'transparent', justifyContent: 'center', alignItems: 'center' }}
               >
                 {sameAsPermanent && <Ionicons name="checkmark" size={14} color="#fff" />}
               </TouchableOpacity>
               <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '700' }}>Local address same as permanent</Text>
            </View>

            {!sameAsPermanent && (
              <View style={{ marginTop: 16, padding: 16, backgroundColor: '#f1f5f9', borderRadius: 16 }}>
                 <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748b', marginBottom: 12 }}>LOCAL ADDRESS</Text>
                 <TextInput style={[wfStyles.wfFormInput, { backgroundColor: '#fff', marginBottom: 10 }]} placeholder="Street / House No" value={lLine1} onChangeText={setLLine1} />
                 <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TextInput style={[wfStyles.wfFormInput, { flex: 1, backgroundColor: '#fff' }]} placeholder="City" value={lCity} onChangeText={setLCity} />
                    <TouchableOpacity 
                      style={[wfStyles.wfFormInput, { flex: 1, backgroundColor: '#fff', justifyContent: 'center' }]} 
                      onPress={() => setShowLDistrictPicker(true)}
                    >
                      <Text style={{ color: lDistrict ? '#1e293b' : '#94a3b8', fontSize: 13 }}>{lDistrict || "District"}</Text>
                    </TouchableOpacity>
                 </View>
                 <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <TouchableOpacity 
                      style={[wfStyles.wfFormInput, { flex: 1, backgroundColor: '#fff', justifyContent: 'center' }]} 
                      onPress={() => setShowLStatePicker(true)}
                    >
                      <Text style={{ color: lState ? '#1e293b' : '#94a3b8', fontSize: 13 }}>{lState || "State"}</Text>
                    </TouchableOpacity>
                    <TextInput style={[wfStyles.wfFormInput, { flex: 1, backgroundColor: '#fff' }]} placeholder="Pincode" keyboardType="numeric" value={lPin} onChangeText={setLPin} />
                 </View>
              </View>
            )}

            {/* Rates moved into Employment History section below */}

            {/* ── EMPLOYMENT HISTORY SECTION ── */}
            <View style={{ marginTop: 24, padding: 14, backgroundColor: '#f8fafc', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary, marginBottom: 10 }}>CURRENT EMPLOYMENT</Text>

              {/* Join Date */}
              <Text style={GS.inputLabel}>Join Date</Text>
              <TouchableOpacity
                style={[wfStyles.wfFormInput, { justifyContent: 'center', backgroundColor: '#fff', marginBottom: 10 }]}
                onPress={openJoinPicker}
              >
                <Text style={{ color: joinDate ? '#1e293b' : '#94a3b8', fontWeight: '700' }}>
                  {joinDate ? appService.formatDate(joinDate) : 'Select Join Date'}
                </Text>
              </TouchableOpacity>

              {/* Rates Row */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={GS.inputLabel}>Daily Rate (₹) {isStaffMode && <Text style={{ color: '#ef4444', fontSize: 10 }}>(Locked)</Text>}</Text>
                  <TextInput
                    style={[wfStyles.wfFormInput, { backgroundColor: '#fff' }, isStaffMode && { backgroundColor: '#f1f5f9', color: '#64748b' }]}
                    placeholder="Per day"
                    keyboardType="numeric"
                    value={rate}
                    onChangeText={handleDailyChange}
                    editable={!isStaffMode}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={GS.inputLabel}>Monthly Rate (₹) {isStaffMode && <Text style={{ color: '#ef4444', fontSize: 10 }}>(Locked)</Text>}</Text>
                  <TextInput
                    style={[wfStyles.wfFormInput, { backgroundColor: '#fff' }, isStaffMode && { backgroundColor: '#f1f5f9', color: '#64748b' }]}
                    placeholder="Per month"
                    keyboardType="numeric"
                    value={monthlyRate}
                    onChangeText={handleMonthlyChange}
                    editable={!isStaffMode}
                  />
                </View>
              </View>

              {/* Shift Group (MANG / DaNi) */}
              <Text style={[GS.inputLabel, { marginTop: 10 }]}>Shift Group</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                {(['MANG', 'DaNi'] as const).map(g => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => {
                      if (!canEditShift) return;
                      setGroupName(g);
                      setShiftHours(g === 'DaNi' ? '12' : '8');
                      setShiftName(''); // reset slot on group change
                    }}
                    disabled={!canEditShift}
                    style={{
                      flex: 1, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center',
                      borderWidth: 2,
                      borderColor: groupName === g ? (g === 'MANG' ? COLORS.primary : '#7c3aed') : '#e2e8f0',
                      backgroundColor: groupName === g ? (g === 'MANG' ? COLORS.primary + '15' : '#7c3aed15') : '#fff',
                      opacity: canEditShift ? 1 : 0.6,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '900', color: groupName === g ? (g === 'MANG' ? COLORS.primary : '#7c3aed') : '#94a3b8' }}>{g}</Text>
                    <Text style={{ fontSize: 8, color: groupName === g ? (g === 'MANG' ? COLORS.primary : '#7c3aed') : '#94a3b8', fontWeight: '600' }}>{g === 'MANG' ? '8 hrs' : '12 hrs'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Shift Name chips — contextual to selected group */}
              {groupName !== '' && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={GS.inputLabel}>Shift Slot</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                    {(groupName === 'MANG'
                      ? [
                          { name: 'Morning',   time: '06:00–14:00' },
                          { name: 'Afternoon', time: '14:00–22:00' },
                          { name: 'Night',     time: '22:00–06:00' },
                          { name: 'General',   time: 'any 8h' },
                        ]
                      : [
                          { name: 'Day',   time: '06:00–18:00' },
                          { name: 'Night', time: '18:00–06:00' },
                        ]
                    ).map(s => (
                      <TouchableOpacity
                        key={s.name}
                        onPress={() => {
                          if (!canEditShift) return;
                          setShiftName(s.name);
                        }}
                        disabled={!canEditShift}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 2,
                          borderColor: shiftName === s.name ? (groupName === 'MANG' ? COLORS.primary : '#7c3aed') : '#e2e8f0',
                          backgroundColor: shiftName === s.name ? (groupName === 'MANG' ? COLORS.primary + '12' : '#7c3aed12') : '#fff',
                          opacity: canEditShift ? 1 : 0.6,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '800', color: shiftName === s.name ? (groupName === 'MANG' ? COLORS.primary : '#7c3aed') : '#64748b' }}>{s.name}</Text>
                        <Text style={{ fontSize: 8, color: '#94a3b8' }}>{s.time}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Shift Timing Row */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={GS.inputLabel}>Shift Start (HH:MM 24h)</Text>
                  <TextInput
                    style={[wfStyles.wfFormInput, { backgroundColor: '#fff' }, !canEditShift && { backgroundColor: '#f1f5f9', color: '#64748b' }]}
                    placeholder="e.g. 08:00"
                    value={shiftStart}
                    onChangeText={text => {
                      if (!canEditShift) return;
                      let v = text.replace(/[^0-9]/g, '');
                      if (v.length > 2) {
                        v = v.slice(0, 2) + ':' + v.slice(2, 4);
                      } else if (v.length === 2 && text.length > shiftStart.length) {
                        v = v + ':';
                      }
                      setShiftStart(v);
                    }}
                    maxLength={5}
                    keyboardType="numeric"
                    editable={canEditShift}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={GS.inputLabel}>Shift Hours</Text>
                  <TextInput
                    style={[wfStyles.wfFormInput, { backgroundColor: '#fff' }, !canEditShift && { backgroundColor: '#f1f5f9', color: '#64748b' }]}
                    placeholder="e.g. 8 or 12"
                    keyboardType="numeric"
                    value={shiftHours}
                    onChangeText={v => {
                      if (!canEditShift) return;
                      setShiftHours(v);
                    }}
                    editable={canEditShift}
                  />
                </View>
              </View>

              {/* History list (edit mode only) */}
              {employee?.employmentHistory?.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748b', marginBottom: 6 }}>HISTORY</Text>
                  {[...employee.employmentHistory].reverse().map((entry: any, idx: number) => (
                    <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                      <View>
                        <Text style={{ fontSize: 10, color: entry.active ? COLORS.primary : '#94a3b8', fontWeight: '800' }}>
                          {entry.active ? '● ACTIVE' : '○'} {appService.formatDate(new Date(entry.joinDate))}{entry.endDate ? ` → ${appService.formatDate(new Date(entry.endDate))}` : ''}
                        </Text>
                        <Text style={{ fontSize: 9, color: '#64748b' }}>
                          ₹{entry.daily_rate}/day · {entry.groupName ? `${entry.groupName}·${entry.shiftName || '?'}` : (entry.shiftStartTime || '--')}  {entry.shiftHours}h
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <Text style={[GS.inputLabel, { marginTop: 16 }]}>Role / Trade {isStaffMode && <Text style={{ color: '#ef4444', fontSize: 10 }}>(Locked)</Text>}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 40 }}>
               {ROLES.map(r => (
                 <TouchableOpacity 
                   key={r} 
                   style={[{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' }, role === r && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }, isStaffMode && { opacity: 0.8 }]}
                   onPress={() => !isStaffMode && setRole(r)}
                   disabled={isStaffMode}
                 >
                   <Text style={[{ fontSize: 13, color: '#64748b', fontWeight: '700' }, role === r && { color: '#fff' }]}>{r}</Text>
                 </TouchableOpacity>
               ))}
            </View>
            </ScrollView>

          <View style={{ padding: 20, paddingBottom: Math.max(20, insets.bottom), borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fff' }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {employee && (
                <TouchableOpacity
                  style={[wfStyles.wfDeleteBtn, !isAdmin && { opacity: 0.5 }]}
                  onPress={handleDelete}
                  disabled={loading || !isAdmin}
                >
                  <Ionicons name="trash-outline" size={24} color="#ef4444" />
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={[GS.btnPrimary, { flex: 1, height: 56 }, loading && { opacity: 0.7 }]} 
                onPress={handleAdd}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name={employee ? "save-outline" : "person-add-outline"} size={22} color="#fff" />
                    <Text style={GS.btnText}>{employee ? 'Update Profile' : 'Save Worker Profile'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

        <AadharScanner 
          visible={scannerVisible} 
          onClose={() => setScannerVisible(false)} 
          onScanned={handleScanned} 
        />

        <StatePicker
            visible={showPStatePicker}
            onClose={() => setShowPStatePicker(false)}
            onSelect={(name, code) => {
                setPStateCode(code);
                setPState(name);
                setPDistrict("");
            }}
        />
        <DistrictPicker
            visible={showPDistrictPicker}
            stateCode={pStateCode}
            onClose={() => setShowPDistrictPicker(false)}
            onSelect={(name) => setPDistrict(name)}
        />

        <StatePicker
            visible={showLStatePicker}
            onClose={() => setShowLStatePicker(false)}
            onSelect={(name, code) => {
                setLStateCode(code);
                setLState(name);
                setLDistrict("");
            }}
        />
        <DistrictPicker
            visible={showLDistrictPicker}
            stateCode={lStateCode}
            onClose={() => setShowLDistrictPicker(false)}
            onSelect={(name) => setLDistrict(name)}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
};
