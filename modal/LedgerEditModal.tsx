import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { appService } from '@/UtilServices/appHelper';
import { COLORS } from '@/styles/stylesIndex';
import { S } from '@/styles/styledashboard';
import { updateLedger } from '@/api/ledger';
import { Picker } from '@react-native-picker/picker';

interface LedgerEditModalProps {
  visible: boolean;
  onClose: () => void;
  ledger: any; // ledger object containing at least _id, ledgerName, openingBalance, ledgerGroupId
  onSaved: () => void; // callback after successful save
}

export const LedgerEditModal: React.FC<LedgerEditModalProps> = ({ visible, onClose, ledger, onSaved }) => {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Load groups on mount
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const res = await appService.httpClient.get('service/finance/groups');
        if (res.data?.success) {
          setGroups(res.data.data);
        }
      } catch (err: any) {
        console.error('Failed to fetch groups', err.message);
      }
    };
    fetchGroups();
  }, []);

  // Populate fields when ledger changes or modal opens
  useEffect(() => {
    if (ledger) {
      setName(ledger.ledgerName || '');
      setGroupId(ledger.ledgerGroupId || '');
      setOpeningBalance(String(ledger.openingBalance ?? 0));
    }
  }, [ledger, visible]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Ledger name cannot be empty');
      return;
    }
    setLoading(true);
    try {
      const payload: any = { ledgerName: name.trim() };
      if (groupId) payload.group = groupId; // backend accepts group name or id; we'll send id for safety
      if (openingBalance !== undefined) payload.openingBalance = parseFloat(openingBalance) || 0;
      await updateLedger(ledger._id, payload);
      Alert.alert('Success', 'Ledger updated successfully');
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Update ledger error', err.message);
      Alert.alert('Error', err.message || 'Failed to update ledger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={S.dashModalOverlay}>
        <View style={[S.dashModalContent, { maxHeight: '90%', width: '95%' }]}>
          <View style={S.dashDetailHeader}>
            <Text style={S.dashModalTitle}>Edit Ledger</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle" size={28} color="#64748b" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <View style={localStyles.inputGroup}>
              <Text style={localStyles.inputLabel}>Ledger Name</Text>
              <TextInput
                style={localStyles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter ledger name"
              />
            </View>
            <View style={localStyles.inputGroup}>
              <Text style={localStyles.inputLabel}>Group</Text>
              <View style={localStyles.pickerWrapper}>
                <Picker selectedValue={groupId} onValueChange={(val) => setGroupId(val)}>
                  {groups.map((g) => (
                    <Picker.Item key={g._id} label={g.groupName} value={g._id} />
                  ))}
                </Picker>
              </View>
            </View>
            <View style={localStyles.inputGroup}>
              <Text style={localStyles.inputLabel}>Opening Balance</Text>
              <TextInput
                style={localStyles.input}
                value={openingBalance}
                onChangeText={setOpeningBalance}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 24 }}>
              <TouchableOpacity style={localStyles.button} onPress={handleSave} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={localStyles.buttonText}>Save</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={[localStyles.button, localStyles.buttonSecondary]} onPress={onClose} disabled={loading}>
                <Text style={[localStyles.buttonText, { color: '#475569' }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const localStyles = StyleSheet.create({
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    minWidth: 80,
  },
  buttonSecondary: {
    backgroundColor: '#e2e8f0',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
