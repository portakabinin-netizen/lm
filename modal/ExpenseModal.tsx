import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { appService } from '../UtilServices/appHelper';
import { COLORS } from '@/styles/stylesIndex';

interface ExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  lead: any;
  leads?: any[];
  onComplete: () => void;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  visible, onClose, lead, onComplete
}) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [txnType, setTxnType] = useState('labour_charge'); // Default for project work

  const handleSave = async () => {
    if (!amount || isNaN(Number(amount))) {
      Alert.alert("Required", "Please enter a valid amount.");
      return;
    }
    if (!description) {
      Alert.alert("Required", "Please enter a short description.");
      return;
    }

    setLoading(true);
    try {
      const session = await appService.getSession();
      if (!session?.token) return;

      const payload = {
        txn_type: txnType,
        amount: Number(amount),
        description: description,
        leadId: lead._id,
        txn_date: new Date(),
        payment_mode: "Cash", // Default for field ops
        payment_status: "Paid",
      };

      const res = await appService.httpClient.post('payment/create', payload, {
        headers: { Authorization: `Bearer ${session.token}` }
      });

      if (res.data.success) {
        appService.showToast("Expense recorded!", "Success");
        onComplete();
        onClose();
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save expense");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Post Operational Expense</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.leadBox}>
              <Text style={styles.label}>Project / Lead</Text>
              <Text style={styles.value}>{lead?.sender_name}</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Amount (INR)</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={styles.descInput}
                placeholder="What was this expense for?"
                multiline
                numberOfLines={3}
                value={description}
                onChangeText={setDescription}
              />
            </View>

            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, txnType === 'labour_charge' && styles.typeActive]}
                onPress={() => setTxnType('labour_charge')}
              >
                <Text style={[styles.typeText, txnType === 'labour_charge' && styles.typeTextActive]}>Labour</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeBtn, txnType === 'freight_cartage' && styles.typeActive]}
                onPress={() => setTxnType('freight_cartage')}
              >
                <Text style={[styles.typeText, txnType === 'freight_cartage' && styles.typeTextActive]}>Freight</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeBtn, txnType === 'misc_expense' && styles.typeActive]}
                onPress={() => setTxnType('misc_expense')}
              >
                <Text style={[styles.typeText, txnType === 'misc_expense' && styles.typeTextActive]}>Misc</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.saveBtn, loading && styles.disabledBtn]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={20} color="#fff" />
                  <Text style={styles.saveBtnText}>Record Payment</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: '#fff'
  },
  container: {
    backgroundColor: '#fff', flex: 1
  },
  header: {
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  },
  title: {
    fontSize: 18, fontWeight: '700', color: '#334155'
  },
  body: {
    padding: 20
  },
  leadBox: {
    marginBottom: 20, backgroundColor: '#f8fafc', padding: 15, borderRadius: 15
  },
  label: {
    fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2
  },
  value: {
    fontSize: 16, fontWeight: '600', color: '#0f172a'
  },
  inputGroup: {
    marginBottom: 20
  },
  inputLabel: {
    fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 8
  },
  amountInput: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, height: 50, paddingHorizontal: 15, fontSize: 18, fontWeight: '700', color: COLORS.primary
  },
  descInput: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, height: 80, paddingHorizontal: 15, paddingTop: 12, fontSize: 14, color: '#333', textAlignVertical: 'top'
  },
  typeRow: {
    flexDirection: 'row', gap: 10, marginBottom: 20
  },
  typeBtn: {
    flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center'
  },
  typeActive: {
    backgroundColor: COLORS.primary + '10', borderColor: COLORS.primary
  },
  typeText: {
    color: '#64748b', fontSize: 13, fontWeight: '600'
  },
  typeTextActive: {
    color: COLORS.primary
  },
  footer: {
    padding: 20, borderTopWidth: 1, borderTopColor: '#eee'
  },
  saveBtn: {
    backgroundColor: COLORS.primary, padding: 16, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center'
  },
  disabledBtn: {
    opacity: 0.7
  },
  saveBtnText: {
    color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 10
  }
});
