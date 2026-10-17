import { appService } from "@/UtilServices/appHelper";
import { STATUS_COLOR } from "@/UtilServices/appModals";
import { useEffect, useState } from "react";
import { DeviceEventEmitter } from "react-native";

export interface AnalyticsFilters {
    fromDate?: string;
    toDate?:   string;
    source?:   string;
}

export const useLeadAnalytics = (
    token:       string,
    dbName:      string | undefined, // 🚀 NEW: Required tenant guard
    filters:     AnalyticsFilters = {},
) => {
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState<string | null>(null);
    const [analytics, setAnalytics] = useState({
        sourceData: [] as any[],
        statusData: [] as any[],
        totalCount: 0,
        financeTrend: [] as any[],
    });

    const fetchData = async () => {
        let activeToken = token;
        let activeDb = dbName;
        if (!activeToken || !activeDb) {
            const session = await appService.getSession();
            if (!activeToken) activeToken = session?.token;
            if (!activeDb) activeDb = session?.dbName;
        }

        if (!activeToken || !activeDb) {
            setLoading(false);
            return;
        }
      
        try {
            setLoading(true);
            setError(null);

            const params: Record<string, string> = {};
            if (filters.fromDate) params.fromDate = filters.fromDate;
            if (filters.toDate)   params.toDate   = filters.toDate;
            if (filters.source)   params.source   = filters.source;
            if (activeDb)         params.dbName   = activeDb;
           
            const res = await appService.httpClient.get("service/leads/analytics", {
                headers: { 
                    Authorization: `Bearer ${activeToken}`,
                    ...(activeDb ? { 'x-tenant-id': activeDb } : {})
                },
                params,
                timeout: 10000,
            });

            if (!res.data?.success)
                throw new Error(res.data?.message || "API returned success:false");

            const { statuses } = res.data.data || {};
            const SOURCE_COLORS = ["#007AFF", "#5856D6", "#AF52DE", "#00BCD4", "#2196F3"];

            const formattedSources = (res.data.data?.sources || []).map((s: any, index: number) => ({
                label: s.label,
                total: s.total || 0,
                posCount: s.posCount || 0,
                recycleCount: s.recycleCount || 0,
                pendingCount: s.pendingCount || 0,
                value: s.total || 0, 
                color: SOURCE_COLORS[index % SOURCE_COLORS.length],
            }));

            const formattedStatuses = Array.isArray(statuses) ? statuses.map((item) => ({
                ...item,
                color: (STATUS_COLOR as any)[item.label] || "#888",
            })) : [];

            setAnalytics({
                sourceData: formattedSources,
                statusData: formattedStatuses,
                totalCount: res.data.total || 0,
                financeTrend: res.data.data?.financeTrend || [],
            });

        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || "Failed to load chart data";
            console.error("❌ Analytics fetch error:", msg, err?.response?.status);
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, dbName, filters.fromDate, filters.toDate, filters.source]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener('CORPORATE_SWITCHED', (data) => {
            if (data?.newDbName) {
                fetchData();
            }
        });
        return () => sub.remove();
    }, []);

    return { ...analytics, loading, error, refresh: fetchData };
};