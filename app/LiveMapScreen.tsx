import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import LiveMapScreen from '@/components/LiveMapScreen';

export default function LiveMapRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    workerId?: string;
    workerPhotoUrl?: string;
    workerName?: string;
  }>();

  return (
    <View style={styles.container}>
      {/* Floating back button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-back" size={24} color="#1e293b" />
      </TouchableOpacity>

      {/* Main optimized live tracking map */}
      <LiveMapScreen
        workerId={params.workerId}
        workerPhotoUrl={params.workerPhotoUrl}
        workerName={params.workerName}
        route={{
          params: {
            workerId: params.workerId,
            workerPhotoUrl: params.workerPhotoUrl,
            workerName: params.workerName,
          },
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    backgroundColor: '#ffffff',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});
