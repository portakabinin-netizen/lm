/**
 * 🪝 useLeadEnquiry.ts
 *
 * PURPOSE:
 * React hook for managing lead enquiry modal state.
 * Encapsulates all enquiry-related logic for reusability.
 *
 * USAGE:
 * const { enquiryLead, openEnquiry, closeEnquiry, isLoading } = useLeadEnquiry();
 *
 * // In render:
 * <TouchableOpacity onPress={() => openEnquiry(lead)}>
 *   <Text>Open Enquiry</Text>
 * </TouchableOpacity>
 *
 * {enquiryLead && (
 *   <SiteShiftEditorModal
 *     visible={!!enquiryLead}
 *     lead={enquiryLead}
 *     onClose={closeEnquiry}
 *     onSaved={handleEnquirySaved}
 *   />
 * )}
 */

import {
  EnquiryAnalytics,
  LeadsEnquiryService,
  QuickActionEmitter,
} from '@/UtilServices/LeadsEnquiryService';
import React, { useCallback, useRef, useState } from 'react';

export interface UseLeadEnquiryReturn {
  enquiryLead: any | null;
  isLoading: boolean;
  error: string | null;
  openEnquiry: (lead: any) => Promise<void>;
  closeEnquiry: () => void;
  resetEnquiry: () => void;
  getEnquiryStatus: () => string;
  canOpenEnquiry: (lead: any) => boolean;
}

/**
 * 🪝 useLeadEnquiry Hook
 */
export const useLeadEnquiry = (): UseLeadEnquiryReturn => {
  const [enquiryLead, setEnquiryLead] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  /**
   * Open enquiry modal for a lead
   */
  const openEnquiry = useCallback(async (lead: any) => {
    setIsLoading(true);
    setError(null);

    try {
      // Validate lead data
      const validation = LeadsEnquiryService.validateLeadForEnquiry(lead);
      if (!validation.valid) {
        setError(validation.error || 'Invalid lead data');
        return;
      }

      // Prepare lead data for enquiry
      const enquiryData = LeadsEnquiryService.preparLeadEnquiryData(lead);

      // Track analytics
      EnquiryAnalytics.trackEnquiryOpen(enquiryData.leadId, enquiryData.siteName);

      // Emit event for other listeners
      QuickActionEmitter.emit('enquiry:opened', enquiryData);

      // Set enquiry lead
      setEnquiryLead(lead);
    } catch (err: any) {
      setError(err?.message || 'Failed to open enquiry');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Close enquiry modal
   */
  const closeEnquiry = useCallback(() => {
    if (enquiryLead) {
      EnquiryAnalytics.trackEnquiryClose(enquiryLead._id, 'cancelled');
      QuickActionEmitter.emit('enquiry:closed', enquiryLead);
    }
    setEnquiryLead(null);
    setError(null);
  }, [enquiryLead]);

  /**
   * Reset enquiry state completely
   */
  const resetEnquiry = useCallback(() => {
    setEnquiryLead(null);
    setIsLoading(false);
    setError(null);
    QuickActionEmitter.clear('enquiry:*');
  }, []);

  /**
   * Get human-readable enquiry status
   */
  const getEnquiryStatus = useCallback((): string => {
    if (isLoading) return 'Loading...';
    if (error) return `Error: ${error}`;
    if (enquiryLead) return `Configuring shifts for ${enquiryLead.sender_name || 'site'}`;
    return 'Ready';
  }, [isLoading, error, enquiryLead]);

  /**
   * Check if a lead can be opened in enquiry
   */
  const canOpenEnquiry = useCallback(
    (lead: any): boolean => {
      return LeadsEnquiryService.validateLeadForEnquiry(lead).valid && !isLoading;
    },
    [isLoading]
  );

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  return {
    enquiryLead,
    isLoading,
    error,
    openEnquiry,
    closeEnquiry,
    resetEnquiry,
    getEnquiryStatus,
    canOpenEnquiry,
  };
};

export default useLeadEnquiry;
