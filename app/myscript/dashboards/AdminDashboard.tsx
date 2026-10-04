import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const AdminDashboard = ({ user }: any) => {
  return (
    <View style={localStyles.container}>
      <Text style={localStyles.title}>Admin Control Center</Text>
      <View style={localStyles.card}>
        <Text>Company: {user.corporateName}</Text>
        <Text>Status: Active</Text>
      </View>
      {/* Add your Total Leads, Active Users stats cards here */}
    </View>
  );
};

const localStyles = StyleSheet.create({
  container: { flex: 1, padding: 10 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, padding: 50 , marginTop:100 },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 10, elevation: 2 }
});

export default AdminDashboard;