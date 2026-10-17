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

    // ── doWA — WhatsApp Button with 3 tiered states based on activity count ─────
    // 1) 0 activity: send welcome message to sender_mobile of lead
    // 2) 1 activity: send digital visiting card to sender_mobile of lead
    // 3) > 1 activity: open sender_mobile for user's own message using WhatsApp
    const doWA = useCallback(async () => {
      const cleanPhone = (item.sender_mobile || mPlain || '').replace(/\D/g, '').slice(-10);
      const targetPhone = cleanPhone ? `91${cleanPhone}` : (mobile?.with91 ?? mPlain);

      if (!targetPhone) {
        appService.showToast('No valid mobile number for WhatsApp', 'Error');
        return;
      }

      const clientName = (item.sender_name || '').trim();
      const company = corporateName || 'portakabin.in';
      const repName = userDisplayName || currentUser || 'Sales Team';
      const count = acts.length;

      let waMessage = '';
      let actionLogNote = '';

      if (count === 0) {
        // ── 1) 0 Activity: Welcome Message to sender_mobile ──
        waMessage =
          `👋 *WELCOME TO ${company.toUpperCase()}*\n\n` +
          `Dear *${clientName || 'Customer'}*,\n\n` +
          `Thank you for your valuable inquiry regarding ${item.product_name ? `*${item.product_name}*` : 'our products/services'}.\n\n` +
          `We have received your requirement and our team is ready to assist you with complete specifications, technical details, and the best quote.\n\n` +
          `Please let us know if you have any questions or additional requirements.\n\n` +
          `Warm Regards,\n` +
          `👤 *${repName}*\n` +
          `🏢 *${company}*\n` +
          (userMobile ? `📱 Mobile: ${userMobile}\n` : '') +
          (corporateEmail ? `✉️ Email: ${corporateEmail}\n` : '') +
          (corporateAddress ? `📍 Address: ${corporateAddress}\n` : '');

        actionLogNote = `Welcome message sent via WhatsApp to ${cleanPhone || targetPhone}`;
      } else if (count === 1) {
        // ── 2) 1 Activity: Digital Visiting Card to sender_mobile ──
        waMessage =
          `📇 *DIGITAL VISITING CARD*\n\n` +
          `🏢 *${company}*\n` +
          (corpProfileImage ? `🖼️ Profile: ${corpProfileImage}\n` : '') +
          `👤 *${repName}*\n` +
          (userMobile ? `📱 Mobile: ${userMobile}\n` : '') +
          (corporateEmail ? `✉️ Email: ${corporateEmail}\n` : '') +
          (corporateAddress ? `📍 Address: ${corporateAddress}\n` : '') +
          (item.product_name ? `\n📦 *Requirement:* ${item.product_name}\n` : '') +
          `\nFeel free to connect with us anytime!`;

        actionLogNote = `Digital visiting card sent via WhatsApp to ${cleanPhone || targetPhone}`;
      } else {
        // ── 3) > 1 Activity: Open sender_mobile for user's own message ──
        waMessage = '';
        actionLogNote = `WhatsApp chat opened for ${cleanPhone || targetPhone}`;
      }

      const waUrl = waMessage
        ? `whatsapp://send?phone=${targetPhone}&text=${encodeURIComponent(waMessage)}`
        : `whatsapp://send?phone=${targetPhone}`;
      const fallbackUrl = `https://wa.me/${targetPhone}${waMessage ? `?text=${encodeURIComponent(waMessage)}` : ''}`;

      try {
        const supported = await Linking.canOpenURL(waUrl);
        if (supported) {
          await Linking.openURL(waUrl);
        } else {
          await Linking.openURL(fallbackUrl);
        }
      } catch {
        Linking.openURL(fallbackUrl).catch(() => {
          appService.showToast('Could not open WhatsApp', 'Error');
        });
      }

      await saveUserAction(actionLogNote);
      onStatusChange();
    }, [
      item.sender_mobile,
      item.sender_name,
      item.product_name,
      mPlain,
      mobile,
      acts.length,
      corporateName,
      userDisplayName,
      currentUser,
      userMobile,
      corporateEmail,
      corporateAddress,
      corpProfileImage,
      saveUserAction,
      onStatusChange,
    ]);

    // ── doEmail — open mail → silent save ─────────────────────────────────────
    const doEmail = useCallback(async () => {
      Linking.openURL(`mailto:${item.sender_email}`).catch(() => null);
      await saveUserAction(`Email initiated,check send box`);
      onStatusChange();
    }, [item.sender_email, saveUserAction, onStatusChange]);

    // ── shareLead — Share Lead Details to a selected number using WhatsApp ──────
    const shareLead = useCallback(async () => {
      const clientName = item.sender_name || 'N/A';
      const clientPhone = item.sender_mobile || mPlain || 'N/A';
      const location = [item.sender_city, item.sender_state].filter(Boolean).join(', ') || 'N/A';
      const leadDate = appService.formatDateTime(item.generated_date || item.createdAt || item.call_time);
      const repName = userDisplayName || currentUser || corporateName || 'Sales Team';

      const leadDetailsMessage =
        `📋 *LEAD INQUIRY DETAILS*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        (item.lead_no ? `🆔 *Inquiry #:* ${item.lead_no}\n` : '') +
        `👤 *Client Name:* ${clientName}\n` +
        `📱 *Mobile:* ${clientPhone}\n` +
        (item.sender_email ? `✉️ *Email:* ${item.sender_email}\n` : '') +
        `📦 *Requirement:* ${item.product_name || 'N/A'}\n` +
        `📍 *Location:* ${location}\n` +
        (item.source ? `🏷️ *Source:* ${item.source}\n` : '') +
        `📅 *Date:* ${leadDate}\n` +
        (item.query_message ? `💬 *Query:* ${item.query_message}\n` : '') +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Forwarded by: ${repName}`;

      // Open WhatsApp without phone parameter so WhatsApp lets user select any contact / number to share to
      const waShareUrl = `whatsapp://send?text=${encodeURIComponent(leadDetailsMessage)}`;
      const waWebShareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(leadDetailsMessage)}`;

      let sharedViaWhatsApp = false;
      try {
        const supported = await Linking.canOpenURL(waShareUrl);
        if (supported) {
          await Linking.openURL(waShareUrl);
          sharedViaWhatsApp = true;
        } else {
          const webSupported = await Linking.canOpenURL(waWebShareUrl);
          if (webSupported) {
            await Linking.openURL(waWebShareUrl);
            sharedViaWhatsApp = true;
          }
        }
      } catch (err) {
        console.warn('WhatsApp share error:', err);
      }

      if (!sharedViaWhatsApp) {
        // Fallback to system share menu
        try {
          await Share.share({
            message: leadDetailsMessage,
            title: `Lead #${item.lead_no || ''} - ${clientName}`,
          });
        } catch {
          appService.showToast('Could not open share menu', 'Error');
          return;
        }
      }

      await saveUserAction(`Lead details shared via WhatsApp`);
      onStatusChange();
    }, [
      item.lead_no,
      item.sender_name,
      item.sender_mobile,
      item.sender_email,
      item.product_name,
      item.sender_city,
      item.sender_state,
      item.source,
      item.generated_date,
      item.createdAt,
      item.call_time,
      item.query_message,
      mPlain,
      userDisplayName,
      currentUser,
      corporateName,
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
