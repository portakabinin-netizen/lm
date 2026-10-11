
/** Month Labels for 12-Month Financial Year Timeline */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse any date format safely with local timezone awareness (ISO, DD-MM-YY, DD-MM-YYYY, YYYY-MM-DD) */
const parseFinancialDate = (d: any): { year: number; month: number } | null => {
  if (!d) return null;
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return null;
    return { year: d.getFullYear(), month: d.getMonth() };
  }
  if (typeof d === 'number') {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) return { year: dt.getFullYear(), month: dt.getMonth() };
  }
  if (typeof d === 'string') {
    const s = d.trim();
    if (!s) return null;

    // 1. If ISO date string with time/timezone (e.g. "2026-05-31T18:30:00.000Z"), parse with local Date
    if (s.includes('T') || s.includes('Z')) {
      const dt = new Date(s);
      if (!isNaN(dt.getTime())) {
        return { year: dt.getFullYear(), month: dt.getMonth() };
      }
    }

    // 2. Explicit Date formatting (DD-MM-YYYY, DD-MM-YY, DD/MM/YYYY, DD/MM/YY)
    const parts = s.split(/[/\- ]/);
    if (parts.length >= 3) {
      // DD-MM-YYYY or DD-MM-YY (Day first)
      if (parts[0].length <= 2 && parts[1].length <= 2) {
        const m = parseInt(parts[1], 10) - 1; // 0-indexed
        let y = parseInt(parts[2], 10);
        if (parts[2].length === 2) {
          y = y < 50 ? 2000 + y : 1900 + y;
        }
        if (!isNaN(y) && !isNaN(m) && m >= 0 && m <= 11) {
          return { year: y, month: m };
        }
      }
      // YYYY-MM-DD
      else if (parts[0].length === 4) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && !isNaN(m) && m >= 0 && m <= 11) {
          return { year: y, month: m };
        }
      }
    }

    const dt = new Date(s);
    if (!isNaN(dt.getTime())) return { year: dt.getFullYear(), month: dt.getMonth() };
  }
  return null;
};

