import React, { useCallback, useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Alert, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { AppHeader } from "@/components/AppHeader";
import { useUserContext } from "@/context/AuthContext";
import { usePayments } from "@/hooks/usePayments";
import { styles as G, COLORS } from "@/styles/stylesIndex";
import { appService } from "@/UtilServices/appHelper";

const fmt = (n: number) => "₹ " + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PL_HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Profit & Loss Account</title>
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
        .header { text-align: center; border-bottom: 2px solid #1a3c6b; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { margin: 0; color: #1a3c6b; font-size: 28px; text-transform: uppercase; letter-spacing: 1px; }
        .header p { margin: 5px 0 0; color: #666; font-size: 14px; }
        
        .box { border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 30px; background: #fff; }
        .box-title { font-size: 14px; font-weight: bold; color: #666; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; }
        
        .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 15px; }
        .row.sub { color: #555; }
        .row.total { border-top: 1px solid #ddd; padding-top: 10px; margin-top: 5px; font-weight: bold; font-size: 16px; color: #000; }
        .row.highlight { background: #f0fdf4; padding: 10px; border-radius: 4px; border: 1px solid #dcfce7; }
        .row.highlight-danger { background: #fef2f2; padding: 10px; border-radius: 4px; border: 1px solid #fee2e2; }
        
        .val-pos { color: #166534; }
        .val-neg { color: #991b1b; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Trading & Profit/Loss Account</h1>
        <p>Financial Year: {{FY}} | Report Generated: {{DATE}}</p>
    </div>

    <div class="box">
        <div class="box-title">Trading Account (Operational)</div>
        <div class="row sub"><span>Sales Revenue</span><span>{{SALES}}</span></div>
        <div class="row sub"><span>Direct Income</span><span>{{D_INCOME}}</span></div>
        <div class="row sub"><span>Purchases</span><span class="val-neg">-{{PURCHASES}}</span></div>
        <div class="row sub"><span>Direct Expenses</span><span class="val-neg">-{{D_EXPENSES}}</span></div>
        <div class="row total">
            <span>Gross Margin</span>
            <span class="{{GM_CLASS}}">{{GM}}</span>
        </div>
    </div>

    <div class="box">
        <div class="box-title">Profit & Loss Account</div>
        <div class="row sub"><span>Gross Margin b/d</span><span>{{GM}}</span></div>
        <div class="row sub"><span>Indirect / Other Income</span><span>+{{I_INCOME}}</span></div>
        <div class="row sub"><span>Indirect Expenses</span><span class="val-neg">-{{I_EXPENSES}}</span></div>
        <div class="row total {{NP_WRAP_CLASS}}">
            <span>Net Profit</span>
            <span class="{{NP_CLASS}}">{{NP}}</span>
        </div>
    </div>
</body>
</html>
`;

export default function ProfitAndLossScreen() {
    const router = useRouter();
    const { user } = useUserContext();
    const isDark = useColorScheme() === "dark";
    
    // Auth & context
    const token = user?.token ?? "";
    const corporateId = user?.corporateId?.trim() || user?.corpAdminId || "";
    
    const { summary, summaryLoading, fetchSummary } = usePayments(token);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    const generatePdfAndShare = async () => {
        if (!summary) return;
        setIsGenerating(true);
        try {
            const d = new Date();
            const y = d.getFullYear();
            const fy = d.getMonth() >= 3 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;

            let html = PL_HTML_TEMPLATE
                .replace("{{FY}}", fy)
                .replace("{{DATE}}", d.toLocaleDateString("en-IN"))
                .replace("{{SALES}}", fmt(summary.sales))
                .replace("{{D_INCOME}}", fmt(summary.directIncome))
                .replace("{{PURCHASES}}", fmt(summary.purchases))
                .replace("{{D_EXPENSES}}", fmt(summary.directExpenses))
                .replace(/{{GM}}/g, fmt(summary.grossMargin))
                .replace("{{GM_CLASS}}", summary.grossMargin >= 0 ? "val-pos" : "val-neg")
                .replace("{{I_INCOME}}", fmt(summary.indirectIncome))
                .replace("{{I_EXPENSES}}", fmt(summary.indirectExpenses))
                .replace(/{{NP}}/g, fmt(summary.netProfit))
                .replace("{{NP_CLASS}}", summary.netProfit >= 0 ? "val-pos" : "val-neg")
                .replace("{{NP_WRAP_CLASS}}", summary.netProfit >= 0 ? "highlight" : "highlight-danger");

            const { uri } = await Print.printToFileAsync({ html, base64: false });
            await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Profit and Loss Account ${fy}`, UTI: "com.adobe.pdf" });
        } catch (error: any) {
            appService.showToast(error?.message || "Error Generating Report", "Error");
        } finally {
            setIsGenerating(false);
        }
    };

    const bg = isDark ? COLORS.bgDark : COLORS.bgLight;
    const cardBg = isDark ? COLORS.cardDark : COLORS.cardLight;
    const border = isDark ? COLORS.borderDark : COLORS.border;
    const txtPri = isDark ? "#e8e8e8" : "#1a1a1a";
    const txtSec = isDark ? "#999" : "#666";

    return (
        <SafeAreaView style={[styles.root, { backgroundColor: bg }]} edges={["top", "left", "right"]}>
            <AppHeader 
                title="Profit & Loss Account" 
                onBackPress={() => router.back()} 
                rightAction={() => (
                    <TouchableOpacity onPress={fetchSummary} style={{ padding: 4 }}>
                        <Ionicons name="refresh" size={22} color="#fff" />
                    </TouchableOpacity>
                )} 
            />

            {summaryLoading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={{ color: txtSec, marginTop: 12 }}>Calculating P&L...</Text>
                </View>
            ) : summary ? (
                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                    
                    <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
                            <Ionicons name="stats-chart" size={20} color={COLORS.primary} />
                            <Text style={[styles.cardTitle, { color: txtPri }]}> TRADING A/C</Text>
                        </View>
                        
                        <View style={styles.row}><Text style={{ color: txtSec }}>Sales Revenue</Text><Text style={[styles.val, { color: txtPri }]}>{fmt(summary.sales)}</Text></View>
                        {(summary.directIncome > 0) && <View style={styles.row}><Text style={{ color: txtSec }}>Direct Income</Text><Text style={[styles.val, { color: txtPri }]}>{fmt(summary.directIncome)}</Text></View>}
                        <View style={styles.row}><Text style={{ color: txtSec }}>Purchases</Text><Text style={[styles.val, { color: txtPri }]}>-{fmt(summary.purchases)}</Text></View>
                        <View style={styles.row}><Text style={{ color: txtSec }}>Direct Expenses</Text><Text style={[styles.val, { color: txtPri }]}>-{fmt(summary.directExpenses)}</Text></View>
                        
                        <View style={[styles.totalRow, { borderTopColor: border }]}>
                            <Text style={[styles.totalLabel, { color: txtPri }]}>Gross Profit</Text>
                            <Text style={[styles.totalVal, { color: summary.grossMargin >= 0 ? COLORS.success : COLORS.danger }]}>{summary.grossMargin >= 0 ? "+" : ""}{fmt(summary.grossMargin)}</Text>
                        </View>
                    </View>

                    <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
                        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
                            <Ionicons name="pie-chart-outline" size={20} color={COLORS.success} />
                            <Text style={[styles.cardTitle, { color: txtPri }]}> PROFIT & LOSS A/C</Text>
                        </View>
                        
                        <View style={styles.row}><Text style={{ color: txtSec }}>Gross Profit b/d</Text><Text style={[styles.val, { color: txtPri }]}>{fmt(summary.grossMargin)}</Text></View>
                        {(summary.indirectIncome > 0) && <View style={styles.row}><Text style={{ color: txtSec }}>Indirect / Other Income</Text><Text style={[styles.val, { color: txtPri }]}>+{fmt(summary.indirectIncome)}</Text></View>}
                        <View style={styles.row}><Text style={{ color: txtSec }}>Indirect Expenses</Text><Text style={[styles.val, { color: txtPri }]}>-{fmt(summary.indirectExpenses)}</Text></View>
                        
                        <View style={[styles.totalRow, { borderTopColor: border }]}>
                            <Text style={[styles.totalLabel, { color: txtPri }]}>Net Profit</Text>
                            <View style={[styles.netBadge, { backgroundColor: summary.netProfit >= 0 ? COLORS.success + "15" : COLORS.danger + "15" }]}>
                                <Text style={[styles.totalVal, { color: summary.netProfit >= 0 ? COLORS.success : COLORS.danger }]}>{summary.netProfit >= 0 ? "+" : ""}{fmt(summary.netProfit)}</Text>
                            </View>
                        </View>
                    </View>

                    <TouchableOpacity 
                        style={[styles.pdfBtn, isGenerating && G.opacity07]} 
                        onPress={generatePdfAndShare} 
                        disabled={isGenerating}
                        activeOpacity={0.8}
                    >
                        {isGenerating ? <ActivityIndicator color="#fff" /> : (
                            <>
                                <Ionicons name="document-text" size={20} color="#fff" />
                                <Text style={styles.pdfBtnTxt}>Share / Print Report (PDF)</Text>
                            </>
                        )}
                    </TouchableOpacity>

                </ScrollView>
            ) : (
                <View style={styles.center}>
                    <Text style={{ color: txtSec }}>No transactions found.</Text>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { padding: 16, paddingBottom: 60 },
    card: { borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 16 },
    cardTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5, marginLeft: 6 },
    row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
    val: { fontSize: 13, fontWeight: "600" },
    totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, paddingTop: 16, marginTop: 4 },
    totalLabel: { fontSize: 15, fontWeight: "800" },
    totalVal: { fontSize: 16, fontWeight: "900" },
    netBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    pdfBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 20, gap: 10 },
    pdfBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "700" }
});
