import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOKENS } from '../theme/tokens';

export interface ProjectSite {
  _id: string;
  sender_name: string;
  location?: { lat?: number; long?: number; address?: string };
  clientId?: string;
  city?: string;
  distance?: number;
}

interface SitePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  projects: ProjectSite[];
  selectedSite: ProjectSite | null;
  onSelectSite: (site: ProjectSite) => void;
}

const EmptyState = ({ text }: { text: string }) => (
  <View style={{ padding: 24, alignItems: 'center' }}>
    <Ionicons name="search-outline" size={36} color="#cbd5e1" />
    <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>{text}</Text>
  </View>
);

export const SitePickerSheet: React.FC<SitePickerSheetProps> = ({
  visible,
  onClose,
  projects,
  selectedSite,
  onSelectSite,
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Available Sites</Text>
              <Text style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                Sorted by distance from your location
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle" size={26} color="#64748b" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {projects.length === 0 ? (
              <EmptyState text="No active sites available" />
            ) : (
              projects.map((p, i) => (
                <TouchableOpacity
                  key={p._id ?? i}
                  onPress={async () => {
                    onSelectSite(p);
                    onClose();
                    await AsyncStorage.setItem('selected_site', JSON.stringify(p));
                  }}
                  style={[
                    styles.pickerItem,
                    i === 0 && { borderLeftWidth: 3, borderLeftColor: TOKENS.colors.secondary },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.pickerItemTitle}>{p.sender_name}</Text>
                      {i === 0 && (
                        <View style={styles.nearestBadge}>
                          <Text style={styles.nearestText}>NEAREST</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.pickerItemSub}>{p.city ?? 'Site Location'}</Text>
                  </View>
                  <View style={[styles.distanceBadge, i === 0 && { backgroundColor: '#dcfce7' }]}>
                    <Text style={[styles.distanceText, i === 0 && { color: TOKENS.colors.secondary }]}>
                      {p.distance! > 1000
                        ? `${(p.distance! / 1000).toFixed(1)} km`
                        : `${Math.round(p.distance!)} m`}
                    </Text>
                  </View>
                  {selectedSite?._id === p._id && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={TOKENS.colors.secondary}
                      style={{ marginLeft: 8 }}
                    />
                  )}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: TOKENS.colors.background.white,
    borderTopLeftRadius: TOKENS.radius.xl,
    borderTopRightRadius: TOKENS.radius.xl,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: TOKENS.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border.dark,
  },
  modalTitle: {
    fontSize: TOKENS.typography.size.lg,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.dark,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: TOKENS.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  pickerItemTitle: {
    fontSize: TOKENS.typography.size.md,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.dark,
  },
  pickerItemSub: {
    fontSize: TOKENS.typography.size.sm,
    color: TOKENS.colors.text.secondaryDark,
    marginTop: 2,
  },
  nearestBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  nearestText: {
    fontSize: 9,
    fontWeight: TOKENS.typography.weight.extrabold,
    color: TOKENS.colors.secondary,
  },
  distanceBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: TOKENS.radius.md,
  },
  distanceText: {
    fontSize: TOKENS.typography.size.xs,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.secondaryDark,
  },
});
