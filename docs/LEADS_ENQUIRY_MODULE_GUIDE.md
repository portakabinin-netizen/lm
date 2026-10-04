/\*\*

- 📋 LEADS ENQUIRY MODULE INTEGRATION GUIDE
-
- This document shows how to integrate the new Lead Enquiry Module
- into existing lead display components.
-
- MODULE STRUCTURE:
- ─────────────────────────────────────────────────────────────────
- 1.  LeadsEnquiryService (UtilServices/LeadsEnquiryService.ts)
- - Core service with static utility methods
- - Handles lead validation, status checks, styling
- - Event emitter for cross-component communication
-
- 2.  useLeadEnquiry Hook (hooks/useLeadEnquiry.ts)
- - React hook for managing enquiry modal state
- - Handles open/close logic, loading states, validation
- - Returns enquiry data and callback functions
-
- 3.  LeadQuickActionButton Component (components/LeadQuickActionButton.tsx)
- - Reusable button component for enquiry action
- - Shows "Enquiry" (green) or "Setup Shifts" (red) based on status
- - Supports multiple sizes and variants
-
- INTEGRATION EXAMPLES:
- ─────────────────────────────────────────────────────────────────
  \*/

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 1: Integration in showLeads.tsx
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useLeadEnquiry from '@/hooks/useLeadEnquiry';
import { LeadQuickActionButton } from '@/components/LeadQuickActionButton';
import { SiteShiftEditorModal } from '@/modal/SiteShiftEditorModal';
import { COLORS } from '@/styles/stylesIndex';

/\*\*

