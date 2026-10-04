import { appService } from '@/UtilServices/appHelper';
import { COLORS } from '@/styles/stylesIndex';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert, FlatList,
  Image,
  Modal,
  StyleSheet,
  Text, TouchableOpacity,
  View,
  ScrollView,
  TextInput
} from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { useRef, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGPSCoordinates } from '@/hooks/useGPSCoordinates';

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // metres
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
};

interface WorkProgressModalProps {
  visible: boolean;
  onClose: () => void;
  lead: any;
  leads?: any[];
  onComplete: () => void;
}

export const WorkProgressModal: React.FC<WorkProgressModalProps> = ({
  visible, onClose, lead, leads = [], onComplete
}) => {
  const { refresh: refreshGPS } = useGPSCoordinates();
  const [selectedLocalLead, setSelectedLocalLead] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const activeLead = selectedLocalLead || lead;

  const [media, setMedia] = useState<any[]>([]);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [location, setLocation] = useState<any>(null);
  const [corporateName, setCorporateName] = useState('Company');
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const viewShotRef = useRef<ViewShot>(null);

  // New states for auto-population and manual mode
  const [isManualMode, setIsManualMode] = useState(false);
  const [activeStaff, setActiveStaff] = useState<any[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const [workerSearch, setWorkerSearch] = useState('');

  useEffect(() => {
    const init = async () => {
      if (visible) {
        setMedia([]);
        setDescription('');
        setSelectedLocalLead(lead);
        setSearchQuery('');
        setWorkerSearch('');
        setIsManualMode(false);
        setSelectedWorker(null);

        const session = await appService.getSession();
        if (session?.corporateName) setCorporateName(session.corporateName);
        else if (session?.userDisplayName) setCorporateName(session.userDisplayName);
        
        let currentLoc = null;
        let fetchedStaff: any[] = [];

        // 1. Fetch Location & Active Staff in parallel
        try {
          const [loc, staffRes] = await Promise.all([
            refreshGPS(),
            appService.httpClient.get('service/hr/attendance/active-staff', {
              headers: { Authorization: `Bearer ${session?.token}` }
            })
          ]);
          if (loc) {
            setLocation(loc);
            currentLoc = loc;
          }
          if (staffRes.data?.success) {
            fetchedStaff = staffRes.data.data || [];
            setActiveStaff(fetchedStaff);
          }
        } catch (err) {
          console.log("Error fetching location or staff", err);
        }

        // 2. Auto-Populate if no lead was passed initially
        if (!lead && currentLoc && leads.length > 0) {
          const withDist = leads.map(l => {
            let dist = Infinity;
            if (l.location?.lat && l.location?.long && currentLoc.latitude != null && currentLoc.longitude != null) {
              dist = getDistance(
                currentLoc.latitude, currentLoc.longitude,
                Number(l.location.lat), Number(l.location.long)
              );
            }
            return { ...l, distance: dist };
          }).sort((a, b) => a.distance - b.distance);

          const nearest = withDist[0];
          if (nearest && nearest.distance < 5000) { // Within 5km
            setSelectedLocalLead(nearest);

            // Find worker at this site
            const workersAtSite = fetchedStaff.filter(s => s.leadId === nearest._id);
            if (workersAtSite.length > 0) {
              setSelectedWorker(workersAtSite[0]); // Auto-select the first worker at site
            }
          }
        }
      }
    };
    init();
  }, [visible, lead, leads]);

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Permission", "Permission to access gallery is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setMedia([...media, ...result.assets]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Permission", "Camera permission is required.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setPendingPhoto(uri);
      
      setTimeout(async () => {
        try {
          if (!viewShotRef.current) return;
          const watermarkedUri = await captureRef(viewShotRef, {
            format: 'jpg',
            quality: 0.8,
          });
          setMedia(prev => [...prev, { uri: watermarkedUri, type: 'image' }]);
          setPendingPhoto(null);
        } catch (err) {
          console.error("Watermark failed", err);
          setMedia(prev => [...prev, { uri, type: 'image' }]); // fallback to raw
          setPendingPhoto(null);
        }
      }, 1000); 
    }
  };

  const removeMedia = (index: number) => {
    const newMedia = [...media];
    newMedia.splice(index, 1);
    setMedia(newMedia);
  };

  const handleUpload = async () => {
    if (media.length === 0) {
      Alert.alert("Required", "Please select at least one photo or video.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Required", "Please enter a progress description.");
      return;
    }
    if (!activeLead) {
      Alert.alert("Required", "Please select a site first.");
      return;
    }
    if (!selectedWorker) {
      Alert.alert("Required", "Please select an employee/worker.");
      return;
    }

    setLoading(true);
    try {
      const session = await appService.getSession();
      if (!session?.token) return;

      const uploadedUrls: string[] = [];

      for (let i = 0; i < media.length; i++) {
        setUploadProgress(Math.round(((i + 1) / media.length) * 100));

        const asset = media[i];
        const ext = asset.uri.split('.').pop() || 'jpg';
        const leadId = activeLead?._id || 'unknown';
        const formData = new FormData();
        formData.append('folder', `leads/${activeLead._id}`);
        formData.append('lead_no', activeLead._id);
        formData.append('file', {
          uri: asset.uri,
          name: `project_${leadId}_${Date.now()}_${i}.${ext}`,
          type: asset.type === 'video' ? `video/${ext}` : `image/${ext}`,
        } as any);

        const uploadRes = await appService.httpClient.post('upload/cloudinary', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${session.token}`
          }
        });

        if (!uploadRes.data.success) throw new Error("Upload failed");
        uploadedUrls.push(uploadRes.data.url);
      }

      // 1. Save new SiteClientCheck record
      await appService.httpClient.post(
        `service/leads/${activeLead._id}/site-client-check`,
        {
          employeeId: selectedWorker.employeeId || selectedWorker._id,
          images: uploadedUrls,
          progressDescription: description
        },
        {
          headers: {
            Authorization: `Bearer ${session.token}`,
            'Content-Type': 'application/json',
          }
        }
      );

      // 2. Save basic activity log for backward compatibility
      await appService.httpClient.post(
        `service/leads/${activeLead._id}/activity`,
        {
          action: `Progress Report by ${selectedWorker.name || 'Worker'}: ${description}`,
          byUser: session?.userDisplayName || 'System'
        },
        {
          headers: {
            Authorization: `Bearer ${session.token}`,
            'Content-Type': 'application/json',
          }
        }
      );

      appService.showToast(`Successfully submitted progress report`, "Success");
      if (onComplete) onComplete();
      onClose();
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.response?.data || err.message || "Failed to upload report";
      const cleanMsg = typeof errorMsg === 'string' && errorMsg.startsWith('<!DOCTYPE') 
        ? "Server Error (500)."
        : errorMsg;
      Alert.alert("Error", cleanMsg);
    } finally {
      setLoading(false);
      setUploadProgress(0);
      setMedia([]);
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[styles.overlay, { marginTop: 0, paddingTop: insets.top }]}>
        <View style={styles.container}>
          <View style={{ height: 60, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
            <TouchableOpacity onPress={onClose} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff' }}>Progress Report</Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '800' }}>
                {activeLead ? activeLead.sender_name : 'Select Site'}
              </Text>
            </View>
            <TouchableOpacity 
              onPress={() => setIsManualMode(!isManualMode)}
              style={{ backgroundColor: isManualMode ? '#fff' : 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}
            >
              <Text style={{ color: isManualMode ? COLORS.primary : '#fff', fontWeight: '800', fontSize: 12 }}>
                {isManualMode ? 'Auto Mode' : 'Manual'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {(!activeLead || !selectedWorker || isManualMode) ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                {/* 1. Site Selection */}
                <View style={styles.searchContainer}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#1e293b', marginBottom: 8 }}>
                    {activeLead ? `Site: ${activeLead.sender_name}` : 'Select Site'}
                  </Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search site by name or number..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  <View style={styles.leadList}>
                    {(() => {
                      const filtered = leads.filter(l => 
                        l.sender_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        l.lead_no?.toString().includes(searchQuery)
                      );

                      const withDistance = filtered.map(l => {
                        let dist = Infinity;
                        if (location && l.location?.lat && l.location?.long && location.latitude != null && location.longitude != null) {
                          dist = getDistance(
                            location.latitude, location.longitude,
                            Number(l.location.lat), Number(l.location.long)
                          );
                        }
                        return { ...l, distance: dist };
                      }).sort((a, b) => a.distance - b.distance);

                      return withDistance.slice(0, 10).map(l => {
                        const isSelected = activeLead?._id === l._id;
                        const distText = l.distance !== Infinity 
                          ? l.distance > 1000 ? `${(l.distance / 1000).toFixed(1)} km` : `${Math.round(l.distance)} m`
                          : null;

                        return (
                          <TouchableOpacity
                            key={l._id}
                            style={[
                              styles.leadItem,
                              isSelected && { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1 }
                            ]}
                            onPress={() => {
                              setSelectedLocalLead(l);
                              const siteStaff = activeStaff.filter(s => s.leadId === l._id);
                              if (siteStaff.length > 0) {
                                setSelectedWorker(siteStaff[0]);
                              } else {
                                setSelectedWorker(null);
                              }
                            }}
                          >
                            <View>
                              <Text style={[styles.leadItemText, isSelected && { color: COLORS.primary }]}>{l.sender_name}</Text>
                              {distText && (
                                <Text style={{ fontSize: 11, color: isSelected ? COLORS.primary : '#16a34a', fontWeight: '800', marginTop: 2 }}>
                                  📍 {distText}
                                </Text>
                              )}
                            </View>
                            <Text style={styles.leadItemNo}>#{l.lead_no}</Text>
                          </TouchableOpacity>
                        );
                      });
                    })()}
                  </View>
                </View>

                {/* 2. Worker Selection */}
                <View style={styles.searchContainer}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#1e293b', marginBottom: 8 }}>
                    {selectedWorker ? `Worker: ${selectedWorker.name || selectedWorker.employeeName}` : 'Select Worker'}
                  </Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search active worker by name..."
                    value={workerSearch}
                    onChangeText={setWorkerSearch}
                  />
                  <View style={styles.leadList}>
                    {(() => {
                      const displayedStaff = activeLead 
                        ? activeStaff.filter(s => s.leadId === activeLead._id)
                        : activeStaff;
                        
                      const filteredStaff = displayedStaff.filter(s => 
                        (s.name || s.employeeName || '').toLowerCase().includes(workerSearch.toLowerCase())
                      );

                      if (filteredStaff.length === 0) {
                        return <Text style={{ textAlign: 'center', marginTop: 10, color: '#94a3b8' }}>
                          {activeLead ? 'No active attendances found for this site.' : 'No active attendances found.'}
                        </Text>;
                      }

                      return filteredStaff.slice(0, 10).map((s, idx) => {
                        const isSelected = selectedWorker?.employeeId === s.employeeId;
                        return (
                          <TouchableOpacity
                            key={s.employeeId || idx}
                            style={[
                              styles.leadItem,
                              isSelected && { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1 }
                            ]}
                            onPress={() => setSelectedWorker(s)}
                          >
                            <View>
                              <Text style={[styles.leadItemText, isSelected && { color: COLORS.primary }]}>
                                {s.name || s.employeeName}
                              </Text>
                              <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '600', marginTop: 2 }}>
                                Site ID: {s.leadId}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      });
                    })()}
                  </View>
                </View>
                
                {(activeLead && selectedWorker) && (
                  <TouchableOpacity 
                    style={{ backgroundColor: COLORS.primary, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 }}
                    onPress={() => setIsManualMode(false)}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800' }}>Confirm Selection</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                {/* Auto-selected info banner */}
                <View style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 15 }}>
                  <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '700', marginBottom: 4 }}>SELECTED WORKER</Text>
                  <Text style={{ fontSize: 15, color: '#0f172a', fontWeight: '800' }}>{selectedWorker?.name || selectedWorker?.employeeName}</Text>
                  <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '700', marginTop: 8, marginBottom: 4 }}>SELECTED SITE</Text>
                  <Text style={{ fontSize: 15, color: '#0f172a', fontWeight: '800' }}>{activeLead?.sender_name}</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={[styles.pickBtn, { flex: 1 }]} onPress={pickMedia}>
                    <Ionicons name="images" size={24} color={COLORS.primary} />
                    <Text style={[styles.pickText, { fontSize: 12 }]}>Gallery</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[styles.pickBtn, { flex: 1 }]} onPress={takePhoto}>
                    <Ionicons name="camera" size={24} color={COLORS.primary} />
                    <Text style={[styles.pickText, { fontSize: 12 }]}>Camera (GPS)</Text>
                  </TouchableOpacity>
                </View>

                {/* Hidden ViewShot for watermarking processing */}
                {pendingPhoto && (
                  <View style={{ position: 'absolute', opacity: 0, left: -1000 }}>
                    <ViewShot ref={viewShotRef} options={{ format: 'jpg', quality: 0.8 }} style={{ width: 600, height: 600 }}>
                      <Image source={{ uri: pendingPhoto }} style={{ width: '100%', height: '100%' }} />
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
                            LAT: {location?.latitude?.toFixed(6)} | LONG: {location?.longitude?.toFixed(6)}
                          </Text>
                        </View>
                        <View style={styles.wmMetaRow}>
                          <Ionicons name="time" size={10} color="#fff" />
                          <Text style={styles.wmSmallText}>{appService.formatDateTime(new Date())}</Text>
                        </View>
                      </View>
                    </ViewShot>
                  </View>
                )}

                <FlatList
                  data={media}
                  keyExtractor={(item, index) => index.toString()}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.mediaList}
                  renderItem={({ item, index }) => (
                    <View style={styles.mediaWrapper}>
                      {item.type === 'video' ? (
                        <View style={styles.videoThumbnail}>
                          <Ionicons name="videocam" size={24} color="#fff" />
                        </View>
                      ) : (
                        <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                      )}
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => removeMedia(index)}
                      >
                        <Ionicons name="close-circle" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  )}
                />

                <View style={{ marginTop: 15, marginBottom: 15 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e293b', marginBottom: 6 }}>
                    Progress Description *
                  </Text>
                  <TextInput
                    style={{
                      borderWidth: 1.5,
                      borderColor: '#cbd5e1',
                      borderRadius: 12,
                      minHeight: 80,
                      padding: 10,
                      color: '#000',
                      backgroundColor: '#f8fafc',
                      textAlignVertical: 'top',
                    }}
                    placeholder="Describe the work progress details..."
                    placeholderTextColor="#94a3b8"
                    multiline
                    value={description}
                    onChangeText={setDescription}
                  />
                </View>

                {loading && (
                  <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
                    </View>
                    <Text style={styles.progressText}>Uploading... {uploadProgress}%</Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.uploadBtn,
                (loading || media.length === 0 || !description.trim() || !activeLead || !selectedWorker || isManualMode) && styles.disabledBtn
              ]}
              onPress={handleUpload}
              disabled={loading || media.length === 0 || !description.trim() || !activeLead || !selectedWorker || isManualMode}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={20} color="#fff" />
                  <Text style={styles.uploadBtnText}>Submit Report</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: '#fff'
  },
  container: {
    backgroundColor: '#fff', flex: 1
  },
  header: {
    padding: 25, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'
  },
  title: {
    fontSize: 20, fontWeight: '700', color: '#1e293b'
  },
  subtitle: {
    fontSize: 14, color: '#64748b', marginTop: 4
  },
  body: {
    padding: 25
  },
  pickBtn: {
    height: 120, width: '100%', borderWidth: 2, borderColor: '#e2e8f0', borderStyle: 'dashed', borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc'
  },
  pickText: {
    marginTop: 10, color: COLORS.primary, fontWeight: '600'
  },
  mediaList: {
    marginTop: 20, height: 100
  },
  mediaWrapper: {
    width: 80, height: 80, marginRight: 15, borderRadius: 12, overflow: 'hidden', backgroundColor: '#eee'
  },
  thumbnail: {
    width: '100%', height: '100%'
  },
  videoThumbnail: {
    flex: 1, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center'
  },
  removeBtn: {
    position: 'absolute', top: 2, right: 2, backgroundColor: '#fff', borderRadius: 10
  },
  footer: {
    padding: 25, paddingTop: 0
  },
  uploadBtn: {
    backgroundColor: COLORS.primary, padding: 18, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center'
  },
  disabledBtn: {
    backgroundColor: '#cbd5e1'
  },
  uploadBtnText: {
    color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 10
  },
  progressContainer: {
    marginTop: 20
  },
  progressBar: {
    height: 10, backgroundColor: '#e2e8f0', borderRadius: 5, overflow: 'hidden'
  },
  progressFill: {
    height: '100%', backgroundColor: '#22c55e'
  },
  progressText: {
    marginTop: 8, fontSize: 12, color: '#64748b', textAlign: 'center'
  },
  wmOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(50, 50, 50, 0.75)',
    padding: 10,
  },
  wmCorpLabel: {
    color: '#fff',
    fontSize: 16, // Slightly larger for the 600x600 ViewShot
    fontWeight: '800',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  wmMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    gap: 6,
  },
  wmAddressText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  wmSmallText: {
    color: '#efefef',
    fontSize: 11,
    fontWeight: '500',
  },
  searchContainer: {
    marginBottom: 20
  },
  searchInput: {
    backgroundColor: '#f1f5f9', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1'
  },
  leadList: {
    marginTop: 10, maxHeight: 200
  },
  leadItem: {
    padding: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', flexDirection: 'row', justifyContent: 'space-between'
  },
  leadItemText: {
    fontWeight: '600', color: '#0f172a'
  },
  leadItemNo: {
    color: '#64748b', fontSize: 12
  }
});
