import * as Sharing from 'expo-sharing';
import { CallRecord, Props } from '@/hooks/interface';
import { COLORS, getThemeStyles, styles } from '@/styles/stylesIndex';
import { appService } from '@/UtilServices/appHelper';
import { appModules, STATUS_COLOR } from '@/UtilServices/appModals';
import { LeadQuickActionButton } from '@/components/LeadQuickActionButton';
import useLeadEnquiry from '@/hooks/useLeadEnquiry';
import { SiteShiftEditorModal } from '@/modal/SiteShiftEditorModal';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  NativeModules,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const { CallTrackerModule } = NativeModules;

const dur = (sec: number): string => {
  sec = Number(sec) || 0;
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60),
    s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
};

const EditableField = React.memo(
  ({
    value,
    isEditing,
    onChange,
    textStyle,
    placeholder,
  }: {
    value: string;
    isEditing?: boolean;
    onChange: (v: string) => void;
    textStyle?: any;
    placeholder: string;
  }) => (
    <View style={styles.fieldRow as any}>
      {isEditing ? (
        <TextInput
          style={[textStyle, styles.slInputUnderline] as any}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          autoFocus
        />
      ) : (
        <Text style={textStyle as any}>{value || `No ${placeholder}`}</Text>
      )}
    </View>
  )
);

