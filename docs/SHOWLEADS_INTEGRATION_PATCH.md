/\*\*

- 🔧 INTEGRATION PATCH: showLeads.tsx
-
- This file shows how to integrate the Lead Enquiry Module into showLeads.tsx
-
- CHANGES REQUIRED:
- 1.  Add imports at the top
- 2.  Add hook initialization in component
- 3.  Add quick action button to render (in ACTION BUTTONS section)
- 4.  Add SiteShiftEditorModal to render
      \*/

// ═══════════════════════════════════════════════════════════════════
// STEP 1: ADD IMPORTS (at top of showLeads.tsx)
// ═══════════════════════════════════════════════════════════════════

import useLeadEnquiry from '@/hooks/useLeadEnquiry';
import { LeadQuickActionButton } from '@/components/LeadQuickActionButton';
import { SiteShiftEditorModal } from '@/modal/SiteShiftEditorModal';

// ═══════════════════════════════════════════════════════════════════
// STEP 2: ADD HOOK IN COMPONENT (inside ShowLeads component)
// ═══════════════════════════════════════════════════════════════════

const ShowLeads = React.memo(({ item, token, onStatusChange, isDark, currentUser, corporateName, corporateEmail }: Props & { corporateName?: string; corporateEmail?: string }) => {
// ... existing state ...
const [isEditing, setIsEditing] = useState(false);
const [isSaving, setIsSaving] = useState(false);
const [showAllActs, setShowAllActs] = useState(false);

// ← ADD THIS: Enquiry modal state
const { enquiryLead, openEnquiry, closeEnquiry, isLoading: enquiryLoading } = useLeadEnquiry();

// ... rest of component ...
});

// ═══════════════════════════════════════════════════════════════════
// STEP 3: ADD QUICK ACTION BUTTON IN RENDER
// ═══════════════════════════════════════════════════════════════════

/\*\*

- BEFORE: Existing Action Buttons section (around line 520 in showLeads.tsx)
-
- {<!-- Action buttons: hidden while editing to avoid accidental calls -->
- {!isEditing && (
-     <View style={styles.slRowGap8 as any}>
-       <TouchableOpacity onPress={doCall} style={[styles.btn, styles.slCallBtnBg] as any}>
-         <MaterialIcons name="call" size={20} color={COLORS.info} />
-       </TouchableOpacity>
-       <TouchableOpacity onPress={doWA} style={[styles.btn, styles.slWaBtnBg] as any}>
-         <MaterialCommunityIcons name="whatsapp" size={20} color={COLORS.success} />
-       </TouchableOpacity>
-       <TouchableOpacity onPress={shareLead} style={[styles.btn, styles.slPlayBtnBg] as any}>
-         <MaterialCommunityIcons name="share-variant" size={20} color={COLORS.info} />
-       </TouchableOpacity>
-     </View>
- )}
- }
  \*/

// AFTER: Add Enquiry Button before other actions

{<!-- Action buttons: hidden while editing to avoid accidental calls -->
{!isEditing && (
<View style={styles.slRowGap8 as any}>
{/_ ← NEW: Enquiry / Quick Action Button _/}
<LeadQuickActionButton
lead={item}
onPress={openEnquiry}
loading={enquiryLoading}
size="small"
variant="compact"
style={{ minWidth: 80 }}
/>

      {/* Existing buttons */}
      <TouchableOpacity onPress={doCall} style={[styles.btn, styles.slCallBtnBg] as any}>
        <MaterialIcons name="call" size={20} color={COLORS.info} />
      </TouchableOpacity>
      <TouchableOpacity onPress={doWA} style={[styles.btn, styles.slWaBtnBg] as any}>
        <MaterialCommunityIcons name="whatsapp" size={20} color={COLORS.success} />
      </TouchableOpacity>
      <TouchableOpacity onPress={shareLead} style={[styles.btn, styles.slPlayBtnBg] as any}>
        <MaterialCommunityIcons name="share-variant" size={20} color={COLORS.info} />
      </TouchableOpacity>
    </View>

)}
}

