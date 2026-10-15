import React, { useState, useEffect } from 'react';
import { 
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView, 
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { appService } from '@/UtilServices/appHelper';
import { StatePicker } from '@/UtilServices/StatePicker';
import { DistrictPicker } from '@/UtilServices/DistrictPicker';
import { COLORS, GS, wfStyles } from '@/styles/stylesIndex';
import { S as dashStyles } from '@/styles/styledashboard';

interface AddClientModalProps {
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
  client?: any; // If provided, we are in Edit Mode
}

export const AddClientModal: React.FC<AddClientModalProps> = ({
  visible, onClose, onComplete, client
}) => {
  const [name, setName] = useState(client?.name || '');
  const [contactPerson, setContactPerson] = useState(client?.contact_person || '');
  const [mobile, setMobile] = useState(client?.mobile || '');
  const [email, setEmail] = useState(client?.email || '');
  const [gst, setGst] = useState(client?.gst || '');
  const [pan, setPan] = useState(client?.pan || '');

  // Address
  const [line1, setLine1] = useState(client?.billingAddress?.line1 || '');
  const [city, setCity] = useState(client?.billingAddress?.city || '');
  const [district, setDistrict] = useState(client?.billingAddress?.district || '');
  const [state, setState] = useState(client?.billingAddress?.state || '');
  const [pin, setPin] = useState(client?.billingAddress?.pincode || '');

  // Pickers
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [showDistrictPicker, setShowDistrictPicker] = useState(false);
  const [stateCode, setStateCode] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (client) {
      setName(client.name || '');
      setContactPerson(client.contact_person || '');
      setMobile(client.mobile || '');
      setEmail(client.email || '');
      setGst(client.gst || '');
      setPan(client.pan || '');
      setLine1(client.billingAddress?.line1 || '');
      setCity(client.billingAddress?.city || '');
      setDistrict(client.billingAddress?.district || '');
      setState(client.billingAddress?.state || '');
      setPin(client.billingAddress?.pincode || '');
    } else {
      setName('');
      setContactPerson('');
      setMobile('');
      setEmail('');
      setGst('');
      setPan('');
      setLine1('');
      setCity('');
      setDistrict('');
      setState('');
      setPin('');
    }
  }, [client, visible]);

  const handleSave = async () => {
    if (!name || !mobile) {
      Alert.alert("Missing Info", "Name and Mobile are required.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name,
        contact_person: contactPerson,
        mobile,
        email,
        gst,
        pan,
        type: "Client",
        billingAddress: {
          line1,
          city,
          district,
          state,
          pincode: pin
        }
      };

      let res;
      if (client?._id) {
        res = await appService.httpClient.put(`service/parties/${client._id}`, payload);
      } else {
        res = await appService.httpClient.post('service/parties', payload);
      }

      if (res.data?.success) {
        appService.showToast(client ? "Client updated!" : "Client added!", "Success");
        onComplete();
        onClose();
      }
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={dashStyles.dashModalOverlay}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={dashStyles.dashModalContent}
        >
          <View style={dashStyles.dashDetailHeader}>
            <View style={[dashStyles.row, dashStyles.justifyBetween, dashStyles.alignCenter]}>
              <Text style={dashStyles.dashModalTitle}>{client ? 'Edit Client' : 'Add New Client'}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close-circle" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
            <View style={GS.inputGroup}>
               <Text style={GS.inputLabel}>Corporate / Client Name</Text>
               <TextInput
                 style={wfStyles.wfFormInput}
                 placeholder="Full Name"
                 value={name}
                 onChangeText={setName}
               />
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
               <View style={{ flex: 1 }}>
                  <Text style={GS.inputLabel}>Contact Person</Text>
                  <TextInput
                    style={wfStyles.wfFormInput}
                    placeholder="Manager name"
                    value={contactPerson}
                    onChangeText={setContactPerson}
                  />
               </View>
               <View style={{ flex: 1 }}>
                  <Text style={GS.inputLabel}>Mobile Number</Text>
                  <TextInput
                    style={wfStyles.wfFormInput}
                    placeholder="10 Digits"
                    keyboardType="numeric"
                    value={mobile}
                    onChangeText={setMobile}
                  />
               </View>
            </View>

            <View style={{ marginTop: 16 }}>
               <Text style={GS.inputLabel}>Email Address</Text>
               <TextInput
                 style={wfStyles.wfFormInput}
                 placeholder="client@example.com"
                 keyboardType="email-address"
                 autoCapitalize="none"
                 value={email}
                 onChangeText={setEmail}
               />
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
               <View style={{ flex: 1 }}>
                  <Text style={GS.inputLabel}>GST Number (Optional)</Text>
                  <TextInput
                    style={[wfStyles.wfFormInput, { textTransform: 'uppercase' }]}
                    placeholder="GSTIN"
                    value={gst}
                    onChangeText={setGst}
                  />
               </View>
               <View style={{ flex: 1 }}>
                  <Text style={GS.inputLabel}>PAN Number</Text>
                  <TextInput
                    style={[wfStyles.wfFormInput, { textTransform: 'uppercase' }]}
                    placeholder="PAN Card"
                    value={pan}
                    onChangeText={setPan}
                  />
               </View>
            </View>

            <View style={{ marginTop: 24, padding: 16, backgroundColor: '#f1f5f9', borderRadius: 16 }}>
               <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748b', marginBottom: 12 }}>BILLING ADDRESS</Text>
               <TextInput 
                 style={[wfStyles.wfFormInput, { backgroundColor: '#fff', marginBottom: 10 }]} 
                 placeholder="Street / Office No" 
                 value={line1} 
                 onChangeText={setLine1} 
               />
               <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput 
                    style={[wfStyles.wfFormInput, { flex: 1, backgroundColor: '#fff' }]} 
                    placeholder="City" 
                    value={city} 
                    onChangeText={setCity} 
                  />
                  <TouchableOpacity 
                    style={[wfStyles.wfFormInput, { flex: 1, backgroundColor: '#fff', justifyContent: 'center' }]} 
                    onPress={() => setShowDistrictPicker(true)}
                  >
                    <Text style={{ color: district ? '#1e293b' : '#94a3b8', fontSize: 13 }}>{district || "District"}</Text>
                  </TouchableOpacity>
               </View>
               <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <TouchableOpacity 
                    style={[wfStyles.wfFormInput, { flex: 1, backgroundColor: '#fff', justifyContent: 'center' }]} 
                    onPress={() => setShowStatePicker(true)}
                  >
                    <Text style={{ color: state ? '#1e293b' : '#94a3b8', fontSize: 13 }}>{state || "State"}</Text>
                  </TouchableOpacity>
                  <TextInput 
                    style={[wfStyles.wfFormInput, { flex: 1, backgroundColor: '#fff' }]} 
                    placeholder="Pincode" 
                    keyboardType="numeric" 
                    value={pin} 
                    onChangeText={setPin} 
                  />
               </View>
            </View>

            <TouchableOpacity 
              onPress={handleSave} 
              disabled={loading}
              style={[dashStyles.dashSaveBtn, { marginBottom: 40 }]}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{client ? 'UPDATE CLIENT' : 'SAVE CLIENT'}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <StatePicker 
        visible={showStatePicker} 
        onClose={() => setShowStatePicker(false)} 
        onSelect={(name, code) => { setState(name); setStateCode(code); setShowStatePicker(false); }} 
      />
      <DistrictPicker 
        visible={showDistrictPicker} 
        stateCode={stateCode} 
        onClose={() => setShowDistrictPicker(false)} 
        onSelect={(name) => { setDistrict(name); setShowDistrictPicker(false); }} 
      />
    </Modal>
  );
};
