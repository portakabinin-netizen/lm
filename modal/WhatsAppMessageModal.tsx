import React, { useState, useCallback, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  NativeModules,
  Alert,
  Image,
  ScrollView,
  useColorScheme,
  DeviceEventEmitter,
} from 'react-native';
import { MaterialCommunityIcons, MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getInfoAsync } from 'expo-file-system/legacy';
import { useUserContext } from '@/context/AuthContext';
import { getPermanentVCardUri } from '@/components/VisitingCardGenerator';
import { COLORS } from '@/styles/stylesIndex';
import { appService } from '@/UtilServices/appHelper';

const { CallTrackerModule } = NativeModules;

export interface Attachment {
  uri: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document';
  mimeType?: string;
  size?: number;
}

export interface WhatsAppMessageModalProps {
  visible: boolean;
  onClose: () => void;
  recipientName: string;
  recipientMobile: string;
  initialMessage?: string;
  initialAttachment?: Attachment | null;
  onMessageSent?: (summary: string) => void;
}

export const WhatsAppMessageModal: React.FC<WhatsAppMessageModalProps> = ({
  visible,
  onClose,
  recipientName,
  recipientMobile,
  initialMessage,
  initialAttachment,
  onMessageSent,
}) => {
  const { user, visitingCardUri: ctxCardUri } = useUserContext();
  const isDark = useColorScheme() === 'dark';
  const [message, setMessage] = useState(initialMessage || '');
  const [attachment, setAttachment] = useState<Attachment | null>(initialAttachment || null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (visible) {
      if (initialMessage !== undefined) setMessage(initialMessage);
      if (initialAttachment !== undefined) setAttachment(initialAttachment);
    }
  }, [visible, initialMessage, initialAttachment]);

  const cleanDigits = String(recipientMobile).replace(/\D/g, '').slice(-10);

  // ─── Attach Visiting Card (AsyncStorage first, then FileManager if required) ───
  const attachVisitingCard = async () => {
    try {
      // 1. Check AsyncStorage first
      let targetUri = await AsyncStorage.getItem('visitingCardUri').catch(() => null);
      if (targetUri) {
        const info = await getInfoAsync(targetUri).catch(() => null);
        if (!info?.exists || !info.size || info.size === 0) {
          targetUri = null;
        }
      }

      // 2. Check fileManager (documentDirectory permanent URI / context card) if required
      if (!targetUri) {
        const permUri = getPermanentVCardUri(user?.dbName, user?.userId);
        const info = await getInfoAsync(permUri).catch(() => null);
        if (info?.exists && info.size && info.size > 0) {
          targetUri = permUri;
          await AsyncStorage.setItem('visitingCardUri', permUri).catch(() => null);
        } else if (ctxCardUri) {
          const ctxInfo = await getInfoAsync(ctxCardUri).catch(() => null);
          if (ctxInfo?.exists && ctxInfo.size && ctxInfo.size > 0) {
            targetUri = ctxCardUri;
            await AsyncStorage.setItem('visitingCardUri', ctxCardUri).catch(() => null);
          }
        }
      }

      // 3. Fallback: Trigger on-demand generation if missing
      if (!targetUri) {
        DeviceEventEmitter.emit('trigger_generate_vcard');
        const permUri = getPermanentVCardUri(user?.dbName, user?.userId);
        const deadline = Date.now() + 2500;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 200));
          const info = await getInfoAsync(permUri).catch(() => null);
          if (info?.exists && info.size && info.size > 0) {
            targetUri = permUri;
            await AsyncStorage.setItem('visitingCardUri', permUri).catch(() => null);
            break;
          }
        }
      }

      if (targetUri) {
        setAttachment({
          uri: targetUri,
          name: 'VisitingCard.png',
          type: 'image',
          mimeType: 'image/png',
        });
        appService.showToast('Visiting card PNG attached!', 'Success');
      } else {
        appService.showToast('Visiting card PNG not available', 'Warning');
      }
    } catch (err: any) {
      appService.showToast('Failed to attach visiting card', 'Error');
    }
  };

  // ─── Pick Image ─────────────────────────────────────────────────────────────
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setAttachment({
          uri: asset.uri,
          name: asset.fileName || 'Image.jpg',
          type: 'image',
          mimeType: asset.mimeType || 'image/jpeg',
          size: asset.fileSize,
        });
      }
    } catch (err: any) {
      appService.showToast('Failed to select image', 'Error');
    }
  };

  // ─── Pick Video ─────────────────────────────────────────────────────────────
  const pickVideo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setAttachment({
          uri: asset.uri,
          name: asset.fileName || 'Video.mp4',
          type: 'video',
          mimeType: asset.mimeType || 'video/mp4',
          size: asset.fileSize,
        });
      }
    } catch (err: any) {
      appService.showToast('Failed to select video', 'Error');
    }
  };

  // ─── Pick Audio ─────────────────────────────────────────────────────────────
  const pickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const doc = result.assets[0];
        setAttachment({
          uri: doc.uri,
          name: doc.name || 'Audio.mp3',
          type: 'audio',
          mimeType: doc.mimeType || 'audio/mpeg',
          size: doc.size,
        });
      }
    } catch (err: any) {
      appService.showToast('Failed to select audio', 'Error');
    }
  };

  // ─── Pick Document ──────────────────────────────────────────────────────────
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const doc = result.assets[0];
        setAttachment({
          uri: doc.uri,
          name: doc.name || 'Document',
          type: 'document',
          mimeType: doc.mimeType || 'application/octet-stream',
          size: doc.size,
        });
      }
    } catch (err: any) {
      appService.showToast('Failed to select document', 'Error');
    }
  };

  // ─── Send Handler ───────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!cleanDigits || cleanDigits.length < 10) {
      appService.showToast('Invalid 10-digit mobile number', 'Error');
      return;
    }

    if (!message.trim() && !attachment) {
      appService.showToast('Please type a message or select an attachment', 'Warning');
      return;
    }

    setIsSending(true);
    let actionLog = '';

    try {
      if (attachment) {
        if (attachment.type === 'image' && CallTrackerModule?.shareWhatsAppWithImage) {
          let bothSuccess = false;
          let imageOnlySuccess = false;
          const msgText = message.trim();
          try {
            // Attempt A: Send BOTH image and message caption
            await CallTrackerModule.shareWhatsAppWithImage(cleanDigits, attachment.uri, msgText);
            bothSuccess = true;
          } catch (bothErr: any) {
            console.warn(
              '[WhatsAppModal] Failed to dispatch BOTH (Image + Text), falling back to image only:',
              bothErr?.message || bothErr
            );
            try {
              // Attempt B: If sending BOTH fails, send ONLY image
              await CallTrackerModule.shareWhatsAppWithImage(cleanDigits, attachment.uri, '');
              imageOnlySuccess = true;
            } catch (imgErr: any) {
              console.warn(
                '[WhatsAppModal] Failed to dispatch image only:',
                imgErr?.message || imgErr
              );
            }
          }

          if (bothSuccess) {
            actionLog = msgText
              ? `Sent WhatsApp image (${attachment.name}) & message to ${cleanDigits}`
              : `Sent WhatsApp image (${attachment.name}) to ${cleanDigits}`;
          } else if (imageOnlySuccess) {
            actionLog = `Sent WhatsApp image (${attachment.name}) to ${cleanDigits}`;
          } else {
            // Attempt C: System share fallback
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(attachment.uri, {
                mimeType: attachment.mimeType || 'image/png',
                dialogTitle: `Send image to ${recipientName || cleanDigits} (WhatsApp)`,
              });
              actionLog = `Shared WhatsApp image (${attachment.name}) with ${cleanDigits}`;
            } else {
              throw new Error('Sharing is not available on this device');
            }
          }
        } else {
          // Send Video, Audio, or Document via system share sheet
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(attachment.uri, {
              mimeType: attachment.mimeType || (attachment.type === 'video' ? 'video/mp4' : 'audio/mpeg'),
              dialogTitle: `Send ${attachment.type} to ${recipientName || cleanDigits} (WhatsApp)`,
            });
            actionLog = `Shared WhatsApp ${attachment.type} (${attachment.name}) with ${cleanDigits}`;
          } else {
            throw new Error('Sharing is not available on this device');
          }
        }
      } else {
        // Text-only WhatsApp dispatch
        const encodedText = encodeURIComponent(message.trim());
        const targetUrl = `whatsapp://send?phone=91${cleanDigits}&text=${encodedText}`;

        const canOpen = await Linking.canOpenURL(targetUrl).catch(() => false);
        if (canOpen) {
          await Linking.openURL(targetUrl);
        } else {
          const webUrl = `https://wa.me/91${cleanDigits}?text=${encodedText}`;
          await Linking.openURL(webUrl);
        }
        actionLog = `Sent WhatsApp message to ${cleanDigits}: "${message.trim().slice(0, 40)}"`;
      }

      onMessageSent?.(actionLog);
      onClose();
      setMessage('');
      setAttachment(null);
    } catch (err: any) {
      Alert.alert('Send Failed', err?.message || 'Could not send WhatsApp message');
    } finally {
      setIsSending(false);
    }
  }, [cleanDigits, message, attachment, recipientName, onMessageSent, onClose]);

  const modalBg = isDark ? '#1e293b' : '#ffffff';
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const cardBorder = isDark ? '#334155' : '#e2e8f0';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.modalCard, { backgroundColor: modalBg }]}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.waIconCircle}>
                <MaterialCommunityIcons name="whatsapp" size={22} color="#ffffff" />
              </View>
              <View>
                <Text style={[s.headerTitle, { color: textColor }]} numberOfLines={1}>
                  {recipientName || 'Recipient'}
                </Text>
                <Text style={s.headerSubtitle}>+91 {cleanDigits}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={isDark ? '#94a3b8' : '#64748b'} />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.scrollArea} keyboardShouldPersistTaps="handled">
            {/* Attachment Preview (if any) */}
            {attachment && (
              <View style={[s.attachmentCard, { borderColor: cardBorder }]}>
                {attachment.type === 'image' ? (
                  <Image source={{ uri: attachment.uri }} style={s.previewImage} resizeMode="cover" />
                ) : (
                  <View style={s.previewIconWrapper}>
                    <MaterialIcons
                      name={
                        attachment.type === 'video'
                          ? 'videocam'
                          : attachment.type === 'audio'
                          ? 'audiotrack'
                          : 'insert-drive-file'
                      }
                      size={28}
                      color="#25D366"
                    />
                  </View>
                )}
                <View style={s.attachmentInfo}>
                  <Text style={[s.attachmentName, { color: textColor }]} numberOfLines={1}>
                    {attachment.name}
                  </Text>
                  <Text style={s.attachmentMeta}>
                    {attachment.type.toUpperCase()}
                    {attachment.size ? ` • ${(attachment.size / 1024).toFixed(0)} KB` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setAttachment(null)} style={s.removeAttachmentBtn}>
                  <Ionicons name="close-circle" size={20} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            )}

            {/* Text Input */}
            <TextInput
              style={[
                s.textInput,
                {
                  color: textColor,
                  backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                  borderColor: cardBorder,
                },
              ]}
              placeholder="Type your WhatsApp message..."
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              multiline
              numberOfLines={4}
              value={message}
              onChangeText={setMessage}
            />

            {/* Attachment Actions Bar */}
            <Text style={[s.sectionLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>
              Attach media (optional)
            </Text>
            <View style={s.pickerRow}>
              <TouchableOpacity style={s.pickerBtn} onPress={attachVisitingCard}>
                <View style={[s.pickerIconCircle, { backgroundColor: '#dbeafe' }]}>
                  <Ionicons name="attach" size={20} color="#2563eb" />
                </View>
                <Text style={[s.pickerBtnText, { color: textColor }]}>Card PNG</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.pickerBtn} onPress={pickImage}>
                <View style={[s.pickerIconCircle, { backgroundColor: '#dcfce7' }]}>
                  <Ionicons name="image" size={20} color="#16a34a" />
                </View>
                <Text style={[s.pickerBtnText, { color: textColor }]}>Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.pickerBtn} onPress={pickVideo}>
                <View style={[s.pickerIconCircle, { backgroundColor: '#fee2e2' }]}>
                  <Ionicons name="videocam" size={20} color="#dc2626" />
                </View>
                <Text style={[s.pickerBtnText, { color: textColor }]}>Video</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.pickerBtn} onPress={pickAudio}>
                <View style={[s.pickerIconCircle, { backgroundColor: '#fef3c7' }]}>
                  <Ionicons name="musical-notes" size={20} color="#d97706" />
                </View>
                <Text style={[s.pickerBtnText, { color: textColor }]}>Audio</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.pickerBtn} onPress={pickDocument}>
                <View style={[s.pickerIconCircle, { backgroundColor: '#e0e7ff' }]}>
                  <Ionicons name="document-text" size={20} color="#4f46e5" />
                </View>
                <Text style={[s.pickerBtnText, { color: textColor }]}>Document</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Footer / Send Button */}
          <View style={s.footer}>
            <TouchableOpacity
              style={[s.sendBtn, isSending && { opacity: 0.7 }]}
              onPress={handleSend}
              disabled={isSending}
            >
              {isSending ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <MaterialCommunityIcons name="whatsapp" size={20} color="#ffffff" />
                  <Text style={s.sendBtnText}>Send on WhatsApp</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  waIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#16a34a',
    fontWeight: '600',
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  scrollArea: {
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  attachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: 'rgba(37, 211, 102, 0.06)',
  },
  previewImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  previewIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 211, 102, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentInfo: {
    flex: 1,
    marginLeft: 10,
  },
  attachmentName: {
    fontSize: 13,
    fontWeight: '600',
  },
  attachmentMeta: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  removeAttachmentBtn: {
    padding: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 16,
  },
  pickerBtn: {
    alignItems: 'center',
    flex: 1,
  },
  pickerIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  pickerBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 13,
    gap: 8,
    shadowColor: '#25D366',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  sendBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default WhatsAppMessageModal;
