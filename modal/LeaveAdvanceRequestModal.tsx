/**
 * LeaveAdvanceRequestModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal for staff to request leave or advance with predefined templates.
 * Sends requests via chat interface to HR/Admin.
 */

import { appService } from '@/UtilServices/appHelper';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface LeaveAdvanceRequestModalProps {
  visible: boolean;
  onClose: () => void;
  token: string;
  userId: string;
  userName: string;
  dbName: string;
  onSubmit?: (type: 'leave' | 'advance', data: any) => void;
}

type RequestType = 'leave' | 'advance' | null;
type LeaveType = 'casual' | 'sick' | 'earned' | 'other';

interface LeaveRequest {
  leaveType: LeaveType;
  fromDate: Date;
  toDate: Date;
  reason: string;
  ratePerDay?: number;
}

interface AdvanceRequest {
  amount: number;
  reason: string;
  fromDate?: Date;
}

const LEAVE_TEMPLATES = [
  { type: 'casual' as LeaveType, label: 'Casual Leave', color: '#3B82F6' },
  { type: 'sick' as LeaveType, label: 'Sick Leave', color: '#EF4444' },
  { type: 'earned' as LeaveType, label: 'Earned Leave', color: '#10B981' },
  { type: 'other' as LeaveType, label: 'Other', color: '#8B5CF6' },
];

