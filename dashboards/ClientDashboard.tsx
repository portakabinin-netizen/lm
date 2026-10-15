/**
 * ClientDashboard.tsx
 *
 * Customer / Client portal view.
 * Clients are NOT employees — this dashboard has NO attendance tracking.
 * Attendance is only for users saved in the Employees or userMaster databases.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/styles/stylesIndex';

interface Props {
    token?: string;
    userId?: string;
    name?: string;
    dbName?: string;
}

const ClientDashboard = ({ name }: Props) => {
    return (
        <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
            {/* ── Header ───────────────────────────────────────────────── */}
            <View style={{ backgroundColor: '#0f172a', paddingHorizontal: 20, paddingVertical: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View>
                        <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>
                            CLIENT PORTAL
                        </Text>
                        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 2 }}>
                            Welcome, {name || 'Client'}
                        </Text>
                    </View>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary + '30', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="person-circle-outline" size={26} color={COLORS.primary} />
                    </View>
                </View>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
                {/* Active Orders */}
                <View style={{ backgroundColor: '#fff', padding: 18, borderRadius: 20, marginBottom: 16, elevation: 3, borderWidth: 1, borderColor: '#f1f5f9' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: '#1e293b' }}>Active Orders</Text>
                        <View style={{ backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                            <Text style={{ color: COLORS.primary, fontSize: 11, fontWeight: '800' }}>VIEW ALL</Text>
                        </View>
                    </View>
                    {[
                        { id: 'INV-402', status: 'Processing', date: 'Oct 12', amount: '₹12,500' },
                        { id: 'INV-398', status: 'Shipped', date: 'Oct 08', amount: '₹8,200' },
                        { id: 'INV-391', status: 'Delivered', date: 'Sep 30', amount: '₹5,800' },
                    ].map((order, i) => (
                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#f1f5f9' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' }}>
                                    <Ionicons name="cube-outline" size={18} color="#64748b" />
                                </View>
                                <View>
                                    <Text style={{ fontWeight: '700', fontSize: 13, color: '#1e293b' }}>{order.id}</Text>
                                    <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{order.date}</Text>
                                </View>
                            </View>
                            <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                <Text style={{ fontWeight: '800', fontSize: 13, color: '#1e293b' }}>{order.amount}</Text>
                                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: order.status === 'Delivered' ? '#dcfce7' : order.status === 'Shipped' ? '#eff6ff' : '#fef9c3' }}>
                                    <Text style={{ fontSize: 9, fontWeight: '800', color: order.status === 'Delivered' ? '#16a34a' : order.status === 'Shipped' ? '#2563eb' : '#ca8a04' }}>
                                        {order.status.toUpperCase()}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ))}
                </View>

                {/* Services Grid */}
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#1e293b', marginBottom: 12 }}>Services</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                    {[
                        { label: 'Place Order', icon: 'add-circle-outline', color: '#3b82f6' },
                        { label: 'My Invoices', icon: 'document-text-outline', color: '#10b981' },
                        { label: 'Track Delivery', icon: 'location-outline', color: '#f59e0b' },
                        { label: 'Support', icon: 'chatbubbles-outline', color: '#8b5cf6' },
                        { label: 'Payment History', icon: 'card-outline', color: '#ef4444' },
                        { label: 'My Profile', icon: 'settings-outline', color: '#64748b' },
                    ].map((item, idx) => (
                        <TouchableOpacity
                            key={idx}
                            activeOpacity={0.8}
                            style={{ width: '48%', backgroundColor: '#fff', padding: 16, borderRadius: 16, alignItems: 'center', elevation: 2, borderWidth: 1, borderColor: '#f1f5f9' }}
                        >
                            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: item.color + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
                                <Ionicons name={item.icon as any} size={22} color={item.color} />
                            </View>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#334155', textAlign: 'center' }}>{item.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
};

export default ClientDashboard;
