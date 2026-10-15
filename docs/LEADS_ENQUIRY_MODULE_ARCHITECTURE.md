/\*\*

- 📚 LEADS ENQUIRY MODULE - ARCHITECTURE & IMPLEMENTATION SUMMARY
-
- Complete reference for the new Lead Enquiry Module system.
- This modular approach provides reusable, maintainable code for
- handling enquiry actions across all lead-related screens.
  \*/

// ═══════════════════════════════════════════════════════════════════
// ARCHITECTURE OVERVIEW
// ═══════════════════════════════════════════════════════════════════

/\*\*

-
- ┌─────────────────────────────────────────────────────────────┐
- │ LEADS ENQUIRY MODULE SYSTEM │
- │ │
- │ ┌──────────────────────────────────────────────────────┐ │
- │ │ PRESENTATION LAYER │ │
- │ │ (React Components) │ │
- │ │ • showLeads.tsx │ │
- │ │ • leadsAnalytics.tsx │ │
- │ │ • Any lead display component │ │
- │ └────────────────┬─────────────────────────────────────┘ │
- │ │ uses │
- │ ┌────────────────▼─────────────────────────────────────┐ │
- │ │ COMPONENT LAYER │ │
- │ │ (Reusable React Components) │ │
- │ │ │ │
- │ │ • LeadQuickActionButton.tsx │ │
- │ │ └─ Rendered button with styling & interactions │ │
- │ │ │ │
- │ │ • SiteShiftEditorModal.tsx (existing) │ │
- │ │ └─ Modal for site shift management │ │
- │ └────────────────┬─────────────────────────────────────┘ │
- │ │ uses │
- │ ┌────────────────▼─────────────────────────────────────┐ │
- │ │ HOOK LAYER │ │
- │ │ (State & Logic Management) │ │
- │ │ │ │
- │ │ • useLeadEnquiry.ts │ │
- │ │ ├─ Manages enquiry modal state │ │
- │ │ ├─ Handles open/close logic │ │
- │ │ ├─ Provides loading & error states │ │
- │ │ └─ Integrates with service layer │ │
- │ └────────────────┬─────────────────────────────────────┘ │
- │ │ uses │
- │ ┌────────────────▼─────────────────────────────────────┐ │
- │ │ SERVICE LAYER │ │
- │ │ (Business Logic & Utilities) │ │
- │ │ │ │
- │ │ • LeadsEnquiryService.ts │ │
- │ │ ├─ hasSiteShifts() │ │
- │ │ ├─ getSiteShiftStatus() │ │
- │ │ ├─ getQuickActionButtonStyle() │ │
- │ │ ├─ validateLeadForEnquiry() │ │
- │ │ └─ QuickActionEmitter (event system) │ │
- │ │ │ │
- │ │ • EnquiryAnalytics (tracking) │ │
- │ └────────────────┬─────────────────────────────────────┘ │
- │ │ │
- │ ┌────────────────▼─────────────────────────────────────┐ │
- │ │ API & DATA LAYER │ │
- │ │ (Backend Integration) │ │
- │ │ │ │
- │ │ Backend Endpoints: │ │
- │ │ • GET /service/leads/:id/shifts │ │
- │ │ • PUT /service/leads/:id/shifts │ │
- │ │ │ │
- │ │ Data Models: │ │
- │ │ • Lead (with siteShifts[]) │ │
- │ │ • SiteShift (shift configuration) │ │
- │ │ • Attendance (duty tracking) │ │
- │ └──────────────────────────────────────────────────────┘ │
- │ │
- └─────────────────────────────────────────────────────────────┘
- \*/

// ═══════════════════════════════════════════════════════════════════
// FILE STRUCTURE & LOCATIONS
// ═══════════════════════════════════════════════════════════════════

/\*\*

