import { COLORS } from '@/styles/stylesIndex';
import { appService } from '@/UtilServices/appHelper';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Types ──────────────────────────────────────────────────────────────────
interface SiteShift {
  _id?: string;
  shiftName: string; // 'Morning' | 'Afternoon' | 'Night' | 'General' | 'Day' | 'Night12'
  groupName: string; // 'MANG' | 'DaNi'
  shiftCode: string; // 'M' | 'A' | 'N' | 'G' | 'D' | 'N2'
  startTime: string; // e.g. "06:00"
  durationHrs: number; // 8 or 12
  workerSlots: number; // required workers per day
  billRate: number; // client billing per worker per shift
  salaryRate: number; // worker salary per shift
  active: boolean;
  exemptDays?: string[];
  // stats returned from getSiteShifts
  permittedThisMonth?: number;
  actualThisMonth?: number;
  activeNow?: number;
  isExcess?: boolean;
  slotExcess?: boolean;
}

interface SiteShiftStats {
  leadId: string;
  siteName: string;
  daysInMonth: number;
  shifts: SiteShift[];
  totalPermittedThisMonth: number;
  totalActualThisMonth: number;
  totalExcess: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  lead: any;
  token: string;
  onSaved?: (updatedLead: any) => void;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const INK = '#161B22';
const INK_SOFT = '#5B6472';
const INK_FAINT = '#94A0B2';
const LINE = '#E5E8F0';
const SURFACE_MUTE = '#EEF1F6';
const PAGE_BG = '#F5F6FA';
const SUCCESS = '#16A34A';
const SUCCESS_BG = '#F0FDF4';
const DANGER = '#DC2626';
const DANGER_BG = '#FEF2F2';

// Each shift "family" gets one color that carries through the color bar,
// the icon chip, and the timeline fill — color = time of day, everywhere.
const SHIFT_META: Record<
  string,
  { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  M: { color: '#D97706', bg: '#FFFBEB', icon: 'sunny' },
  A: { color: '#EA580C', bg: '#FFF7ED', icon: 'partly-sunny' },
  N: { color: '#4F46E5', bg: '#EEF2FF', icon: 'moon' },
  G: { color: '#475569', bg: '#F1F5F9', icon: 'settings' },
  D: { color: '#D97706', bg: '#FFFBEB', icon: 'sunny' },
  N2: { color: '#7C3AED', bg: '#F5F3FF', icon: 'moon' },
};
const getShiftMeta = (code: string) => SHIFT_META[code] || SHIFT_META.G;

// ─── Preset shift templates ───────────────────────────────────────────────────
const SHIFT_PRESETS = [
  {
    label: 'Morning',
    shiftName: 'Morning',
    groupName: 'MANG',
    shiftCode: 'M',
    startTime: '06:00',
    durationHrs: 8,
  },
  {
    label: 'Afternoon',
    shiftName: 'Afternoon',
    groupName: 'MANG',
    shiftCode: 'A',
    startTime: '14:00',
    durationHrs: 8,
  },
  {
    label: 'Night',
    shiftName: 'Night',
    groupName: 'MANG',
    shiftCode: 'N',
    startTime: '22:00',
    durationHrs: 8,
  },
  {
    label: 'General',
    shiftName: 'General',
    groupName: 'MANG',
    shiftCode: 'G',
    startTime: '09:00',
    durationHrs: 8,
  },
  {
    label: 'Day · 12h',
    shiftName: 'Day',
    groupName: 'DaNi',
    shiftCode: 'D',
    startTime: '08:00',
    durationHrs: 12,
  },
  {
    label: 'Night · 12h',
    shiftName: 'Night12',
    groupName: 'DaNi',
    shiftCode: 'N2',
    startTime: '20:00',
    durationHrs: 12,
  },
];

const BLANK_SHIFT: SiteShift = {
  shiftName: 'General',
  groupName: 'MANG',
  shiftCode: 'G',
  startTime: '09:00',
  durationHrs: 8,
  workerSlots: 1,
  billRate: 0,
  salaryRate: 0,
  active: true,
  exemptDays: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const shiftEndTime = (start: string, hrs: number) => {
  if (!start) return '';
  const [h, m] = start.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '';
  const endH = (h + hrs) % 24;
  return `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// ─── 24-hour timeline strip ───────────────────────────────────────────────────
// The signature visual: every shift is plotted on a midnight-to-midnight
// track so its position in the day is read at a glance, not just its label.
const ShiftTimelineStrip = React.memo(
  ({ start, hrs, color }: { start: string; hrs: number; color: string }) => {
    const [hRaw, mRaw] = (start || '00:00').split(':').map(Number);
    const h = isNaN(hRaw) ? 0 : hRaw;
    const m = isNaN(mRaw) ? 0 : mRaw;
    const startFrac = Math.max(0, Math.min(1, (h + m / 60) / 24));
    const lenFrac = Math.max(0, Math.min(1, (hrs || 0) / 24));
    const wraps = startFrac + lenFrac > 1;
    const firstWidth = wraps ? 1 - startFrac : lenFrac;
    const secondWidth = wraps ? startFrac + lenFrac - 1 : 0;

    return (
      <View style={styles.timelineTrack}>
        {[0.25, 0.5, 0.75].map((t) => (
          <View key={t} style={[styles.timelineTick, { left: `${t * 100}%` }]} />
        ))}
        <View
          style={[
            styles.timelineFill,
            { left: `${startFrac * 100}%`, width: `${firstWidth * 100}%`, backgroundColor: color },
          ]}
        />
        {wraps && (
          <View
            style={[
              styles.timelineFill,
              { left: '0%', width: `${secondWidth * 100}%`, backgroundColor: color },
            ]}
          />
        )}
      </View>
    );
  }
);

// ─── Form section wrapper ─────────────────────────────────────────────────────
const FormSection = React.memo(
  ({
    icon,
    title,
    children,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    children: React.ReactNode;
  }) => (
    <View style={styles.formSection}>
      <View style={styles.formSectionHeader}>
        <Ionicons name={icon} size={13} color={INK_FAINT} />
        <Text style={styles.formSectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  )
);

// ─── Fade-in wrapper for the edit form ───────────────────────────────────────
const FadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
};

// ─── Component ───────────────────────────────────────────────────────────────
export const SiteShiftEditorModal: React.FC<Props> = ({
  visible,
  onClose,
  lead,
  token,
  onSaved,
}) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<SiteShiftStats | null>(null);
  const [shifts, setShifts] = useState<SiteShift[]>([]);
  const [showTimePicker, setShowTimePicker] = useState<number | null>(null);
  const [selectedIdxs, setSelectedIdxs] = useState<Set<number>>(new Set());

  const toggleExemptDay = (idx: number, day: string) => {
    setShifts((prev) => {
      const copy = [...prev];
      const currentDays = copy[idx].exemptDays || [];
      const newDays = currentDays.includes(day)
        ? currentDays.filter((d) => d !== day)
        : [...currentDays, day];
      copy[idx] = { ...copy[idx], exemptDays: newDays };
      return copy;
    });
  };

  const updateShiftField = (idx: number, field: keyof SiteShift, val: any) => {
    setShifts((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const handleTimeChange = (event: any, selectedDate?: Date) => {
    // Only used for iOS where state showTimePicker is valid
    const idx = showTimePicker;
    if (event.type === 'set' || Platform.OS === 'ios') {
      if (selectedDate && idx !== null) {
        const hh = String(selectedDate.getHours()).padStart(2, '0');
        const mm = String(selectedDate.getMinutes()).padStart(2, '0');
        updateShiftField(idx, 'startTime', `${hh}:${mm}`);
      }
    }
  };

  const openTimePicker = (idx: number) => {
    const d = new Date();
    const [h, m] = (shifts[idx].startTime || '09:00').split(':').map(Number);
    d.setHours(h || 0, m || 0, 0, 0);

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: d,
        onChange: (event, selectedDate) => {
          if (event.type === 'set' && selectedDate) {
            const hh = String(selectedDate.getHours()).padStart(2, '0');
            const mm = String(selectedDate.getMinutes()).padStart(2, '0');
            updateShiftField(idx, 'startTime', `${hh}:${mm}`);
          }
        },
        mode: 'time',
        is24Hour: true,
      });
    } else {
      setShowTimePicker(idx);
    }
  };

  const loadShifts = useCallback(async () => {
    if (!lead?._id) return;
    setLoading(true);
    try {
      const res = await appService.httpClient.get(`service/leads/${lead._id}/shifts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) {
        setStats(res.data.data);
        setShifts(res.data.data.shifts || []);
      }
    } catch {
      // no shifts yet, use lead's embedded siteShifts
      setShifts(lead?.siteShifts || []);
    } finally {
      setLoading(false);
    }
  }, [lead?._id, token]);

  useEffect(() => {
    if (visible) loadShifts();
  }, [visible, loadShifts]);

  const saveShifts = async () => {
    setSaving(true);
    try {
      const res = await appService.httpClient.put(
        `service/leads/${lead._id}/shifts`,
        {
          siteShifts: shifts.map(
            ({ permittedThisMonth, actualThisMonth, activeNow, isExcess, slotExcess, ...s }) => s
          ),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.success) {
        appService.showToast('Site shifts saved', 'Success');
        onSaved?.(res.data.data);
        await loadShifts();
      } else {
        appService.showToast(res.data?.message || 'Failed to save', 'Error');
      }
    } catch (e: any) {
      appService.showToast(e?.response?.data?.message || 'Failed to save shifts', 'Error');
    } finally {
      setSaving(false);
    }
  };

  const appendGroup = (groupName: 'MANG' | 'DaNi') => {
    setShifts((prev) => {
      const existingCodes = new Set(prev.map((s) => s.shiftCode));
      const newShifts = SHIFT_PRESETS.filter(
        (p) => p.groupName === groupName && !existingCodes.has(p.shiftCode)
      ).map((p) => ({
        shiftName: p.shiftName,
        groupName: p.groupName,
        shiftCode: p.shiftCode,
        startTime: p.startTime,
        durationHrs: p.durationHrs,
        workerSlots: 1,
        billRate: 0,
        salaryRate: 0,
        active: true,
        exemptDays: [],
      }));
      return [...prev, ...newShifts];
    });
  };

  const addCustomShift = () => {
    setShifts((prev) => [...prev, { ...BLANK_SHIFT }]);
  };

  const deleteShift = (idx: number) => {
    Alert.alert('Remove shift', `Remove ${shifts[idx].shiftName} from this table?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setShifts((prev) => prev.filter((_, i) => i !== idx));
          setSelectedIdxs((prev) => {
            const next = new Set(prev);
            next.delete(idx);
            return next;
          });
        },
      },
    ]);
  };

  const deleteSelectedShifts = () => {
    if (selectedIdxs.size === 0) return;
    Alert.alert('Remove shifts', `Remove ${selectedIdxs.size} selected shift(s)?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setShifts((prev) => prev.filter((_, i) => !selectedIdxs.has(i)));
          setSelectedIdxs(new Set());
        },
      },
    ]);
  };

  const toggleSelect = (idx: number) => {
    setSelectedIdxs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIdxs.size === shifts.length) {
      setSelectedIdxs(new Set());
    } else {
      setSelectedIdxs(new Set(shifts.map((_, i) => i)));
    }
  };

  const toggleActive = (idx: number) => {
    const updated = shifts.map((s, i) => (i === idx ? { ...s, active: !s.active } : s));
    setShifts(updated);
  };

  const siteName = stats?.siteName || lead?.sender_name || 'Site';

  if (!visible) return null;

  return (
    <KeyboardAvoidingView
      style={[StyleSheet.absoluteFillObject, { zIndex: 999, backgroundColor: PAGE_BG }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flex: 1, backgroundColor: PAGE_BG, paddingTop: insets.top }}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={onClose} style={styles.headerIconBtn} activeOpacity={0.75}>
              <Ionicons name="chevron-back" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerEyebrow}>Shift schedule</Text>
            {saving ? (
              <View style={[styles.headerSaveBtn, { backgroundColor: 'transparent' }]}>
                <ActivityIndicator color="#fff" size="small" />
              </View>
            ) : (
              <TouchableOpacity
                onPress={saveShifts}
                style={styles.headerSaveBtn}
                activeOpacity={0.75}
              >
                <Ionicons name="save-outline" size={16} color="#fff" />
                <Text style={styles.headerSaveBtnText}>Save</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {siteName}
          </Text>
        </View>

        {/* Monthly Summary — floats over the header for a layered, modern feel */}
        {stats && (
          <View style={styles.statsCard}>
            <View style={styles.statCell}>
              <Text style={styles.statNum}>{stats.shifts.length}</Text>
              <Text style={styles.statLabel}>Shifts</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statNum}>{stats.totalPermittedThisMonth}</Text>
              <Text style={styles.statLabel}>Permitted</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={[styles.statNum, stats.totalExcess > 0 && { color: DANGER }]}>
                {stats.totalActualThisMonth}
              </Text>
              <Text style={styles.statLabel}>Actual</Text>
            </View>
            {stats.totalExcess > 0 && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={[styles.statNum, { color: DANGER }]}>+{stats.totalExcess}</Text>
                  <Text style={styles.statLabel}>Excess</Text>
                </View>
              </>
            )}
          </View>
        )}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading shift schedule…</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: stats ? 18 : 24,
              paddingBottom: 60,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Shift list */}
            {shifts.length === 0 && (
              <View style={styles.emptyBox}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="calendar-outline" size={28} color={INK_SOFT} />
                </View>
                <Text style={styles.emptyText}>No shifts set up yet</Text>
                <View style={styles.emptyWarnBanner}>
                  <Ionicons name="alert-circle" size={13} color={DANGER} />
                  <Text style={styles.emptyWarnText}>
                    Duty start is blocked until you add a shift
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={addCustomShift}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle" size={18} color="#fff" />
                  <Text style={styles.emptyAddBtnText}>Add a shift</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Shift list Table View */}
            {shifts.length > 0 && (
              <View>
                {selectedIdxs.size > 0 && (
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'flex-end',
                      marginBottom: 8,
                      paddingHorizontal: 4,
                    }}
                  >
                    <TouchableOpacity
                      onPress={deleteSelectedShifts}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: DANGER_BG,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                      }}
                    >
                      <Ionicons name="trash" size={14} color={DANGER} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: DANGER }}>
                        Delete {selectedIdxs.size} selected
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                <View style={styles.tableContainer}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={true}
                    persistentScrollbar={true}
                    indicatorStyle="black"
                    contentContainerStyle={{ paddingBottom: 8 }}
                  >
                    <View>
                      {/* Header Row */}
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.tableHeaderCell, { width: 100 }]}>
                          {'Shift\nName'}
                        </Text>
                        <Text style={[styles.tableHeaderCell, { width: 70 }]}>{'Duty\nStart'}</Text>
                        <Text style={[styles.tableHeaderCell, { width: 60 }]}>{'Duty\nHrs'}</Text>
                        <Text style={[styles.tableHeaderCell, { width: 70 }]}>
                          {'Worker\nCount'}
                        </Text>
                        <Text style={[styles.tableHeaderCell, { width: 70 }]}>{'Pay\nRate'}</Text>
                        <Text style={[styles.tableHeaderCell, { width: 70 }]}>{'Bill\nRate'}</Text>
                        <TouchableOpacity
                          style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}
                          onPress={toggleSelectAll}
                        >
                          <Ionicons
                            name={
                              selectedIdxs.size > 0 && selectedIdxs.size === shifts.length
                                ? 'checkbox'
                                : 'square-outline'
                            }
                            size={20}
                            color={COLORS.primary}
                          />
                        </TouchableOpacity>
                      </View>

                      {/* Data Rows */}
                      {shifts.map((shift, idx) => (
                        <React.Fragment key={shift._id || idx}>
                        <View
                          style={[styles.tableDataRow, !shift.active && { opacity: 0.5 }]}
                        >
                          <View
                            style={[
                              styles.tableDataCell,
                              { width: 100, flexDirection: 'row', alignItems: 'center' },
                            ]}
                          >
                            <View
                              style={[
                                styles.shiftDot,
                                { backgroundColor: getShiftMeta(shift.shiftCode).color },
                              ]}
                            />
                            <Text style={styles.tableDataCellText} numberOfLines={1}>
                              {shift.shiftName}
                            </Text>
                          </View>

                          {/* Duty Start */}
                          <TouchableOpacity
                            style={[styles.tableDataCell, { width: 70 }]}
                            onPress={() => openTimePicker(idx)}
                          >
                            <View style={styles.inlineInputContainer}>
                              <Text style={styles.inlineInputText}>
                                {shift.startTime || 'HH:MM'}
                              </Text>
                            </View>
                          </TouchableOpacity>

                          {/* Duty Hrs */}
                          <View style={[styles.tableDataCell, { width: 60 }]}>
                            <TextInput
                              style={styles.inlineInput}
                              value={String(shift.durationHrs || '')}
                              onChangeText={(v) =>
                                updateShiftField(idx, 'durationHrs', parseInt(v) || 0)
                              }
                              keyboardType="number-pad"
                            />
                          </View>

                          {/* Worker Count */}
                          <View style={[styles.tableDataCell, { width: 70 }]}>
                            <TextInput
                              style={styles.inlineInput}
                              value={String(shift.workerSlots || '')}
                              onChangeText={(v) =>
                                updateShiftField(idx, 'workerSlots', parseInt(v) || 0)
                              }
                              keyboardType="number-pad"
                            />
                          </View>

                          {/* Pay Rate */}
                          <View style={[styles.tableDataCell, { width: 70 }]}>
                            <TextInput
                              style={styles.inlineInput}
                              value={String(shift.salaryRate || '')}
                              onChangeText={(v) =>
                                updateShiftField(idx, 'salaryRate', parseFloat(v) || 0)
                              }
                              keyboardType="decimal-pad"
                            />
                          </View>

                          {/* Bill Rate */}
                          <View style={[styles.tableDataCell, { width: 70 }]}>
                            <TextInput
                              style={styles.inlineInput}
                              value={String(shift.billRate || '')}
                              onChangeText={(v) =>
                                updateShiftField(idx, 'billRate', parseFloat(v) || 0)
                              }
                              keyboardType="decimal-pad"
                            />
                          </View>

                          <View
                            style={[
                              styles.tableDataCell,
                              { width: 40, flexDirection: 'row', justifyContent: 'center' },
                            ]}
                          >
                            <TouchableOpacity
                              onPress={() => toggleSelect(idx)}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                              <Ionicons
                                name={selectedIdxs.has(idx) ? 'checkbox' : 'square-outline'}
                                size={20}
                                color={COLORS.primary}
                              />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Exempt Days Sub-row */}
                        <View style={styles.exemptDaysRow}>
                          <Text style={styles.exemptDaysLabel}>Exempt Days:</Text>
                          <View style={styles.exemptDaysList}>
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => {
                              const isSelected = (shift.exemptDays || []).includes(day);
                              return (
                                <TouchableOpacity
                                  key={day}
                                  style={[styles.exemptDayChip, isSelected && styles.exemptDayChipActive]}
                                  onPress={() => toggleExemptDay(idx, day)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={[styles.exemptDayChipText, isSelected && styles.exemptDayChipTextActive]}>
                                    {day}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      </React.Fragment>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </View>
            )}

            {/* Global Time Picker for iOS */}
            {showTimePicker !== null && Platform.OS === 'ios' && (
              <View style={{ alignItems: 'center', marginBottom: 24 }}>
                <DateTimePicker
                  value={(() => {
                    const d = new Date();
                    const [h, m] = (shifts[showTimePicker].startTime || '09:00')
                      .split(':')
                      .map(Number);
                    d.setHours(h || 0, m || 0, 0, 0);
                    return d;
                  })()}
                  mode="time"
                  is24Hour={true}
                  display="spinner"
                  onChange={handleTimeChange}
                />
                <TouchableOpacity
                  onPress={() => setShowTimePicker(null)}
                  style={{
                    marginTop: 8,
                    padding: 12,
                    backgroundColor: SURFACE_MUTE,
                    borderRadius: 8,
                    minWidth: 100,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontWeight: '700', color: COLORS.primary }}>Done</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Add buttons at bottom */}
            <View style={styles.quickAddContainer}>
              <Text style={styles.quickAddTitle}>Quick Add</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <TouchableOpacity
                  style={styles.addMoreBtn}
                  onPress={() => appendGroup('MANG')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add-circle" size={18} color={COLORS.primary} />
                  <Text style={styles.addMoreBtnText}>8h Group (MANG)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addMoreBtn}
                  onPress={() => appendGroup('DaNi')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add-circle" size={18} color={COLORS.primary} />
                  <Text style={styles.addMoreBtnText}>12h Group (DaNi)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addMoreBtn}
                  onPress={addCustomShift}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.addMoreBtnText}>Custom Shift</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    marginTop: 10,
    letterSpacing: -0.3,
  },

  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: -22,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 19, fontWeight: '900', color: INK },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: INK_FAINT,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statDivider: { width: 1, height: '70%', backgroundColor: LINE },

  loadingBox: { alignItems: 'center', marginTop: 60, gap: 10 },
  loadingText: { fontSize: 13, color: INK_FAINT, fontWeight: '600' },

  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    padding: 28,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: LINE,
    borderStyle: 'dashed',
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: SURFACE_MUTE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: { fontSize: 16, fontWeight: '800', color: INK, marginTop: 14 },
  emptyWarnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: DANGER_BG,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  emptyWarnText: { fontSize: 12, fontWeight: '700', color: DANGER },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
  },
  emptyAddBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  shiftCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: LINE,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  shiftCardInactive: { opacity: 0.55 },
  shiftColorBar: { width: 4 },
  shiftCardBody: { flex: 1, padding: 14 },
  shiftCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  shiftIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shiftName: { fontSize: 15, fontWeight: '800', color: INK },
  shiftMeta: { fontSize: 11, fontWeight: '600', color: INK_FAINT, marginTop: 1 },

  timelineTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: SURFACE_MUTE,
    position: 'relative',
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 6,
  },
  timelineTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(15,23,42,0.10)',
  },
  timelineFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 },
  timelineCaption: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  timelineCaptionText: { fontSize: 10, fontWeight: '700', color: INK_SOFT },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: SURFACE_MUTE,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  infoChipText: { fontSize: 11, fontWeight: '700', color: INK_SOFT },
  warnChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: DANGER_BG,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  warnChipText: { fontSize: 11, fontWeight: '800', color: DANGER },

  monthBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
  },
  monthBannerOk: { backgroundColor: SUCCESS_BG },
  monthBannerExcess: { backgroundColor: DANGER_BG },
  monthBannerText: { fontSize: 11, fontWeight: '700', flexShrink: 1 },

  shiftActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 10,
  },
  actionBtnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: SURFACE_MUTE,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionBtnGhostText: { fontSize: 12, fontWeight: '700', color: INK_SOFT },
  actionBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: DANGER_BG,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionBtnDangerText: { fontSize: 12, fontWeight: '700', color: DANGER },

  editForm: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginTop: 4,
    borderWidth: 1.5,
    borderColor: COLORS.primary + '30',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  editFormTitle: { fontSize: 16, fontWeight: '900', color: INK },
  editFormSubtitle: { fontSize: 12, color: INK_FAINT, marginTop: 2, marginBottom: 16 },

  formSection: { marginBottom: 18 },
  formSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  formSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: INK_FAINT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: INK_SOFT, marginBottom: 4 },
  fieldInput: {
    borderWidth: 1.5,
    borderColor: LINE,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    color: INK,
    fontSize: 14,
    backgroundColor: PAGE_BG,
  },

  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: SURFACE_MUTE,
    borderWidth: 1,
    borderColor: LINE,
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: INK_SOFT },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  saveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.primary + '50',
    backgroundColor: COLORS.primary + '08',
  },
  addMoreBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },

  slidingToggleContainer: {
    flexDirection: 'row',
    backgroundColor: SURFACE_MUTE,
    borderRadius: 12,
    padding: 4,
    position: 'relative',
    borderWidth: 1,
    borderColor: LINE,
  },
  slidingIndicator: {
    position: 'absolute',
    top: '6%',
    bottom: '6%',
    left: '2%',
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  slidingBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  slidingBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: INK_SOFT,
  },
  slidingBtnTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  shiftNameChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: SURFACE_MUTE,
    borderWidth: 1,
    borderColor: LINE,
  },
  shiftNameChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: INK_SOFT,
  },
  timingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PAGE_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LINE,
    padding: 8,
    marginBottom: 10,
  },
  timingBlock: {
    flex: 1,
  },
  timingBlockResult: {
    flex: 1,
    backgroundColor: COLORS.primary + '12',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timingLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: INK_FAINT,
    marginBottom: 4,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  timingInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 8,
    height: 36,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: INK,
  },
  timingDivider: {
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timingResultText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
  },
  strengthCard: {
    backgroundColor: PAGE_BG,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LINE,
  },
  subFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: INK_SOFT,
    marginBottom: 6,
  },
  fieldInputInner: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    color: INK,
    fontSize: 14,
  },
  tableContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LINE,
    overflow: 'hidden',
    marginBottom: 20,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: SURFACE_MUTE,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  tableHeaderCell: {
    fontSize: 12,
    fontWeight: '700',
    color: INK_SOFT,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  tableDataCell: {},
  tableDataCellText: {
    fontSize: 14,
    fontWeight: '500',
    color: INK,
  },
  shiftDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  headerSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  headerSaveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  inlineInput: {
    backgroundColor: '#a2aab3d8',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 0,
    height: 38,
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
    textAlign: 'center',
  },
  inlineInputContainer: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 4,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineInputText: {
    fontSize: 13,
    color: INK,
    fontWeight: '600',
  },
  quickAddContainer: {
    marginTop: 10,
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  quickAddTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: INK_FAINT,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  exemptDaysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FAFBFC',
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  exemptDaysLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: INK_FAINT,
    marginRight: 10,
    textTransform: 'uppercase',
  },
  exemptDaysList: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
    flex: 1,
  },
  exemptDayChip: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#fff',
  },
  exemptDayChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '1A',
  },
  exemptDayChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: INK_SOFT,
  },
  exemptDayChipTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
});

export default SiteShiftEditorModal;
