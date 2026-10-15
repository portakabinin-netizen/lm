/**
 * 🎯 LeadsEnquiryService.ts
 *
 * PURPOSE:
 * Centralized service for handling lead enquiry actions.
 * Manages site shift configuration modal, quick action state, and lead data.
 *
 * USAGE:
 * - Can be imported into any screen that displays leads (showLeads, leadsAnalytics, etc.)
 * - Handles opening/closing enquiry modal for site shift configuration
 * - Provides quick action interface for batch operations
 */

export interface LeadEnquiryData {
  leadId: string;
  siteName: string;
  senderName?: string;
  status?: string;
  hasSiteShifts?: boolean;
  siteShiftsCount?: number;
}

export interface QuickActionConfig {
  showEnquiry: boolean;
  enquiryLead: LeadEnquiryData | null;
  isLoading: boolean;
  error?: string | null;
}

/**
 * 🔧 LeadsEnquiryService - Static methods for enquiry actions
 */
export const LeadsEnquiryService = {
  /**
   * Check if a lead has site shifts configured
   */
  hasSiteShifts: (lead: any): boolean => {
    if (!lead?.siteShifts || !Array.isArray(lead.siteShifts)) return false;
    const activeSiteShifts = lead.siteShifts.filter((s: any) => s.active !== false);
    return activeSiteShifts.length > 0;
  },

  /**
   * Get site shift status for display
   */
  getSiteShiftStatus: (
    lead: any
  ): {
    configured: boolean;
    count: number;
    activeCount: number;
  } => {
    if (!lead?.siteShifts || !Array.isArray(lead.siteShifts)) {
      return { configured: false, count: 0, activeCount: 0 };
    }
    const active = lead.siteShifts.filter((s: any) => s.active !== false);
    return {
      configured: active.length > 0,
      count: lead.siteShifts.length,
      activeCount: active.length,
    };
  },

  /**
   * Prepare lead data for enquiry modal
   */
  preparLeadEnquiryData: (lead: any): LeadEnquiryData => {
    const status = LeadsEnquiryService.getSiteShiftStatus(lead);
    return {
      leadId: lead._id || lead.id,
      siteName: lead.sender_name || lead.name || 'Unnamed Site',
      senderName: lead.sender_name,
      status: lead.status,
      hasSiteShifts: status.configured,
      siteShiftsCount: status.activeCount,
    };
  },

  /**
   * Get quick action button styles based on shift configuration status
   */
  getQuickActionButtonStyle: (hasShifts: boolean) => ({
    backgroundColor: hasShifts ? '#f0fdf4' : '#fef2f2',
    borderColor: hasShifts ? '#bbf7d0' : '#fecaca',
    buttonText: hasShifts ? '📋 Enquiry' : '🚫 Setup Shifts',
    textColor: hasShifts ? '#15803d' : '#ef4444',
    iconColor: hasShifts ? '#16a34a' : '#ef4444',
  }),

  /**
   * Get action message based on shift configuration
   */
  getActionMessage: (hasShifts: boolean, siteName: string): string => {
    if (hasShifts) {
      return `View/edit site shift configuration for "${siteName}"`;
    }
    return `"${siteName}" has no shift configuration. Configure shifts before starting duty.`;
  },

  /**
   * Validate lead data for enquiry action
   */
  validateLeadForEnquiry: (lead: any): { valid: boolean; error?: string } => {
    if (!lead) return { valid: false, error: 'Lead data not found' };
    if (!lead._id && !lead.id) return { valid: false, error: 'Lead ID missing' };
    if (!lead.sender_name && !lead.name) return { valid: false, error: 'Lead name missing' };
    return { valid: true };
  },
};

/**
 * 🎨 Quick Action Button Templates
 */
export const QUICK_ACTION_TEMPLATES = {
  ENQUIRY: {
    type: 'enquiry',
    icon: 'settings-outline',
    label: 'Enquiry',
    description: 'Configure site shifts',
  },
  SETUP_SHIFTS: {
    type: 'enquiry',
    icon: 'add-circle',
    label: 'Setup Shifts',
    description: 'Configure site shifts',
  },
};

/**
 * 🏷️ Lead Status to Quick Action Mapping
 */
export const LEAD_STATUS_QUICK_ACTIONS = {
  Accepted: ['enquiry', 'activity', 'contact'],
  'Tax Invoice': ['enquiry', 'activity'],
  'Fully Paid': ['enquiry', 'activity'],
  Engaged: ['enquiry', 'contact', 'activity'],
  Recent: ['contact', 'activity'],
  Recycle: ['contact', 'activity'],
};

/**
 * 🔔 Quick Action Event Emitter (for cross-component communication)
 */
export class QuickActionEmitter {
  private static listeners: {
    [key: string]: ((data: any) => void)[];
  } = {};

  static on(event: string, callback: (data: any) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);

    // Return unsubscribe function
    return () => {
      this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
    };
  }

  static emit(event: string, data: any) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach((cb) => cb(data));
  }

  static clear(event?: string) {
    if (event) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
    }
  }
}

/**
 * 📊 Enquiry Analytics Tracker
 */
export const EnquiryAnalytics = {
  trackEnquiryOpen: (leadId: string, leadName: string) => {
    // Log enquiry modal open
    console.log(`[Enquiry] Modal opened for lead ${leadId} (${leadName})`);
  },

  trackShiftConfigChange: (leadId: string, changeCount: number) => {
    // Log shift configuration changes
    console.log(
      `[Enquiry] Shift config updated for lead ${leadId}: ${changeCount} shifts modified`
    );
  },

  trackEnquiryClose: (leadId: string, action: 'saved' | 'cancelled') => {
    // Log enquiry modal close action
    console.log(`[Enquiry] Modal closed for lead ${leadId}: ${action}`);
  },
};

export default LeadsEnquiryService;
