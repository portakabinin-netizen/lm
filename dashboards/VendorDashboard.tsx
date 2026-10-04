import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, styles as G } from '@/styles/stylesIndex';

const VendorDashboard = ({ token, userId, name }: any) => {
    return (
        <ScrollView style={[G.flex1, { backgroundColor: '#f8fafc' }] as any}>
            <View style={{ padding: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <View>
                        <Text style={{ fontSize: 24, fontWeight: '900', color: '#1e293b' }}>{name}</Text>
                        <Text style={{ fontSize: 14, color: '#64748b', fontWeight: '600' }}>Vendor Dashboard (Testing)</Text>
                    </View>
                    <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.success + '20', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="cart" size={24} color={COLORS.success} />
                    </View>
                </View>

                {/* Balance Card */}
                <View style={{ backgroundColor: '#1e293b', padding: 24, borderRadius: 24, marginBottom: 20, elevation: 8 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>Outstanding Balance</Text>
                    <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 4 }}>₹ 45,280.00</Text>
                    <View style={{ flexDirection: 'row', marginTop: 16, gap: 8 }}>
                        <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' }}>
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>3 Overdue Invoices</Text>
                        </View>
                    </View>
                </View>

                {/* Actions */}
                <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 12 }}>Supplier Tools</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                    {[
                        { label: 'Purchase Orders', icon: 'document-text', color: '#3b82f6' },
                        { label: 'Submit Invoice', icon: 'cloud-upload', color: '#10b981' },
                        { label: 'Ledger Statement', icon: 'list-circle', color: '#f59e0b' },
                        { label: 'Inventory', icon: 'cube', color: '#8b5cf6' },
                    ].map((item, idx) => (
                        <TouchableOpacity key={idx} style={{ width: '48%', backgroundColor: '#fff', padding: 16, borderRadius: 16, alignItems: 'center', elevation: 2 }}>
                            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: item.color + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                                <Ionicons name={item.icon as any} size={22} color={item.color} />
                            </View>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155' }}>{item.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
};

export default VendorDashboard;
