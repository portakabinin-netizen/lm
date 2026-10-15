/**
 * BroadcastAlertModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Pop-up that appears when the server emits 'admin:broadcast'.
 * ALL users (including guests) see this as long as they are connected.
 *
 * SEND interface (for CorpAdmin / Admin):
 *   Pass `showSender={true}` to render the compose form.
 *
 * RECEIVE:
 *   The modal auto-opens whenever a broadcast arrives via Socket.IO.
 *   Mounted once at app root level in `_layout.tsx` (inside AuthProvider).
 */

import { useUserContext } from '@/context/AuthContext';
import { getSocket } from '@/hooks/Socket';
import { appService } from '@/UtilServices/appHelper';
import { COLORS } from '@/styles/stylesIndex';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────
interface BroadcastPayload {
  id: string;
  title: string;
  message: string;
  priority: 'normal' | 'urgent';
  sentBy: string;
  sentByRole: string;
  corporateName?: string;
  at: string;
  targetRoles?: string[];
}

interface Props {
  /** When true, a "Send Broadcast" button appears (for Admin / CorpAdmin panels) */
  showSender?: boolean;
}

const CAN_SEND_ROLES = ['CorpAdmin', 'userAdmin'];

// ─── Component ────────────────────────────────────────────────────────────────
export default React.memo(function BroadcastAlertModal({ showSender = false }: Props) {
  const { user } = useUserContext();
  const isDark    = useColorScheme() === 'dark';

  // Received broadcasts queue
  const [queue, setQueue]           = useState<BroadcastPayload[]>([]);
  const [current, setCurrent]       = useState<BroadcastPayload | null>(null);

  // Compose form
  const [senderOpen, setSenderOpen] = useState(false);
  const [title, setTitle]           = useState('');
  const [message, setMessage]       = useState('');
  const [priority, setPriority]     = useState<'normal' | 'urgent'>('normal');
  const [sending, setSending]       = useState(false);

  // Animation
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const canSend = CAN_SEND_ROLES.includes(user?.userRole ?? '');

  // ── Socket listener ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.dbName) return;
    const socket = getSocket();

    const onBroadcast = (payload: BroadcastPayload) => {
      // Filter by targetRoles if specified
      if (payload.targetRoles?.length && user.userRole) {
        if (!payload.targetRoles.includes(user.userRole)) return;
      }
      appService.playAlertTone();
      setQueue(q => [...q, payload]);
    };

    socket.on('admin:broadcast', onBroadcast);
    return () => { socket.off('admin:broadcast', onBroadcast); };
  }, [user?.dbName, user?.userRole]);

  // ── Show next from queue ─────────────────────────────────────────────────
  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0]);
      setQueue(q => q.slice(1));
    }
  }, [queue, current]);

  // ── Animate in ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (current) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 7 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [current]);

  const dismiss = useCallback(() => setCurrent(null), []);

  // ── Send Broadcast ────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!message.trim()) { appService.showToast('Enter a message', 'Error'); return; }
    if (!user?.token) return;
    setSending(true);
    try {
      const res = await appService.sendBroadcast({ title, message, priority }, user.token);
      if (res?.success) {
        appService.showToast('Broadcast sent to all users ✅', 'Success');
        setSenderOpen(false);
        setTitle(''); setMessage(''); setPriority('normal');
      } else {
        appService.showToast(res?.message || 'Send failed', 'Error');
      }
    } catch (err: any) {
      appService.showToast(err?.response?.data?.message || 'Send failed', 'Error');
    } finally {
      setSending(false);
    }
  }, [title, message, priority, user?.token]);

  // ─── Colors ────────────────────────────────────────────────────────────────
  const cardBg   = isDark ? '#1e293b' : '#ffffff';
  const txtPri   = isDark ? '#f1f5f9' : '#0f172a';
  const txtSec   = isDark ? '#94a3b8' : '#64748b';
  const border   = isDark ? '#334155' : '#e2e8f0';
  const inputBg  = isDark ? '#0f172a' : '#f8fafc';
  const urgentColor = '#EF4444';
  const normalColor = COLORS.primary;

  const isUrgent = current?.priority === 'urgent';
  const accentColor = isUrgent ? urgentColor : normalColor;
  const queueCount = queue.length;

  return (
    <>
      {/* ── Received Broadcast Popup ──────────────────────────────────────────── */}
      <Modal
        visible={!!current}
        transparent
        animationType="none"
        onRequestClose={dismiss}
        statusBarTranslucent
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
          onPress={dismiss}
        >
          <Animated.View
            style={{
              width: '100%', maxWidth: 380, borderRadius: 28,
              backgroundColor: cardBg,
              borderWidth: 1.5, borderColor: accentColor + '60',
              overflow: 'hidden',
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
              shadowColor: accentColor, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20,
              elevation: 16,
            }}
          >
            {/* Priority banner */}
            <View style={{ backgroundColor: accentColor, paddingVertical: 10, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={isUrgent ? 'alert-circle' : 'megaphone'} size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 1, flex: 1 }}>
                {isUrgent ? '🚨 URGENT ALERT' : '📢 BROADCAST MESSAGE'}
              </Text>
              {queueCount > 0 && (
                <View style={{ backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{queueCount} more</Text>
                </View>
              )}
            </View>

            <View style={{ padding: 22 }}>
              {/* Title */}
              <Text style={{ fontSize: 18, fontWeight: '800', color: txtPri, marginBottom: 6 }}>
                {current?.title || 'Message from Management'}
              </Text>

              {/* From */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: accentColor + '20', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="person-circle-outline" size={16} color={accentColor} />
                </View>
                <Text style={{ fontSize: 12, color: txtSec }}>
                  <Text style={{ fontWeight: '700', color: accentColor }}>{current?.sentBy}</Text>
                  {current?.corporateName ? ` · ${current.corporateName}` : ''}
                </Text>
              </View>

              {/* Message body */}
              <View style={{ backgroundColor: accentColor + '08', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: accentColor + '20', marginBottom: 18 }}>
                <ScrollView style={{ maxHeight: 160 }} showsVerticalScrollIndicator={false}>
                  <Text style={{ fontSize: 14, color: txtPri, lineHeight: 22 }}>{current?.message}</Text>
                </ScrollView>
              </View>

              {/* Timestamp */}
              <Text style={{ fontSize: 10, color: txtSec, textAlign: 'right', marginBottom: 16 }}>
                {current?.at ? new Date(current.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
              </Text>

              {/* Dismiss button */}
              <TouchableOpacity
                onPress={dismiss}
                style={{ backgroundColor: accentColor, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                  {queueCount > 0 ? `Got it · Next (${queueCount})` : 'Got it'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* ── Compose Broadcast (Admin/CorpAdmin only) ───────────────────────────── */}
      {showSender && canSend && (
        <>
          {/* Trigger button */}
          <TouchableOpacity
            onPress={() => setSenderOpen(true)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: COLORS.primary + '18', borderRadius: 12,
              paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1,
              borderColor: COLORS.primary + '40', marginBottom: 12,
            }}
          >
            <Ionicons name="megaphone-outline" size={18} color={COLORS.primary} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.primary }}>Send Broadcast to All Users</Text>
          </TouchableOpacity>

          {/* Compose Modal */}
          <Modal
            visible={senderOpen}
            transparent
            animationType="slide"
            onRequestClose={() => setSenderOpen(false)}
            statusBarTranslucent
          >
            <Pressable
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
              onPress={() => setSenderOpen(false)}
            >
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <Pressable onPress={() => {}} style={{ backgroundColor: cardBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, borderTopWidth: 1.5, borderColor: COLORS.primary + '40' }}>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: txtPri }}>📢 Send Broadcast</Text>
                    <Text style={{ fontSize: 12, color: txtSec, marginTop: 2 }}>Message will pop-up to ALL connected users</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSenderOpen(false)} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={28} color={isDark ? '#475569' : '#cbd5e1'} />
                  </TouchableOpacity>
                </View>

                {/* Priority toggle */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                  {(['normal', 'urgent'] as const).map(p => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setPriority(p)}
                      style={{
                        flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                        borderWidth: 1.5,
                        backgroundColor: priority === p ? (p === 'urgent' ? urgentColor + '18' : COLORS.primary + '18') : 'transparent',
                        borderColor: priority === p ? (p === 'urgent' ? urgentColor : COLORS.primary) : border,
                      }}
                    >
                      <Text style={{ fontWeight: '700', fontSize: 12, color: priority === p ? (p === 'urgent' ? urgentColor : COLORS.primary) : txtSec }}>
                        {p === 'urgent' ? '🚨 Urgent' : '📢 Normal'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Title input */}
                <TextInput
                  style={{ backgroundColor: inputBg, borderWidth: 1, borderColor: border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: txtPri, marginBottom: 10 }}
                  placeholder="Title (optional)"
                  placeholderTextColor={txtSec}
                  value={title}
                  onChangeText={setTitle}
                />

                {/* Message input */}
                <TextInput
                  style={{ backgroundColor: inputBg, borderWidth: 1.5, borderColor: COLORS.primary + '40', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: txtPri, minHeight: 100, textAlignVertical: 'top', marginBottom: 18 }}
                  placeholder="Type your message here…"
                  placeholderTextColor={txtSec}
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  maxLength={500}
                />
                <Text style={{ fontSize: 10, color: txtSec, textAlign: 'right', marginTop: -14, marginBottom: 14 }}>{message.length}/500</Text>

                {/* Send button */}
                <TouchableOpacity
                  onPress={handleSend}
                  disabled={sending || !message.trim()}
                  style={{
                    backgroundColor: priority === 'urgent' ? urgentColor : COLORS.primary,
                    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                    opacity: sending || !message.trim() ? 0.6 : 1,
                  }}
                >
                  {sending
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Send to All Users</Text>
                  }
                </TouchableOpacity>
              </Pressable>
            </KeyboardAvoidingView>
            </Pressable>
          </Modal>
        </>
      )}
    </>
  );
});
