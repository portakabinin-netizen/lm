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

  useEffect(() => {
    const init = async () => {
      if (visible) {
        setMedia([]);
        setDescription('');
        setSelectedLocalLead(lead);
        setSearchQuery('');
        const session = await appService.getSession();
        if (session?.corporateName) setCorporateName(session.corporateName);
        else if (session?.userDisplayName) setCorporateName(session.userDisplayName);
        
        // Predetermine location for watermarking
        const loc = await refreshGPS();
        if (loc) setLocation(loc);
      }
    };
    init();
  }, [visible, lead]);

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
      
      // 🚀 INCREASE DELAY: Give it time to render location and date clearly
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
      }, 1000); // 1s for better reliability
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

    setLoading(true);
    try {
      const session = await appService.getSession();
      if (!session?.token) return;

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
      }

      // Save activity text note to lead activity logs (no image URL required in log)
      await appService.httpClient.post(
        `service/leads/${activeLead._id}/activity`,
        {
          action: description,
          byUser: session?.userDisplayName || 'System'
        },
        {
          headers: {
            Authorization: `Bearer ${session.token}`,
            'Content-Type': 'application/json',
          }
        }
      );

      appService.showToast(`Successfully uploaded ${media.length} items`, "Success");
      if (onComplete) onComplete();
      onClose();
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.response?.data || err.message || "Failed to upload media";
      const cleanMsg = typeof errorMsg === 'string' && errorMsg.startsWith('<!DOCTYPE') 
        ? "Server Error (500). The file might be too large (>5MB) or the server encountered an issue."
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
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '800' }}>{activeLead?.sender_name || 'Select Site'}</Text>
            </View>
          </View>

          <View style={styles.body}>
            {!activeLead ? (
              <View style={styles.searchContainer}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 10 }}>Select Site for Progress Report</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search site by name or number..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                <View style={styles.leadList}>
                  <ScrollView nestedScrollEnabled>
                    {(() => {
                      const filtered = leads.filter(l => 
                        l.sender_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        l.lead_no?.toString().includes(searchQuery)
                      );

                      const withDistance = filtered.map(l => {
                        let distance = Infinity;
                        if (location && l.location && l.location.lat && l.location.long) {
                          distance = getDistance(
                            location.latitude,
                            location.longitude,
                            l.location.lat,
                            l.location.long
                          );
                        }
                        return { ...l, distance };
                      });

                      withDistance.sort((a, b) => a.distance - b.distance);

                      return withDistance.map(l => {
                        const isNear = l.distance < 5000;
                        const distText = l.distance !== Infinity 
                          ? l.distance > 1000 
                            ? `📍 ${(l.distance / 1000).toFixed(1)} km` 
                            : `📍 ${Math.round(l.distance)} m`
                          : null;

                        return (
                          <TouchableOpacity
                            key={l._id}
                            style={[
                              styles.leadItem,
                              isNear && { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', borderWidth: 0.5 }
                            ]}
                            onPress={() => setSelectedLocalLead(l)}
                          >
                            <View>
                              <Text style={styles.leadItemText}>{l.sender_name}</Text>
                              {distText && (
                                <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: '800', marginTop: 2 }}>
                                  {distText} {isNear ? '· Near You' : ''}
                                </Text>
                              )}
                            </View>
                            <Text style={styles.leadItemNo}>#{l.lead_no}</Text>
                          </TouchableOpacity>
                        );
                      });
                    })()}
                  </ScrollView>
                </View>
              </View>
            ) : (
              <>
                {activeLead && !lead && (
                  <TouchableOpacity onPress={() => setSelectedLocalLead(null)} style={{ marginBottom: 15 }}>
                    <Text style={{ color: COLORS.primary, fontWeight: '600', fontSize: 12 }}>Change Site</Text>
                  </TouchableOpacity>
                )}

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
              </>
            )}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.uploadBtn,
                (loading || media.length === 0 || !description.trim()) && styles.disabledBtn
              ]}
              onPress={handleUpload}
              disabled={loading || media.length === 0 || !description.trim()}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={20} color="#fff" />
                  <Text style={styles.uploadBtnText}>Upload Progress ({media.length})</Text>
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
