// styles.ts
import { StyleSheet } from "react-native";

export const HEADER_HEIGHT = 90;
export const FOOTER_HEIGHT = 25;
export const DRAWER_WIDTH = 260;

export const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: "#e4e5ecff" },

  /* HEADER */
  headerSafe: {
    backgroundColor: "#e4e5ecff",
    height: HEADER_HEIGHT,
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginTop: -30,
    minHeight: HEADER_HEIGHT,
  },
  leftTouch: { width: 50, alignItems: "flex-start", justifyContent: "center" },
  menuImage: { width: 60, height: 60, borderRadius: 8 },

  headerCenterWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },

  headerTitle: { color: "#202099c1", fontSize: 25, fontWeight: "700" },
  headersubTitle: { color: "#202099c1", fontSize: 15, fontWeight: "700" },
  rightPlaceholder: { width: 50 },

  /* OVERLAY */
  overlay: {
    position: "absolute",
    top: HEADER_HEIGHT,
    left: 0,
    right: 0,
    bottom: FOOTER_HEIGHT,
    backgroundColor: "rgba(0,0,0,0.32)",
    zIndex: 10,
  },

  /* DRAWER */
  drawer: {
    position: "absolute",
    top: HEADER_HEIGHT,
    bottom: FOOTER_HEIGHT,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "#e4e5ecff",
    padding: 12,
    zIndex: 20,
    borderRightWidth: 1,
    borderRightColor: "#eaeff6",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 8,
  },

  drawerCloseButton: { position: "absolute", top: 12, right: 5, zIndex: 30, color: "#cb1b07c8" },
  drawerTitle: { fontSize: 15, fontWeight: "700", color: "#2563eb", marginBottom: 12 },

  drawerSection: { marginBottom: 12 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  drawerSectionTitle: { fontSize: 15, fontWeight: "400", color: "#030303ff" },

  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 6,
    marginLeft: 10,
  },
  drawerItemText: { fontSize: 10, color: "#000000b8", marginLeft: 10 },

  /* BODY */
  body: { padding: 16, paddingBottom: FOOTER_HEIGHT + 18 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 12 },

  statCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 3,
  },
  statLabel: { fontSize: 18, color: "#6b7280" },
  statValue: { fontSize: 25, fontWeight: "700", marginTop: 6 },

  /* FOOTER */
  footerSafe: { backgroundColor: "#e4e5ecff", height: FOOTER_HEIGHT, justifyContent: "center" },

  footer: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: FOOTER_HEIGHT,
    marginBottom: -45,
  },

  footerText: { color: "#1b041fff", fontSize: 12 },
  footerSubText: { color: "#01050dff", fontSize: 10 },
});