-
- PROJECT ROOT
- ├── UtilServices/
- │ └── LeadsEnquiryService.ts .................. Service layer (static methods)
- │
- ├── hooks/
- │ └── useLeadEnquiry.ts ........................ React hook for state management
- │
- ├── components/
- │ └── LeadQuickActionButton.tsx .............. Reusable button component
- │
- ├── modal/
- │ └── SiteShiftEditorModal.tsx ............... Site shift configuration modal
- │
- ├── dashboards/
- │ └── showLeads.tsx .......................... Lead display component (to be updated)
- │
- ├── backend/
- │ ├── controller/
- │ │ └── UserCorpController.js ............. Backend API (getSiteShifts, updateSiteShifts)
- │ │
- │ ├── models/
- │ │ └── TenantModels.js ................... Database schema (siteShifts)
- │ │
- │ └── routes/
- │ └── UserCorpRouter.js ................. API routes
- │
- └── docs/
-     ├── LEADS_ENQUIRY_MODULE_GUIDE.md ........ Integration guide & examples
-     └── SHOWLEADS_INTEGRATION_PATCH.md ....... Specific integration steps
- \*/

// ═══════════════════════════════════════════════════════════════════
// DATA FLOW DIAGRAM
// ═══════════════════════════════════════════════════════════════════

/\*\*

-
- USER INTERACTION FLOW:
- ═══════════════════════════════════════════════════════════════════
-
- 1.  USER SEES LEAD CARD
- │
- ├─ LeadQuickActionButton renders
- ├─ Button checks if lead has siteShifts via LeadsEnquiryService
- ├─ Shows "Setup Shifts" (red) or "Enquiry" (green)
- └─ Button is clickable
-
- 2.  USER CLICKS ENQUIRY BUTTON
- │
- ├─ onClick → openEnquiry(lead) is called (from useLeadEnquiry hook)
- ├─ Hook validates lead via LeadsEnquiryService.validateLeadForEnquiry()
- ├─ Hook emits event via QuickActionEmitter.emit('enquiry:opened')
- └─ State updates: enquiryLead = lead
-
- 3.  MODAL OPENS
- │
- ├─ SiteShiftEditorModal becomes visible
- ├─ Modal fetches shifts via API GET /service/leads/:id/shifts
- ├─ Display shifts with monthly statistics
- └─ User can add/edit/delete shifts
-
- 4.  USER SAVES SHIFTS
- │
- ├─ Modal sends PUT /service/leads/:id/shifts to backend
- ├─ Backend validates and saves siteShifts array
- ├─ Modal calls onSaved callback
- └─ Parent component receives updated lead
-
- 5.  MODAL CLOSES
- │
- ├─ closeEnquiry() is called (from hook)
- ├─ Hook emits event via QuickActionEmitter.emit('enquiry:closed')
- ├─ State updates: enquiryLead = null
- ├─ EnquiryAnalytics.trackEnquiryClose() logs the action
- └─ Parent component refreshes if needed
-
- 6.  LEAD CARD UPDATES
- │
- ├─ Parent calls onStatusChange() or onRefresh()
- ├─ Lead data is refetched or updated
- ├─ LeadQuickActionButton re-renders with new data
- └─ Button now shows updated status (e.g., shifts configured)
- \*/

// ═══════════════════════════════════════════════════════════════════
// KEY COMPONENTS EXPLAINED
// ═══════════════════════════════════════════════════════════════════

/\*\*

- 📦 LeadsEnquiryService (UtilServices/LeadsEnquiryService.ts)
- ────────────────────────────────────────────────────────────────
-
- Purpose: Core business logic and utilities
-
- Key Methods:
-
- hasSiteShifts(lead: any): boolean
- ├─ Checks if lead has active siteShifts
- ├─ Returns: true if activeShifts.length > 0
- └─ Used by: Button styling, validation
-
- getSiteShiftStatus(lead: any): { configured, count, activeCount }
- ├─ Gets detailed shift information
- ├─ Returns: Object with counts and configured flag
- └─ Used by: Analytics, UI rendering
-
- getQuickActionButtonStyle(hasShifts: boolean): { backgroundColor, ... }
- ├─ Returns styling based on shift status
- ├─ Green colors if configured, Red if not
- └─ Used by: LeadQuickActionButton component
-
- validateLeadForEnquiry(lead: any): { valid, error? }
- ├─ Validates lead has required fields
- ├─ Checks: \_id, sender_name
- └─ Used by: useLeadEnquiry hook
-
- QuickActionEmitter: Event system for cross-component communication
- ├─ emit(event, data): Fire events
- ├─ on(event, callback): Listen to events
- └─ Used by: Communication between screens
-
- EnquiryAnalytics: Tracking and logging
- ├─ trackEnquiryOpen(leadId, leadName)
- ├─ trackShiftConfigChange(leadId, changeCount)
- └─ trackEnquiryClose(leadId, action)
- \*/

