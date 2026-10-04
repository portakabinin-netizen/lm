import api_url from "@/backend/routes/base_url";
import { httpClient } from "@/context/AuthContext";
import { showGlobalToast } from "@/hooks/commomFunction";
import { Leads } from "@/hooks/interface";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { sendLeadsToBackend } from "./getDataProcees";
import LeadTile from "./RenderLeadTile";
import { styles } from "./styles/TileStyles";

// Constants moved outside to prevent re-creation on every render
const formatDate = (date: Date) => date.toISOString().split("T")[0];
const today = new Date();
const yesterday=new Date();
yesterday.setDate(today.getDate()-1);
const url1 = `${process.env.EXPO_PUBLIC_URL1}&from_date=${formatDate(yesterday)}&to_date=${formatDate(today)}&limit=50&page_no=1`;
const url2 = `${process.env.EXPO_PUBLIC_URL2}`;

const STATUS_MAP: Record<string, string> = {
    "Recent": "Recent",
    "Engaged": "Engaged",
    "Accepted": "Accepted",
    "Recycle": "Delete"
};

export default function SalesDashboard({ user }: { user: any }) {
    const [leads, setLeads] = useState<Leads[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState("Recent");
    
    const tabs = ["Recent", "Engaged", "Accepted", "Recycle"];

    const fetchLeads = useCallback(async (isRefreshing = false) => {
        if (!user?.token) return;

        const sessionString = await AsyncStorage.getItem("userSession");
        if (!sessionString) return;
        const session = JSON.parse(sessionString);

        if (isRefreshing) setRefreshing(true);
        else setLoading(true);

        try {
            const tabStatus = STATUS_MAP[activeTab] || activeTab;
            const res = await httpClient.get(`${api_url}/service/leads/status/${tabStatus}`, {
                headers: { Authorization: `Bearer ${user.token}` },
                params: { corporateId: session.corporateId }
            });
            setLeads(res.data.success ? res.data.data : []);
        } catch (err) {
            showGlobalToast("Something went wrong!", "Error");
            setLeads([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [activeTab, user?.token]);

    // Combined Initial Sync and Fetch
    useEffect(() => {
        const initializeData = async () => {
            setLoading(true);
            try {
            if (activeTab === "Recent") { await sendLeadsToBackend(url1  , url2);}
               
            } catch (error) {
                console.error("Initial Sync Failed:", error);
            }
            await fetchLeads();
            setLoading(false);
        };

        initializeData();
    }, [fetchLeads]);

    return (
        <View style={styles.container}>
            <View style={{ flex: 1 }}>
                {loading && !refreshing ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color="#007AFF" />
                    </View>
                ) : (
                    <FlatList
                        data={leads}
                        keyExtractor={(item) => item._id?.toString() || Math.random().toString()}
                        renderItem={({ item, index }) => (
                            <LeadTile 
                                item={item}
                                token={user.token}
                                isFirst={index === 0} 
                                onStatusChange={fetchLeads}
                                currentUser={user.name}
                            />
                        )}
                        ListEmptyComponent={
                            <View style={styles.center}>
                                <Ionicons name="cloud-download" size={48} color="#CCC" />
                                <Text style={styles.emptyText}>No leads in {activeTab}</Text>
                            </View>
                        }
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl 
                                refreshing={refreshing} 
                                onRefresh={async () => {
                                    setRefreshing(true);
                                    try {
                                       if (activeTab === "Recent") { await sendLeadsToBackend(url1  , url2);}
                                        await fetchLeads(true);
                                    } finally {
                                        setRefreshing(false);
                                    }
                                }} 
                                colors={["#007AFF"]} 
                            />
                        }
                    />
                )}
            </View>

            <View style={styles.bottomTabBar}>
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    contentContainerStyle={styles.tabScroll}
                >
                    {/* Simplified manual sync button */}
                    <TouchableOpacity 
                        style={{ paddingHorizontal: 15, justifyContent: 'center' }} 
                        onPress={() => alert("Function called")}
                    >
                        <View style={{ alignItems: 'center' }}>
                        <Ionicons name="add-circle" size={30} color="#0e8d18" />
                        <Text style={{ color: '#0e8d18', fontSize: 12, fontWeight: '600' }}>Lead</Text>
                        </View>
                    </TouchableOpacity>

                    {tabs.map((tab) => (
                        <TouchableOpacity 
                            key={tab} 
                            onPress={() => setActiveTab(tab)} 
                            style={[
                                styles.pill, 
                                activeTab === tab && styles.activePill
                            ]}
                        >
                            <Text style={[
                                styles.pillText, 
                                activeTab === tab && styles.activePillText
                            ]}>
                                {tab}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
        </View>
    );
}