// myscript/styles.js
import { Dimensions, StyleSheet } from "react-native";

const { width, height } = Dimensions.get("window");

export const DRAWER_WIDTH = Math.min(260, Math.round(width * 0.867));
export const HEADER_HEIGHT = Math.min(90, Math.round(height * 0.125));
export const FOOTER_HEIGHT = Math.min(50, Math.round(height * 0.065));

export const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: "#f9fafb" },

  headerSafe: { height: HEADER_HEIGHT, backgroundColor: "#fff" },

  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    marginTop :10,
    height: HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 5,
    backgroundColor: "#8dee2bff",
    borderBottomWidth: 1,
    borderBottomColor: "#060b06ff",
    zIndex: 100,
  },
  panGSTHdr:{
    alignItems:"baseline",
    fontSize:12,
    fontWeight:"800",

  },

  leftTouch: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
 imageContainer: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    padding:5,
    marginTop:15,
  },
  menuImage: {
    width: 44,
    height: 44,
    borderRadius: 22, // Half of width/height makes it a perfect circle
    resizeMode: "cover",
  },
  placeholder: {
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0'
  },

  headerCenterWrapper: { flex: 1, justifyContent: "center" },

  headerTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },

  headersubTitle: { fontSize: 15, color: "#0b0ec7ff" },

  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },

  toolbarTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },

  overlay: {
    position: "absolute",
    top: HEADER_HEIGHT,
    left: 0,
    right: 0,
    bottom: FOOTER_HEIGHT,
    backgroundColor: "rgba(0,0,0,0.25)",
    zIndex: 40,
  },

  drawer: {
    position: "absolute",
    left: 0,
    top: HEADER_HEIGHT,
    bottom: FOOTER_HEIGHT,
    width: DRAWER_WIDTH,
    backgroundColor: "#fff",
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: "#e6e6e6",
    zIndex: 50,
  },
  drawerHeader:{

  },

  drawerCloseButton: {
    position: "absolute",
    right: 8,
    top: 8,
    zIndex: 60,
  },

  drawerTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },

  drawerSection: { marginTop: 12 },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },

  drawerSectionTitle: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },

  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
  },

  drawerSubtitle:{
  fontSize: 7,
  color:"#111827"
  },

  drawerItemText: { marginLeft: 10, fontSize: 14, color: "#374151" },

  rightPlaceholder: { width: 56, alignItems: "center", justifyContent: "center" },

  body: {
    flex: 1,
    paddingTop: HEADER_HEIGHT + 10,
    paddingBottom: FOOTER_HEIGHT + 10,
    paddingHorizontal: 16,
  },

  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },

  statCard: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },

  statLabel: { fontSize: 13, color: "#6b7280" },
  statValue: { fontSize: 22, fontWeight: "700" },

  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    elevation: 1,
  },

  vendorName: { fontSize: 16, fontWeight: "700", color: "#111" },

  productList: { paddingHorizontal: 8, marginTop: 8 },

  productCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },

  productTitle: { fontSize: 15, fontWeight: "700", color: "#111" },

  productDesc: { fontSize: 13, color: "#6b7280", marginTop: 6 },

  swipeContainer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "transparent",
    paddingRight: 4,
  },

  swipeEdit: {
    width: 80,
    height: "100%",
    backgroundColor: "#06a0b5",
    justifyContent: "center",
    alignItems: "center",
  },

  swipeDelete: {
    width: 80,
    height: "100%",
    backgroundColor: "red",
    justifyContent: "center",
    alignItems: "center",
  },

  swipeLabel: { color: "#fff", fontSize: 12, marginTop: 4, fontWeight: "700" },

  addButton: {
    backgroundColor: "#0b6cff",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
  },

  addButtonText: { color: "#fff", fontWeight: "700", marginLeft: 6 },

  addProductBtn: {
    backgroundColor: "#0b6cff",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 4,
  },

  addProductText: { color: "#fff", fontWeight: "700", marginLeft: 8 },

  modalWrapper: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
  },

  modalCard: {
    padding: 18,
    backgroundColor: "#fff",
    borderRadius: 12,
    margin: 16,
  },

  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },

  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 10 },

  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fafafa",
  },

  actionsRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16 },

  actionBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },

  actionBtnText: { color: "#fff", fontWeight: "700" },

  footerSafe: {
    height: 70,
    backgroundColor: "#fff",
    paddingBottom: 10,
    justifyContent: "center",
  },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: FOOTER_HEIGHT,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    zIndex: 100,
  },

  footerText: { fontSize: 12, color: "#6b7280" },

  footerSubText: { fontSize: 11, color: "#9ca3af" },

  uploadOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },

  uploadPercentText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  /* DROPDOWN */
  dropdownBox: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },

  dropdownItem: { paddingVertical: 10, paddingHorizontal: 12 },

  dropdownSelected: { fontWeight: "700", color: "#0b6cff" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  pickerWrapper: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#fff",
    marginBottom: 16,
  },

  picker: { height: 52 },

  groupBox: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 8,
    marginBottom: 16,
    backgroundColor: "#fff",
  },

  groupHeader: {
    backgroundColor: "#ffe066",
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
  },

  groupHeaderText: { fontSize: 16, fontWeight: "700" },

  /* ===================================
      FIXED TABLE ROW SECTION (UPDATED)
  =================================== */

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    marginBottom: 6,
  },

  hDesc: { flex: 2, fontWeight: "700", fontSize: 14, color: "#111" },

  hBuy: {
    flex: 1,
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
    color: "#111",
  },

  hSale: {
    flex: 1,
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
    color: "#111",
  },

  hUom: {
    flex: 1,
    fontWeight: "700",
    fontSize: 14,
    textAlign: "right",
    color: "#111",
  },

  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#eee",
  },

  colDesc: {
    flex: 2,
    fontSize: 14,
    color: "#333",
    paddingRight: 6,
  },

  colInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#fff",
    borderRadius: 6,
    textAlign: "center",
    marginHorizontal: 4,
    paddingHorizontal: 4,
  },

  colUom: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    color: "#555",
    paddingRight: 4,
  },

  divider: { height: 1, backgroundColor: "#e0e0e0", marginTop: 6 },

  buttonRow: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 15, 
},

  saveButton: {
    backgroundColor: "#010500dc",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },

  saveButtonText: {
    color: "#f3ececf0",
    fontWeight: "700",
    fontSize: 30,
  },
  closeButton: {
    backgroundColor: "#e60606ea",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
    marginRight: 10,
  },

  closeButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 30,
  },

  
});