- Example: Updated ShowLeads component with enquiry integration
  \*/
  export const ShowLeadsWithEnquiry = ({ item, token, onRefresh }: any) => {
  const { enquiryLead, openEnquiry, closeEnquiry, isLoading } = useLeadEnquiry();

const handleEnquiryPress = useCallback(async () => {
await openEnquiry(item);
}, [item, openEnquiry]);

const handleEnquirySaved = useCallback(
(updatedLead: any) => {
closeEnquiry();
onRefresh?.();
},
[closeEnquiry, onRefresh]
);

return (
<View>
{/_ Existing lead content _/}
{/_ ... _/}

      {/* QUICK ACTION BUTTON - Replace existing action buttons */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {/* Quick Action: Enquiry Button (NEW) */}
        <LeadQuickActionButton
          lead={item}
          onPress={handleEnquiryPress}
          loading={isLoading}
          size="medium"
          variant="compact"
        />

        {/* Other quick actions can go here */}
        {/* Call, WhatsApp, Email, etc. */}
      </View>

      {/* ENQUIRY MODAL - Automatically managed */}
      {enquiryLead && (
        <SiteShiftEditorModal
          visible={!!enquiryLead}
          onClose={closeEnquiry}
          lead={enquiryLead}
          token={token}
          onSaved={handleEnquirySaved}
        />
      )}
    </View>

);
};

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 2: Usage in Dashboard / Leads List
// ═══════════════════════════════════════════════════════════════════

import { FlatList } from 'react-native';
import LeadsEnquiryService from '@/UtilServices/LeadsEnquiryService';

/\*\*

- Example: Leads dashboard with bulk enquiry actions
  \*/
  export const LeadsDashboardWithEnquiry = ({ leads, token }: any) => {
  const { enquiryLead, openEnquiry, closeEnquiry } = useLeadEnquiry();

// Filter leads that need shift configuration
const leadsNeedingShifts = leads.filter(
(lead: any) => !LeadsEnquiryService.hasSiteShifts(lead)
);

const renderLeadItem = ({ item }: any) => (
<View style={{ marginBottom: 12, padding: 12, backgroundColor: '#fff', borderRadius: 8 }}>
<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
<View style={{ flex: 1 }}>
<Text style={{ fontSize: 14, fontWeight: '700' }}>{item.sender_name}</Text>
<Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
Status: {item.status}
</Text>
</View>
<LeadQuickActionButton
          lead={item}
          onPress={openEnquiry}
          size="small"
          variant="compact"
        />
</View>
</View>
);

return (
<View style={{ flex: 1 }}>
<FlatList
data={leads}
renderItem={renderLeadItem}
keyExtractor={(item) => item.\_id}
/>

      {/* Warning panel for leads without shifts */}
      {leadsNeedingShifts.length > 0 && (
        <View style={{ padding: 12, backgroundColor: '#fef2f2', borderRadius: 8, margin: 12 }}>
          <Text style={{ color: '#dc2626', fontWeight: '700', marginBottom: 4 }}>
            ⚠️ {leadsNeedingShifts.length} site(s) need shift configuration
          </Text>
          <Text style={{ color: '#991b1b', fontSize: 12 }}>
            Configure shifts before starting duty at these sites.
          </Text>
        </View>
      )}

      {/* Enquiry modal */}
      {enquiryLead && (
        <SiteShiftEditorModal
          visible={!!enquiryLead}
          onClose={closeEnquiry}
          lead={enquiryLead}
          token={token}
        />
      )}
    </View>

);
};

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 3: Service Usage - Direct API calls
// ═══════════════════════════════════════════════════════════════════

/\*\*

- Example: Using service directly without hook
  \*/
  export const useLeadsEnquiryService = () => {
  const checkLeadStatus = (lead: any) => {
  const validation = LeadsEnquiryService.validateLeadForEnquiry(lead);
  const status = LeadsEnquiryService.getSiteShiftStatus(lead);
  const message = LeadsEnquiryService.getActionMessage(status.configured, lead.sender_name);

      return {
        isValid: validation.valid,
        hasShifts: status.configured,
        shiftCount: status.activeCount,
        message,
      };

  };

const prepareLeadData = (lead: any) => {
return LeadsEnquiryService.preparLeadEnquiryData(lead);
};

const getButtonStyle = (lead: any) => {
const hasShifts = LeadsEnquiryService.hasSiteShifts(lead);
return LeadsEnquiryService.getQuickActionButtonStyle(hasShifts);
};

return { checkLeadStatus, prepareLeadData, getButtonStyle };
};

// ═══════════════════════════════════════════════════════════════════
// EXAMPLE 4: Event Listener Integration
// ═══════════════════════════════════════════════════════════════════

import { QuickActionEmitter } from '@/UtilServices/LeadsEnquiryService';
import { useEffect } from 'react';

/\*\*

- Example: Listening to enquiry events
  \*/
  export const useLeadsEnquiryEvents = (onEnquiryOpen?: (data: any) => void) => {
  useEffect(() => {
  const unsubscribe = QuickActionEmitter.on('enquiry:opened', (data) => {
  console.log('Enquiry opened for:', data.siteName);
  onEnquiryOpen?.(data);
  });

      return () => unsubscribe?.();

  }, [onEnquiryOpen]);

useEffect(() => {
const unsubscribe = QuickActionEmitter.on('enquiry:closed', (data) => {
console.log('Enquiry closed for:', data.siteName);
});

    return () => unsubscribe?.();

}, []);
};

// ═══════════════════════════════════════════════════════════════════
// QUICK REFERENCE: API
// ═══════════════════════════════════════════════════════════════════

/\*\*

- LeadsEnquiryService Methods:
- ─────────────────────────────
-
- hasSiteShifts(lead: any): boolean
- → Check if lead has active shifts
-
- getSiteShiftStatus(lead: any): { configured: bool, count: number, activeCount: number }
- → Get shift status details
-
- preparLeadEnquiryData(lead: any): LeadEnquiryData
- → Prepare lead data for modal
-
- getQuickActionButtonStyle(hasShifts: boolean): { backgroundColor, borderColor, buttonText, ... }
- → Get button styling based on status
-
- getActionMessage(hasShifts: boolean, siteName: string): string
- → Get user-friendly message
-
- validateLeadForEnquiry(lead: any): { valid: bool, error?: string }
- → Validate lead before opening modal
  \*/

/\*\*

- useLeadEnquiry Hook Return:
- ──────────────────────────
-
- enquiryLead: any | null
- → Current enquiry lead (null when modal closed)
-
- isLoading: boolean
- → Loading state during enquiry open
-
- error: string | null
- → Error message if enquiry failed
-
- openEnquiry(lead: any): Promise<void>
- → Open enquiry modal for lead
-
- closeEnquiry(): void
- → Close enquiry modal
-
- resetEnquiry(): void
- → Reset all state
-
- getEnquiryStatus(): string
- → Get human-readable status string
-
- canOpenEnquiry(lead: any): boolean
- → Check if lead can be opened
  \*/

/\*\*

- LeadQuickActionButton Props:
- ──────────────────────────
-
- lead: any (required)
- → Lead object with \_id, sender_name, siteShifts
-
- onPress: (lead: any) => void | Promise<void> (required)
- → Callback when button is pressed
-
- loading?: boolean (default: false)
- → Show loading spinner
-
- size?: 'small' | 'medium' | 'large' (default: 'medium')
- → Button size
-
- variant?: 'compact' | 'expanded' (default: 'compact')
- → Button layout style
-
- disabled?: boolean (default: false)
- → Disable button interaction
-
- containerStyle?: ViewStyle
- → Override container styles
-
- style?: ViewStyle
- → Override button styles
  \*/

export default {
ShowLeadsWithEnquiry,
LeadsDashboardWithEnquiry,
useLeadsEnquiryService,
useLeadsEnquiryEvents,
};