/\*\*

- 🪝 useLeadEnquiry Hook (hooks/useLeadEnquiry.ts)
- ────────────────────────────────────────────────────────────────
-
- Purpose: React state management for enquiry modal
-
- Returned Values:
-
- enquiryLead: any | null
- └─ Current lead being enquired, null when modal closed
-
- isLoading: boolean
- └─ Loading state during enquiry opening
-
- error: string | null
- └─ Error message if enquiry failed
-
- Functions:
-
- openEnquiry(lead: any): Promise<void>
- ├─ Opens enquiry for lead
- ├─ Validates lead
- ├─ Emits event
- └─ Sets enquiryLead state
-
- closeEnquiry(): void
- ├─ Closes enquiry modal
- ├─ Resets enquiryLead
- └─ Emits event
-
- resetEnquiry(): void
- └─ Resets all state to initial
-
- getEnquiryStatus(): string
- └─ Returns human-readable status
-
- canOpenEnquiry(lead: any): boolean
- └─ Checks if lead can be opened
- \*/

/\*\*

- 🎨 LeadQuickActionButton (components/LeadQuickActionButton.tsx)
- ────────────────────────────────────────────────────────────────
-
- Purpose: Reusable button component for enquiry action
-
- Props:
-
- lead: any (required)
- └─ Lead object with \_id, sender_name, siteShifts
-
- onPress: (lead: any) => void | Promise<void> (required)
- └─ Callback when button is pressed
-
- loading?: boolean
- └─ Show loading spinner
-
- size?: 'small' | 'medium' | 'large'
- └─ Button size
-
- variant?: 'compact' | 'expanded'
- ├─ compact: Small icon + text button
- └─ expanded: Full button with description
-
- disabled?: boolean
- └─ Disable button interaction
-
- Behavior:
- ├─ Checks lead.siteShifts via LeadsEnquiryService
- ├─ Shows "Setup Shifts" (red) if no shifts
- ├─ Shows "Enquiry" (green) if shifts exist
- ├─ Calls onPress(lead) when clicked
- └─ Shows loading spinner while async
- \*/

// ═══════════════════════════════════════════════════════════════════
// INTEGRATION CHECKLIST
// ═══════════════════════════════════════════════════════════════════

/\*\*

-
- STEP 1: Create New Files
- [ ] LeadsEnquiryService.ts in UtilServices/
- [ ] useLeadEnquiry.ts in hooks/
- [ ] LeadQuickActionButton.tsx in components/
-
- STEP 2: Update showLeads.tsx
- [ ] Add imports (3 items)
- [ ] Add useLeadEnquiry hook
- [ ] Add LeadQuickActionButton in render
- [ ] Add SiteShiftEditorModal in render
-
- STEP 3: Test Integration
- [ ] Verify button appears in lead cards
- [ ] Verify styling changes based on siteShifts status
- [ ] Verify modal opens on button click
- [ ] Verify shifts can be added/edited/deleted
- [ ] Verify lead updates after saving
- [ ] Test with different lead statuses
- [ ] Check mobile responsiveness
- [ ] Verify no console errors
-
- STEP 4: Apply to Other Components (Optional)
- [ ] leadsAnalytics.tsx
- [ ] ShiftChangeModal.tsx (already integrated)
- [ ] Any other lead display component
- \*/

// ═══════════════════════════════════════════════════════════════════
// USAGE PATTERNS
// ═══════════════════════════════════════════════════════════════════

/\*\*

-
- PATTERN 1: Basic Integration (Recommended)
- ──────────────────────────────────────────────────────────────────
-
- const MyLeadComponent = () => {
- const { enquiryLead, openEnquiry, closeEnquiry } = useLeadEnquiry();
-
- return (
-     <>
-       <LeadQuickActionButton lead={lead} onPress={openEnquiry} />
-       {enquiryLead && (
-         <SiteShiftEditorModal
-           visible={true}
-           lead={enquiryLead}
-           onClose={closeEnquiry}
-           token={token}
-           onSaved={onRefresh}
-         />
-       )}
-     </>
- );
- };
- \*/

