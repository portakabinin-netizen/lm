import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { appService } from '@/UtilServices/appHelper';
import StaffDashboard from './StaffDashboard';
import VendorDashboard from './VendorDashboard';
import ClientDashboard from './ClientDashboard';
import { COLORS } from '@/styles/stylesIndex';

const GuestDashboard = (props: any) => {
    const [resolvedRole, setResolvedRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [userData, setUserData] = useState<any>(null);

    useEffect(() => {
        const resolve = async () => {
            try {
                const res = await appService.httpClient.post('auth/resolve-guest', {});
                if (res.data.success) {
                    setResolvedRole(res.data.role);
                    setUserData({ name: res.data.userDisplayName, userId: res.data.userId });
                } else {
                    setError(res.data.message || "Failed to resolve role");
                }
            } catch (err: any) {
                setError(err.response?.data?.message || "Access Denied");
            } finally {
                setLoading(false);
            }
        };
        resolve();
    }, []);

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={{ marginTop: 12, color: '#64748b', fontWeight: '600' }}>Resolving Access...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 18 }}>Error</Text>
                <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 8 }}>{error}</Text>
            </View>
        );
    }

    const passProps = { ...props, name: userData?.name || props.name, userId: userData?.userId || props.userId };

    if (resolvedRole === 'Staff') return <StaffDashboard {...passProps} />;
    if (resolvedRole === 'Vendor') return <VendorDashboard {...passProps} />;
    if (resolvedRole === 'Client') return <ClientDashboard {...passProps} />;

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text>Unknown Guest Role</Text>
        </View>
    );
};

export default GuestDashboard;
