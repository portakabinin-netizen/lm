import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "@/components/AppHeader";
import { appService } from "@/UtilServices/appHelper";
import { useUserContext } from "@/context/AuthContext";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";

const COLORS = {
  pri: "#059669",
  sec: "#f59e0b",
  bg: "#f8fafc",
  srf: "#ffffff",
  txt: "#0f172a",
  muted: "#64748b",
  bdr: "#e2e8f0"
};

export default function BulkUploadScreen() {
  const { user } = useUserContext();
  const router = useRouter();
  const token = user?.token ?? "";
  
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Validate Context
  if (!user?.corporateId || !user?.corpAdminId) {
    return (
      <SafeAreaView style={styles.root}>
        <AppHeader title="Bulk Upload" onBackPress={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorText}>
            Access Denied. Please ensure you have selected a Corporate Business profile before uploading bulk data.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      if (Platform.OS === "web") {
        const response = await appService.httpClient.get("product/bulk-upload/template", {
          responseType: "blob",
          headers: { Authorization: `Bearer ${token}` }
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "Purchase_Bulk_Upload_Template.xlsx");
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        // Native
        const fileName = "Purchase_Bulk_Upload_Template.xlsx";
        const fileUri = FileSystem.documentDirectory + fileName;
        
        // Cannot use axios blob easily in native, use expo-file-system downloadAsync
        const downloadRes = await FileSystem.downloadAsync(
          `${appService.httpClient.defaults.baseURL}product/bulk-upload/template`,
          fileUri,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (downloadRes.status !== 200) {
          throw new Error(`Server returned status code: ${downloadRes.status}`);
        }
        
        await Sharing.shareAsync(downloadRes.uri);
      }
      appService.showToast("Template downloaded successfully!", "Success");
    } catch (err: any) {
      console.log("Download Error:", err?.response || err);
      const msg = err?.response?.data?.error || err.message || "Could not download template.";
      Alert.alert("Download Error", msg);
    } finally {
      setDownloading(false);
    }
  };

  const handleUploadData = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
          "application/vnd.ms-excel",
          ".xlsx", ".xls"
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      setUploading(true);

      const formData = new FormData();
      formData.append("file", {
        uri: Platform.OS === "android" ? file.uri : file.uri.replace("file://", ""),
        name: file.name,
        type: file.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      } as any);
      
      // Pass the corporate identifiers explicitly although middleware normally injects it
      formData.append("corporateId", user.corporateId);
      formData.append("corpAdminId", user.corpAdminId);

      await appService.httpClient.post("product/bulk-upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`
        }
      });

      appService.showToast("Data uploaded successfully!", "Success");
    } catch (err: any) {
      console.log(err);
      Alert.alert("Upload Failed", err?.response?.data?.error || err.message || "Failed to parse and upload sheet.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["left", "right", "bottom"]}>
      <AppHeader title="Bulk Upload (Excel)" onBackPress={() => router.back()} />
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>1. Get the Template</Text>
          <Text style={styles.desc}>
            Download the official Excel template. It contains sheets for Vendors, Categories, Products, and Item Rates. 
            Fill it accurately without modifying the column headers.
          </Text>
          <TouchableOpacity 
            style={styles.btnSec} 
            onPress={handleDownloadTemplate}
            disabled={downloading}
          >
            {downloading ? <ActivityIndicator size="small" color={COLORS.pri} /> : <Text style={styles.btnTxtSec}>Download Template (XLSX)</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>2. Upload Completed File</Text>
          <Text style={styles.desc}>
            Once you have populated your vendors, categories, products, and prices in the template, select the file here to import it into your corporate profile.
          </Text>
          <TouchableOpacity 
            style={styles.btnPri} 
            onPress={handleUploadData}
            disabled={uploading}
          >
            {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnTxtPri}>Select & Upload Excel</Text>}
          </TouchableOpacity>
        </View>
        
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Important Note:</Text>
          <Text style={styles.infoText}>
            • Any duplicate Vendor Mobile Number, or Category/Product Names will be ignored to prevent redundancies.{"\n"}
            • Ensure 'CategoryName' strictly matches across the Categories, Products, and ItemRates sheets.{"\n"}
            • Ensure the 'VendorMobile' in ItemRates accurately matches a mobile number in the Vendors sheet.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 16, gap: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  errorText: { color: "#b91c1c", fontSize: 16, textAlign: "center", fontWeight: "600" },
  card: {
    backgroundColor: COLORS.srf,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.bdr,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  title: { fontSize: 16, fontWeight: "700", color: COLORS.txt, marginBottom: 8 },
  desc: { fontSize: 13, color: COLORS.muted, marginBottom: 16, lineHeight: 20 },
  btnPri: {
    backgroundColor: COLORS.pri,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center"
  },
  btnTxtPri: { color: "#fff", fontSize: 14, fontWeight: "600" },
  btnSec: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: COLORS.pri,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center"
  },
  btnTxtSec: { color: COLORS.pri, fontSize: 14, fontWeight: "600" },
  infoBox: {
    marginTop: 10,
    padding: 14,
    backgroundColor: "#fffbeb",
    borderLeftWidth: 4,
    borderLeftColor: COLORS.sec,
    borderRadius: 6
  },
  infoTitle: { fontWeight: "700", color: "#92400e", marginBottom: 4, fontSize: 13 },
  infoText: { color: "#b45309", fontSize: 12, lineHeight: 18 }
});