const ShowLeads = React.memo(
  ({
    item,
    token,
    onStatusChange,
    isDark,
    currentUser,
    corporateName,
    corporateEmail,
    corporateAddress,
    userMobile,
    userDisplayName,
    corpProfileImage,
    visitingCardUri,
  }: Props & { 
    corporateName?: string; 
    corporateEmail?: string;
    corporateAddress?: string | null;
    userMobile?: string;
    userDisplayName?: string;
    corpProfileImage?: string;
    visitingCardUri?: string;
  }) => {

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showAllActs, setShowAllActs] = useState(false);

    const [editBuf, setEditBuf] = useState({
      sender_name: item.sender_name ?? '',
      product_name: item.product_name ?? '',
      sender_email: item.sender_email ?? '',
      sender_city: item.sender_city ?? '',
      sender_state: item.sender_state ?? '',
      sender_mobile: item.sender_mobile ?? '',
    });

    const isEditingRef = useRef(isEditing);
    useEffect(() => {
      isEditingRef.current = isEditing;
    }, [isEditing]);

    useEffect(() => {
      if (!isEditingRef.current) {
        setEditBuf({
          sender_name: item.sender_name ?? '',
          product_name: item.product_name ?? '',
          sender_email: item.sender_email ?? '',
          sender_city: item.sender_city ?? '',
          sender_state: item.sender_state ?? '',
          sender_mobile: item.sender_mobile ?? '',
        });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item._id]);

    const vName = isEditing ? editBuf.sender_name : (item.sender_name ?? '');
    const vProduct = isEditing ? editBuf.product_name : (item.product_name ?? '');
    const vEmail = isEditing ? editBuf.sender_email : (item.sender_email ?? '');
    const vCity = isEditing ? editBuf.sender_city : (item.sender_city ?? '');
    const vState = isEditing ? editBuf.sender_state : (item.sender_state ?? '');
    const vMobile = isEditing ? editBuf.sender_mobile : (item.sender_mobile ?? '');

    // ── Always use item.sender_mobile for action buttons (call/WA/share) ─────
    const mobile = useMemo(
      () => appService.formatMobile(item.sender_mobile ?? ''),
      [item.sender_mobile]
    );
    const mPlain = mobile?.plain ?? item.sender_mobile ?? '';
    const acts = Array.isArray(item.activity) ? item.activity : [];
    const lastAct = acts.length > 0 ? acts[acts.length - 1] : null;

    const statusColor = STATUS_COLOR[item.status] ?? COLORS.primary;

    const theme = getThemeStyles(isDark);
    const { enquiryLead, openEnquiry, closeEnquiry, isLoading: enquiryLoading } = useLeadEnquiry();
    const tileStyle = useMemo(() => [styles.tile, theme.card] as any, [isDark]);

    // ── Buffer setters ─────────────────────────────────────────────────────────
    const setName = useCallback((v: string) => setEditBuf((p) => ({ ...p, sender_name: v })), []);
    const setProduct = useCallback(
      (v: string) => setEditBuf((p) => ({ ...p, product_name: v })),
      []
    );
    const setEmail = useCallback((v: string) => setEditBuf((p) => ({ ...p, sender_email: v })), []);
    const setCity = useCallback((v: string) => setEditBuf((p) => ({ ...p, sender_city: v })), []);
    const setState_ = useCallback(
      (v: string) => setEditBuf((p) => ({ ...p, sender_state: v })),
      []
    );
    const setMobile = useCallback(
      (v: string) => setEditBuf((p) => ({ ...p, sender_mobile: v })),
      []
    );

    // ── Handlers ───────────────────────────────────────────────────────────────
    const startEditing = useCallback(() => {
      setEditBuf({
        sender_name: item.sender_name ?? '',
        product_name: item.product_name ?? '',
        sender_email: item.sender_email ?? '',
        sender_city: item.sender_city ?? '',
        sender_state: item.sender_state ?? '',
        sender_mobile: item.sender_mobile ?? '',
      });
      setIsEditing(true);
    }, [
      item.sender_name,
      item.product_name,
      item.sender_email,
      item.sender_city,
      item.sender_state,
      item.sender_mobile,
    ]);

    const cancelEdit = useCallback(() => setIsEditing(false), []);
    const toggleActs = useCallback(() => setShowAllActs((p) => !p), []);

    const openStatus = useCallback(() => {
      appModules.openStatus(item._id, item.status, token, onStatusChange);
    }, [item._id, item.status, token, onStatusChange]);

    // ── saveUserAction — silent activity log (no corporateId needed by API) ───
    const saveUserAction = useCallback(
      async (note: string) => {
        await appService.leadFollowUp({ itemId: item._id, action: note, token });
      },
      [item._id, token]
    );

    // ── openActivityModal — for manual note modal ──────────────────────────────
    const openActivityModal = useCallback(
      (defaultNote: string, url?: string) => {
        if (url) Linking.openURL(url).catch(() => null);
        appModules.openActivity({
          phoneNumber: mPlain,
          name: item.sender_name ?? '',
          itemId: item._id,
          token,
          onComplete: onStatusChange,
        });
        appModules.updateActivityNote(defaultNote);
      },
      [mPlain, item.sender_name, item._id, token, onStatusChange]
    );

    // ── doCall — dial → non-blocking poll call log → silent save ─────────────
    const doCall = useCallback(async () => {
      const norm = (n: string) => n.replace(/\D/g, '').slice(-10);
      const target = norm(mPlain);
      let beforeCount = 0;

      if (CallTrackerModule) {
        try {
          const before: CallRecord[] = await CallTrackerModule.getDeviceCallLogs();
          beforeCount = before.filter((r) => norm(r.phoneNumber ?? '') === target).length;
        } catch {}
      }

      Linking.openURL(`tel:${mPlain}`).catch(() => {
        appService.showToast('Could not open dialer', 'Error');
      });

      // ── Non-blocking: poll in background, don't await on UI thread ──────────
      if (CallTrackerModule) {
        appService.showToast('Tracking call status…', 'Info');
        const maxWaitMs = 45_000;
        const pollMs = 2_500;
        const deadline = Date.now() + maxWaitMs;

        const pollLoop = async () => {
          let finalNote = `Call initiated to ${mPlain}`;
          while (Date.now() < deadline) {
            await new Promise((res) => setTimeout(res, pollMs));
            try {
              const after: CallRecord[] = await CallTrackerModule.getDeviceCallLogs();
              const matching = after
                .filter((r) => norm(r.phoneNumber ?? '') === target)
                .sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

              if (matching.length > beforeCount) {
                const seconds = Number(matching[0].duration || 0);
                if (seconds > 0) {
                  finalNote = `Call CONNECTED. Duration: ${dur(seconds)}`;
                  appService.showToast(`Call connected: ${dur(seconds)}`, 'Success');
                } else {
                  finalNote = `Call NOT CONNECTED (Missed/Rejected)`;
                  appService.showToast('Call not connected', 'Info');
                }
                break;
              }
            } catch {
              break;
            }
          }
          await saveUserAction(finalNote);
          onStatusChange();
        };

        pollLoop(); // fire-and-forget — does NOT block the UI
      } else {
        // No call tracker — just log immediately
        await saveUserAction(`Call initiated to ${mPlain}`);
        onStatusChange();
      }
    }, [mPlain, saveUserAction, onStatusChange]);

    // ── doWA — open WhatsApp → silent save ────────────────────────────────────
    const doWA = useCallback(async () => {
      Linking.openURL(`https://wa.me/${mobile?.with91 ?? mPlain}`).catch(() => null);
      await saveUserAction(`WhatsApp message initiated`);
      onStatusChange();
    }, [mobile, mPlain, saveUserAction, onStatusChange]);

    // ── doEmail — open mail → silent save ─────────────────────────────────────
    const doEmail = useCallback(async () => {
      Linking.openURL(`mailto:${item.sender_email}`).catch(() => null);
      await saveUserAction(`Email initiated,check send box`);
      onStatusChange();
    }, [item.sender_email, saveUserAction, onStatusChange]);

    // ── shareLead — share via WhatsApp/SMS/native share ───────────────────────
    const shareLead = useCallback(async () => {
      const message =
        `🏢 ${corporateName || 'portakabin.in'}\n` +
        (corpProfileImage ? `🖼️ Profile: ${corpProfileImage}\n` : '') +
        `👤 ${userDisplayName || currentUser}\n` +
        `📱 Mobile: ${userMobile || 'N/A'}\n` +
        `✉️ Email: ${corporateEmail || 'info@portakabin.in'}\n` +
        (corporateAddress ? `📍 Address: ${corporateAddress}` : '');

      if (visitingCardUri) {
        try {
          await Sharing.shareAsync(visitingCardUri, {
            dialogTitle: 'Share Digital Visiting Card',
            mimeType: 'image/png',
          });
          if (acts.length === 0) {
            await saveUserAction('Supplier contacted via Digital Card');
            onStatusChange();
          }
          return;
        } catch {
          appService.showToast('Could not share visiting card', 'Error');
        }
      }

      // ── If no activity yet → send directly to buyer via WhatsApp/SMS ──────────
      if (acts.length === 0) {
        const waUrl = `https://wa.me/${mobile?.with91 ?? mPlain}?text=${encodeURIComponent(message)}`;
        Linking.openURL(waUrl).catch(() => {
          const smsUrl = `sms:${mobile?.withPlus91 ?? mPlain}?body=${encodeURIComponent(message)}`;
          Linking.openURL(smsUrl).catch(() =>
            appService.showToast('Could not open WhatsApp or SMS', 'Error')
          );
        });
        await saveUserAction('Supplier contacted via WA/SMS');
        onStatusChange();
        return;
      }

      // ── Has activity → use native share sheet ────────────────────────────────
      try {
        await Share.share({ message });
      } catch {
        appService.showToast('Could not open share menu', 'Error');
      }
    }, [
      mPlain,
      mobile,
      acts,
      currentUser,
      corporateName,
      corporateEmail,
      corporateAddress,
      userMobile,
      userDisplayName,
      corpProfileImage,
      visitingCardUri,
      saveUserAction,
      onStatusChange,
    ]);

    // ── openActivity — free-text note modal ───────────────────────────────────
    const openActivity = useCallback(() => openActivityModal(''), [openActivityModal]);

    // ── saveEdits ─────────────────────────────────────────────────────────────
    const saveEdits = useCallback(async () => {
      if (isSaving) return;
      setIsSaving(true);
      try {
        await appService.httpClient.put(`/service/leads/${item._id}`, editBuf, {
          headers: { Authorization: `Bearer ${token}` },
        });
        appService.showToast('Lead updated!', 'Success');
        setIsEditing(false);
        onStatusChange();
      } catch {
        appService.showToast('Update failed', 'Error');
      } finally {
        setIsSaving(false);
      }
    }, [isSaving, item._id, editBuf, token, onStatusChange]);

    // ─────────────────────────────────────────────────────────────────────────
    return (
      <>
        <View style={tileStyle}>
          {/* ── ROW 1: Lead no + Status badge + Edit ── */}
        <View style={styles.headerRow as any}>
          <View style={styles.idBox as any}>
            <Text style={styles.idText as any}>Inquiry # {item.lead_no}</Text>
          </View>
          <View style={styles.headerActions as any}>
            {isSaving && (
              <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 8 }} />
            )}
            {isEditing ? (
              <>
                <TouchableOpacity
                  onPress={cancelEdit}
                  disabled={isSaving}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="close" size={20} color={isSaving ? COLORS.textMuted : COLORS.danger} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveEdits}
                  disabled={isSaving}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="check-circle" size={20} color={isSaving ? COLORS.textMuted : COLORS.success} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  onPress={startEditing}
                  disabled={isSaving}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="edit" size={20} color={isSaving ? COLORS.textMuted : COLORS.info} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusBadge, { backgroundColor: statusColor + '15' }] as any}
                  onPress={openStatus}
                  disabled={isSaving}
                >
                  <Text style={[styles.statusText, { color: isSaving ? COLORS.textMuted : statusColor }] as any}>
                    {item.status}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* ── ROW 2: Source + Date Badges ── */}
        <View style={styles.sourceDateRow as any}>
          <View style={[styles.slBadge, styles.slSourceBadge] as any}>
            <MaterialIcons name="campaign" size={12} color={COLORS.primary} />
            <Text style={[styles.slBadgeText, { color: COLORS.primary }] as any}>
              {item.source}
            </Text>
          </View>

          <View style={[styles.slBadge, styles.slDateBadge] as any}>
            <MaterialIcons name="event" size={12} color={COLORS.secondary} />
            <Text style={[styles.slBadgeText, { color: COLORS.secondary }] as any}>
              {appService.formatDateTime(item.generated_date)}
            </Text>
          </View>
        </View>

        {/* ── NAME ── */}
        <View style={styles.slNameRow as any}>
          {!isEditing && <MaterialIcons name="person" size={16} color={COLORS.textMuted} />}
          <EditableField
            value={vName}
            isEditing={isEditing}
            onChange={setName}
            textStyle={styles.nameText as any}
            placeholder="Name"
          />
        </View>

        {/* ── PRODUCT ── */}
        <View style={styles.slProductRow as any}>
          {!isEditing && <MaterialIcons name="shopping-cart" size={16} color={COLORS.textMuted} />}
          <EditableField
            value={vProduct}
            isEditing={isEditing}
            onChange={setProduct}
            textStyle={[styles.nameText, { fontSize: 14, color: COLORS.info }] as any}
            placeholder="Product"
          />
        </View>

        {/* ── EMAIL ── */}
        {vEmail || isEditing ? (
          <View style={styles.slEmailRow as any}>
            {!isEditing && <MaterialIcons name="email" size={15} color={COLORS.primaryDark} />}
            <EditableField
              value={vEmail}
              isEditing={isEditing}
              onChange={setEmail}
              textStyle={styles.slEmailStyle as any}
              placeholder="Email"
            />
            {!isEditing && vEmail ? (
              <TouchableOpacity
                onPress={doEmail}
                style={[styles.btn, styles.slEmailBtnBg, styles.slEmailBtn] as any}
              >
                <MaterialIcons name="email" size={18} color={COLORS.primary} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* ── CITY / STATE ── */}
        {isEditing ? (
          <View style={styles.slCityStateRow as any}>
            <TextInput
              style={[styles.nameText, styles.slInputUnderlineCompact] as any}
              value={vCity}
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor={COLORS.textMuted}
            />
            <TextInput
              style={[styles.nameText, styles.slInputUnderlineCompact] as any}
              value={vState}
              onChangeText={setState_}
              placeholder="State"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
        ) : (
          <Text style={styles.slLocText as any}>
            📍 {item.sender_city || 'N/A'}, {item.sender_state || 'N/A'}
          </Text>
        )}

        {/* ── MOBILE + ACTION BUTTONS ── */}
        <View style={styles.actions as any}>
          {isEditing ? (
            <EditableField
              value={vMobile}
              isEditing={isEditing}
              onChange={setMobile}
              textStyle={styles.phoneText as any}
              placeholder="Mobile"
            />
          ) : (
            <Text style={styles.phoneText as any}>{mPlain}</Text>
          )}

          {/* Action buttons: hidden while editing to avoid accidental calls */}
          {!isEditing && (
            <View style={styles.slRowGap8 as any}>
              <TouchableOpacity onPress={doCall} style={[styles.btn, styles.slCallBtnBg] as any}>
                <MaterialIcons name="call" size={20} color={COLORS.info} />
              </TouchableOpacity>
              <TouchableOpacity onPress={doWA} style={[styles.btn, styles.slWaBtnBg] as any}>
                <MaterialCommunityIcons name="whatsapp" size={20} color={COLORS.success} />
              </TouchableOpacity>
              <TouchableOpacity onPress={shareLead} style={[styles.btn, styles.slPlayBtnBg] as any}>
                <MaterialCommunityIcons name="share-variant" size={20} color={COLORS.info} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── ACTIVITY SECTION ── */}
        <View style={styles.activitySection as any}>
          <View style={styles.activityHeaderRow as any}>
            <TouchableOpacity
              style={styles.activityLabelGroup as any}
              onPress={acts.length > 0 ? toggleActs : undefined}
            >
              <MaterialIcons name="history" size={14} color={COLORS.textMuted} />
              <Text style={styles.activityLabel as any} numberOfLines={2}>
                {lastAct
                  ? `${appService.formatDateTime(lastAct.date)}: ${lastAct.action} → ${lastAct.byUser}`
                  : 'No activity yet'}
              </Text>
              {acts.length > 0 && (
                <MaterialIcons
                  name={showAllActs ? 'expand-less' : 'expand-more'}
                  size={16}
                  color={COLORS.textMuted}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={openActivity} style={styles.slActAddBtn as any}>
              <MaterialIcons name="playlist-add" size={22} color={COLORS.info} />
            </TouchableOpacity>
          </View>

          {showAllActs &&
            acts.map((a: any, i: number) => (
              <View key={`${item._id}-a-${i}`} style={styles.activityItem as any}>
                <Text style={styles.activityRowText as any}>
                  📝 {appService.formatDateTime(a.date)} — {a.action} → {a.byUser}
                </Text>
              </View>
            ))}
        </View>
      </View>
      {enquiryLead && (
        <SiteShiftEditorModal
          visible={!!enquiryLead}
          onClose={closeEnquiry}
          lead={enquiryLead}
          token={token}
          onSaved={() => {
            closeEnquiry();
            onStatusChange?.();
          }}
        />
      )}
      </>
    );
  }
);

export default ShowLeads;
