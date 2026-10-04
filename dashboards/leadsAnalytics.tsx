import { AnalyticsFilters, useLeadAnalytics } from '@/hooks/leadAnalytics';
import { COLORS } from '@/styles/stylesIndex';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import FinanceAnalytics from './financeAnalytics';

// ─── Color palette ────────────────────────────────────────────────────────────
const SOURCE_COLORS = ['#378ADD', '#1D9E75', '#D85A30', '#BA7517', '#D4537E', '#639922', '#7F77DD'];
const STATUS_COLORS: Record<string, string> = {
  Recent: '#378ADD',
  Engaged: '#1D9E75',
  Accepted: '#639922',
  Recycle: '#E24B4A',
  Delete: '#E24B4A',
  Invoice: '#1c4410',
};

// ─── Pill status groups (matches bar chart) ────────────────────────────────
// Order: Total → In-Progress → Converted → Recycle
const PILL_STATUSES = [
  { key: 'inprogress', label: 'Progress', color: '#F5A623', field: 'pendingCount' },
  { key: 'converted', label: 'Converted', color: '#1D9E75', field: 'posCount' },
  { key: 'recycle', label: 'Recycle', color: '#E24B4A', field: 'recycleCount' },
];

const DATE_PRESETS = [
  { label: 'All', fromDate: '', toDate: '' },
  { label: 'Today', fromDate: 'today', toDate: '' },
  { label: '7D', fromDate: '7days', toDate: '' },
  { label: '30D', fromDate: '30days', toDate: '' },
];

interface LeadAnalyticsProps {
  isDark: boolean;
  token: string;
  dbName: string | undefined;
}

