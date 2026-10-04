import { C as COLORS } from "@/hooks/Theme";
import { Dimensions, Platform, StyleSheet, TextStyle, ViewStyle } from "react-native";
export { COLORS };
const { width, height } = Dimensions.get("window");

// ─── Layout Constants ─────────────────────────────────────────────────────
export const DRAWER_WIDTH = Math.min(320, Math.round(width * 0.8));
export const HEADER_HEIGHT = Platform.OS === "ios" ? 110 : 90;
export const FOOTER_HEIGHT = 68;

// ─── Tab Colors ───────────────────────────────────────────────────────────
export const TAB_COLORS: Record<string, string> = {
  Recent: COLORS.accent,
  Engaged: COLORS.warning,
  Accepted: COLORS.success,
  Recycle: COLORS.danger,
  Invoice: "#8b5cf6",
  "Tax Invoice": "#8b5cf6",
};

// ─── Theme Helper ─────────────────────────────────────────────────────────
export interface ThemeColors {
  safeArea: ViewStyle;
  card: ViewStyle;
  text: TextStyle;
  cardTitle: TextStyle;
  brandTitle: TextStyle;
  brandSubtitle: TextStyle;
  inputLabel: TextStyle;
  inputWrapper: ViewStyle;
  textInput: TextStyle;
  placeholder: string;
  iconCircle: ViewStyle;
  iconLabel: TextStyle;
}

export const getThemeStyles = (isDark: boolean): ThemeColors => ({
  safeArea: { backgroundColor: isDark ? COLORS.bgDark : COLORS.bgLight },
  card: {
    backgroundColor: isDark ? COLORS.cardDark : COLORS.cardLight,
    borderColor: isDark ? COLORS.borderDark : COLORS.border,
  },
  text: { color: isDark ? COLORS.textLight : COLORS.textDark },
  cardTitle: { color: isDark ? COLORS.textLight : COLORS.textDark },
  brandTitle: { color: isDark ? "#60a5fa" : "#1e3a8a" },
  brandSubtitle: { color: isDark ? COLORS.textMuted : COLORS.secondary },
  inputLabel: { color: isDark ? COLORS.textMuted : COLORS.textSub },
  inputWrapper: {
    backgroundColor: isDark ? COLORS.bgDark : COLORS.bgLight,
    borderColor: isDark ? COLORS.borderDark : COLORS.border,
  },
  textInput: { color: isDark ? COLORS.white : COLORS.textDark },
  placeholder: isDark ? COLORS.textMuted : COLORS.textSub,
  iconCircle: { backgroundColor: isDark ? COLORS.borderDark : COLORS.divider },
  iconLabel: { color: isDark ? COLORS.textMuted : COLORS.secondary },
});

// ─── Utility Styles ───────────────────────────────────────────────────────
export const UTILS = {
    flex1: { flex: 1 } as ViewStyle,
    row: { flexDirection: 'row' } as ViewStyle,
    center: { justifyContent: 'center', alignItems: 'center' } as ViewStyle,
    alignCenter: { alignItems: 'center' } as ViewStyle,
    justifyBetween: { justifyContent: 'space-between' } as ViewStyle,
    mt10: { marginTop: 10 } as ViewStyle,
    mt12: { marginTop: 12 } as ViewStyle,
    mb10: { marginBottom: 10 } as ViewStyle,
    gap10: { gap: 10 } as ViewStyle,
    gap12: { gap: 12 } as ViewStyle,
    p20: { padding: 20 } as ViewStyle,
    p24: { padding: 24 } as ViewStyle,
    p40: { padding: 40 } as ViewStyle,
    h20: { height: 20 } as ViewStyle,
    h100: { height: 100 } as ViewStyle,
};

