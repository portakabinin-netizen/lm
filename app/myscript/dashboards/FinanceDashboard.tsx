import api_url from "@/backend/routes/base_url";
import { Leads } from "@/hooks/interface";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
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
import Toast from "react-native-toast-message";
import { sendLeadsToBackend } from "./getDataProcees";
import LeadTile from "./RenderLeadTile";
import { styles } from "./styles/TileStyles";
const formatDate = (date: Date) => date.toISOString().split("T")[0];
const[sDate,eDate]=[formatDate(new Date()) , formatDate(new Date())];
const[url1,url2,BASE_URL]=[ `https://www.tradeindia.com/utils/my_inquiry.html?userid=23134696&profile_id=102656695&key=abef1268bf0df7863ae259fb1c2b611d&from_date=${sDate}&to_date=${eDate}&limit=50&page_no=1`,"https://portakabin.pythonanywhere.com/api/sales",api_url];
const STATUS_MAP: Record<string, string> = {
    "Recent": "Recent",
    "Engaged": "Engaged",
    "Accepted": "Accepted",
    "Recycle": "Delete"
};


 const handleNewLeads = async () => {
    try {
     
      Toast.show({ type: "success", text1:"Updates", position: "top",topOffset:100});
     
    } catch {
      Toast.show({ type: "error", text1: "Status update failed" ,position: "top",topOffset:100 });
    }
  };
 

export default function SalesDashboard({ user }: { user: any }) {
    const [leads, setLeads] = useState<Leads[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState("Recent");
    
    const tabs = ["Recent", "Engaged", "Accepted", "Recycle"];

        const fetchLeads = useCallback(async (isRefreshing = false) => {
        const sessionString: any = await AsyncStorage.getItem("userSession");
        const session = JSON.parse(sessionString);
        if (!user?.token) return;     
        if (isRefreshing) setRefreshing(true);
        else setLoading(true);

        try {
            const tabStatus = STATUS_MAP[activeTab] || activeTab;
            const res = await axios.get(`${api_url}/service/leads/status/${tabStatus}`, {
                headers: { Authorization: `Bearer ${user.token}` },
                params: {
                    corporateId: session.corporateId
                }
            });
            setLeads(res.data.success ? res.data.data : []);
        } catch (err: any) {
            const errCode = err.response?.status;
            Toast.show({
                type: "error",
                text1: `Error code: ${errCode}`,
                text2: "Something went wrong!",
                position: "top", 
                topOffset: 100
            });
            setLeads([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [activeTab, user?.token]);

    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);

    return (
        <View style={styles.container}>
            {/* 1. LIST AREA */}
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
                                onRefresh={() => fetchLeads(true)} 
                                colors={["#007AFF"]} 
                            />
                        }
                    />
                )}
            </View>

            {/* 2. BOTTOM TABBAR */}
            <View style={styles.bottomTabBar}>
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={true} 
                    contentContainerStyle={styles.tabScroll}
                 >
                    <TouchableOpacity onPress={() => sendLeadsToBackend(url1,url2)}>
                        <Ionicons name="cloud-download" size={40} color="#CCC" />
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