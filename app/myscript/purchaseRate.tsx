import { httpClient } from "@/context/AuthContext";
import * as Print from "expo-print";
import { useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ProductItem, Vendor } from "./interface";

const formatMobile = (mobile: string) => {

  if (!mobile) return "";

  const m = mobile.replace(/\s+/g, ""); 

  if (m.length === 10) return `+91${m}`; 

  if (m.startsWith("+") && m.length === 13) return m;

  if (m.length === 12) return `+${m}`; 

  return m; // 
};

export default function VendorReportUI() {
  const { id } = useLocalSearchParams();
  const [vendor, setVendor] = useState<Vendor | null>(null);
 
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await httpClient.get(`/product/rate/vendor/${id}`);
      setVendor(res.data);
      
    } catch (e) {
      console.log("❌ Fetch Error:", e);
    }
  };
   
  const generateHTML = () => {
    
   if (!vendor) return "";
    

// Usage in component
<Text style={styles.h2}>
  Contact Person: {vendor.contactPerson}{"\n"}
  Mobile: ${formatMobile(vendor.mobileNo)}
</Text>

    let html = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 15px; }
            h1 { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
            h2 { font-size: 14px; margin-bottom: 15px; }
            h3 { font-size: 16px; font-weight: bold; margin-top: 15px; margin-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #000; padding: 6px; text-align: center; font-size: 13px; }
            th { font-weight: bold; }
            td.description { text-align: left; }
          </style>
        </head>
        <body>
          <h1>Vendor Name: ${vendor.vendorName}</h1>
          <h2>Contact Person: ${vendor.contactPerson}</h2>
          <h1>Mobile: ${formatMobile(vendor.mobileNo)}</h1>
    `;

    vendor.productCost.forEach(cat => {
      html += `<h3>Category Name: ${cat.categoryName}</h3>`;
      // Group by productName
      const grouped: Record<string, ProductItem[]> = {};
      cat.products.forEach(p => {
        if (!grouped[p.productName]) grouped[p.productName] = [];
        grouped[p.productName].push(p);
      });

      Object.keys(grouped).forEach(pName => {
        html += `<h4>Product Name: ${pName}</h4>`;
        html += `
          <table>
            <tr>
              <th>Sl No</th>
              <th>Description</th>
              <th>Rate</th>
              <th>UoM</th>
            </tr>
        `;
        grouped[pName].forEach((item, i) => {
          html += `
            <tr>
              <td>${i + 1}</td>
              <td class="description">${item.description}</td>
              <td>${item.price}</td>
              <td>${item.UoM}</td>
            </tr>
          `;
        });
        html += `</table>`;
      });
    });

    html += `</body></html>`;
    return html;
  };

  const handlePDF = async () => {
    const html = generateHTML();
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  };

  if (!vendor) return <Text style={{ marginTop: 50, textAlign: "center" }}>Loading...</Text>;

  return (
    <ScrollView style={{ backgroundColor: "#fff", padding: 30 }}>
      <Text style={styles.h1}>{vendor.vendorName}</Text>
      <Text style={styles.h2}>
        Contact Person: {vendor.contactPerson}{"\n"}
        Mobile: {formatMobile(vendor.mobileNo)}
      </Text>
      <View style={styles.hr} />

      {vendor.productCost.map((cat, ci) => {
        const grouped: Record<string, ProductItem[]> = {};
        cat.products.forEach(p => {
          if (!grouped[p.productName]) grouped[p.productName] = [];
          grouped[p.productName].push(p);
        });

        return (
          <View key={ci} style={{ marginBottom: 25 }}>
            <Text style={styles.cat}>Category Name: {cat.categoryName}</Text>
            {Object.keys(grouped).map((pName, pi) => (
              <View key={pi} style={{ marginTop: 10 }}>
                <Text style={styles.pname}>Product Name: {pName}</Text>
                <View style={styles.table}>
                  <View style={styles.tr}>
                    <Text style={[styles.th, styles.colSl]}>Sl No</Text>
                    <Text style={[styles.th, styles.colDesc]}>Description</Text>
                    <Text style={[styles.th, styles.colRate]}>Rate</Text>
                    <Text style={[styles.th, styles.colUom]}>UoM</Text>
                  </View>
                  {grouped[pName].map((item, i) => (
                    <View key={i} style={styles.tr}>
                      <Text style={[styles.td, styles.colSl]}>{i + 1}</Text>
                      <Text style={[styles.td, styles.colDesc]}>{item.description}</Text>
                      <Text style={[styles.td, styles.colRate]}>{item.price}</Text>
                      <Text style={[styles.td, styles.colUom]}>{item.UoM}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        );
      })}

      <TouchableOpacity style={styles.btnPDF} onPress={handlePDF}>
        <Text style={styles.btnText}>Export PDF & Share</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 20, fontWeight: "800", marginTop: 10 },
  h2: { fontSize: 14, marginBottom: 8 },
  hr: { borderBottomWidth: 1, opacity: 0.4, marginBottom: 15 },
  cat: { fontSize: 17, fontWeight: "700" },
  pname: { fontSize: 15, fontWeight: "600", marginBottom: 5 },

  table: { borderWidth: 1, borderColor: "#000", borderRadius: 2, overflow: "hidden" },
  
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#000",
    alignItems: "stretch", // important for vertical stretch
  },

  th: {
    padding: 6,
    fontSize: 13,
    fontWeight: "bold",
    borderRightWidth: 1,
    borderColor: "#000",
    textAlign: "center",
  },

  td: {
    padding: 6,
    fontSize: 13,
    borderRightWidth: 1,
    borderColor: "#000",
    textAlign: "center",
  },

  /* Column widths and alignment */
  colSl: { width: 50, textAlign: "left", borderRightWidth: 1, borderColor: "#000" },
  colDesc: { flex: 1, textAlign: "left", borderRightWidth: 1, borderColor: "#000", flexWrap: "wrap" },
  colRate: { width: 70, textAlign: "right", borderRightWidth: 1, borderColor: "#000" },
  colUom: { width: 60, textAlign: "center", borderRightWidth: 0 },

  btnPDF: { marginTop: 20, backgroundColor: "#007bff", padding: 10, borderRadius: 6, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "600" },
});