// ─── Shadow Helper ────────────────────────────────────────────────────────
export function mkShadow(e: number): ViewStyle {
  return (
    Platform.select({
      ios: {
        shadowColor: "#d1a8a8ff",
        shadowOpacity: 0.1,
        shadowRadius: e,
        shadowOffset: { width: 0, height: Math.round(e / 3) },
      },
      android: { elevation: e },
    }) ?? {}
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
export const styles = StyleSheet.create({
  container: { flex: 1 },
  safeRoot: { flex: 1, backgroundColor: COLORS.primary },
  safeContainer: { flex: 1, backgroundColor: COLORS.bgLight },
  safeAreaNoPrimary: { flex: 1, backgroundColor: COLORS.bgLight },

  header: {
    height: HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    backgroundColor: COLORS.primary,
    ...mkShadow(10),
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.white,
  },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.divider,
    ...mkShadow(4),
  },

  tile: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.white,
  },

  text: {
    color: COLORS.textDark,
  },

  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    ...mkShadow(4),
  },

  primaryButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "700",
  },

  // ─── Global Layout Styles ───────────────────────────────────────────────
  body: {
    flex: 1,
    backgroundColor: COLORS.bgLight,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // ─── Header Styles ──────────────────────────────────────────────────────
  headerSubTitle: {
    fontSize: 11,
    color: "#ffffffCC",
    marginTop: -2,
  },
  headerLocText: {
    fontSize: 10,
    color: "#ffffffCC",
    marginTop: 2,
    fontWeight: "600",
  },
  menuImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: "#ffffff40",
    backgroundColor: COLORS.white,
  },

  // ─── Drawer Styles ──────────────────────────────────────────────────────
  drawer: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: COLORS.white,
    zIndex: 2000,
    ...mkShadow(24),
    borderTopRightRadius: 24,
  },
  drawerHeader: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: "#38BDF8",
    borderTopRightRadius: 24,
    ...mkShadow(8),
  },
  drawerProfileRow: {
    flexDirection: "column",
    alignItems: "center",
    marginTop: 8,
  },
  drawerAvatar: {
    width: 80,
    height: 80,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: "#ffffff40",
    backgroundColor: "#ffffff10",
  },
  drawerUserName: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.white,
    letterSpacing: -0.3,
  },
  drawerUserRoleInline: {
    fontSize: 10,
    color: "rgba(255,255,255,0.7)",
    marginLeft: 8,
    fontWeight: "700",
  },
  drawerCloseBtn: {
    position: "absolute",
    top: 16,
    right: 11,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ffffff20",
    justifyContent: "center",
    alignItems: "center",
  },
  drawerHeaderInfo: {
    alignItems: "center",
    marginTop: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: COLORS.bgLight,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  drawerText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textDark,
    marginLeft: 12,
  },

  // ─── Lead Tile Styles ───────────────────────────────────────────────────
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  idBox: {
    backgroundColor: COLORS.bgDark,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  idText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.white,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  sourceDateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  slBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  slSourceBadge: {
    backgroundColor: COLORS.primary + "15",
  },
  slDateBadge: {
    backgroundColor: COLORS.secondary + "15",
  },
  slBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  // ─── Field Styles ───────────────────────────────────────────────────────
  slNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  fieldRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  slInputUnderline: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primary,
    paddingVertical: 2,
  },
  nameText: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textDark,
  },
  slProductRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  slEmailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  slEmailStyle: {
    fontSize: 13,
    color: COLORS.primaryDark,
    textDecorationLine: "underline",
  },
  slCityStateRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  slInputUnderlineCompact: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primary,
    fontSize: 14,
    paddingVertical: 2,
  },
  slLocText: {
    fontSize: 13,
    color: COLORS.textSub,
    marginBottom: 8,
  },

  // ─── Action Styles ──────────────────────────────────────────────────────
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  slEmailBtnBg: {
    backgroundColor: COLORS.primary + "10",
  },
  slEmailBtn: {
    marginLeft: 8,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  phoneText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textDark,
  },
  slRowGap8: {
    flexDirection: "row",
    gap: 8,
  },
  slCallBtnBg: {
    backgroundColor: COLORS.info + "15",
  },
  slWaBtnBg: {
    backgroundColor: COLORS.success + "15",
  },
  slPlayBtnBg: {
    backgroundColor: COLORS.info + "10",
  },

  // ─── Activity Styles ────────────────────────────────────────────────────
  activitySection: {
    marginTop: 12,
    backgroundColor: COLORS.bgLight,
    borderRadius: 12,
    padding: 10,
  },
  activityHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  activityLabelGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  activityLabel: {
    fontSize: 12,
    color: COLORS.textSub,
    flex: 1,
  },
  slActAddBtn: {
    padding: 4,
  },
  activityItem: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.divider,
  },
  activityRowText: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 16,
  },

  // ─── Auth & Utility Styles ────────────────────────────────────────────────
  safeArea: { flex: 1 },
  flex1: { flex: 1 },
  scrollContainer: { padding: 20, paddingTop: 40 },
  headerSection: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    ...mkShadow(12),
  },
  logo: {
    width: 60,
    height: 60,
    resizeMode: "contain",
  },
  brandTitleLarge: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  brandSubtitleLarge: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 4,
    color: COLORS.textMuted,
  },
  authCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 24,
    ...mkShadow(20),
  },
  centerText: { textAlign: "center" },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    marginLeft: 4,
  },
  inputWrapperAuth: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    backgroundColor: COLORS.bgLight,
  },
  textInput: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.divider,
    paddingHorizontal: 16,
    fontSize: 15,
    color: COLORS.textDark,
    backgroundColor: COLORS.bgLight,
  },
  iconRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  actionBtn: { alignItems: "center" },
  iconCircleAuth: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.divider,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  iconLabel: {
    fontSize: 11,
    fontWeight: "700",
  },

  // ─── Modal & Form Extras ────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.textDark,
  },
  roleSwitch: {
    flexDirection: "row",
    backgroundColor: COLORS.bgDark + "05",
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  roleTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
  },
  roleTabActive: {
    backgroundColor: COLORS.white,
    ...mkShadow(4),
  },
  roleTabText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  roleTabTextActive: {
    color: COLORS.primary,
  },
  inputGroup: {
    marginBottom: 20,
    width: "100%",
  },

  // ─── Call Log Styles ────────────────────────────────────────────────────
  clOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  clContainer: {
    height: "100%",
    marginTop: 5,
    overflow: "hidden",
  },
  clHeader: {
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  clTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  clSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  clList: {
    padding: 16,
    paddingBottom: 40,
  },
  clCard: {
    borderRadius: 16,
    marginBottom: 12,
    padding: 14,
    ...mkShadow(2),
  },
  clCardMain: {
    flexDirection: "row",
    alignItems: "center",
  },
  clInfoCol: {
    flex: 1,
  },
  clActionCol: {
    marginHorizontal: 10,
    minWidth: 70,
    alignItems: "center",
  },
  clName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  clSubText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  clRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  clDateText: {
    fontSize: 11,
    color: COLORS.textSub,
  },
  clAddButton: {
    backgroundColor: COLORS.success,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  clAddButtonText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "700",
  },
  clLeadBadge: {
    backgroundColor: COLORS.info + "20",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  clLeadNoText: {
    color: COLORS.info,
    fontSize: 12,
    fontWeight: "800",
  },
  clFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: COLORS.divider + "40",
    gap: 6,
  },
  clCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ─── Utility Styles (Auto-Generated) ──────────────────────────────────
  row: { flexDirection: "row" },
  rowCenter: { flexDirection: "row", alignItems: "center" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  alignCenter: { alignItems: "center" },
  alignEnd: { alignItems: "flex-end" },
  justifyBetween: { justifyContent: "space-between" },
  txtSec: { color: COLORS.textSub },

  w48: { width: "48%" },
  w92: { width: "92%" },
  w94: { width: "94%" },
  w100: { width: "100%" },
  minH56: { minHeight: 56 },
  minH80: { minHeight: 80 },

  m4: { margin: 4 }, m8: { margin: 8 }, m12: { margin: 12 }, m16: { margin: 16 }, m20: { margin: 20 },
  mt2: { marginTop: 2 }, mt4: { marginTop: 4 }, mt6: { marginTop: 6 }, mt8: { marginTop: 8 }, mt10: { marginTop: 10 }, mt12: { marginTop: 12 }, mt16: { marginTop: 16 }, mt20: { marginTop: 20 }, mt40: { marginTop: 40 },
  mb4: { marginBottom: 4 }, mb8: { marginBottom: 8 }, mb10: { marginBottom: 10 }, mb12: { marginBottom: 12 }, mb16: { marginBottom: 16 }, mb20: { marginBottom: 20 },
  ml4: { marginLeft: 4 }, ml8: { marginLeft: 8 }, ml10: { marginLeft: 10 }, ml12: { marginLeft: 12 },
  mr4: { marginRight: 4 }, mr8: { marginRight: 8 }, mr10: { marginRight: 10 }, mr12: { marginRight: 12 },
  mv4: { marginVertical: 4 }, mv8: { marginVertical: 8 }, mv12: { marginVertical: 12 }, mv14: { marginVertical: 14 }, mv16: { marginVertical: 16 },
  mh4: { marginHorizontal: 4 }, mh8: { marginHorizontal: 8 }, mh12: { marginHorizontal: 12 }, mh16: { marginHorizontal: 16 },

  p4: { padding: 4 }, p8: { padding: 8 }, p12: { padding: 12 }, p14: { padding: 14 }, p16: { padding: 16 },
  pt4: { paddingTop: 4 }, pt8: { paddingTop: 8 }, pt12: { paddingTop: 12 }, pt16: { paddingTop: 16 }, pt20: { paddingTop: 20 },
  pb4: { paddingBottom: 4 }, pb8: { paddingBottom: 8 }, pb12: { paddingBottom: 12 }, pb16: { paddingBottom: 16 }, pb40: { paddingBottom: 40 }, pb100: { paddingBottom: 100 },
  ph4: { paddingHorizontal: 4 }, ph8: { paddingHorizontal: 8 }, ph10: { paddingHorizontal: 10 }, ph12: { paddingHorizontal: 12 }, ph14: { paddingHorizontal: 14 }, ph16: { paddingHorizontal: 16 }, ph20: { paddingHorizontal: 20 },
  pv4: { paddingVertical: 4 }, pv8: { paddingVertical: 8 }, pv10: { paddingVertical: 10 }, pv12: { paddingVertical: 12 }, pv14: { paddingVertical: 14 }, pv16: { paddingVertical: 16 }, pv20: { paddingVertical: 20 },

  br4: { borderRadius: 4 }, br8: { borderRadius: 8 }, br10: { borderRadius: 10 }, br12: { borderRadius: 12 }, br14: { borderRadius: 14 }, br16: { borderRadius: 16 }, br18: { borderRadius: 18 }, br24: { borderRadius: 24 },

  fs8: { fontSize: 8 }, fs9: { fontSize: 9 }, fs10: { fontSize: 10 }, fs11: { fontSize: 11 }, fs12: { fontSize: 12 }, fs13: { fontSize: 13 }, fs14: { fontSize: 14 }, fs15: { fontSize: 15 }, fs16: { fontSize: 16 }, fs18: { fontSize: 18 }, fs20: { fontSize: 20 }, fs22: { fontSize: 22 }, fs24: { fontSize: 24 },
  bold600: { fontWeight: "600" }, bold700: { fontWeight: "700" }, bold800: { fontWeight: "800" }, bold900: { fontWeight: "900" },
  uppercase: { textTransform: "uppercase" },
  letter1_8: { letterSpacing: 1.8 },
  opacity06: { opacity: 0.6 }, opacity07: { opacity: 0.7 },

  // ─── Project Dashboard Styles ───────────────────────────────────────────
  pdContainer: { flex: 1, backgroundColor: "#f8fafc" },
  pdInner: { padding: 12 },
  pdHeader: { flexDirection: "column", marginBottom: 12 },
  pdWelcomeText: { fontSize: 22, fontWeight: "900", color: "#1e293b", letterSpacing: -0.5 },
  pdDateText: { fontSize: 11, color: "#94a3b8", fontWeight: "700" },
  pdHeaderActions: { flexDirection: "row", gap: 6, marginTop: 8 },
  pdIconBtnCompact: { 
    flex: 1,
    backgroundColor: COLORS.primary + "10", 
    paddingVertical: 6, 
    paddingHorizontal: 4,
    borderRadius: 8, 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.primary + "20"
  },
  pdIconBtnTextSmall: { color: COLORS.primary, fontWeight: "800", fontSize: 9 },
  
  // ─── Tabs ───
  pdTabs: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 4, marginHorizontal: 16, marginBottom: 15, borderWidth: 1, borderColor: '#f1f5f9', ...mkShadow(2) },
  pdTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
  pdTabActive: { backgroundColor: COLORS.primary, ...mkShadow(4) },
  pdTabText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  pdTabTextActive: { color: '#fff' },

  pdStatsRow: { flexDirection: "row", gap: 6, marginBottom: 12, marginHorizontal: 4 },
  pdStatCard: { flex: 1, paddingVertical: 10, paddingHorizontal: 2, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
  pdStatVal: { fontSize: 18, fontWeight: "900" },
  pdStatLab: { fontSize: 8, color: COLORS.textSub, fontWeight: "700", textTransform: "uppercase", marginTop: 4, letterSpacing: 0.2 },
  pdSectionTitle: { fontSize: 20, fontWeight: "800", color: "#1e293b", marginBottom: 15, letterSpacing: -0.5 },
  pdCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 20,
    marginTop: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    position: "relative",
    ...mkShadow(4)
  },
  pdCardDark: { backgroundColor: "#1e293b", borderColor: "#334155" },
  pdCardHeader: { marginBottom: 15, marginTop: 10 },
  pdLeadMain: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 },
  pdLeadName: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  pdLeadProduct: { fontSize: 14, color: "#64748b", fontWeight: "500" },

  // 🚀 Floating Name Badge (Half on body, half on card)
  pdBadge: {
    position: "absolute",
    top: -12,
    alignSelf: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    ...mkShadow(4),
  },
  pdBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  pdContactRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10
  },
  pdContactBtn: {
    backgroundColor: "#f8fafc",
    padding: 8,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  pdContactBtnText: { fontSize: 11, color: "#0f172a", fontWeight: "600" },

  pdActionGrid: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    justifyContent: "space-between",
  },
  pdGridBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: "center",
    gap: 4,
    backgroundColor: '#fff',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    ...mkShadow(1),
  },
  pdGridIcon: { width: 30, height: 30, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  pdGridText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#334155",
    textAlign: "center",
    width: '100%',
  },
  pdCentered: { flex: 1, justifyContent: "center", alignItems: "center" },
  pdLoadingText: { marginTop: 15, fontSize: 14, color: "#94a3b8", fontWeight: "600" },
  pdEmpty: { padding: 80, alignItems: "center" },
  pdEmptyText: { marginTop: 20, color: "#94a3b8", fontWeight: "600", fontSize: 16 },

  // Dark Mode Helpers
  pdBgDark: { backgroundColor: "#0f172a" },
  pdTextWhite: { color: "#f1f5f9" },

  // ─── Voucher Entry Styles ───────────────────────────────────────────────
  vHeader: { padding: 16, backgroundColor: COLORS.primary, flexDirection: "row", justifyContent: "space-between" },
  vTitle: { fontSize: 18, fontWeight: "800", color: "#fff" },
  vSubTitle: { fontSize: 12, color: "rgba(255,255,255,0.7)" },
  vBody: { padding: 12 },
  vNarrationInput: {
    backgroundColor: "#fff", padding: 12, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.divider, marginBottom: 15, fontSize: 13, minHeight: 60,
    textAlignVertical: 'top'
  },
  vGridHeader: { flexDirection: 'row', paddingHorizontal: 4, marginBottom: 8 },
  vColLedger: { flex: 2 },
  vColType: { width: 50, textAlign: 'center' },
  vColAmount: { flex: 1, textAlign: 'right' },
  vGridLabel: { fontSize: 10, fontWeight: "800", color: COLORS.textMuted, textTransform: "uppercase" },
  vEntryRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.divider, ...mkShadow(2)
  },
  vTypeBtn: {
    width: 36, height: 32, borderRadius: 8, justifyContent: 'center',
    alignItems: 'center', backgroundColor: COLORS.bgLight
  },
  vTypeDr: { backgroundColor: COLORS.info + '20' },
  vTypeCr: { backgroundColor: COLORS.danger + '20' },
  vTypeTextDr: { color: COLORS.info, fontWeight: '800', fontSize: 11 },
  vTypeTextCr: { color: COLORS.danger, fontWeight: '800', fontSize: 11 },
  vLedgerBtn: { flex: 2, marginRight: 8 },
  vLedgerText: { fontSize: 13, color: COLORS.textDark, fontWeight: '600' },
  vAmountInput: { flex: 1, fontSize: 15, fontWeight: '700', textAlign: 'right', color: COLORS.textDark },
  vRemoveBtn: { marginLeft: 10, padding: 4 },
  vAddBtn: {
    alignSelf: 'center', marginVertical: 12, paddingVertical: 8,
    paddingHorizontal: 20, borderRadius: 20, backgroundColor: COLORS.bgLight,
    borderWidth: 1, borderColor: COLORS.divider, flexDirection: 'row', alignItems: 'center', gap: 6
  },
  vAddText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  vFooter: {
    padding: 16, borderTopWidth: 1, borderTopColor: COLORS.divider,
    backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between'
  },
  vTotalLabel: { fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: '800' },
  vTotalVal: { fontSize: 18, fontWeight: '900', color: COLORS.textDark },
  vBalanced: { color: COLORS.success },
  vUnbalanced: { color: COLORS.danger },
  vSaveBtn: {
    backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 16,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
    marginTop: 10
  },
  vSaveText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // ─── GPS Watermark Styles ──────────────────────────────────────────────
  wmOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
  },
  wmCorpLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  wmMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  wmAddressText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
  },
  wmSmallText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '500',
  },

  // ─── Project Card Gallery Layout ───────────────────────────────────────
  pdGalleryRow: {
    height: 190,
    backgroundColor: 'transparent',
    marginTop: 22,
    paddingHorizontal: 2,
    overflow: 'hidden',
  },
  pdGalleryImgLarge: {
    width: width - 36,
    height: 180,
    marginRight: 4,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  pdGalleryEmptyV3: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    height: 180,
  },
  pdGalleryEmptyTextV3: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 10,
    fontWeight: '700',
  },
  pdDetailsBox: {
    padding: 10,
    paddingTop: 4,
    gap: 6,
  },
  pdInfoLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 10,
  },
  pdProductStackV3: {
    flex: 1,
    gap: 2,
  },
  pdCardProductV3: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1e293b',
  },
  pdCardPhoneV3: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  pdActionRowV3: {
    flexDirection: 'row',
    gap: 8,
  },
  pdActionBtnV3: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#f1f5f9',
    ...mkShadow(2),
  },
  pdActionIconV3: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdActionTextV3: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  pdModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  pdFullImage: { width: width, height: '90%' },
  pdFullCloseBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, right: 20, zIndex: 1000, backgroundColor: 'rgba(255,255,255,0.15)', padding: 8, borderRadius: 25 },

  // ─── Categories & Inventory Styles ───────────────────────────────────────
  productList: { paddingLeft: 12, marginTop: -4 },
  productCard: { backgroundColor: COLORS.white, padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#f1f5f9' },
  productTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textDark },
  productDesc: { fontSize: 13, color: COLORS.textSub, marginTop: 4 },
  hsnBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  hsnBadgeTxt: { fontSize: 10, fontWeight: '700', color: COLORS.textSub },
  swipeContainer: { flexDirection: 'row' },
  swipeEdit: { backgroundColor: COLORS.info, width: 70, justifyContent: 'center', alignItems: 'center' },
  swipeDelete: { backgroundColor: COLORS.danger, width: 70, justifyContent: 'center', alignItems: 'center' },
  swipeLabel: { color: COLORS.white, fontSize: 12, fontWeight: '700', marginTop: 4 },
  vendorName: { fontSize: 16, fontWeight: '700', color: COLORS.textDark },
  modalWrapper: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: COLORS.white, borderRadius: 20, padding: 24, ...mkShadow(12) },
  input: { backgroundColor: COLORS.bgLight, borderWidth: 1, borderColor: COLORS.divider, borderRadius: 10, padding: 12, marginTop: 4, marginBottom: 12, fontSize: 14, color: COLORS.textDark },
  hsnHintTxt: { fontSize: 11, color: COLORS.textSub, marginTop: -8, marginBottom: 12, marginLeft: 4 },
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  actionBtnText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  modalActionBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  footerSafe: { backgroundColor: COLORS.bgLight },
  footer: { padding: 20, alignItems: 'center' },
  footerText: { fontSize: 12, color: COLORS.textMuted },
  footerSubText: { fontSize: 10, color: COLORS.divider, marginTop: 2 },

  // ─── Price Grid Form Styles ──────────────────────────────────────────
  pgLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSub, marginBottom: 8, marginLeft: 4 },
  pgPickerWrapper: { backgroundColor: COLORS.bgLight, borderWidth: 1, borderColor: COLORS.divider, borderRadius: 12, marginBottom: 20, overflow: 'hidden' },
  pgPicker: { height: 50, color: COLORS.textDark },
  pgSaveBtn: { backgroundColor: COLORS.success, width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', ...mkShadow(4) },
  pgGroupBox: { backgroundColor: COLORS.white, borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: '#f1f5f9', overflow: 'hidden', ...mkShadow(4) },
  pgGroupHeader: { backgroundColor: COLORS.primary, paddingVertical: 10, paddingHorizontal: 16 },
  pgGroupTitle: { color: COLORS.white, fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  pgRowHeader: { flexDirection: 'row', backgroundColor: '#f8fafc', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pgHCol1: { flex: 2 },
  pgHCol2: { width: 80, textAlign: 'center' },
  pgHCol3: { width: 60, textAlign: 'right' },
  pgHText: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase' },
  pgDataRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  pgColDesc: { flex: 2, fontSize: 13, color: COLORS.textDark, fontWeight: '500' },
  pgInput: { width: 80, backgroundColor: COLORS.bgLight, borderWidth: 1, borderColor: COLORS.divider, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, fontSize: 14, fontWeight: '700', color: COLORS.primary, textAlign: 'center' },
  pgColUom: { width: 60, fontSize: 11, color: COLORS.textSub, textAlign: 'right', fontWeight: '700' },

  // ─── Ledger Styles
  ledgerRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', alignItems: 'center' },
  ledgerHeaderRow: { flexDirection: 'row', backgroundColor: '#f8fafc', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', alignItems: 'center' },
  ledgerColDate: { width: 60, paddingLeft: 8 },
  ledgerColDesc: { flex: 1, paddingHorizontal: 4 },
  ledgerColAmt: { width: 70, textAlign: 'right' },
  ledgerColBal: { width: 80, textAlign: 'right', paddingRight: 8 },
  ledgerHeaderText: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase' },
  ledgerBodyText: { fontSize: 12, color: COLORS.textDark, fontWeight: '500' },
  amtDebit: { color: '#dc2626', fontWeight: '700' },
  amtCredit: { color: '#16a34a', fontWeight: '700' },
  balPositive: { color: '#16a34a', fontWeight: '900' },
  balNegative: { color: '#dc2626', fontWeight: '900' },
  leadInfoCard: { backgroundColor: COLORS.white, borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#f1f5f9', ...mkShadow(4) },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e2e8f0', height: 48 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#1e293b' },
  divider: { height: 1, backgroundColor: '#f1f5f9', width: '100%' },

  // ─── Standardized Global UI Components ─────────────────────────────────
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textSub,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.divider,
    justifyContent: "center",
    alignItems: "center",
  },
  btnPrimary: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    ...mkShadow(4),
  },
  btnSecondary: {
    backgroundColor: COLORS.bgLight,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.divider,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  btnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "800",
  },
  btnTextSecondary: {
    color: COLORS.textDark,
    fontSize: 16,
    fontWeight: "800",
  },
});
// --- Workforce & Attendance Styles -----------------------------------------
export const wfStyles = StyleSheet.create({
  // ── Modal chrome ──────────────────────────────────────────────────────────
  wfModalOverlay: { flex: 1, backgroundColor: '#fff' },
  wfModalOverlayBottom: { flex: 1, backgroundColor: '#fff' },
  wfModalContainer: { backgroundColor: '#fff', flex: 1, overflow: 'hidden' },
  wfModalContainerBottom: { backgroundColor: '#fff', flex: 1, paddingBottom: 20 },
  wfHeader: { padding: 24, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  wfTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  wfSubtitle: { fontSize: 12, color: '#64748b' },
  wfFilterBar: { padding: 12, flexDirection: 'row', gap: 10, backgroundColor: '#fdfdfd', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  wfDateSelector: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  wfDateText: { fontSize: 12, fontWeight: '700', color: '#1e293b' },
  wfSiteSelector: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, minHeight: 50 },
  wfEmptyBox: { flex: 1, padding: 50, alignItems: 'center', justifyContent: 'center' },
  wfEmptyText: { color: '#94a3b8', marginTop: 8, fontWeight: '600', fontSize: 13 },
  wfFooter: { paddingHorizontal: 12, paddingBottom: 14, paddingTop: 6 },
  wfLoadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // ── Employee card ─────────────────────────────────────────────────────────
  wfCard: { backgroundColor: '#fff', borderRadius: 14, padding: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  wfAvatarWrap: { position: 'relative' },
  wfAvatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: '#e2e8f0' },
  wfAvatarFallback: { justifyContent: 'center', alignItems: 'center' },
  wfAvatarInitial: { fontSize: 20, fontWeight: '800' },
  wfMenuDot: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#475569', borderRadius: 8, padding: 2 },
  wfCardMid: { flex: 1, paddingHorizontal: 10 },
  wfNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  wfStatusDot: { width: 8, height: 8, borderRadius: 4 },
  wfEmpName: { fontSize: 13, fontWeight: '800', color: '#1e293b', flex: 1 },
  wfCallBtn: { backgroundColor: '#22c55e', width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  wfWaBtn: { backgroundColor: '#25D366', width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  wfEmpMobile: { fontSize: 11, color: '#64748b', marginTop: 1 },
  wfEmpRole: { fontSize: 10, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase' },
  wfDutyLabel: { fontSize: 10, fontWeight: '700', marginTop: 1 },
  // ── Toggle ────────────────────────────────────────────────────────────────
  wfToggleWrap: { alignItems: 'center', gap: 3 },
  wfToggleTrack: { width: 46, height: 26, borderRadius: 13, borderWidth: 1.5, justifyContent: 'center', paddingHorizontal: 2 },
  wfToggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, elevation: 3, alignSelf: 'flex-start' },
  wfToggleThumbOn: { alignSelf: 'flex-end' },
  wfToggleLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  wfToggleSpinner: { width: 46, height: 26 },
  // ── Dropdown menu ─────────────────────────────────────────────────────────
  wfDropdown: { position: 'absolute', top: 54, right: 2, backgroundColor: '#fff', borderRadius: 12, zIndex: 999, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, elevation: 8, width: 190, borderWidth: 1, borderColor: '#f1f5f9' },
  wfDropItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  wfDropItemForce: { borderTopWidth: 1, borderTopColor: '#fef3c7', backgroundColor: '#fffbeb' },
  wfDropItemDanger: { borderTopWidth: 1, borderTopColor: '#fee2e2' },
  wfDropText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  wfDropTextForce: { color: '#b45309' },
  wfDropTextDanger: { color: '#ef4444' },
  // ── Rate / Form dialogs ───────────────────────────────────────────────────
  wfOverlay: { flex: 1, backgroundColor: '#fff' },
  wfDialogCard: { backgroundColor: '#fff', flex: 1, width: '100%' },
  wfDialogCardWide: { backgroundColor: '#fff', flex: 1, width: '100%' },
  wfDialogTitle: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  wfDialogSubtitle: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  wfDialogLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 6 },
  wfDialogInput: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, height: 46, paddingHorizontal: 12, fontSize: 15, fontWeight: '700', color: '#1e293b' },
  wfDialogInputTall: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, height: 70, paddingHorizontal: 12, fontSize: 14, color: '#1e293b', textAlignVertical: 'top', marginTop: 12 },
  wfDialogBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  wfDialogBtn: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  wfDialogBtnCancel: { backgroundColor: '#f1f5f9' },
  wfDialogBtnPrimary: { flex: 1 },
  wfDialogBtnDanger: { flex: 1, backgroundColor: '#ef4444' },
  wfDialogBtnText: { fontWeight: '700' },
  wfDialogBtnTextDark: { color: '#64748b', fontWeight: '700' },
  wfDialogBtnTextLight: { color: '#fff', fontWeight: '700' },
  // ── Payment sheet rows ────────────────────────────────────────────────────
  wfSheetRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  wfSheetLabel: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  wfSheetValue: { fontSize: 13, fontWeight: '800', color: '#1e293b' },
  wfSheetSalaryBox: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, marginTop: 4, backgroundColor: '#f0fdf4', borderRadius: 10, paddingHorizontal: 10 },
  wfSheetSalaryLabel: { fontSize: 13, color: '#16a34a', fontWeight: '800' },
  wfSheetSalaryValue: { fontSize: 15, fontWeight: '900', color: '#16a34a' },
  wfSheetPaymentBox: { marginTop: 10, padding: 10, backgroundColor: '#fef2f2', borderRadius: 10 },
  wfSheetPaymentText: { fontSize: 11, color: '#dc2626', fontWeight: '700' },
  wfSheetPaymentHint: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  // ── Legacy ────────────────────────────────────────────────────────────────
  wfMetaLabel: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  wfCircleBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  wfCircleBtnText: { fontSize: 18, fontWeight: '900', color: '#64748b' },
  wfAbsentActive: { borderColor: '#ef4444', backgroundColor: '#ef4444' },
  wfPresentActive: { borderColor: '#22c55e', backgroundColor: '#22c55e' },
  wfCircleAbsent: { backgroundColor: '#fee2e2' },
  wfCirclePresent: { backgroundColor: '#dcfce7' },
  wfRateInput: { backgroundColor: '#f8fafc', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, width: 70, textAlign: 'center', fontWeight: '800', color: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
  wfActionGrid: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12, marginTop: 12 },
  wfActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  wfActionText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  wfFormInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, fontSize: 15, color: '#1e293b' },
  wfDeleteBtn: { width: 56, height: 56, borderRadius: 15, backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#fecaca' },
  // Layout Utilities
  flex1: { flex: 1 } as ViewStyle,
  row: { flexDirection: 'row' } as ViewStyle,
  center: { justifyContent: 'center', alignItems: 'center' } as ViewStyle,
  alignCenter: { alignItems: 'center' } as ViewStyle,
  alignEnd: { alignItems: 'flex-end' } as ViewStyle,
  justifyBetween: { justifyContent: 'space-between' } as ViewStyle,
  mt10: { marginTop: 10 } as ViewStyle,
  mt12: { marginTop: 12 } as ViewStyle,
  mb10: { marginBottom: 10 } as ViewStyle,
  gap10: { gap: 10 } as ViewStyle,
  gap12: { gap: 12 } as ViewStyle,
  p20: { padding: 20 } as ViewStyle,
  p24: { padding: 24 } as ViewStyle,
  p40: { padding: 40 } as ViewStyle,
  h20: { height: 20 } as ViewStyle,
  h100: { height: 100 } as ViewStyle,
  alignStart: { alignItems: 'flex-start' } as ViewStyle,
  justifyCenter: { justifyContent: 'center' } as ViewStyle,
});