export const LeaveAdvanceRequestModal: React.FC<LeaveAdvanceRequestModalProps> = ({
  visible,
  onClose,
  token,
  userId,
  userName,
  dbName,
  onSubmit,
}) => {
  const [requestType, setRequestType] = useState<RequestType>(null);
  const [loading, setLoading] = useState(false);

  // Leave state
  const [leaveRequest, setLeaveRequest] = useState<LeaveRequest>({
    leaveType: 'casual',
    fromDate: new Date(),
    toDate: new Date(),
    reason: '',
    ratePerDay: 0,
  });
  const [showFromDatePicker, setShowFromDatePicker] = useState(false);
  const [showToDatePicker, setShowToDatePicker] = useState(false);

  // Advance state
  const [advanceRequest, setAdvanceRequest] = useState<AdvanceRequest>({
    amount: 0,
    reason: '',
    fromDate: new Date(),
  });
  const [showAdvanceDatePicker, setShowAdvanceDatePicker] = useState(false);

  // Reset state when modal closes
  const handleClose = () => {
    setRequestType(null);
    setLeaveRequest({
      leaveType: 'casual',
      fromDate: new Date(),
      toDate: new Date(),
      reason: '',
      ratePerDay: 0,
    });
    setAdvanceRequest({
      amount: 0,
      reason: '',
      fromDate: new Date(),
    });
    onClose();
  };

  // Format date for display
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Calculate leave days
  const getLeafeDays = (): number => {
    const diffTime = leaveRequest.toDate.getTime() - leaveRequest.fromDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both days
    return Math.max(1, diffDays);
  };

  // Handle leave date selection
  const handleFromDateChange = (event: any, date?: Date) => {
    setShowFromDatePicker(false);
    if (date) {
      setLeaveRequest((prev) => ({
        ...prev,
        fromDate: date,
        toDate: date >= prev.toDate ? date : prev.toDate,
      }));
    }
  };

  const handleToDateChange = (event: any, date?: Date) => {
    setShowToDatePicker(false);
    if (date) {
      setLeaveRequest((prev) => ({
        ...prev,
        toDate: date < prev.fromDate ? prev.fromDate : date,
      }));
    }
  };

  const handleAdvanceDateChange = (event: any, date?: Date) => {
    setShowAdvanceDatePicker(false);
    if (date) {
      setAdvanceRequest((prev) => ({
        ...prev,
        fromDate: date,
      }));
    }
  };

  // Submit leave request
  const submitLeaveRequest = async () => {
    if (!leaveRequest.reason.trim()) {
      Alert.alert('Required', 'Please provide a reason for leave.');
      return;
    }

    setLoading(true);
    try {
      const leaveDays = getLeafeDays();
      const totalAmount = (leaveRequest.ratePerDay || 0) * leaveDays;
      const message =
        `📋 LEAVE REQUEST\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Leave Type: ${leaveRequest.leaveType.charAt(0).toUpperCase() + leaveRequest.leaveType.slice(1)}\n` +
        `From Date: ${formatDate(leaveRequest.fromDate)}\n` +
        `To Date: ${formatDate(leaveRequest.toDate)}\n` +
        `Total Days: ${leaveDays}\n` +
        `Rate Per Day: ₹${leaveRequest.ratePerDay || 0}\n` +
        `Total Amount: ₹${totalAmount}\n` +
        `Reason: ${leaveRequest.reason}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Request ID: ${Date.now()}\n` +
        `Requested By: ${userName}\n\n` +
        `Please review and approve this request.`;

      // Get HR/Admin list to send to
      const staffRes = await appService.httpClient.get('service/staff', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (staffRes.data?.success) {
        const hrAdmins = (staffRes.data.data as any[]).filter(
          (u) => u.userRole === 'userAdmin' || u.userRole === 'CorpAdmin' || u.userRole === 'HR'
        );

        if (hrAdmins.length === 0) {
          Alert.alert('Error', 'No HR/Admin found to send request to.');
          setLoading(false);
          return;
        }

        // Send to all HR/Admins
        await Promise.all(
          hrAdmins.map((admin) =>
            appService.httpClient.post(
              'service/chat/send',
              {
                senderName: userName,
                senderId: userId,
                text: message,
                type: 'text',
                isOneToOne: true,
                receiverId: admin._id,
              },
              { headers: { Authorization: `Bearer ${token}` } }
            )
          )
        );

        Alert.alert('Success', 'Leave request submitted to HR.');
        onSubmit?.('leave', leaveRequest);
        handleClose();
      }
    } catch (error) {
      console.error('Error submitting leave request:', error);
      Alert.alert('Error', 'Failed to submit leave request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Submit advance request
  const submitAdvanceRequest = async () => {
    if (advanceRequest.amount <= 0) {
      Alert.alert('Required', 'Please enter a valid advance amount.');
      return;
    }

    if (!advanceRequest.reason.trim()) {
      Alert.alert('Required', 'Please provide a purpose/reason for advance.');
      return;
    }

    setLoading(true);
    try {
      const message =
        `💰 ADVANCE REQUEST\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Amount Requested: ₹${advanceRequest.amount}\n` +
        `Request Date: ${formatDate(advanceRequest.fromDate || new Date())}\n` +
        `Purpose: ${advanceRequest.reason}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Request ID: ${Date.now()}\n` +
        `Requested By: ${userName}\n\n` +
        `Please review and approve this request.`;

      // Get HR/Admin list to send to
      const staffRes = await appService.httpClient.get('service/staff', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (staffRes.data?.success) {
        const hrAdmins = (staffRes.data.data as any[]).filter(
          (u) => u.userRole === 'userAdmin' || u.userRole === 'CorpAdmin' || u.userRole === 'HR'
        );

        if (hrAdmins.length === 0) {
          Alert.alert('Error', 'No HR/Admin found to send request to.');
          setLoading(false);
          return;
        }

        // Send to all HR/Admins
        await Promise.all(
          hrAdmins.map((admin) =>
            appService.httpClient.post(
              'service/chat/send',
              {
                senderName: userName,
                senderId: userId,
                text: message,
                type: 'text',
                isOneToOne: true,
                receiverId: admin._id,
              },
              { headers: { Authorization: `Bearer ${token}` } }
            )
          )
        );

        Alert.alert('Success', 'Advance request submitted to HR.');
        onSubmit?.('advance', advanceRequest);
        handleClose();
      }
    } catch (error) {
      console.error('Error submitting advance request:', error);
      Alert.alert('Error', 'Failed to submit advance request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {requestType === null && 'Request Type'}
              {requestType === 'leave' && 'Leave Request'}
              {requestType === 'advance' && 'Advance Request'}
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color="#0f172a" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Request Type Selection */}
            {requestType === null && (
              <View>
                <Text style={styles.sectionLabel}>Select Request Type</Text>

                <TouchableOpacity
                  onPress={() => setRequestType('leave')}
                  style={[styles.requestCard, { borderLeftColor: '#FFA500' }]}
                >
                  <View style={styles.requestCardIconContainer}>
                    <Ionicons name="calendar" size={28} color="#FFA500" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.requestCardTitle}>Request Leave</Text>
                    <Text style={styles.requestCardDesc}>
                      Apply for casual, sick, or earned leave with dates and reason
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setRequestType('advance')}
                  style={[styles.requestCard, { borderLeftColor: '#0284c7' }]}
                >
                  <View style={styles.requestCardIconContainer}>
                    <Ionicons name="cash" size={28} color="#0284c7" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.requestCardTitle}>Request Advance</Text>
                    <Text style={styles.requestCardDesc}>
                      Request salary advance with amount and reason
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            )}

            {/* Leave Request Form */}
            {requestType === 'leave' && (
              <View>
                <Text style={styles.sectionLabel}>Leave Type</Text>
                <View style={styles.leaveTypeGrid}>
                  {LEAVE_TEMPLATES.map((template) => (
                    <TouchableOpacity
                      key={template.type}
                      onPress={() =>
                        setLeaveRequest((prev) => ({ ...prev, leaveType: template.type }))
                      }
                      style={[
                        styles.leaveTypeButton,
                        leaveRequest.leaveType === template.type && {
                          backgroundColor: template.color,
                          borderColor: template.color,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.leaveTypeButtonText,
                          leaveRequest.leaveType === template.type && { color: '#fff' },
                        ]}
                      >
                        {template.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.sectionLabel, { marginTop: 16 }]}>From Date</Text>
                <TouchableOpacity
                  onPress={() => setShowFromDatePicker(true)}
                  style={styles.dateField}
                >
                  <Ionicons name="calendar" size={18} color="#0284c7" />
                  <Text style={styles.dateFieldText}>{formatDate(leaveRequest.fromDate)}</Text>
                </TouchableOpacity>

                {showFromDatePicker && (
                  <DateTimePicker
                    value={leaveRequest.fromDate}
                    mode="date"
                    display="default"
                    onChange={handleFromDateChange}
                  />
                )}

                <Text style={[styles.sectionLabel, { marginTop: 12 }]}>To Date</Text>
                <TouchableOpacity
                  onPress={() => setShowToDatePicker(true)}
                  style={styles.dateField}
                >
                  <Ionicons name="calendar" size={18} color="#0284c7" />
                  <Text style={styles.dateFieldText}>{formatDate(leaveRequest.toDate)}</Text>
                </TouchableOpacity>

                {showToDatePicker && (
                  <DateTimePicker
                    value={leaveRequest.toDate}
                    mode="date"
                    display="default"
                    onChange={handleToDateChange}
                  />
                )}

                <View style={styles.infoBox}>
                  <Ionicons name="information-circle" size={16} color="#0284c7" />
                  <Text style={styles.infoBoxText}>Total Leave Days: {getLeafeDays()}</Text>
                </View>

                <Text style={[styles.sectionLabel, { marginTop: 12 }]}>
                  Rate Per Day (Optional)
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter rate per day (e.g., 500)"
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                  value={leaveRequest.ratePerDay?.toString() ?? ''}
                  onChangeText={(text) =>
                    setLeaveRequest((prev) => ({
                      ...prev,
                      ratePerDay: text ? parseFloat(text) : 0,
                    }))
                  }
                />

                <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Reason</Text>
                <TextInput
                  style={[styles.input, { minHeight: 80 }]}
                  placeholder="Enter reason for leave"
                  placeholderTextColor="#94a3b8"
                  multiline
                  numberOfLines={4}
                  value={leaveRequest.reason}
                  onChangeText={(text) => setLeaveRequest((prev) => ({ ...prev, reason: text }))}
                />
              </View>
            )}

            {/* Advance Request Form */}
            {requestType === 'advance' && (
              <View>
                <Text style={styles.sectionLabel}>Advance Amount</Text>
                <View style={styles.amountInputContainer}>
                  <Text style={styles.currencySymbol}>₹</Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={advanceRequest.amount?.toString() ?? ''}
                    onChangeText={(text) =>
                      setAdvanceRequest((prev) => ({
                        ...prev,
                        amount: text ? parseFloat(text) : 0,
                      }))
                    }
                  />
                </View>

                <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Requested Date</Text>
                <TouchableOpacity
                  onPress={() => setShowAdvanceDatePicker(true)}
                  style={styles.dateField}
                >
                  <Ionicons name="calendar" size={18} color="#0284c7" />
                  <Text style={styles.dateFieldText}>
                    {formatDate(advanceRequest.fromDate || new Date())}
                  </Text>
                </TouchableOpacity>

                {showAdvanceDatePicker && (
                  <DateTimePicker
                    value={advanceRequest.fromDate || new Date()}
                    mode="date"
                    display="default"
                    onChange={handleAdvanceDateChange}
                  />
                )}

                <View style={styles.infoBox}>
                  <Ionicons name="information-circle" size={16} color="#0284c7" />
                  <Text style={styles.infoBoxText}>Amount: ₹{advanceRequest.amount || 0}</Text>
                </View>

                <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Purpose</Text>
                <TextInput
                  style={[styles.input, { minHeight: 80 }]}
                  placeholder="Enter purpose for advance (e.g., Medical emergency, Personal need, Travel)"
                  placeholderTextColor="#94a3b8"
                  multiline
                  numberOfLines={4}
                  value={advanceRequest.reason}
                  onChangeText={(text) => setAdvanceRequest((prev) => ({ ...prev, reason: text }))}
                />
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            {requestType !== null && (
              <TouchableOpacity
                onPress={() => setRequestType(null)}
                style={[styles.button, { backgroundColor: '#e2e8f0' }]}
              >
                <Text style={[styles.buttonText, { color: '#0f172a' }]}>Back</Text>
              </TouchableOpacity>
            )}

            {requestType === null ? (
              <TouchableOpacity onPress={handleClose} style={[styles.button, { flex: 1 }]}>
                <Text style={styles.buttonText}>Close</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={requestType === 'leave' ? submitLeaveRequest : submitAdvanceRequest}
                disabled={loading}
                style={[
                  styles.button,
                  { flex: 1, backgroundColor: loading ? '#94a3b8' : '#10b981' },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Submit Request</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
  },
  container: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    maxHeight: '85%',
    flexDirection: 'column',
    marginTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  requestCardIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  requestCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  requestCardDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 3,
    lineHeight: 16,
  },
  leaveTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  leaveTypeButton: {
    flex: 0.48,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
  },
  leaveTypeButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dateFieldText: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
    marginLeft: 8,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    gap: 8,
  },
  infoBoxText: {
    fontSize: 12,
    color: '#0284c7',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    color: '#0f172a',
    fontSize: 14,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0284c7',
    paddingLeft: 12,
  },
  amountInput: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default LeaveAdvanceRequestModal;
