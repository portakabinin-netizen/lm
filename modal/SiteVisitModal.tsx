import { appService } from '@/UtilServices/appHelper';
import { COLORS } from '@/styles/stylesIndex';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { useGPSCoordinates } from '@/hooks/useGPSCoordinates';

interface SiteVisitModalProps {
  visible: boolean;
  onClose: () => void;
  lead: any;
  leads?: any[];
  onComplete: () => void;
}

export const SiteVisitModal: React.FC<SiteVisitModalProps> = ({
  visible,
  onClose,
  lead,
  leads = [],
  onComplete,
}) => {
  const { refresh: refreshGPS } = useGPSCoordinates();
  const [selectedLocalLead, setSelectedLocalLead] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const activeLead = selectedLocalLead || lead;

  const [image, setImage] = useState<string | null>(null);
  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [corporateName, setCorporateName] = useState('Company');
  const viewShotRef = useRef<ViewShot>(null);

  useEffect(() => {
    const init = async () => {
      if (visible) {
        reset();
        setSelectedLocalLead(lead);
        const session = await appService.getSession();
        if (session?.corporateName) setCorporateName(session.corporateName);
        else if (session?.userDisplayName) setCorporateName(session.userDisplayName);
      }
    };
    init();
  }, [visible, lead]);

  const reset = () => {
    setImage(null);
    setLocation(null);
    setRemarks('');
  };

  const takeSelfie = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission', 'Camera permission is required to mark Geo-Coordinates.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      cameraType: ImagePicker.CameraType.front,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
      // Automatically fetch location when photo is taken
      fetchLocation();
    }
  };

  const fetchLocation = async () => {
    setLoading(true);
    try {
      const loc = await refreshGPS();
      if (loc) {
        setLocation(loc);
      } else {
        Alert.alert(
          'Location Error',
          'Failed to get current location. Please ensure GPS is enabled.'
        );
      }
    } catch (err) {
      console.error('Location error', err);
      Alert.alert('Location Error', 'An error occurred while fetching location.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!image) {
      Alert.alert('Required', 'Please capture a selfie to verify and mark Geo-Coordinates.');
      return;
    }
    if (!location) {
      Alert.alert(
        'Required',
        'Location is required to mark Geo-Coordinates. Please wait for location to be fetched or try again.'
      );
      return;
    }
    if (!activeLead) {
      Alert.alert('Error', 'No lead selected.');
      return;
    }

    setLoading(true);
    try {
      const session = await appService.getSession();
      if (!session?.token) return;

      // 1. Capture Watermarked Image
      const watermarkedUri = await captureRef(viewShotRef.current!, {
        format: 'jpg',
        quality: 0.8,
      });

      const ext = 'jpg';
      const formData = new FormData();
      formData.append('folder', `leads/${activeLead._id}`);
      formData.append('lead_no', activeLead._id); // Send lead_no for backend folder isolation
      formData.append('file', {
        uri: watermarkedUri,
        name: `visit_${activeLead._id}_${Date.now()}.${ext}`,
        type: `image/${ext}`,
      } as any);

      const uploadRes = await appService.httpClient.post('upload/cloudinary', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${session.token}`,
        },
      });

      if (!uploadRes.data.success) throw new Error('Upload failed');

      // 2. Log Site Visit in Lead Activity
      await appService.httpClient.post(
        `service/leads/${activeLead._id}/site-visit`,
        {
          selfie_url: uploadRes.data.url,
          location: location,
          remarks: remarks || 'Geo-Coordinates marked successfully',
        },
        {
          headers: { Authorization: `Bearer ${session.token}` },
        }
      );

      appService.showToast('Geo-Coordinates marked successfully', 'Success');

      // ── Save geotag to active attendance record (silent, non-blocking) ──
      try {
        const dutyStored = await AsyncStorage.getItem('active_duty_info');
        if (dutyStored) {
          const { attendanceId, token: dutyToken } = JSON.parse(dutyStored);
          if (attendanceId && dutyToken) {
            // Resolve best client name: lead name > google_location > address
            const clientName =
              activeLead?.sender_name ||
              activeLead?.google_location_name ||
              location?.formattedAddress ||
              'Unknown Site';

            await appService.httpClient
              .put(
                `service/hr/attendance/${attendanceId}`,
                {
                  $push: {
                    geoHistory: {
                      lat: location.latitude,
                      long: location.longitude,
                      accuracy: null,
                      speed: null,
                      type: 'geotag',
                      clientName,
                      leadId: activeLead._id,
                      address: location.formattedAddress || null,
                      timestamp: new Date().toISOString(),
                    },
                  },
                },
                { headers: { Authorization: `Bearer ${dutyToken}` } }
              )
              .catch(() => {
                /* silent — site visit already saved */
              });
          }
        }
      } catch {
        // Non-critical — never block site visit save
      }

      if (onComplete) onComplete();
      onClose();
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.message ||
        err.response?.data ||
        err.message ||
        'Failed to mark Geo-Coordinates';
      const cleanMsg =
        typeof errorMsg === 'string' && errorMsg.startsWith('<!DOCTYPE')
          ? 'Server Error (500). The file might be too large (>5MB) or the server encountered an issue.'
          : errorMsg;
      Alert.alert('Error', cleanMsg);
    } finally {
      setLoading(false);
    }
  };

  const insets = useSafeAreaInsets();

  const availableLeads = React.useMemo(() => {
    return leads
      .filter((l) => l.status === 'Engaged' || l.status === 'Accepted' || l.status === 'Tax Invoice') // Only show engaged, accepted or tax invoice status leads
      .filter((l) => !l.location?.lat) // Only show sites NOT having Geo-Coordinates
      .filter((l) => {
        const matchesQuery =
          l.sender_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.lead_no?.toString().includes(searchQuery);
        return matchesQuery;
      });
  }, [leads, searchQuery]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={[
            styles.overlay,
            { marginTop: 0, paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
        >
          <View style={styles.container}>
            <View
              style={{
                height: 60,
                backgroundColor: COLORS.primary,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
              }}
            >
              <TouchableOpacity
                onPress={onClose}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff' }}>
                  Geo-Coordinates marked
                </Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '800' }}>
                  {activeLead?.sender_name || 'Verification'}
                </Text>
              </View>
            </View>

            {!activeLead ? (
              <View style={[styles.body, { paddingBottom: 0 }]}>
                <View style={styles.searchContainer}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b' }}>
                      Select Site to GeoTag
                    </Text>
                    <View
                      style={{
                        backgroundColor: COLORS.primary,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 12,
                        marginLeft: 8,
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
                        {availableLeads.length}
                      </Text>
                    </View>
                  </View>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search site by name or number..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                </View>
                <View style={styles.leadList}>
                  <ScrollView nestedScrollEnabled contentContainerStyle={{ paddingBottom: 20 }}>
                    {availableLeads.map((l) => (
                      <TouchableOpacity
                        key={l._id}
                        style={styles.leadItem}
                        onPress={() => setSelectedLocalLead(l)}
                      >
                        <Text style={styles.leadItemText}>{l.sender_name}</Text>
                        <Text style={styles.leadItemNo}>#{l.lead_no}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.body}>
                <>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 15,
                    }}
                  >
                    <View>
                      <Text style={styles.leadName}>{activeLead.sender_name}</Text>
                      <Text style={styles.leadNo}>Lead #{activeLead.lead_no}</Text>
                    </View>
                    {!lead && (
                      <TouchableOpacity onPress={() => setSelectedLocalLead(null)}>
                        <Text style={{ color: COLORS.primary, fontWeight: '600', fontSize: 12 }}>
                          Change Site
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.mediaSection}>
                    {image ? (
                      <View style={styles.previewContainer}>
                        <ViewShot
                          ref={viewShotRef}
                          options={{ format: 'jpg', quality: 0.8 }}
                          style={{ flex: 1 }}
                        >
                          <Image source={{ uri: image }} style={styles.preview} />

                          {/* --- Watermark Overlay --- */}
                          <View style={styles.wmOverlay}>
                            <Text style={styles.wmCorpLabel}>{corporateName}</Text>

                            <View style={styles.wmMetaRow}>
                              <Ionicons name="location" size={10} color="#fff" />
                          <Text style={{ color: '#fff', fontSize: 10, marginLeft: 2, fontWeight: '700' }} numberOfLines={1}>
                            {location?.resolvedName || location?.formattedAddress || "Unknown"}
                          </Text>
                            </View>

                            <View style={styles.wmMetaRow}>
                              <Ionicons name="navigate" size={10} color="#fff" />
                              <Text style={styles.wmSmallText}>
                                LAT: {location?.latitude?.toFixed(6) || '0.0'} | LONG:{' '}
                                {location?.longitude?.toFixed(6) || '0.0'}
                              </Text>
                            </View>

                            <View style={styles.wmMetaRow}>
                              <Ionicons name="time" size={10} color="#fff" />
                              <Text style={styles.wmSmallText}>
                                {appService.formatDateTime(new Date())}
                              </Text>
                            </View>
                          </View>
                        </ViewShot>

                        <TouchableOpacity style={styles.retakeBtn} onPress={takeSelfie}>
                          <Ionicons name="camera-reverse" size={20} color="#fff" />
                          <Text style={styles.retakeText}>Retake</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.cameraPlaceholder} onPress={takeSelfie}>
                        <Ionicons name="camera" size={48} color={COLORS.primary} />
                        <Text style={styles.placeholderText}>
                          Capture Selfie to mark Geo-Coordinates
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="location" size={20} color={COLORS.primary} />
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Live Location</Text>
                      {loading && !location ? (
                        <ActivityIndicator size="small" color={COLORS.primary} />
                      ) : (
                        <Text style={styles.infoValue}>
                          {location?.formattedAddress || 'Capturing location...'}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="time" size={20} color="#666" />
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Timestamp</Text>
                      <Text style={styles.infoValue}>{appService.formatDateTime(new Date())}</Text>
                    </View>
                  </View>
                </>
              </ScrollView>
            )}

            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.saveBtn, (loading || !location) && styles.disabledBtn]}
                onPress={handleSave}
                disabled={loading || !location}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.saveBtnText}>Geo-Tag Site</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    backgroundColor: '#fff',
    flex: 1,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  body: {
    padding: 20,
    flexGrow: 1,
  },
  leadName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  leadNo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  mediaSection: {
    aspectRatio: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 15,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  cameraPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    marginTop: 10,
    color: COLORS.primary,
    fontWeight: '600',
  },
  previewContainer: {
    flex: 1,
  },
  preview: {
    flex: 1,
  },
  retakeBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  retakeText: {
    color: '#fff',
    marginLeft: 5,
    fontSize: 12,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 15,
    alignItems: 'flex-start',
  },
  infoContent: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    marginTop: 2,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledBtn: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    marginLeft: 10,
  },
  wmOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(50, 50, 50, 0.75)',
    padding: 8,
  },
  wmCorpLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  wmMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 1,
    gap: 4,
  },
  wmAddressText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
    flex: 1,
  },
  wmSmallText: {
    color: '#efefef',
    fontSize: 8,
    fontWeight: '500',
  },
  searchContainer: {
    marginBottom: 10,
  },
  searchInput: {
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  leadList: {
    marginTop: 10,
    flex: 1,
  },
  leadItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  leadItemText: {
    fontWeight: '600',
    color: '#0f172a',
  },
  leadItemNo: {
    color: '#64748b',
    fontSize: 12,
  },
});
