
import { appService } from "@/UtilServices/appHelper";
import { useUserContext } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { Linking } from "react-native";

export type SellerData = {
    name: string;
    tag: string;
    logo: string;
    email: string;
    mobile: string;
    telephone?: string;
    address: {
        line1?: string;
        city?: string;
        state?: string;
        pincode?: string;
        country?: string;
    };
    gst: string;
    pan: string;
    taxRegistrations: {
        tan?: string; cin?: string; iec?: string; msme_udyam?: string;
        fssai?: string; drug_license?: string; import_export_code?: string;
    };
    bank: Record<string, any>;
    signatory: { name?: string; designation?: string; signature_label?: string };
    Quotation_TC?: string;
    TaxInvoiceTC?: string;
};

export type LocationData = {
    _id: string;
    locationName: string;
    isRegisteredOffice: boolean;
    address: any;
    gstin: string;
    bankDetails: any;
    contactPerson: string;
    contactMobile: string;
    contactEmail: string;
    active: boolean;
    locationType?: "HO" | "RO" | "BO";
};

export const usePIPOTI = (token: string) => {
    const { user } = useUserContext();

    const [seller, setSeller] = useState<SellerData | null>(null);
    const [locations, setLocations] = useState<LocationData[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
    const [buyer, setBuyer] = useState<any | null>(null);
    const [vendor, setVendor] = useState<any | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /* ─────────────────────────────────────────────
       BASE URL (still useful for debug / deep-links)
    ───────────────────────────────────────────── */
    const baseURL = (): string =>
        ((appService.httpClient.defaults.baseURL as string) || "").replace(/\/+$/, "");

    /* ─────────────────────────────────────────────
       FETCH SELLER INFO (from leadsCorporate)
    ───────────────────────────────────────────── */
    const fetchSeller = async () => {
         if (!token) return;
         try {
             setLoading(true);
             const r = await appService.httpClient.get("setting/update/corporate", {
                 headers: { Authorization: `Bearer ${token}` },
             });
             const corp = r.data?.data?.accessCorporate || {};
             const locs: LocationData[] = corp.locations || [];
             setLocations(locs);

             // Resolve current location (by default use HO object _id to print/pdf reports)
             let activeLoc = locs.find(l => l.locationType === 'HO');
             if (!activeLoc) activeLoc = locs.find(l => l.isRegisteredOffice) || locs.find(l => l._id === user?.locationId) || locs[0];
             
             if (activeLoc) {
                 setSelectedLocation(activeLoc);
                 setSeller({
                     name: corp.corporateName || "",
                     tag: corp.corporateTagName || "",
                     logo: corp.CorpProfileImage || "",
                     email: activeLoc.contactEmail || corp.corporateEmail || "",
                     mobile: activeLoc.contactMobile || corp.centralRegistrations?.corporateMobile || "",
                     telephone: corp.centralRegistrations?.corporateTelephone || "",
                     address: {
                         line1: corp.corporateAddress || "",
                         city: corp.corporateCity || "",
                         state: corp.corporateState || "",
                         pincode: corp.corporatePin || "",
                     },
                     gst: activeLoc.gstin || "",
                     pan: corp.corporatePAN || "",
                     taxRegistrations: corp.centralRegistrations || {},
                     bank: activeLoc.bankDetails || {},
                     signatory: corp.authorizedSignatory || {},
                     Quotation_TC: corp.centralRegistrations?.Quotation_TC || "",
                     TaxInvoiceTC: corp.centralRegistrations?.TaxInvoiceTC || "",
                 });
             }
         } catch (e: any) {
             console.error("[usePIPOTI] API error fetchSeller:", e);
             setError(e?.response?.data?.message || e.message || "Unknown error");
         } finally {
             setLoading(false);
         }
    };

    const selectLocation = (locId: string) => {
        const loc = locations.find(l => l._id === locId);
        if (loc) {
            setSelectedLocation(loc);
            // Refresh seller data based on this location
            setSeller(prev => prev ? {
                ...prev,
                email: loc.contactEmail || prev.email,
                mobile: loc.contactMobile || prev.mobile,
                gst: loc.gstin || "",
                bank: loc.bankDetails || {},
            } : null);
        }
    };

    /* ─────────────────────────────────────────────
       FETCH BUYER INFO (from leadsLedger)
    ───────────────────────────────────────────── */
    const fetchBuyer = async (leadId: string) => {
        if (!token) return;
        try {
            setLoading(true);
            const r = await appService.httpClient.get(`service/leads/${leadId}`, {
                 headers: { Authorization: `Bearer ${token}` },
            });
            const leadInfo = r.data?.data || r.data || {};
            setBuyer(leadInfo.buyerInfo || {});
            return leadInfo;
        } catch (e: any) {
            console.error("[usePIPOTI] API error fetchBuyer:", e);
            setError(e?.response?.data?.message || e.message || "Unknown error");
        } finally {
            setLoading(false);
        }
    };

    /* ─────────────────────────────────────────────
       FETCH VENDOR INFO (from purchase schema)
    ───────────────────────────────────────────── */
    const fetchVendor = async (vendorId: string) => {
        if (!token) return;
        try {
            setLoading(true);
            const r = await appService.httpClient.get("service/parties/suppliers", {
                 headers: { Authorization: `Bearer ${token}` },
            });
            const vendors = Array.isArray(r.data) ? r.data : (r.data?.data || r.data?.vendors || []);
            const matched = vendors.find((v: any) => v._id === vendorId);
            setVendor(matched || null);
            return matched;
        } catch (e: any) {
            console.error("[usePIPOTI] API error fetchVendor:", e);
            setError(e?.response?.data?.message || e.message || "Unknown error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSeller();
    }, [token]);

    /* ─────────────────────────────────────────────
       WHATSAPP  (React Native — no window.open)
    ───────────────────────────────────────────── */
    const sendWhatsApp = async (mobile: string, message: string): Promise<void> => {
        if (!mobile) throw new Error("Mobile number is required");
        const url = `https://wa.me/${mobile}?text=${encodeURIComponent(message)}`;
        const canOpen = await Linking.canOpenURL(url);
        if (!canOpen) throw new Error("WhatsApp is not installed on this device");
        await Linking.openURL(url);
    };

    /* ─────────────────────────────────────────────
       EMAIL via device mail client
    ───────────────────────────────────────────── */
    const openEmailClient = async ({
        to,
        subject,
        body,
    }: {
        to: string;
        subject: string;
        body: string;
    }): Promise<void> => {
        const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        const canOpen = await Linking.canOpenURL(url);
        if (!canOpen) throw new Error("No mail client found on this device");
        await Linking.openURL(url);
    };

    /* ─────────────────────────────────────────────
       EMAIL via backend API
       (use this when you want to send HTML email with PDF attachment)
    ───────────────────────────────────────────── */
    const sendEmailAPI = async ({
        to,
        subject,
        html,
    }: {
        to: string;
        subject: string;
        html: string;
    }) => {
        const res = await appService.httpClient.post(
            "common/send-email",
            { to, subject, html },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return res.data;
    };

    /* ─────────────────────────────────────────────
       GENERATE SHARE MESSAGE
    ───────────────────────────────────────────── */
    const generateInvoiceMessage = (invoiceNo: string, amount: number): string => {
        return (
            `Dear Customer,\n\n` +
            `Your Invoice *${invoiceNo}* of amount ₹${amount.toFixed(2)} has been generated.\n\n` +
            `Please find the attached invoice.\n\n` +
            `Regards,\n${seller?.name || "Company"}`
        );
    };

    return {
        seller,
        locations,
        selectedLocation,
        selectLocation,
        buyer,
        vendor,
        loading,
        error,
        baseURL,
        fetchSeller,
        fetchBuyer,
        fetchVendor,
        sendWhatsApp,
        openEmailClient,
        sendEmailAPI,
        generateInvoiceMessage,
    };
};