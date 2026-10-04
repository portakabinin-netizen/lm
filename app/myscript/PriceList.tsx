import { useState } from "react";
import { FlatList, SafeAreaView, StyleSheet, Text, View } from "react-native";
import uuid from 'react-native-uuid';

// Sample JSON data
const panelData = {
  WallPanels: {
    SupplierInfo: [
      {
        CompanyName: "ABC Steel Traders",
        ContactPersonName: "Ramesh Kumar",
        ContactNumber: "9876543210",
        Brand: {
          JSW: {
            "0.45mm": { CoreThickness: "40mm", Rate: "1100" },
            "0.50mm": { CoreThickness: "50mm", Rate: "1150" }
          },
          "AM/NS": {
            "0.45mm": { CoreThickness: "40mm", Rate: "1120" },
            "0.50mm": { CoreThickness: "50mm", Rate: "1170" }
          }
        }
      },
      {
        CompanyName: "XYZ PUF Solutions",
        ContactPersonName: "Sanjay Patel",
        ContactNumber: "9123456780",
        Brand: {
          JSW: {
            "0.40mm": { CoreThickness: "30mm", Rate: "1050" }
          },
          "AM/NS": {
            "0.45mm": { CoreThickness: "30mm", Rate: "1080" }
          }
        }
      }
    ]
  },
  RoofPanels: {
    SupplierInfo: [
      {
        CompanyName: "Prime Roof Panels",
        ContactPersonName: "Karan Shah",
        ContactNumber: "9822456789",
        Brand: {
          JSW: {
            "0.50mm": { CoreThickness: "35mm", Rate: "1300" },
            "0.55mm": { CoreThickness: "40mm", Rate: "1350" }
          },
          "AM/NS": {
            "0.50mm": { CoreThickness: "35mm", Rate: "1320" },
            "0.55mm": { CoreThickness: "40mm", Rate: "1370" }
          }
        }
      },
      {
        CompanyName: "RoofTech Solutions",
        ContactPersonName: "Anil Mehta",
        ContactNumber: "9876543211",
        Brand: {
          JSW: {
            "0.45mm": { CoreThickness: "30mm", Rate: "1250" }
          },
          "AM/NS": {
            "0.45mm": { CoreThickness: "30mm", Rate: "1270" }
          }
        }
      }
    ]
  }
};

export default function RateScreen() {
  const [data] = useState(panelData);

  // Render each coil-core row
  const renderCoilCore = (coilThickness: string, details: { CoreThickness: string; Rate: string }) => {
    const id = uuid.v4().toString();
    return (
      <View key={id} style={styles.coilRow}>
        <Text style={styles.cell}>{coilThickness}</Text>
        <Text style={styles.cell}>{details.CoreThickness}</Text>
        <Text style={styles.cell}>{details.Rate}</Text>
      </View>
    );
  };

  // Render each supplier
  const renderSupplier = (supplier: any, index: number) => (
    <View key={index} style={styles.supplierContainer}>
      <Text style={styles.supplierTitle}>
        {supplier.CompanyName} - {supplier.ContactPersonName}
      </Text>

      {Object.keys(supplier.Brand).map((brandName) => (
        <View key={brandName} style={styles.brandContainer}>
          <Text style={styles.brandTitle}>{brandName}</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.cell}>Coil Thickness</Text>
            <Text style={styles.cell}>Core Thickness</Text>
            <Text style={styles.cell}>Rate</Text>
          </View>
          {Object.entries(supplier.Brand[brandName]).map(([coilThickness, details]) =>
            renderCoilCore(coilThickness, details as any)
          )}
        </View>
      ))}
    </View>
  );

  // Render each product panel
  const renderProduct = ([productName, product]: [string, any]) => (
    <View key={productName} style={styles.productContainer}>
      <Text style={styles.productTitle}>{productName}</Text>
      {product.SupplierInfo.map((supplier: any, index: number) => renderSupplier(supplier, index))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={Object.entries(data)}
        keyExtractor={([productName]) => productName}
        renderItem={({ item }) => renderProduct(item)}
      />
    </SafeAreaView>
  );
}

// Styles
const styles = StyleSheet.create({
  container: { flex: 1, padding: 10, backgroundColor: "#f5f5f5" },
  productContainer: { marginBottom: 20 },
  productTitle: { fontSize: 22, fontWeight: "bold", marginBottom: 10 },
  supplierContainer: { marginBottom: 15, backgroundColor: "#fff", padding: 10, borderRadius: 8 },
  supplierTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  brandContainer: { marginBottom: 10, paddingLeft: 10 },
  brandTitle: { fontSize: 15, fontWeight: "500", marginBottom: 5 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, paddingBottom: 5, marginBottom: 5 },
  coilRow: { flexDirection: "row", marginBottom: 3 },
  cell: { flex: 1, fontSize: 14 }
});
