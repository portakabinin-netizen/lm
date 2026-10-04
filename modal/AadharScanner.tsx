import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Modal, Alert, Animated } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { parseAadharQR, AadharData } from '@/UtilServices/aadharParser';
import { COLORS } from '@/styles/stylesIndex';

interface AadharScannerProps {
  visible: boolean;
  onClose: () => void;
  onScanned: (data: AadharData) => void;
}

export const AadharScanner: React.FC<AadharScannerProps> = ({ visible, onClose, onScanned }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && !scanned && permission?.granted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(animValue, {
            toValue: 246, // Height of scannerOutline (250) minus laser height
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          })
        ])
      ).start();
    } else {
      animValue.stopAnimation();
      animValue.setValue(0);
    }
  }, [visible, scanned, permission?.granted, animValue]);

  if (!visible) return null;

  if (!permission) {
    // Camera permissions are still loading.
    return (
      <Modal visible={visible} transparent>
        <View style={styles.overlay}>
           <View style={styles.card}>
              <Text style={styles.text}>Requesting camera permission...</Text>
           </View>
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet.
    return (
      <Modal visible={visible} transparent>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={[styles.text, { textAlign: 'center' }]}>We need your permission to show the camera</Text>
            <TouchableOpacity style={styles.btn} onPress={requestPermission}>
               <Text style={styles.btnText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#ccc', marginTop: 10 }]} onPress={onClose}>
               <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    const parsed = parseAadharQR(data);
    if (parsed) {
      onScanned(parsed);
      onClose();
    } else {
      Alert.alert(
        "Invalid Code", 
        "This does not look like a valid Aadhar QR code. Try another one or enter details manually.",
        [{ text: "Try Again", onPress: () => setScanned(false) }]
      );
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ["qr", "pdf417", "datamatrix", "code128", "code39"],
          }}
        />
        
        {/* Overlay Overlay */}
        <View style={styles.uiContainer}>
          <View style={styles.header}>
             <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={28} color="#fff" />
             </TouchableOpacity>
             <Text style={styles.headerText}>Scan Aadhar QR</Text>
          </View>

          <View style={styles.footer}>
             <View style={styles.scannerOutline}>
                {!scanned && (
                  <Animated.View 
                    style={[
                      styles.laserLine, 
                      { transform: [{ translateY: animValue }] }
                    ]} 
                  />
                )}
             </View>
             <Text style={styles.infoText}>Position the Aadhar QR code within the frame</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  uiContainer: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 40,
  },
  headerText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 15,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    alignItems: 'center',
    marginBottom: 100,
  },
  scannerOutline: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 20,
    backgroundColor: 'transparent',
    marginBottom: 30,
    overflow: 'hidden',
  },
  laserLine: {
    width: '100%',
    height: 4,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 5,
  },
  infoText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    borderRadius: 10,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 20,
    width: '80%',
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
    color: '#333',
    marginBottom: 20,
  },
  btn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 10,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
  }
});
