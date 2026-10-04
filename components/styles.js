import { Platform, StyleSheet } from "react-native";

export default StyleSheet.create({
  /** ---------- Global Container ---------- */
  container: {
    flex: 1,
  },

  /** ---------- Header ---------- */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#fc5918ff",
    backgroundColor: "#fff",
    marginTop: Platform.OS === "android" ? 25 : 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },

  /** ---------- List / ScrollView ---------- */
  listContainer: {
    flex: 1,
    paddingBottom: 80,
    backgroundColor: "#f8f9fa",
  },

  /** ---------- Lead Tile / Card ---------- */
  tile: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
    marginHorizontal: 0,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    flexWrap: "wrap",
  },
  label: {
    fontWeight: "500",
    marginRight: 6,
  },
  value: {
    fontWeight: "700",
    color: "#333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 4,
    minWidth: 80,
    color: "#333",
  },

  /** ---------- Serial Circle ---------- */
  serialCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  serialText: {
    color: "#fff",
    fontWeight: "700",
  },

  /** ---------- Top Right Edit Buttons ---------- */
  topRightButtons: {
    position: "absolute",
    right: 12,
    top: 12,
    flexDirection: "row",
    zIndex: 2,
  },

  /** ---------- Status / Action Buttons ---------- */
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  button: {
    backgroundColor: "#0f032dff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 6,
    marginTop: 4,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },

  /** ---------- Contact Icons Row ---------- */
  contactRow: {
    flexDirection: "row",
    marginLeft: 6,
  },
  iconBtn: {
    marginRight: 6,
  },

  /** ---------- Modals ---------- */
  centeredModal: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.3)",
  },

  /** ---------- Actions ---------- */
  actionBtn: {
    backgroundColor: "#007AFF",
    padding: 8,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 6,
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },
  subActionContainer: {
    flexDirection: "row",
    marginTop: 6,
  },
  subActionBtn: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: "#25D366",
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: "center",
  },
  subActionText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },

  /** ---------- States / Empty ---------- */
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },

  /** ---------- Menu ---------- */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-start",
    paddingTop: 60,
  },
  menuContainer: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    borderRadius: 8,
    paddingVertical: 8,
    elevation: 5,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuText: {
    fontSize: 16,
    color: "#333",
  },

  /** ---------- Images / Logos ---------- */
  reactLogo: {
    height: 178,
    width: 290,
    alignSelf: "center",
    marginVertical: 12,
  },
  tabsWrapper: {
    flex: 1,
  },

  /** ---------- Footer ---------- */
  footer: {
    height: 30,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderTopWidth: 2,
    borderBottomColor: "#18fc64e7",
  },
  footerText: {
    fontSize: 12,
    color: "#155efbff",
  },
});