export const GS = StyleSheet.create({
  inputGroup: {
    marginBottom: 20,
    width: "100%",
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
    marginBottom: 6,
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // ─── Config Page Styles ──────────────────────────────────────────────
  configPage: { flex: 1, backgroundColor: "#0f172a" },
  configScroll: { padding: 16, paddingBottom: 100 },
  configSaveBtn: { backgroundColor: "rgba(0,229,255,0.15)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(0,229,255,0.3)", paddingVertical: 6, paddingHorizontal: 12 },
  configSaveBtnSuccess: { backgroundColor: "#4caf50", borderColor: "#4caf50" },
  configSaveBtnText: { color: "#00e5ff", fontWeight: "bold", fontSize: 13 },
  configTabs: { flexDirection: 'row', marginBottom: 24, gap: 10 },
  configTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12, backgroundColor: '#1e2a3a', borderWidth: 1, borderColor: '#2d3d4d' },
  configTabActive: { backgroundColor: 'rgba(0,229,255,0.1)', borderColor: '#00e5ff' },
  configTabText: { color: '#64748b', fontWeight: 'bold', fontSize: 12 },
  configTabTextActive: { color: '#00e5ff' },
  configGrid: { gap: 16 },
  configCard: { backgroundColor: '#1e2a3a', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#2d3d4d', gap: 12 },
  configCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  configCardIcon: { fontSize: 20 },
  configCardLabel: { fontSize: 14, fontWeight: '800', color: '#e2e8f0' },
  configInputWrap: { backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#2d3d4d' },
  configInput: { color: '#fff', fontSize: 14, padding: 0 },
  configDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00e5ff', position: 'absolute', right: 12, top: '50%', marginTop: -3 },
  configToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  configToggleLabel: { fontSize: 15, fontWeight: 'bold', color: '#fff' },
  configToggleSub: { fontSize: 11, color: '#64748b' },
  configMailSection: { gap: 16 },
  configPassRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  configEyeText: { fontSize: 18 },
});