/** Comprehensive Multi-Line Graph for Sales, Purchase, Salary, and Net Profit (Sales - Salary - Purchase) */
/** Comprehensive Multi-Line Graph for Sales, Purchase, Salary, and Net Profit (Sales - Salary - Purchase) */
function FinancialComparisonLineChart({
  vouchersList = [],
  transactions = [],
  masterData,
  totalInflow = 0,
  totalOutflow = 0,
  summary,
  theme,
}: {
  vouchersList?: any[];
  transactions?: Transaction[];
  masterData?: { groups: any[]; ledgers: any[] };
  totalInflow?: number;
  totalOutflow?: number;
  summary?: any;
  theme: any;
}) {
  const { cardBg, border, txtPri, txtSec, isDark } = theme;
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  const [yearMode, setYearMode] = useState<'current' | 'previous'>('current');
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(new Date().getMonth());

  const targetYear = yearMode === 'current' ? currentYear : previousYear;

  // Monthly dataset for 12 months as per double-entry accounting equation (Strict Ledger Master Match)

    const groupMap = new Map<string, any>();
    (masterData?.groups || []).forEach((g: any) => {
      groupMap.set(String(g._id), g);
    });

    (masterData?.ledgers || []).forEach((l: any) => {
      const g = groupMap.get(String(l.ledgerGroupId)) || {};
      const gName = (g.groupName || l.groupName || '').toLowerCase();
      const gNature = (g.nature || '').toLowerCase();
      const lName = (l.ledgerName || '').toLowerCase();
      const lId = String(l._id);

      // Exclude asset accounts from outflow
      if (gNature === 'asset') {
        return;
      }

      // Inflow includes Sales + Direct/Indirect Income
      const isInflow =
        gNature === 'revenue' ||
        gNature === 'income' ||
        gName.includes('sales') ||
        gName.includes('revenue') ||
        gName.includes('income') ||
        gName.includes('turnover') ||
        lName.includes('sales') ||
        lName.includes('income') ||
        lName.includes('revenue');

      // Outflow includes Purchase + Direct/Indirect Expenses (excluding Asset)
      const isOutflow =
        gNature === 'expense' ||
        gName.includes('purchase') ||
        gName.includes('expense') ||
        gName.includes('cost') ||
        gName.includes('material') ||
        lName.includes('purchase') ||
        lName.includes('expense') ||
        lName.includes('salary') ||
        lName.includes('wages') ||
        lName.includes('payroll') ||
        lName.includes('rent') ||
        lName.includes('bill');

      if (isInflow) {
        inflowLedgerIds.add(lId);
      } else if (isOutflow) {
        outflowLedgerIds.add(lId);
      }
    });

    const data = Array.from({ length: 12 }, (_, i) => ({
      month: MONTH_NAMES[i],
      monthIdx: i,
      inflow: 0,
      outflow: 0,
      profit: 0, // representing Net (inflow - outflow)
    }));

    // Process Vouchers (The single source of truth for General Ledger)
    (vouchersList || []).forEach((v: any) => {
      if (!v) return;
      const parsed = parseFinancialDate(v.date || v.createdAt || v.voucherDate);
      if (!parsed || parsed.year !== targetYear) return;
      const m = parsed.month;
      if (m < 0 || m > 11) return;

      const vType = (v.voucherType || '').toLowerCase();
      let voucherInflowHandled = false;
      let voucherOutflowHandled = false;

      (v.entries || []).forEach((e: any) => {
        if (!e) return;
        const lId = String(e.ledgerId || '');
        const dr = Number(e.debit) || 0;
        const cr = Number(e.credit) || 0;

        if (inflowLedgerIds.has(lId)) {
          data[m].inflow += (cr - dr);
          voucherInflowHandled = true;
        } else if (outflowLedgerIds.has(lId)) {
          data[m].outflow += (dr - cr);
          voucherOutflowHandled = true;
        }

        if (isPurchase) {
          purchaseLedgerIds.add(lId);
        } else if (isDirect) {
          directExpensesLedgerIds.add(lId);
        } else {
          indirectExpensesLedgerIds.add(lId);
        }
      }
    });

    const data = Array.from({ length: 12 }, (_, i) => ({
      month: MONTH_NAMES[i],
      monthIdx: i,
      inflow: 0,
      outflow: 0,
      profit: 0, // representing Net (inflow - outflow)
    }));

    // Process Vouchers (The single source of truth for General Ledger)
    (vouchersList || []).forEach((v: any) => {
      if (!v) return;
      const parsed = parseFinancialDate(v.date || v.createdAt || v.voucherDate);
      if (!parsed || parsed.year !== targetYear) return;
      const m = parsed.month;
      if (m < 0 || m > 11) return;

      const vType = (v.voucherType || '').toLowerCase();
      let voucherInflowHandled = false;
      let voucherOutflowHandled = false;

      (v.entries || []).forEach((e: any) => {
        if (!e) return;
        const lId = String(e.ledgerId || '');
        const dr = Number(e.debit) || 0;
        const cr = Number(e.credit) || 0;

        if (inflowLedgerIds.has(lId)) {
          data[m].inflow += (cr - dr);
          voucherInflowHandled = true;
        } else if (outflowLedgerIds.has(lId)) {
          data[m].outflow += (dr - cr);
          voucherOutflowHandled = true;
        }
      });

      // Type-level fallback for sales/purchase/expense vouchers where ledger name was generic
      if (!voucherInflowHandled && vType === 'sales') {
        const totalCr = (v.entries || []).reduce((sum: number, e: any) => sum + (e ? (Number(e.credit) || 0) : 0), 0);
        data[m].inflow += totalCr || Number(v.amount || v.totalCr || v.totalDr || 0);
      }
      if (!voucherOutflowHandled && (vType === 'purchase' || vType === 'payment' || vType === 'expense')) {
        const totalDr = (v.entries || []).reduce((sum: number, e: any) => sum + (e ? (Number(e.debit) || 0) : 0), 0);
        data[m].outflow += totalDr || Number(v.amount || v.totalDr || 0);
      }
    });

    // Calculate Net Profit = Inflow - Outflow
    data.forEach((d) => {
      d.profit = d.inflow - d.outflow;
            data[m].directExpenses += val;
          } else {
            data[m].indirectExpenses += val;
          }
          voucherOutflowHandled = true;
        }
      });

      // Type-level fallback for sales/purchase/expense vouchers where ledger name was generic
      if (!voucherInflowHandled && vType === 'sales') {
        const totalCr = (v.entries || []).reduce((sum: number, e: any) => sum + (e ? (Number(e.credit) || 0) : 0), 0);
        const val = totalCr || Number(v.amount || v.totalCr || v.totalDr || 0);
        data[m].inflow += val;
        data[m].sales += val;
      }
      if (!voucherOutflowHandled && (vType === 'purchase' || vType === 'payment' || vType === 'expense')) {
        const totalDr = (v.entries || []).reduce((sum: number, e: any) => sum + (e ? (Number(e.debit) || 0) : 0), 0);
        const val = totalDr || Number(v.amount || v.totalDr || 0);
        data[m].outflow += val;
        if (vType === 'purchase') {
          data[m].purchase += val;
        } else {
          data[m].indirectExpenses += val;
        }
      }
    });

    // Calculate Net Profit = Inflow - Outflow
    data.forEach((d) => {
      d.profit = d.inflow - d.outflow;
    });

    return data;
  }, [vouchersList, masterData, targetYear]);

  // Auto-focus latest active month when data is loaded
  useEffect(() => {
    const activeMonths = monthlyData
      .map((d, idx) => ({ idx, total: Math.abs(d.inflow) + Math.abs(d.outflow) }))
      .filter((d) => d.total > 0);
    if (activeMonths.length > 0) {
      const isSelectedMonthActive = activeMonths.some((d) => d.idx === selectedMonthIdx);
      if (!isSelectedMonthActive) {
        setSelectedMonthIdx(activeMonths[activeMonths.length - 1].idx);
      }
    }
  }, [monthlyData]);

  // Aggregate Totals for the Selected Year
  const yearInflowTotal = monthlyData.reduce((acc, d) => acc + d.inflow, 0);
  const yearOutflowTotal = monthlyData.reduce((acc, d) => acc + d.outflow, 0);
  const yearNetTotal = yearInflowTotal - yearOutflowTotal;

  // Selected Month Focus
  const focusedMonth = monthlyData[selectedMonthIdx] || monthlyData[0];

  // SVG Chart Geometry Calculations
  const chartWidth = Math.max(SCREEN_WIDTH - 64, 300);
  const chartHeight = 170;
  const padLeft = 38;
  const padRight = 14;
  const padTop = 16;
  const padBottom = 26;
  const plotW = chartWidth - padLeft - padRight;
  const plotH = chartHeight - padTop - padBottom;

  const allValues = monthlyData.flatMap((d) => [d.inflow, d.outflow, d.profit]);
  const limitVal = Math.max(
    Math.max(...allValues, 0),
    Math.abs(Math.min(...allValues, 0)),
    1000
            }}
          >
            <Text
              style={{
                fontSize: 9.5,
                fontWeight: '800',
                color: yearMode === 'previous' ? '#fff' : txtSec,
              }}
            >
              {previousYear} (PY)
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 3 KEY METRIC PILLS: ACTUAL SELECTED MONTH COMPONENT VALUES ── */}
      <View
        style={{
          backgroundColor: isDark ? '#0b1329' : '#f8fafc',
          borderRadius: 12,
          padding: 8,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: border,

  const inflowPath = makeLinePath((d) => d.inflow);
  const outflowPath = makeLinePath((d) => d.outflow);
  const netPath = makeLinePath((d) => d.profit);

  return (
    <SectionCard cardBg={cardBg} border={border}>
      {/* ── CARD HEADER & COMPACT YEAR TOGGLE ─────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <SectionTitle label="Sales, Purchase, Salary & Profit" txtSec={txtSec} icon="pulse-outline" />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderWidth: 1,
            borderColor: border,
          }}
        >
          {/* Previous Year Button */}
          <TouchableOpacity
            onPress={() => setTargetYear(targetYear - 1)}
            style={{ paddingHorizontal: 12, paddingVertical: 6 }}
            hitSlop={{ top: 10, bottom: 10, left: 15, right: 10 }}
          >
            <Ionicons name="chevron-back-outline" size={16} color={COLORS.primary} />
          </TouchableOpacity>

          {/* Current Year Text */}
          <Text
            style={{
              fontSize: 12,
              fontWeight: '800',
              color: txtPri,
              marginHorizontal: 4,
            }}
          >
            {targetYear}
          </Text>

          {/* Next Year Button */}
          <TouchableOpacity
            onPress={() => setTargetYear(targetYear + 1)}
            style={{ paddingHorizontal: 12, paddingVertical: 6 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 15 }}
          >
            <Ionicons name="chevron-forward-outline" size={16} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 3 KEY METRIC PILLS: ACTUAL SELECTED MONTH COMPONENT VALUES ── */}
      <View
        style={{
          backgroundColor: isDark ? '#0b1329' : '#f8fafc',
          borderRadius: 12,
          padding: 8,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: border,
        }}
      >
        {/* Focused Month Subhead */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: txtSec }}>
            Month: <Text style={{ color: COLORS.primary }}>{focusedMonth.month} {targetYear}</Text>
          </Text>
          <Text style={{ fontSize: 9, color: txtSec, fontWeight: '600' }}>
            Tap graph points to switch month
          </Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {/* Inflow */}
          <View style={{ alignItems: 'center', flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10B981' }} />
              <Text style={{ fontSize: 9.5, color: txtSec, fontWeight: '700' }}>Inflow</Text>
            </View>
            <Text style={{ fontSize: 12, fontWeight: '900', color: '#10B981', marginTop: 2 }}>
              {fmtFull(focusedMonth.inflow)}
            </Text>
          </View>

          <View style={{ width: 1, backgroundColor: border, marginVertical: 2 }} />

          {/* Outflow */}
          <View style={{ alignItems: 'center', flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#EF4444' }} />
              <Text style={{ fontSize: 9.5, color: txtSec, fontWeight: '700' }}>Outflow</Text>
            </View>
            <Text style={{ fontSize: 12, fontWeight: '900', color: '#EF4444', marginTop: 2 }}>
              {fmtFull(focusedMonth.outflow)}
            </Text>
          </View>

          <View style={{ width: 1, backgroundColor: border, marginVertical: 2 }} />

          {/* Net */}
          <View style={{ alignItems: 'center', flex: 1.1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#F59E0B' }} />
              <Text style={{ fontSize: 9.5, color: txtSec, fontWeight: '700' }}>Net</Text>
            </View>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '900',
                color: focusedMonth.profit >= 0 ? '#10B981' : '#EF4444',
                marginTop: 2,
              }}
            >
              {focusedMonth.profit >= 0 ? '+' : ''}
              {fmtFull(focusedMonth.profit)}
            </Text>
          </View>
        </View>
      </View>

      {/* ── INTERACTIVE MULTI-LINE SVG GRAPH WITH DIRECT MONTH TOUCH OVERLAYS ── */}
      <View style={{ alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
        <Svg width={chartWidth} height={chartHeight}>
          <Defs>
            <SvgGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#F59E0B" stopOpacity="0.25" />
              <Stop offset="100%" stopColor="#F59E0B" stopOpacity="0.0" />
            </SvgGradient>
          </Defs>

          {/* Horizontal Reference Grid Lines */}
          <Line
            x1={padLeft}
            y1={topLineY}
            x2={chartWidth - padRight}
            y2={topLineY}
            stroke={isDark ? '#334155' : '#e2e8f0'}
            strokeWidth="1"
            strokeDasharray="4,4"
          />
          <Line
            x1={padLeft}
            y1={zeroLineY}
            x2={chartWidth - padRight}
            y2={zeroLineY}
            stroke={isDark ? '#475569' : '#cbd5e1'}
            strokeWidth="1.2"
          />
          <Line
            x1={padLeft}
            y1={bottomLineY}
            x2={chartWidth - padRight}
            y2={bottomLineY}
            stroke={isDark ? '#334155' : '#e2e8f0'}
            strokeWidth="1"
            strokeDasharray="4,4"
          />

          {/* Left Y-Axis Values */}
          <SvgText
            x={padLeft - 5}
            y={topLineY + 3}
            fontSize="8"
            fill={txtSec}
            textAnchor="end"
            fontWeight="700"
          >
            1
          </SvgText>
          <SvgText
            x={padLeft - 5}
            y={zeroLineY + 3}
            fontSize="8"
            fill={txtSec}
            textAnchor="end"
            fontWeight="700"
          >
            0
          </SvgText>
          <SvgText
            x={padLeft - 5}
            y={bottomLineY + 3}
            fontSize="8"
            fill={txtSec}
            textAnchor="end"
            fontWeight="700"
          >
            -1
          </SvgText>

                  stroke={isDark ? '#0f172a' : '#ffffff'}
                  strokeWidth={1.2}
                />
              </G>
            bottom: 0,
            flexDirection: 'row',
          }}
        >
          {monthlyData.map((d, i) => {
            const isSelected = i === selectedMonthIdx;
            return (
              <TouchableOpacity
                key={d.month}
                activeOpacity={0.7}
                style={{
                  flex: 1,
                  height: '100%',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  paddingBottom: 2,
                }}
                onPress={() => setSelectedMonthIdx(i)}
              >
                <View
                  style={{
                    paddingHorizontal: 3,
                    paddingVertical: 1,
                    borderRadius: 4,
                    backgroundColor: isSelected ? '#5B21B6' : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 8.5,
                      fontWeight: isSelected ? '900' : '600',
                      color: isSelected ? '#fff' : txtSec,
                    }}
                  >
                    {d.month}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
                  cy={getY(d.inflow)}
                  r={isSelected ? 6 : 4}
                  fill="#5B21B6"
                  stroke="#047857"
                  strokeWidth={1.5}
                />
                <Circle
                  cx={x}
                  cy={getY(d.outflow)}
                  r={isSelected ? 5.5 : 3.5}
                  fill="#5B21B6"
                  stroke="#B91C1C"
                  strokeWidth={1.5}
                />
                <Circle
                  cx={x}
                  cy={getY(d.profit)}
                  r={isSelected ? 6.5 : 4.5}
                  fill="#5B21B6"
                  stroke="#D97706"
                  strokeWidth={1.5}
                />
              </G>
            );
          })}
        </Svg>

        {/* Transparent Interactive Month Touch Bar Overlay */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: padLeft - 10,
            right: padRight - 10,
            bottom: 0,
            flexDirection: 'row',
          }}
        >
          {monthlyData.map((d, i) => {
            const isSelected = i === selectedMonthIdx;
            return (
              <TouchableOpacity
                key={d.month}
                activeOpacity={0.7}
                style={{
                  flex: 1,
                  height: '100%',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  paddingBottom: 2,
                }}
                onPress={() => setSelectedMonthIdx(i)}
              >
                <View
                  style={{
                    paddingHorizontal: 3,
                    paddingVertical: 1,
                    borderRadius: 4,
                    backgroundColor: isSelected ? '#5B21B6' : 'transparent',
                  }}
                    paddingVertical: 1,
                    borderRadius: 4,
                    backgroundColor: isSelected ? '#5B21B6' : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 8.5,
                      fontWeight: isSelected ? '900' : '600',
                      color: isSelected ? '#fff' : txtSec,
                    }}
                  >
                    {d.month}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Sources and Application of Fund Excel-Style Table */}
      <View
        style={{
          flexDirection: 'row',
          marginTop: 15,
          borderWidth: 1,
          borderColor: border,
          borderRadius: 6,
          overflow: 'hidden',
          backgroundColor: cardBg,
        }}
      >
        {/* Left Side: Sources of Fund */}
        <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: border }}>
          <View
            style={{
              backgroundColor: isDark ? '#1e293b' : '#cbd5e1',
              paddingVertical: 5,
              alignItems: 'center',
              borderBottomWidth: 1,
              borderBottomColor: border,
            }}
          >
            <Text style={{ fontSize: 9, fontWeight: '800', color: txtPri }}>
              Sources of Fund
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
              borderBottomWidth: 1,
              borderBottomColor: border,
              paddingVertical: 3,
            }}
          >
            <Text style={{ flex: 1.6, fontSize: 7.5, fontWeight: '700', color: txtSec, paddingLeft: 6 }}>
              Particulars
            </Text>
            <Text style={{ flex: 1, fontSize: 7.5, fontWeight: '700', color: txtSec, textAlign: 'right', paddingRight: 6 }}>
              Amount
            </Text>
          </View>
          {/* Sales */}
          <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: border }}>
            <Text style={{ flex: 1.6, fontSize: 8.5, color: txtPri, paddingLeft: 6 }}>Sales</Text>
            <Text style={{ flex: 1, fontSize: 8.5, color: txtPri, textAlign: 'right', paddingRight: 6 }}>
              {fmtFull(focusedMonth.sales || 0)}
            </Text>
          </View>
          {/* Direct Income */}
          <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: border }}>
            <Text style={{ flex: 1.6, fontSize: 8.5, color: txtPri, paddingLeft: 6 }}>Direct Income</Text>
            <Text style={{ flex: 1, fontSize: 8.5, color: txtPri, textAlign: 'right', paddingRight: 6 }}>
              {fmtFull(focusedMonth.directIncome || 0)}
            </Text>
          </View>
          {/* Indirect Income */}
          <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: isSurplus ? 1 : 0.5, borderBottomColor: border }}>
            <Text style={{ flex: 1.6, fontSize: 8.5, color: txtPri, paddingLeft: 6 }}>Indirect Income</Text>
            <Text style={{ flex: 1, fontSize: 8.5, color: txtPri, textAlign: 'right', paddingRight: 6 }}>
              {fmtFull(focusedMonth.indirectIncome || 0)}
            </Text>
          </View>
          {/* Deficit or Symmetrical Placeholder */}
          {!isSurplus ? (
            <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: border }}>
              <Text style={{ flex: 1.6, fontSize: 8.5, fontWeight: '800', color: '#B91C1C', paddingLeft: 6 }}>
                Deficit of Fund
              </Text>
              <Text style={{ flex: 1, fontSize: 8.5, fontWeight: '800', color: '#B91C1C', textAlign: 'right', paddingRight: 6 }}>
                {fmtFull(absoluteSurplus)}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'transparent' }}>
              <Text style={{ flex: 1.6, fontSize: 8.5, color: 'transparent', paddingLeft: 6 }}>-</Text>
              <Text style={{ flex: 1, fontSize: 8.5, color: 'transparent', textAlign: 'right', paddingRight: 6 }}>-</Text>
            </View>
          )}
          {/* Total Inflow */}
          <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#1e293b' : '#f8fafc', paddingVertical: 5 }}>
            <Text style={{ flex: 1.6, fontSize: 8.5, fontWeight: '800', color: txtPri, paddingLeft: 6 }}>
              Total Sources
            </Text>
            <Text style={{ flex: 1, fontSize: 8.5, fontWeight: '800', color: txtPri, textAlign: 'right', paddingRight: 6 }}>
              {fmtFull(isSurplus ? focusedMonth.inflow : focusedMonth.outflow)}
            </Text>
          </View>
        </View>

        {/* Right Side: Application of Fund */}
        <View style={{ flex: 1 }}>
          <View
            style={{
              backgroundColor: isDark ? '#1e293b' : '#cbd5e1',
              paddingVertical: 5,
              alignItems: 'center',
              borderBottomWidth: 1,
              borderBottomColor: border,
            }}
          >
            <Text style={{ fontSize: 9, fontWeight: '800', color: txtPri }}>
              Application of Fund
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
              borderBottomWidth: 1,
              borderBottomColor: border,
              paddingVertical: 3,
            }}
          >
            <Text style={{ flex: 1.6, fontSize: 7.5, fontWeight: '700', color: txtSec, paddingLeft: 6 }}>
              Particulars
            </Text>
            <Text style={{ flex: 1, fontSize: 7.5, fontWeight: '700', color: txtSec, textAlign: 'right', paddingRight: 6 }}>
              Amount
            </Text>
          </View>
          {/* Purchase */}
          <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: border }}>
            <Text style={{ flex: 1.6, fontSize: 8.5, color: txtPri, paddingLeft: 6 }}>Purchase</Text>
            <Text style={{ flex: 1, fontSize: 8.5, color: txtPri, textAlign: 'right', paddingRight: 6 }}>
              {fmtFull(focusedMonth.purchase || 0)}
            </Text>
          </View>
          {/* Direct Expenses */}
          <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: border }}>
            <Text style={{ flex: 1.6, fontSize: 8.5, color: txtPri, paddingLeft: 6 }}>Direct Expenses</Text>
            <Text style={{ flex: 1, fontSize: 8.5, color: txtPri, textAlign: 'right', paddingRight: 6 }}>
              {fmtFull(focusedMonth.directExpenses || 0)}
            </Text>
          </View>
          {/* Indirect Expenses */}
          <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: !isSurplus ? 1 : 0.5, borderBottomColor: border }}>
            <Text style={{ flex: 1.6, fontSize: 8.5, color: txtPri, paddingLeft: 6 }}>Indirect Expenses</Text>
            <Text style={{ flex: 1, fontSize: 8.5, color: txtPri, textAlign: 'right', paddingRight: 6 }}>
              {fmtFull(focusedMonth.indirectExpenses || 0)}
            </Text>
          </View>
          {/* Surplus or Symmetrical Placeholder */}
          {isSurplus ? (
            <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: border }}>
              <Text style={{ flex: 1.6, fontSize: 8.5, fontWeight: '800', color: '#047857', paddingLeft: 6 }}>
                Surplus of Fund
              </Text>
              <Text style={{ flex: 1, fontSize: 8.5, fontWeight: '800', color: '#047857', textAlign: 'right', paddingRight: 6 }}>
                {fmtFull(absoluteSurplus)}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'transparent' }}>
              <Text style={{ flex: 1.6, fontSize: 8.5, color: 'transparent', paddingLeft: 6 }}>-</Text>
              <Text style={{ flex: 1, fontSize: 8.5, color: 'transparent', textAlign: 'right', paddingRight: 6 }}>-</Text>
            </View>
          )}
          {/* Total Outflow */}
          <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#1e293b' : '#f8fafc', paddingVertical: 5 }}>
            <Text style={{ flex: 1.6, fontSize: 8.5, fontWeight: '800', color: txtPri, paddingLeft: 6 }}>
              Total Application
            </Text>
            <Text style={{ flex: 1, fontSize: 8.5, fontWeight: '800', color: txtPri, textAlign: 'right', paddingRight: 6 }}>