import { appService } from "@/UtilServices/appHelper";
import { useEffect, useState } from "react";

export const useFinanceAnalytics = (token: string) => {
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
        try {
            setLoading(true);
            setError(null);
            const res = await appService.httpClient.get("finance/analytics", {
                headers: { Authorization: `Bearer ${token}` },
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
    }, [token]);

    return { data, loading, error, refresh };
};
