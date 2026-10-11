import os, sys, shutil

def update_finance_dashboard():
    src_file = r'c:\hipk\dashboards\FinanceDashboard.tsx'
    chart_file = r'c:\hipk\scratch\final_evolved_chart_only.tsx'
    bak_file = r'c:\hipk\dashboards\FinanceDashboard.tsx.bak'
    
    # Restore clean baseline from bak
    shutil.copyfile(bak_file, src_file)

    with open(src_file, 'r', encoding='utf-8') as f:
        content = f.read()

    with open(chart_file, 'r', encoding='utf-8') as f:
        chart_content = f.read()

    # 1. Imports
    import_addition = (
        "import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop, Line, Text as SvgText, G, Rect } from 'react-native-svg';\n"
        "import { VoucherEntryModal } from '@/modal/VoucherEntryModal';\n"
    )
    if 'import { VoucherEntryModal }' not in content:
        content = content.replace("import { AdminPettyCashView } from \"../app/adminPettyCash\";", 
                                  "import { AdminPettyCashView } from \"../app/adminPettyCash\";\n" + import_addition)

    # 2. fmtFull
    fmt_full_def = (
        "export const fmtFull = (v: number) => {\n"
        "    const num = Number(v) || 0;\n"
        "    return `₹${num.toLocaleString('en-IN')}`;\n"
        "};\n"
    )
    if 'export const fmtFull' not in content:
        content = content.replace("export const fmt = ", fmt_full_def + "\nexport const fmt = ")

    # 3. Props
    old_props = "interface Props {\n    token: string; userId: string; name: string; dbName: string;\n}"
    new_props = "interface Props {\n    token: string; userId: string; name: string; dbName: string;\n    graphOnly?: boolean;\n    hideHeader?: boolean;\n}"
    if old_props in content:
        content = content.replace(old_props, new_props)
    else:
        print("WARNING: Could not find old_props!")

    # 4. Insert FinancialComparisonLineChart above export default function FinanceDashboard
    decl_target = "// ─────────────────────────────────────────────────────────────────────────────\nexport default function FinanceDashboard({ token, userId, name, dbName }: Props) {"
    new_decl = (
        "// ─────────────────────────────────────────────────────────────────────────────\n"
        + chart_content + "\n\n" +
        "// ─────────────────────────────────────────────────────────────────────────────\n"
        "export default function FinanceDashboard({ token, userId, name, dbName, graphOnly = false, hideHeader = false }: Props) {"
    )
    if decl_target in content:
        content = content.replace(decl_target, new_decl)
    else:
        print("WARNING: Could not find export default function FinanceDashboard declaration!")

    # 5. Add voucher state to FinanceDashboard body
    voucher_state = (
        "\n    const [voucherVisible, setVoucherVisible] = useState(false);\n"
        "    const [voucherMode, setVoucherMode] = useState<any>('payment');\n"
        "    const [voucherInitialType, setVoucherInitialType] = useState<any>('Payment');\n\n"
        "    const openVoucherModal = useCallback((mode?: any, initialType?: any) => {\n"
        "        setVoucherMode(mode);\n"
        "        setVoucherInitialType(initialType);\n"
        "        setVoucherVisible(true);\n"
        "    }, []);\n"
    )
    tab_state_target = "const [activeTab, setActiveTab] = useState<FinTab>(\"overview\");"
    if tab_state_target in content:
        content = content.replace(tab_state_target, tab_state_target + voucher_state)
    else:
        print("WARNING: Could not find activeTab state definition!")

    # 6. Add graphOnly check right before the main JSX return
    main_return_target = "    return (\n        <View style={{ flex: 1, backgroundColor: bg }}>\n            {/* ── DUTY STATUS HEADER (Finance) ───────────────────────────── */}"
    graph_only_block = (
        "    if (graphOnly) {\n"
        "        return (\n"
        "            <ScrollView\n"
        "                style={{ flex: 1, backgroundColor: bg }}\n"
        "                contentContainerStyle={{ padding: 12, paddingBottom: 60 }}\n"
        "                showsVerticalScrollIndicator={false}\n"
        "            >\n"
        "                <FinancialComparisonLineChart\n"
        "                    vouchersList={vouchersList}\n"
        "                    transactions={transactions}\n"
        "                    masterData={masterData}\n"
        "                    totalInflow={summary?.totalReceipts ?? 0}\n"
        "                    totalOutflow={summary?.totalPayments ?? 0}\n"
        "                    summary={summary}\n"
        "                    theme={theme}\n"
        "                />\n"
        "            </ScrollView>\n"
        "        );\n"
        "    }\n\n"
        "    return (\n"
        "        <View style={{ flex: 1, backgroundColor: bg }}>\n"
        "            {/* ── DUTY STATUS HEADER (Finance) ───────────────────────────── */}\n"
    )
    if main_return_target in content:
        content = content.replace(main_return_target, graph_only_block)
    else:
        print("WARNING: Could not find main_return_target!")

    # 7. Wrap Header Strip with {!hideHeader && ( ... )}
    header_block = (
        "            {/* ── DUTY STATUS HEADER (Finance) ───────────────────────────── */}\n"
        "            <View style={{ backgroundColor: '#0f172a', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>\n"
    )
    header_block_repl = (
        "            {/* ── DUTY STATUS HEADER (Finance) ───────────────────────────── */}\n"
        "            {!hideHeader && (\n"
        "            <View style={{ backgroundColor: '#0f172a', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>\n"
    )
    header_close = (
        "                        </TouchableOpacity>\n"
        "                    )}\n"
        "                </View>\n"
        "            </View>\n\n"
        "            {/* ── FINANCE SUB-TABS ──────────────────────────────────────── */}"
    )
    header_close_repl = (
        "                        </TouchableOpacity>\n"
        "                    )}\n"
        "                </View>\n"
        "            </View>\n"
        "            )}\n\n"
        "            {/* ── FINANCE SUB-TABS ──────────────────────────────────────── */}"
    )
    if header_block in content and header_close in content:
        content = content.replace(header_block, header_block_repl)
        content = content.replace(header_close, header_close_repl)
        print("Wrapped header with hideHeader check successfully!")
    else:
        print("WARNING: Could not find header_block or header_close!")

    # 8. Add Quick Actions Hub above FINANCE SUB-TABS
    quick_actions_hub = (
        "            {/* ── QUICK ACTIONS HUB ────────────────────────────────────── */}\n"
        "            <View\n"
        "                style={{\n"
        "                    flexDirection: 'row',\n"
        "                    alignItems: 'center',\n"
        "                    paddingHorizontal: 12,\n"
        "                    paddingVertical: 10,\n"
        "                    gap: 6,\n"
        "                    backgroundColor: cardBg,\n"
        "                    borderBottomWidth: 0.5,\n"
        "                    borderBottomColor: border,\n"
        "                }}\n"
        "            >\n"
        "                <TouchableOpacity\n"
        "                    onPress={() => openVoucherModal()}\n"
        "                    activeOpacity={0.85}\n"
        "                    style={{\n"
        "                        flex: 1.4,\n"
        "                        flexDirection: 'row',\n"
        "                        alignItems: 'center',\n"
        "                        justifyContent: 'center',\n"
        "                        gap: 4,\n"
        "                        backgroundColor: COLORS.primary,\n"
        "                        paddingVertical: 10,\n"
        "                        paddingHorizontal: 6,\n"
        "                        borderRadius: 12,\n"
        "                        ...mkShadow(3),\n"
        "                    }}\n"
        "                >\n"
        "                    <Ionicons name=\"document-text\" size={15} color=\"#fff\" />\n"
        "                    <Text\n"
        "                        style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}\n"
        "                        numberOfLines={1}\n"
        "                        adjustsFontSizeToFit\n"
        "                    >\n"
        "                        + Voucher Entry\n"
        "                    </Text>\n"
        "                </TouchableOpacity>\n\n"
        "                <TouchableOpacity\n"
        "                    onPress={() => openVoucherModal('salary', 'Payment')}\n"
        "                    activeOpacity={0.85}\n"
        "                    style={{\n"
        "                        flex: 1,\n"
        "                        flexDirection: 'row',\n"
        "                        alignItems: 'center',\n"
        "                        justifyContent: 'center',\n"
        "                        gap: 4,\n"
        "                        backgroundColor: '#7c3aed',\n"
        "                        paddingVertical: 10,\n"
        "                        paddingHorizontal: 4,\n"
        "                        borderRadius: 12,\n"
        "                        ...mkShadow(3),\n"
        "                    }}\n"
        "                >\n"
        "                    <Ionicons name=\"people\" size={14} color=\"#fff\" />\n"
        "                    <Text\n"
        "                        style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}\n"
        "                        numberOfLines={1}\n"
        "                        adjustsFontSizeToFit\n"
        "                    >\n"
        "                        Salaries\n"
        "                    </Text>\n"
        "                </TouchableOpacity>\n\n"
        "                <TouchableOpacity\n"
        "                    onPress={() => openVoucherModal('sales', 'Sales')}\n"
        "                    activeOpacity={0.85}\n"
        "                    style={{\n"
        "                        flex: 0.85,\n"
        "                        flexDirection: 'row',\n"
        "                        alignItems: 'center',\n"
        "                        justifyContent: 'center',\n"
        "                        gap: 4,\n"
        "                        backgroundColor: '#2563eb',\n"
        "                        paddingVertical: 10,\n"
        "                        paddingHorizontal: 4,\n"
        "                        borderRadius: 12,\n"
        "                        ...mkShadow(3),\n"
        "                    }}\n"
        "                >\n"
        "                    <Ionicons name=\"receipt-outline\" size={14} color=\"#fff\" />\n"
        "                    <Text\n"
        "                        style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}\n"
        "                        numberOfLines={1}\n"
        "                        adjustsFontSizeToFit\n"
        "                    >\n"
        "                        Bills\n"
        "                    </Text>\n"
        "                </TouchableOpacity>\n\n"
        "                <TouchableOpacity\n"
        "                    onPress={handleDownloadTemplate}\n"
        "                    disabled={downloading}\n"
        "                    activeOpacity={0.8}\n"
        "                    style={{\n"
        "                        width: 36,\n"
        "                        height: 36,\n"
        "                        borderRadius: 10,\n"
        "                        backgroundColor: isDark ? '#1e293b' : '#ffffff',\n"
        "                        justifyContent: 'center',\n"
        "                        alignItems: 'center',\n"
        "                        borderWidth: 1,\n"
        "                        borderColor: border,\n"
        "                        ...mkShadow(2),\n"
        "                    }}\n"
        "                >\n"
        "                    {downloading ? (\n"
        "                        <ActivityIndicator size=\"small\" color={COLORS.primary} />\n"
        "                    ) : (\n"
        "                        <Ionicons name=\"download-outline\" size={16} color={COLORS.primary} />\n"
        "                    )}\n"
        "                </TouchableOpacity>\n\n"
        "                <TouchableOpacity\n"
        "                    onPress={handleUploadVouchers}\n"
        "                    disabled={uploading}\n"
        "                    activeOpacity={0.8}\n"
        "                    style={{\n"
        "                        width: 36,\n"
        "                        height: 36,\n"
        "                        borderRadius: 10,\n"
        "                        backgroundColor: isDark ? '#1e293b' : '#ffffff',\n"
        "                        justifyContent: 'center',\n"
        "                        alignItems: 'center',\n"
        "                        borderWidth: 1,\n"
        "                        borderColor: border,\n"
        "                        ...mkShadow(2),\n"
        "                    }}\n"
        "                >\n"
        "                    {uploading ? (\n"
        "                        <ActivityIndicator size=\"small\" color=\"#7c3aed\" />\n"
        "                    ) : (\n"
        "                        <Ionicons name=\"cloud-upload-outline\" size={16} color=\"#7c3aed\" />\n"
        "                    )}\n"
        "                </TouchableOpacity>\n"
        "            </View>\n\n"
    )
    subtabs_target = "            {/* ── FINANCE SUB-TABS ──────────────────────────────────────── */}"
    if subtabs_target in content:
        content = content.replace(subtabs_target, quick_actions_hub + subtabs_target)
    else:
        print("WARNING: Could not find subtabs_target!")

    # 9. Overview tab renders FinancialComparisonLineChart
    overview_target = (
        "                    {activeTab === \"overview\" && (\n"
        "                        <OverviewPanel"
    )
    overview_replacement = (
        "                    {activeTab === \"overview\" && (\n"
        "                        <>\n"
        "                            <FinancialComparisonLineChart\n"
        "                                vouchersList={vouchersList}\n"
        "                                transactions={transactions}\n"
        "                                masterData={masterData}\n"
        "                                totalInflow={summary?.totalReceipts ?? 0}\n"
        "                                totalOutflow={summary?.totalPayments ?? 0}\n"
        "                                summary={summary}\n"
        "                                theme={theme}\n"
        "                            />\n"
        "                            <OverviewPanel"
    )
    overview_close_target = (
        "                            downloading={downloading}\n"
        "                            uploading={uploading} \n"
        "                        />\n"
        "                    )}"
    )
    overview_close_replacement = (
        "                            downloading={downloading}\n"
        "                            uploading={uploading} \n"
        "                        />\n"
        "                        </>\n"
        "                    )}"
    )
    if overview_target in content and overview_close_target in content:
        content = content.replace(overview_target, overview_replacement)
        content = content.replace(overview_close_target, overview_close_replacement)
        print("Updated Overview tab successfully!")
    else:
        print("WARNING: Could not find overview_target or overview_close_target!")

    # 10. Mount VoucherEntryModal at the end of JSX
    end_jsx_target = (
        "                        </View>\n"
        "                    </View>\n"
        "                </View>\n"
        "            </Modal>\n"
        "        </View>\n"
        "    );\n"
        "}"
    )
    modal_mount = (
        "                        </View>\n"
        "                    </View>\n"
        "                </View>\n"
        "            </Modal>\n\n"
        "            {/* ── MODAL: FULL VOUCHER ENTRY ────────────────────────────── */}\n"
        "            <VoucherEntryModal\n"
        "                visible={voucherVisible}\n"
        "                onClose={() => {\n"
        "                    setVoucherVisible(false);\n"
        "                    fetchExtraData();\n"
        "                    fetchTransactions();\n"
        "                    fetchSummary();\n"
        "                }}\n"
        "                token={token}\n"
        "                dbName={dbName}\n"
        "                mode={voucherMode}\n"
        "                initialType={voucherInitialType}\n"
        "            />\n"
        "        </View>\n"
        "    );\n"
        "}"
    )
    if end_jsx_target in content:
        content = content.replace(end_jsx_target, modal_mount)
        print("Mounted VoucherEntryModal successfully!")
    else:
        print("WARNING: Could not find end_jsx_target!")

    with open(src_file, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Updated FinanceDashboard.tsx successfully! New length:", len(content))

if __name__ == '__main__':
    update_finance_dashboard()