// ═══════════════════════════════════════════════════════════════════
// STEP 4: ADD ENQUIRY MODAL TO RENDER (at end of component return)
// ═══════════════════════════════════════════════════════════════════

/\*\*

- Add this AFTER the main </View> that wraps the entire lead card
- but inside the component return
  \*/

{/_ ← NEW: Enquiry Modal for Site Shift Configuration _/}
{enquiryLead && (
<SiteShiftEditorModal
visible={!!enquiryLead}
onClose={closeEnquiry}
lead={enquiryLead}
token={token}
onSaved={(updatedLead) => {
closeEnquiry();
onStatusChange?.();
}}
/>
)}

// ═══════════════════════════════════════════════════════════════════
// COMPLETE INTEGRATION SUMMARY
// ═══════════════════════════════════════════════════════════════════

/\*\*

- Changes to showLeads.tsx:
-
- 1.  Import 3 items:
- - useLeadEnquiry hook
- - LeadQuickActionButton component
- - SiteShiftEditorModal component
-
- 2.  Add hook call in component:
- const { enquiryLead, openEnquiry, closeEnquiry, isLoading: enquiryLoading } = useLeadEnquiry();
-
- 3.  Add button in ACTION BUTTONS section:
- <LeadQuickActionButton
-      lead={item}
-      onPress={openEnquiry}
-      loading={enquiryLoading}
-      size="small"
-      variant="compact"
- />
-
- 4.  Add modal at end of component:
- {enquiryLead && (
-      <SiteShiftEditorModal
-        visible={!!enquiryLead}
-        onClose={closeEnquiry}
-        lead={enquiryLead}
-        token={token}
-        onSaved={(updatedLead) => {
-          closeEnquiry();
-          onStatusChange?.();
-        }}
-      />
- )}
-
- TOTAL LINES OF CODE ADDED: ~15 lines
- EXISTING CODE MODIFIED: 0 lines (pure additions)
-
- BENEFITS:
- ✅ Enquiry button shown in all lead displays
- ✅ Button styling changes based on shift configuration status
- ✅ Opens SiteShiftEditorModal for site shift management
- ✅ Refreshes lead status on save
- ✅ Reusable across multiple components
- ✅ No breaking changes to existing code
  \*/

// ═══════════════════════════════════════════════════════════════════
// ALTERNATIVE: Inline implementation (if you prefer not to use hook)
// ═══════════════════════════════════════════════════════════════════

/\*\*

- If you prefer to manage state directly in component:
  \*/

const ShowLeads_Alternative = React.memo(({ item, token, onStatusChange }: any) => {
// Local state for enquiry
const [enquiryLead, setEnquiryLead] = useState<any | null>(null);

const handleOpenEnquiry = async (lead: any) => {
// Validation can be added here
setEnquiryLead(lead);
};

const handleCloseEnquiry = () => {
setEnquiryLead(null);
};

return (
<View>
{/_ Existing lead content _/}

      {/* Button */}
      <LeadQuickActionButton
        lead={item}
        onPress={handleOpenEnquiry}
        size="small"
      />

      {/* Modal */}
      {enquiryLead && (
        <SiteShiftEditorModal
          visible={true}
          onClose={handleCloseEnquiry}
          lead={enquiryLead}
          token={token}
          onSaved={() => {
            handleCloseEnquiry();
            onStatusChange?.();
          }}
        />
      )}
    </View>

);
});

// ═══════════════════════════════════════════════════════════════════
// TESTING CHECKLIST
// ═══════════════════════════════════════════════════════════════════

/\*\*

- After integration, verify:
-
- [ ] Button appears in all lead tiles
- [ ] Button shows "Setup Shifts" (red) if no siteShifts configured
- [ ] Button shows "Enquiry" (green) if siteShifts exist
- [ ] Button click opens SiteShiftEditorModal
- [ ] Saving shifts in modal refreshes lead display
- [ ] Modal can be closed without saving
- [ ] Loading spinner shows during modal open
- [ ] Works with all lead statuses (Recent, Engaged, Accepted, etc.)
- [ ] Mobile responsiveness is maintained
- [ ] No console errors or warnings
      \*/

export default ShowLeads;
