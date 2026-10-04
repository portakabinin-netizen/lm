import { StyleSheet } from 'react-native';
import { COLORS } from '@/styles/stylesIndex';

export const ledgerStyles = StyleSheet.create({
    root: { flex: 1 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
    searchBox: {
        flexDirection: "row", alignItems: "center",
        borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44,
    },
    searchInput: { flex: 1, marginLeft: 8, fontSize: 14 },
    ledgerCard: {
        flexDirection: "row", alignItems: "center",
        paddingVertical: 14, paddingRight: 14, paddingLeft: 0,
        borderRadius: 12, marginBottom: 10, overflow: "hidden",
    },
    ledgerAccent: { width: 4, alignSelf: "stretch" },
    groupBadge: {
        borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
    },
    groupBadgeTxt: { fontSize: 10, fontWeight: "700" },
    radioCircle: {
        width: 22, height: 22, borderRadius: 11, borderWidth: 2,
        justifyContent: "center", alignItems: "center", marginLeft: 12,
    },
    radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.primary },
    footer: { padding: 16, borderTopWidth: 1, paddingBottom: 30 },
    pdfBtn: {
        backgroundColor: COLORS.primary, padding: 16, borderRadius: 12,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    },
    pdfBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },

    // Modal Styles
    modalSafe: { flex: 1 },
    modalHeader: {
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        padding: 12, borderBottomWidth: 1,
    },
    modalCancelBtn: { padding: 8 },
    modalCancelTxt: { color: COLORS.danger, fontWeight: "600", fontSize: 16 },
    modalOrientBtn: { padding: 8, flexDirection: "row", alignItems: "center", gap: 6 },
    modalOrientTxt: { fontWeight: "600", fontSize: 15 },
    modalPrintBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: COLORS.primary, borderRadius: 8 },
    modalPrintTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
    webview: { flex: 1 }
});
