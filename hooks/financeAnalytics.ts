import { appService } from "@/UtilServices/appHelper";
import { useEffect, useState } from "react";
import { DeviceEventEmitter } from "react-native";

export const useFinanceAnalytics = (token: string, dbName?: string) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState({
        quotationAmount: 0,
        invoiceAmount: 0,
        poAmount: 0,
        invoiceReceivedAmount: 0,
        pendingBills: 0,
        pendingInvoices: 0,
        quoteVsInvoice: [] as any[],
        poVsInvoiceReceived: [] as any[],
        pendingComparison: [] as any[],
    });

    const refresh = async () => {
        let activeToken = token;
        let activeDb = dbName;
        if (!activeToken || !activeDb) {
            const session = await appService.getSession();
            if (!activeToken) activeToken = session?.token;
            if (!activeDb) activeDb = session?.dbName;
        }

        if (!activeToken) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const headers: Record<string, string> = {
                Authorization: `Bearer ${activeToken}`,
            };
            const params: Record<string, string> = {};
            if (activeDb) {
                headers['x-tenant-id'] = activeDb;
                params.dbName = activeDb;
            }

            const res = await appService.httpClient.get("finance/analytics", {
                headers,
                params,
                timeout: 10000,
            });
            if (res.data?.success) {
                setData(res.data.data);
            } else {
                setError(res.data?.message || "Finance analytics data not found");
            }
        } catch (err: any) {
            setError(err.message || "Failed to fetch finance analytics");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
    }, [token, dbName]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener('CORPORATE_SWITCHED', (eventData) => {
            if (eventData?.newDbName) {
                refresh();
            }
        });
        return () => sub.remove();
    }, []);

    return { data, loading, error, refresh };
};
