import { Platform, StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
    // ============================================
    // 🏠 DASHBOARD / CONTAINER STYLES
    // ============================================
    container: { 
        flex: 1, 
        backgroundColor: '#F9FAFB' 
    },
    bottomTabBar: { 
        backgroundColor: '#FFF', 
        height: Platform.OS === 'ios' ? 85 : 70, 
        borderTopWidth: 1, 
        borderTopColor: '#EEE',
        paddingBottom: Platform.OS === 'ios' ? 20 : 0, 
        justifyContent: 'center',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 3 },
            android: { elevation: 20 }
        })
    },
     sourceDate: {
        alignItems: "center",       
        textAlign: "center",        
        backgroundColor: "#0b6cff",
        borderRadius: 10,           
        overflow: "hidden",         
        padding: 8,                 
        color: "#ffffff",           
        },
    tabScroll: { 
        paddingHorizontal: 18, 
        alignItems: 'center' 
    },
    pill: { 
        paddingHorizontal: 12, 
        paddingVertical: 8, 
        marginHorizontal: 6, 
        borderRadius: 25, 
        backgroundColor: '#F3F4F6', 
        borderWidth: 1, 
        borderColor: '#ff6200ff' 
    },
    activePill: { 
        backgroundColor: '#007AFF', 
        borderColor: '#ff6200ff' 
    },
    pillText: { 
        fontSize: 13, 
        fontWeight: '700', 
        color: '#6B7280' 
    },
    activePillText: { 
        color: '#FFF' 
    },
    listContent: { 
        padding: 15, 
        paddingBottom: 20 
    },
    center: { 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: 200 
    },
    emptyText: { 
        marginTop: 10, 
        color: '#999', 
        fontWeight: '500' 
    },

    // ============================================
    // 🧱 LEAD TILE STYLES
    // ============================================
    tile: { 
        backgroundColor: '#FFFFFF', 
        borderRadius: 12, 
        padding: 15, 
        marginBottom: 15, 
        marginHorizontal: 15, 
        borderWidth: 1, 
        borderColor: '#d54646ff', 
        elevation: 2 
    },
    firstTile: { 
        marginTop: 65 
    },
    headerRow: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 10 
    },
    idBox: { 
        backgroundColor: '#F3F4F6', 
        paddingHorizontal: 8, 
        paddingVertical: 2, 
        borderRadius: 4 
    },
    idText: { 
        fontSize: 11, 
        fontWeight: 'bold', 
        color: '#666' 
    },
    headerActions: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 8 
    },
    editActionsGroup: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 8 
    },
    saveBtnPill: { 
        backgroundColor: '#007AFF', 
        flexDirection: 'row', 
        paddingHorizontal: 12, 
        paddingVertical: 6, 
        borderRadius: 20, 
        alignItems: 'center', 
        gap: 4 
    },
    saveBtnText: { 
        color: '#FFF', 
        fontSize: 11, 
        fontWeight: 'bold' 
    },
    statusBadge: { 
        backgroundColor: '#E8F2FF', 
        paddingHorizontal: 10, 
        paddingVertical: 4, 
        borderRadius: 6 
    },
    acceptedBadge: { 
        backgroundColor: '#4CAF50' 
    },
    statusText: { 
        color: '#007AFF', 
        fontSize: 11, 
        fontWeight: 'bold' 
    },
    whiteText: { 
        color: '#FFF' 
    },
    content: { 
        marginBottom: 10 
    },
    nameText: { 
        fontSize: 18, 
        fontWeight: 'bold', 
        color: '#1F2937' 
    },
    productText: { 
        fontSize: 14, 
        color: '#4B5563', 
        marginTop: 2 
    },
    infoText: { 
        fontSize: 13, 
        color: '#9CA3AF', 
        marginTop: 2 
    },
    fieldRow: { 
        marginVertical: 2 
    },
    input: { 
        borderBottomWidth: 1, 
        borderBottomColor: '#007AFF', 
        fontSize: 14, 
        padding: 2, 
        color: '#000' 
    },

    // ============================================
    // 📝 ACTIVITY SECTION
    // ============================================
    activitySection: { 
        borderTopWidth: 1, 
        borderTopColor: '#F3F4F6', 
        paddingTop: 8, 
        marginTop: 5 
    },
    activityHeaderRow: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center' 
    },
    activityLabelGroup: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        flex: 1 
    },
    activityLabel: { 
        fontSize: 12, 
        color: '#6B7280' 
    },
    activityValue: { 
        color: '#111827', 
        fontWeight: '500' 
    },
    addActivityBtn: { 
        padding: 4 
    },
    activityList: { 
        marginTop: 8, 
        backgroundColor: '#F9FAFB', 
        padding: 8, 
        borderRadius: 8 
    },
    activityItem: { 
        paddingVertical: 4, 
        borderBottomWidth: 1, 
        borderBottomColor: '#EEE' 
    },
    activityRowText: { 
        fontSize: 11, 
        color: '#4B5563' 
    },

    // ============================================
    // 📞 FOOTER & MODAL STYLES
    // ============================================
    footer: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#F9FAFB'
    },
    phoneText: { 
        fontSize: 20, 
        fontWeight: '700', 
        color: '#09389eff' 
    },
    actions: { 
        flexDirection: 'row',
        justifyContent :'space-between',
        alignItems:'center', 
        paddingTop:10,
        
    },
    btn: { 
        width: 38, 
        height: 38, 
        borderRadius: 19, 
        justifyContent: 'center', 
        alignItems: 'center' 
    },
    modalOverlay: { 
        flex: 1, 
        backgroundColor: 'rgba(0,0,0,0.5)', 
        justifyContent: 'center', 
        alignItems: 'center' 
    },
    modalBox: { 
        backgroundColor: '#FFF', 
        width: '85%', 
        padding: 20, 
        borderRadius: 15 
    },
    modalTitle: { 
        fontSize: 16, 
        fontWeight: 'bold', 
        marginBottom: 15 
    },
    textArea: { 
        borderWidth: 1, 
        borderColor: '#EEE', 
        borderRadius: 8, 
        padding: 10, 
        height: 80, 
        textAlignVertical: 'top', 
        marginBottom: 15 
    },
    modalFooter: { 
        flexDirection: 'row', 
        justifyContent: 'flex-end', 
        alignItems: 'center', 
        gap: 20 
    },
    cancelLink: { 
        padding: 10 
    },
    option: { 
        paddingVertical: 12, 
        borderBottomWidth: 1, 
        borderBottomColor: '#EEE' 
    },
    optionText: { 
        fontSize: 14, 
        color: '#333' 
    },
    closeBtn: { 
        marginTop: 15, 
        alignSelf: 'center' 
    }
    
});