const LeadAnalytics = React.memo(({ isDark, token, dbName }: LeadAnalyticsProps) => {
  const [adminTab, setAdminTab] = useState<'Leads' | 'Finance'>('Leads');
  const [zoom, setZoom] = useState(1.0);

  const [filters, setFilters] = useState<AnalyticsFilters>({
    fromDate: '',
    toDate: '',
    source: '',
  });

  const { sourceData, statusData, totalCount, financeTrend, loading, error, refresh } =
    useLeadAnalytics(token, dbName, filters);

  // ── Colours ───────────────────────────────────────────────────────────
  const bg = isDark ? COLORS.bgDark : COLORS.bgLight;
  const cardBg = isDark ? COLORS.cardDark : COLORS.cardLight;
  const border = isDark ? COLORS.borderDark : COLORS.border;
  const txtPri = isDark ? '#e8e8e8' : '#1a1a1a';
  const txtSec = isDark ? '#999' : '#666';
  const trackBg = isDark ? '#2a2a2a' : '#f0f0f0';
  const gridBg = isDark ? '#1a1a1a' : '#f8f8f8';
  const gridBorder = isDark ? '#333' : '#e0e0e0';

  // ── Aggregated sums across ALL sources ────────────────────────────────
  const sumTotal = sourceData.reduce(
    (acc: number, curr: any) => acc + (Number(curr.total) || 0),
    0
  );
  const sumConverted = sourceData.reduce(
    (acc: number, curr: any) => acc + (Number(curr.posCount) || 0),
    0
  );
  const sumRecycle = sourceData.reduce(
    (acc: number, curr: any) => acc + (Number(curr.recycleCount) || 0),
    0
  );
  const sumPending = sourceData.reduce(
    (acc: number, curr: any) => acc + (Number(curr.pendingCount) || 0),
    0
  );

  // ── Single merged bar chart (one group of 4 bars = totals across all sources)
  const RenderMergedBarChart = () => {
    const screenWidth = Dimensions.get('window').width;

    const maxRangeValue = Math.max(sumTotal, sumConverted, sumRecycle, sumPending, 10) * 1.3;

    // Sequence: Total → In-Progress → Converted → Recycle
    const chartData = [
      {
        value: sumTotal,
        label: 'Total',
        frontColor: '#378ADD',
        spacing: 6 * zoom,
        labelTextStyle: {
          color: txtPri,
          fontSize: 9 * zoom,
          fontWeight: 'bold',
          width: 56 * zoom,
          textAlign: 'center' as const,
        },
      },
      {
        value: sumPending,
        label: 'Progress',
        frontColor: '#F5A623',
        spacing: 6 * zoom,
        labelTextStyle: {
          color: txtPri,
          fontSize: 9 * zoom,
          fontWeight: 'bold',
          width: 56 * zoom,
          textAlign: 'center' as const,
        },
      },
      {
        value: sumConverted,
        label: 'Convert',
        frontColor: '#1D9E75',
        spacing: 6 * zoom,
        labelTextStyle: {
          color: txtPri,
          fontSize: 9 * zoom,
          fontWeight: 'bold',
          width: 56 * zoom,
          textAlign: 'center' as const,
        },
      },
      {
        value: sumRecycle,
        label: 'Recycle',
        frontColor: '#E24B4A',
        spacing: 6 * zoom,
        labelTextStyle: {
          color: txtPri,
          fontSize: 9 * zoom,
          fontWeight: 'bold',
          width: 56 * zoom,
          textAlign: 'center' as const,
        },
      },
    ];

    return (
      <View style={{ marginTop: 0, paddingBottom: 0 }}>
        <BarChart
          {...({
            data: chartData,
            width: screenWidth - 80,
            height: 120,
            barWidth: 44 * zoom,
            initialSpacing: 20 * zoom,
            maxValue: maxRangeValue,
            noOfSections: 4,
            barBorderRadius: 4,
            yAxisThickness: 0,
            xAxisThickness: 1.5,
            xAxisColor: border,
            yAxisTextStyle: { color: txtSec, fontSize: 9 },
            yAxisLabelWidth: 26,
            isAnimated: true,
            rotateLabel: false,
            labelsExtraHeight: 20,
          } as any)}
        />
      </View>
    );
  };

  // ── Source × Status grid ──────────────────────────────────────────────
  // Columns = status pills; Rows = each source
  const SourceStatusGrid = () => {
    if (!sourceData || sourceData.length === 0) return null;

    const GRID_COLUMNS = [
      { key: 'total', label: 'Total', color: '#378ADD', isTotal: true },
      { key: 'inprogress', label: 'Progress', color: '#F5A623', field: 'pendingCount' },
      { key: 'converted', label: 'Converted', color: '#1D9E75', field: 'posCount' },
      { key: 'recycle', label: 'Recycle', color: '#E24B4A', field: 'recycleCount' },
    ];

    return (
      <View
        style={{
          width: '100%',
          borderRadius: 12,
          borderWidth: 0.5,
          borderColor: gridBorder,
          overflow: 'hidden',
          marginTop: 4,
        }}
      >
        {/* ── Header row ── */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: isDark ? '#1e1e1e' : '#f0f0f0',
            borderBottomWidth: 0.5,
            borderBottomColor: gridBorder,
          }}
        >
          {/* top-left corner: Sources heading */}
          <View
            style={{
              width: '28%',
              paddingVertical: 5,
              paddingHorizontal: 6,
              borderRightWidth: 0.5,
              borderRightColor: gridBorder,
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 10, color: txtSec, fontWeight: '700', letterSpacing: 0.5 }}>
              SOURCES
            </Text>
          </View>
          {GRID_COLUMNS.map((col, cIdx) => (
            <View
              key={col.key}
              style={{
                width: '18%',
                paddingVertical: 5,
                paddingHorizontal: 4,
                alignItems: 'center',
                justifyContent: 'center',
                borderRightWidth: cIdx === GRID_COLUMNS.length - 1 ? 0 : 0.5,
                borderRightColor: gridBorder,
              }}
            >
              <View
                style={{
                  backgroundColor: col.color,
                  borderRadius: 6,
                  paddingHorizontal: 4,
                  paddingVertical: 2,
                  alignSelf: 'stretch',
                  alignItems: 'center',
                }}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  style={{ fontSize: 9, color: '#fff', fontWeight: '700' }}
                >
                  {col.label}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Data rows ── */}
        {sourceData.map((src: any, idx: number) => {
          const srcColor = SOURCE_COLORS[idx % SOURCE_COLORS.length];
          const rowBg =
            idx % 2 === 0 ? (isDark ? '#161616' : '#ffffff') : isDark ? '#1c1c1c' : '#fafafa';

          return (
            <View
              key={src.label}
              style={{
                flexDirection: 'row',
                backgroundColor: rowBg,
                borderBottomWidth: 0.5,
                borderBottomColor: gridBorder,
              }}
            >
              {/* Source label */}
              <View
                style={{
                  width: '28%',
                  paddingVertical: 5,
                  paddingHorizontal: 6,
                  justifyContent: 'center',
                  borderRightWidth: 0.5,
                  borderRightColor: gridBorder,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    backgroundColor: srcColor,
                    flexShrink: 0,
                  }}
                />
                <Text
                  style={{ fontSize: 10, color: txtPri, fontWeight: '500', flex: 1 }}
                  numberOfLines={2}
                >
                  {src.label}
                </Text>
              </View>

              {/* Cells per column */}
              {GRID_COLUMNS.map((col, cIdx) => {
                let val = 0;
                if (col.isTotal) {
                  val = (Number(src.pendingCount) || 0) + (Number(src.posCount) || 0) + (Number(src.recycleCount) || 0);
                } else if (col.field) {
                  val = Number(src[col.field]) || 0;
                }

                return (
                  <View
                    key={col.key}
                    style={{
                      width: '18%',
                      paddingVertical: 5,
                      paddingHorizontal: 4,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRightWidth: cIdx === GRID_COLUMNS.length - 1 ? 0 : 0.5,
                      borderRightColor: gridBorder,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: val > 0 ? '700' : '400',
                        color: val > 0 ? col.color : isDark ? '#444' : '#ccc',
                      }}
                    >
                      {val}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* ── Total footer row ── */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: isDark ? '#1e1e1e' : '#f0f0f0',
            borderTopWidth: 1,
            borderTopColor: gridBorder,
          }}
        >
          <View
            style={{
              width: '28%',
              paddingVertical: 6,
              paddingHorizontal: 6,
              borderRightWidth: 0.5,
              borderRightColor: gridBorder,
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 10, color: txtSec, fontWeight: '700' }}>TOTAL</Text>
          </View>
          {[
            { key: 'total', val: sumTotal, color: '#378ADD' },
            { key: 'inprogress', val: sumPending, color: '#F5A623' },
            { key: 'converted', val: sumConverted, color: '#1D9E75' },
            { key: 'recycle', val: sumRecycle, color: '#E24B4A' },
          ].map((col, cIdx) => (
            <View
              key={col.key}
              style={{
                width: '18%',
                paddingVertical: 6,
                paddingHorizontal: 4,
                alignItems: 'center',
                justifyContent: 'center',
                borderRightWidth: cIdx === 3 ? 0 : 0.5,
                borderRightColor: gridBorder,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: col.color }}>{col.val}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  // ── Pill ───────────────────────────────────────────────────────────────
  const Pill = ({
    label,
    active,
    onPress,
  }: {
    label: string;
    active: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        marginRight: 6,
        marginBottom: 6,
        backgroundColor: active ? '#378ADD' : isDark ? '#2a2a2a' : '#eee',
        borderWidth: 0.5,
        borderColor: active ? '#378ADD' : border,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '500', color: active ? '#fff' : txtSec }}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  // ── Section card ───────────────────────────────────────────────────────
  const SectionCard = ({ children, style }: { children: React.ReactNode; style?: any }) => (
    <View
      style={[
        {
          backgroundColor: cardBg,
          borderRadius: 14,
          borderWidth: 0.5,
          borderColor: border,
          padding: 14,
          marginBottom: 10,
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  const SectionTitle = ({ label }: { label: string }) => (
    <Text style={{ fontSize: 10, color: txtSec, letterSpacing: 0.7, marginBottom: 12 }}>
      {label.toUpperCase()}
    </Text>
  );

  // ─────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {/* ── TOP TABS: Leads / Finance ────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: cardBg,
          borderBottomWidth: 0.5,
          borderBottomColor: border,
        }}
      >
        {(['Leads', 'Finance'] as const).map((tab) => {
          const active = adminTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setAdminTab(tab)}
              activeOpacity={0.75}
              style={{
                flex: 1,
                paddingVertical: 12,
                alignItems: 'center',
                borderBottomWidth: active ? 2 : 0,
                borderBottomColor: active ? COLORS.primary : 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: active ? '500' : '400',
                  color: active ? COLORS.primary : txtSec,
                }}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── FINANCE ─────────────────────────────────────────────── */}
      {adminTab === 'Finance' && <FinanceAnalytics isDark={isDark} token={token} dbName={dbName} />}

      {/* ── LEADS ANALYTICS ─────────────────────────────────────── */}
      {adminTab === 'Leads' && (
        <View style={{ flex: 1, backgroundColor: bg }}>
          {/* ── FIXED TOP FILTERS ──────────────────────────────────── */}
          <View
            style={{
              padding: 12,
              backgroundColor: cardBg,
              borderBottomWidth: 1,
              borderBottomColor: border,
              zIndex: 10,
            }}
          >
            {/* Date range row */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <SectionTitle label="Date range" />
              <View style={{ flexDirection: 'row', gap: 5 }}>
                {DATE_PRESETS.map((p) => (
                  <Pill
                    key={p.label}
                    label={p.label}
                    active={filters.fromDate === p.fromDate}
                    onPress={() =>
                      setFilters((f) => ({ ...f, fromDate: p.fromDate, toDate: p.toDate }))
                    }
                  />
                ))}
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: border, marginBottom: 10, opacity: 0.5 }} />

            {/* Chart section title + Zoom Controls */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <SectionTitle label="Consolidate Sources Summary" />
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => setZoom((z) => Math.max(z - 0.2, 0.6))}
                  style={{
                    backgroundColor: trackBg,
                    padding: 6,
                    borderRadius: 6,
                    minWidth: 28,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: txtPri, fontWeight: 'bold' }}>−</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 10, color: txtSec }}>{Math.round(zoom * 100)}%</Text>
                <TouchableOpacity
                  onPress={() => setZoom((z) => Math.min(z + 0.2, 2.0))}
                  style={{
                    backgroundColor: trackBg,
                    padding: 6,
                    borderRadius: 6,
                    minWidth: 28,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: txtPri, fontWeight: 'bold' }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 12, paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
          >
            {/* ── LOADING ── */}
            {loading && (
              <View style={{ height: 200, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={{ color: txtSec, fontSize: 12, marginTop: 10 }}>
                  Loading analytics…
                </Text>
              </View>
            )}

            {/* ── ERROR ── */}
            {!loading && error && (
              <SectionCard>
                <Text style={{ color: COLORS.danger, fontSize: 13, textAlign: 'center' }}>
                  {error}
                </Text>
                <TouchableOpacity
                  onPress={refresh}
                  style={{
                    marginTop: 12,
                    alignSelf: 'center',
                    paddingHorizontal: 20,
                    paddingVertical: 8,
                    backgroundColor: COLORS.primary,
                    borderRadius: 20,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 12 }}>Retry</Text>
                </TouchableOpacity>
              </SectionCard>
            )}

            {/* ── NO DATA ── */}
            {!loading && !error && totalCount === 0 && (
              <SectionCard>
                <View style={{ height: 140, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: txtSec, fontSize: 13 }}>No data for selected filters</Text>
                </View>
              </SectionCard>
            )}

            {!loading && !error && sourceData.length > 0 && (
              <>
                {/* ── MERGED BAR CHART (all sources summed into 4 bars) ── */}
                <SectionCard style={{ paddingHorizontal: 6, paddingTop: 8, paddingBottom: 0, marginBottom: 8 }}>
                  <Text
                    style={{
                      fontSize: 10,
                      color: txtSec,
                      letterSpacing: 0.7,
                      marginBottom: 4,
                      marginLeft: 8,
                    }}
                  >
                    CONSOLIDATE SOURCES SUMMARY
                  </Text>
                  <RenderMergedBarChart />
                </SectionCard>

                {/* ── SOURCE × STATUS GRID ── */}
                <SectionCard style={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8, marginBottom: 8 }}>
                  <Text
                    style={{ fontSize: 10, color: txtSec, letterSpacing: 0.7, marginBottom: 6 }}
                  >
                    SOURCE-STATUS BREAKDOWN
                  </Text>
                  <SourceStatusGrid />
                </SectionCard>
              </>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
});

export default LeadAnalytics;