/\*\*

-
- PATTERN 2: Service Usage (Advanced)
- ──────────────────────────────────────────────────────────────────
-
- const MyComponent = () => {
- const hasShifts = LeadsEnquiryService.hasSiteShifts(lead);
- const style = LeadsEnquiryService.getQuickActionButtonStyle(hasShifts);
- const validation = LeadsEnquiryService.validateLeadForEnquiry(lead);
-
- if (!validation.valid) {
-     return <Text>{validation.error}</Text>;
- }
-
- return <Text style={{ color: style.textColor }}>Ready</Text>;
- };
- \*/

/\*\*

-
- PATTERN 3: Event Listening (Advanced)
- ──────────────────────────────────────────────────────────────────
-
- useEffect(() => {
- const unsubscribe = QuickActionEmitter.on('enquiry:opened', (data) => {
-     console.log('Enquiry opened:', data.siteName);
-     // Log analytics, update UI, etc.
- });
-
- return unsubscribe;
- }, []);
- \*/

// ═══════════════════════════════════════════════════════════════════
// TROUBLESHOOTING
// ═══════════════════════════════════════════════════════════════════

/\*\*

-
- Problem: Button not showing
- Solution:
- 1.  Check imports are correct
- 2.  Verify LeadQuickActionButton is rendered
- 3.  Check lead prop has \_id and sender_name
- 4.  Check styling (might be hidden by other elements)
-
- Problem: Modal doesn't open
- Solution:
- 1.  Verify useLeadEnquiry hook is called
- 2.  Check enquiryLead state updates after openEnquiry()
- 3.  Verify SiteShiftEditorModal is rendered
- 4.  Check visible prop is conditional on enquiryLead
-
- Problem: Shifts not loading in modal
- Solution:
- 1.  Check network request to GET /service/leads/:id/shifts
- 2.  Verify lead has \_id
- 3.  Check token is passed correctly
- 4.  Check backend API is responding
-
- Problem: Lead not updating after saving
- Solution:
- 1.  Verify onSaved callback is called
- 2.  Check closeEnquiry() is called
- 3.  Verify onStatusChange() or refresh function is called
- 4.  Check lead data in UI actually updates
- \*/

// ═══════════════════════════════════════════════════════════════════
// PERFORMANCE CONSIDERATIONS
// ═══════════════════════════════════════════════════════════════════

/\*\*

-
- Optimization Tips:
-
- 1.  Memoization
- ├─ LeadQuickActionButton is wrapped in useMemo for style calculations
- ├─ Service methods are static (no instances created)
- └─ Hook returns are stable unless state changes
-
- 2.  Lazy Loading
- ├─ SiteShiftEditorModal loads shifts only when visible
- ├─ API call happens in modal, not in parent
- └─ Parent component unaffected by modal state
-
- 3.  State Management
- ├─ Each component manages its own enquiry state
- ├─ No global state pollution
- └─ Event system for optional cross-component communication
-
- 4.  Re-renders
- ├─ Button only re-renders when lead changes
- ├─ Modal only renders when enquiryLead != null
- └─ Service methods don't cause re-renders
- \*/

export const ArchitectureSummary = {
layers: [
'Presentation (Components)',
'UI Components (Button, Modal)',
'State Management (Hook)',
'Business Logic (Service)',
'API & Data (Backend)',
],
files: [
'LeadsEnquiryService.ts',
'useLeadEnquiry.ts',
'LeadQuickActionButton.tsx',
'showLeads.tsx (to update)',
'SiteShiftEditorModal.tsx (existing)',
],
features: [
'Enquiry modal for site shifts',
'Quick action button with status',
'Event system for communication',
'Analytics tracking',
'Error handling',
'Loading states',
],
benefits: [
'Reusable across components',
'Type-safe with TypeScript',
'No breaking changes',
'Clean separation of concerns',
'Easy to test and maintain',
'Extensible for future features',
],
};
