
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
  const [targetYear, setTargetYear] = useState<number>(new Date().getFullYear());
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(new Date().getMonth());

  // Monthly dataset for 12 months as per double-entry accounting equation (Strict Ledger Master Match)
  const monthlyData = useMemo(() => {
    // 1. Build Sets of exact Ledger IDs matching Ledger Groups
    const inflowLedgerIds = new Set<string>();
    const outflowLedgerIds = new Set<string>();

    const salesLedgerIds = new Set<string>();
    const directIncomeLedgerIds = new Set<string>();
    const indirectIncomeLedgerIds = new Set<string>();

    const purchaseLedgerIds = new Set<string>();
    const directExpensesLedgerIds = new Set<string>();
    const indirectExpensesLedgerIds = new Set<string>();

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
        const isSales =
          gName.includes('sales') ||
          gName.includes('turnover') ||
          gName.includes('revenue') ||
          lName.includes('sales') ||
          lName.includes('turnover') ||
          lName.includes('revenue');
        const isDirect = gName.includes('direct') || lName.includes('direct');

        if (isSales) {
          salesLedgerIds.add(lId);
        } else if (isDirect) {
          directIncomeLedgerIds.add(lId);
        } else {
          indirectIncomeLedgerIds.add(lId);
        }
      } else if (isOutflow) {
        outflowLedgerIds.add(lId);
        const isPurchase =
          gName.includes('purchase') ||
          gName.includes('cost') ||
          gName.includes('material') ||
          lName.includes('purchase') ||
          lName.includes('material');
        const isDirect =
          gName.includes('direct') ||
          lName.includes('direct') ||
          lName.includes('salary') ||
          lName.includes('wages') ||
          lName.includes('payroll');

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
      sales: 0,
      directIncome: 0,
      indirectIncome: 0,
      purchase: 0,
      directExpenses: 0,
      indirectExpenses: 0,
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
          const val = cr - dr;
          data[m].inflow += val;
          if (salesLedgerIds.has(lId)) {
            data[m].sales += val;
          } else if (directIncomeLedgerIds.has(lId)) {
            data[m].directIncome += val;
          } else {
            data[m].indirectIncome += val;
          }
          voucherInflowHandled = true;
        } else if (outflowLedgerIds.has(lId)) {
          const val = dr - cr;
          data[m].outflow += val;
          if (purchaseLedgerIds.has(lId)) {
            data[m].purchase += val;
          } else if (directExpensesLedgerIds.has(lId)) {
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

  const surplus = (focusedMonth.inflow || 0) - (focusedMonth.outflow || 0);
  const isSurplus = surplus >= 0;
  const absoluteSurplus = Math.abs(surplus);

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
  ) * 1.1;

  const maxVal = limitVal;
  const minVal = -limitVal;
  const range = maxVal - minVal || 1;

  const getX = (idx: number) => padLeft + (idx / 11) * plotW;
  const getY = (val: number) => padTop + plotH - ((val - minVal) / range) * plotH;

  const zeroLineY = getY(0);
  const bottomLineY = getY(minVal);
  const topLineY = getY(maxVal);

  const makeLinePath = (getter: (d: any) => number) => {
    return monthlyData.reduce((acc, d, i) => {
      const x = getX(i);
      const y = getY(getter(d));
      return i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `${acc} L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }, '');
  };

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
          <Text style={{ fontSize: 11.5, fontWeight: '800', color: txtSec }}>
            Month: <Text style={{ color: COLORS.primary, fontSize: 12.5 }}>{focusedMonth.month} {targetYear}</Text>
          </Text>
          <Text style={{ fontSize: 10.5, color: txtSec, fontWeight: '600' }}>
            Tap graph points to switch month
          </Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {/* Inflow */}
          <View style={{ alignItems: 'center', flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10B981' }} />
              <Text style={{ fontSize: 11, color: txtSec, fontWeight: '700' }}>Inflow</Text>
            </View>
            <Text style={{ fontSize: 14.5, fontWeight: '900', color: '#10B981', marginTop: 2 }}>
              {fmtFull(focusedMonth.inflow)}
            </Text>
          </View>

          <View style={{ width: 1, backgroundColor: border, marginVertical: 2 }} />

          {/* Outflow */}
          <View style={{ alignItems: 'center', flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#EF4444' }} />
              <Text style={{ fontSize: 11, color: txtSec, fontWeight: '700' }}>Outflow</Text>
            </View>
            <Text style={{ fontSize: 14.5, fontWeight: '900', color: '#EF4444', marginTop: 2 }}>
              {fmtFull(focusedMonth.outflow)}
            </Text>
          </View>

          <View style={{ width: 1, backgroundColor: border, marginVertical: 2 }} />

          {/* Net */}
          <View style={{ alignItems: 'center', flex: 1.1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#F59E0B' }} />
              <Text style={{ fontSize: 11, color: txtSec, fontWeight: '700' }}>Net</Text>
            </View>
            <Text
              style={{
                fontSize: 14.5,
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
            fontSize="9.5"
            fill={txtSec}
            textAnchor="end"
            fontWeight="700"
          >
            1
          </SvgText>
          <SvgText
            x={padLeft - 5}
            y={zeroLineY + 3}
            fontSize="9.5"
            fill={txtSec}
            textAnchor="end"
            fontWeight="700"
          >
            0
          </SvgText>
          <SvgText
            x={padLeft - 5}
            y={bottomLineY + 3}
            fontSize="9.5"
            fill={txtSec}
            textAnchor="end"
            fontWeight="700"
          >
            -1
          </SvgText>

          {/* Three-Color Lines */}
          <Path
            d={inflowPath}
            fill="none"
            stroke="#047857"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d={outflowPath}
            fill="none"
            stroke="#B91C1C"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d={netPath}
            fill="none"
            stroke="#D97706"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Month Indicator Dots & Column Highlight */}
          {monthlyData.map((d, i) => {
            const x = getX(i);
            const isSelected = i === selectedMonthIdx;
            return (
              <G key={d.month}>
                {/* Active Month Column Guide */}
                {isSelected && (
                  <Line
                    x1={x}
                    y1={padTop}
                    x2={x}
                    y2={padTop + plotH}
                    stroke={COLORS.primary}
                    strokeWidth="1.5"
                    strokeDasharray="2,2"
                  />
                )}

                {/* Data Points (Dark Purple Fills with Line Color Borders) */}
                <Circle
                  cx={x}
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
                >
                  <Text
                    style={{
                      fontSize: 9.8,
                      fontWeight: isSelected ? '900' : '700',
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
              paddingVertical: 6,
              alignItems: 'center',
              borderBottomWidth: 1,
              borderBottomColor: border,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: txtPri }}>
              Sources of Fund
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
              borderBottomWidth: 1,
              borderBottomColor: border,
              paddingVertical: 4,
            }}
          >
            <Text style={{ flex: 1.6, fontSize: 9, fontWeight: '700', color: txtSec, paddingLeft: 6 }}>
              Particulars
            </Text>
            <Text style={{ flex: 1, fontSize: 9, fontWeight: '700', color: txtSec, textAlign: 'right', paddingRight: 6 }}>
              Amount
            </Text>
          </View>
          {/* Sales */}
          <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: border }}>
            <Text style={{ flex: 1.6, fontSize: 10.2, color: txtPri, paddingLeft: 6 }}>Sales</Text>
            <Text style={{ flex: 1, fontSize: 10.2, color: txtPri, textAlign: 'right', paddingRight: 6 }}>
              {fmtFull(focusedMonth.sales || 0)}
            </Text>
          </View>
          {/* Direct Income */}
          <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: border }}>
            <Text style={{ flex: 1.6, fontSize: 10.2, color: txtPri, paddingLeft: 6 }}>Direct Income</Text>
            <Text style={{ flex: 1, fontSize: 10.2, color: txtPri, textAlign: 'right', paddingRight: 6 }}>
              {fmtFull(focusedMonth.directIncome || 0)}
            </Text>
          </View>
          {/* Indirect Income */}
          <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: isSurplus ? 1 : 0.5, borderBottomColor: border }}>
            <Text style={{ flex: 1.6, fontSize: 10.2, color: txtPri, paddingLeft: 6 }}>Indirect Income</Text>
            <Text style={{ flex: 1, fontSize: 10.2, color: txtPri, textAlign: 'right', paddingRight: 6 }}>
              {fmtFull(focusedMonth.indirectIncome || 0)}
            </Text>
          </View>
          {/* Deficit or Symmetrical Placeholder */}
          {!isSurplus ? (
            <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: border }}>
              <Text style={{ flex: 1.6, fontSize: 10.2, fontWeight: '800', color: '#B91C1C', paddingLeft: 6 }}>
                Deficit of Fund
              </Text>
              <Text style={{ flex: 1, fontSize: 10.2, fontWeight: '800', color: '#B91C1C', textAlign: 'right', paddingRight: 6 }}>
                {fmtFull(absoluteSurplus)}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'transparent' }}>
              <Text style={{ flex: 1.6, fontSize: 10.2, color: 'transparent', paddingLeft: 6 }}>-</Text>
              <Text style={{ flex: 1, fontSize: 10.2, color: 'transparent', textAlign: 'right', paddingRight: 6 }}>-</Text>
            </View>
          )}
          {/* Total Inflow */}
          <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#1e293b' : '#f8fafc', paddingVertical: 5 }}>
            <Text style={{ flex: 1.6, fontSize: 10.8, fontWeight: '800', color: txtPri, paddingLeft: 6 }}>
              Total Sources
            </Text>
            <Text style={{ flex: 1, fontSize: 10.8, fontWeight: '800', color: txtPri, textAlign: 'right', paddingRight: 6 }}>
              {fmtFull(isSurplus ? focusedMonth.inflow : focusedMonth.outflow)}
            </Text>
          </View>
        </View>

        {/* Right Side: Application of Fund */}
        <View style={{ flex: 1 }}>
          <View
            style={{
              backgroundColor: isDark ? '#1e293b' : '#cbd5e1',
              paddingVertical: 6,
              alignItems: 'center',
              borderBottomWidth: 1,
              borderBottomColor: border,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: txtPri }}>
              Application of Fund
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
              borderBottomWidth: 1,
              borderBottomColor: border,
              paddingVertical: 4,
            }}
          >
            <Text style={{ flex: 1.6, fontSize: 9, fontWeight: '700', color: txtSec, paddingLeft: 6 }}>
              Particulars
            </Text>
            <Text style={{ flex: 1, fontSize: 9, fontWeight: '700', color: txtSec, textAlign: 'right', paddingRight: 6 }}>
              Amount
            </Text>
          </View>
          {/* Purchase */}
          <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: border }}>
            <Text style={{ flex: 1.6, fontSize: 10.2, color: txtPri, paddingLeft: 6 }}>Purchase</Text>
            <Text style={{ flex: 1, fontSize: 10.2, color: txtPri, textAlign: 'right', paddingRight: 6 }}>
              {fmtFull(focusedMonth.purchase || 0)}
            </Text>
          </View>
          {/* Direct Expenses */}
          <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: border }}>
            <Text style={{ flex: 1.6, fontSize: 10.2, color: txtPri, paddingLeft: 6 }}>Direct Expenses</Text>
            <Text style={{ flex: 1, fontSize: 10.2, color: txtPri, textAlign: 'right', paddingRight: 6 }}>
              {fmtFull(focusedMonth.directExpenses || 0)}
            </Text>
          </View>
          {/* Indirect Expenses */}
          <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: !isSurplus ? 1 : 0.5, borderBottomColor: border }}>
            <Text style={{ flex: 1.6, fontSize: 10.2, color: txtPri, paddingLeft: 6 }}>Indirect Expenses</Text>
            <Text style={{ flex: 1, fontSize: 10.2, color: txtPri, textAlign: 'right', paddingRight: 6 }}>
              {fmtFull(focusedMonth.indirectExpenses || 0)}
            </Text>
          </View>
          {/* Surplus or Symmetrical Placeholder */}
          {isSurplus ? (
            <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: border }}>
              <Text style={{ flex: 1.6, fontSize: 10.2, fontWeight: '800', color: '#047857', paddingLeft: 6 }}>
                Surplus of Fund
              </Text>
              <Text style={{ flex: 1, fontSize: 10.2, fontWeight: '800', color: '#047857', textAlign: 'right', paddingRight: 6 }}>
                {fmtFull(absoluteSurplus)}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'transparent' }}>
              <Text style={{ flex: 1.6, fontSize: 10.2, color: 'transparent', paddingLeft: 6 }}>-</Text>
              <Text style={{ flex: 1, fontSize: 10.2, color: 'transparent', textAlign: 'right', paddingRight: 6 }}>-</Text>
            </View>
          )}
          {/* Total Outflow */}
          <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#1e293b' : '#f8fafc', paddingVertical: 5 }}>
            <Text style={{ flex: 1.6, fontSize: 10.8, fontWeight: '800', color: txtPri, paddingLeft: 6 }}>
              Total Application
            </Text>
            <Text style={{ flex: 1, fontSize: 10.8, fontWeight: '800', color: txtPri, textAlign: 'right', paddingRight: 6 }}>
              {fmtFull(isSurplus ? focusedMonth.inflow : focusedMonth.outflow)}
            </Text>
          </View>
        </View>
      </View>
    </SectionCard>
  );
}

/** Cash Flow Bar Comparison: Received vs Paid Out */
function CashFlowRatioChart({
  totalReceived,
  totalPayments,
  theme,
}: {
  totalReceived: number;
  totalPayments: number;
  theme: any;
}) {
  const { cardBg, border, txtPri, txtSec, isDark } = theme;
  const totalVolume = Math.max(totalReceived + totalPayments, 1);
  const recvPct = Math.round((totalReceived / totalVolume) * 100);
  const payPct = Math.round((totalPayments / totalVolume) * 100);
  const netFlow = totalReceived - totalPayments;

  return (
    <SectionCard cardBg={cardBg} border={border}>
      <SectionTitle
        label="Cash Flow Ratio (Inflow vs Outflow)"
        txtSec={txtSec}