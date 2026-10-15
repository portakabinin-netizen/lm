import { AppHeader } from '@/components/AppHeader';
import { useAuthActions, useUserContext } from '@/context/AuthContext';
import { useGPSCoordinates } from '@/hooks/useGPSCoordinates';
import { C, useTheme } from '@/hooks/Theme';
import { styles as G } from '@/styles/stylesIndex';
import { appService } from '@/UtilServices/appHelper';
import { DistrictPicker } from '@/UtilServices/DistrictPicker';
import { getStateCodeByName, GST_STATES } from '@/UtilServices/gstConstants';
import { GST_DISTRICTS } from '@/UtilServices/gstDistricts';
import { StatePicker } from '@/UtilServices/StatePicker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Field,
  GenericPicker,
  Row,
  SaveButton,
  SectionCard,
  SectionTitle,
  SelectField,
  str,
  Toggle,
} from './Settingscomponents';

// ─────────────────────────────────────────────────────────────────────────────
//  Corporate Editor
// ─────────────────────────────────────────────────────────────────────────────

const CORP_TABS = [
  { key: 'Basic', label: 'Basic', icon: 'business' },
  { key: 'Branches', label: 'Branches', icon: 'location' },
  { key: 'Registrations', label: 'Legal', icon: 'document-text' },
  { key: 'Signatory', label: 'Sign', icon: 'create' },
  { key: 'Connect', label: 'Connect', icon: 'git-network' },
] as const;
type CorpTab = (typeof CORP_TABS)[number]['key'];

import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';

interface LeadApi {
  b2bName: string;
  url: string;
  userid: string;
  profile_id: string;
  key: string;
  isActive: boolean;
}

interface Branch {
  branchName: string;
  isRegisteredOffice: boolean;
  line1?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  country: string;
  lat?: string;
  long?: string;
  gstin?: string;
  bank_name?: string;
  branch?: string;
  account_number?: string;
  ifsc_code?: string;
  account_type: string;
  contactPerson?: string;
  contactMobile?: string;
  active: boolean;
  _id?: string;
  locationType: 'HO' | 'RO' | 'BO';
  parentId?: string;
}

interface CorpForm {
  corporateName?: string;
  corporateTagName?: string;
  corporateEmail?: string;
  corporateAddress?: string;
  corporateCity?: string;
  corporateDistrict?: string;
  corporateState?: string;
  corporatePin?: string;
  corporateLat?: string;
  corporateLong?: string;
  corporatePAN?: string;
  ownershipType: string;
  corporateActive: boolean;
  CorpProfileImage?: string;
  corporateMobile?: string;
  corporateTelephone?: string;
  Quotation_TC?: string;
  TaxInvoiceTC?: string;
  tan?: string;
  cin?: string;
  iec?: string;
  msme_udyam?: string;
  fssai?: string;
  drug_license?: string;
  import_export_code?: string;
  sig_name: string;
  sig_designation: string;
  sig_signature_label: string;
  sig_signature_img?: string;
  sig_stamp_img?: string;
  leadApis: LeadApi[];
  mail_host: string;
  mail_port: string;
  mail_secure: boolean;
  mail_user?: string;
  mail_pass?: string;
  mail_isActive: boolean;
  msg91_authkey?: string;
  msg91_sender_id?: string;
  msg91_template_id?: string;
  msg91_whatsapp_template_id?: string;
  msg91_isActive: boolean;
  cloudinary_cloud_name?: string;
  cloudinary_api_key?: string;
  cloudinary_api_secret?: string;
  cloudinary_isActive: boolean;
  cloudPlaybackUrl?: string;
  locations: Branch[];
}

const EMPTY_CORP: CorpForm = {
  corporateActive: true,
  ownershipType: 'Proprietorship',
  sig_name: '',
  sig_designation: '',
  sig_signature_label: 'Authorised Signatory',
  sig_signature_img: '',
  sig_stamp_img: '',
  leadApis: [],
  mail_host: 'imap.gmail.com',
  mail_port: '993',
  mail_secure: true,
  mail_isActive: false,
  mail_user: '',
  mail_pass: '',
  msg91_isActive: false,
  cloudinary_isActive: false,
  cloudPlaybackUrl: '',
  locations: [],
  CorpProfileImage: '',
};

const NEW_BRANCH = (): Branch => ({
  branchName: '',
  isRegisteredOffice: false,
  country: 'India',
  active: true,
  account_type: 'Current',
  locationType: 'HO',
  bank_name: '',
  branch: '',
  account_number: '',
  ifsc_code: '',
  gstin: '',
  line1: '',
  city: '',
  state: '',
  pincode: '',
  contactPerson: '',
  contactMobile: '',
});

export const CorporateEditor: React.FC<{
  isDark: boolean;
  token: string;
  onNameLoad?: (name: string) => void;
  refreshGPS: () => Promise<any>;
}> = ({ isDark, token, onNameLoad, refreshGPS }) => {
  const th = useTheme(isDark);
  const { mode } = useLocalSearchParams();
  const router = useRouter();
  const isNew = mode === 'new';
  const { user } = useUserContext();
  const { switchCorporate } = useAuthActions();
  const corporateId = user?.corporateId;
  const corpAdminId = user?.corpAdminId;

  const [tab, setTab] = useState<CorpTab>('Basic');
  const [form, setForm] = useState<CorpForm>(EMPTY_CORP);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Picker States
  const [ownershipPickerVisible, setOwnershipPickerVisible] = useState(false);
  const [statePickerVisible, setStatePickerVisible] = useState(false);
  const [districtPickerVisible, setDistrictPickerVisible] = useState(false);
  const [activeBranchIdx, setActiveBranchIdx] = useState<number | null>(null);
  const [branchPickerType, setBranchPickerType] = useState<'state' | 'district' | 'type' | null>(
    null
  );
  
  // Location Tagging Loading States
  const [hoLocationLoading, setHoLocationLoading] = useState(false);
  const [branchLocationLoading, setBranchLocationLoading] = useState<Record<number, boolean>>({});

  const set = useCallback((k: keyof CorpForm, v: any) => setForm((p) => ({ ...p, [k]: v })), []);

  useEffect(() => {
    if (isNew) {
      setForm(EMPTY_CORP);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await appService.httpClient.get(`/setting/update/corporate`, {
          params: { corporateId, corpAdminId },
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = r.data || {};
        const corp: any = j.data?.accessCorporate ?? {};
        const tr = corp.taxRegistrations ?? {};
        const bk = corp.bankDetails ?? {};
        const sg = corp.authorizedSignatory ?? {};
        const ap = corp.apiUrls ?? {};
        const mc = ap.mailConfigure ?? {};
        const ti = ap.tradeindia ?? {};

        const cName = str(corp.corporateName);
        if (onNameLoad && cName) onNameLoad(cName);
        let hoLocation = (corp.locations || []).find(
          (l: any) => l.locationType === 'HO'
        );
        if (!hoLocation && corp.locations && corp.locations.length > 0) {
          hoLocation = corp.locations.find((l: any) => l.isRegisteredOffice) || corp.locations[0];
        }
        const hoAddr = hoLocation?.address || {};

        setForm({
          corporateName: cName,
          corporateTagName: str(corp.corporateTagName),
          corporateEmail: str(corp.corporateEmail),
          corporateAddress: str(hoAddr.line1),
          corporateCity: str(hoAddr.city),
          corporateDistrict: str(hoAddr.district),
          corporateState: str(hoAddr.state),
          corporatePin: str(hoAddr.pincode),
          corporateLat: hoAddr.lat ? String(hoAddr.lat) : '',
          corporateLong: hoAddr.long ? String(hoAddr.long) : '',
          corporatePAN: str(corp.corporatePAN),
          ownershipType: str(corp.ownershipType) || 'Proprietorship',
          corporateActive: corp.corporateActive ?? true,
          CorpProfileImage: corp.CorpProfileImage || '',

          // Tax Registrations
          tan: str(tr.tan),
          cin: str(tr.cin),
          iec: str(tr.iec),
          msme_udyam: str(tr.msme_udyam),
          fssai: str(tr.fssai),
          drug_license: str(tr.drug_license),
          import_export_code: str(tr.import_export_code),
          corporateMobile: str(tr.corporateMobile),
          corporateTelephone: str(tr.corporateTelephone),
          Quotation_TC: str(tr.Quotation_TC),
          TaxInvoiceTC: str(tr.TaxInvoiceTC),

          // Authorized Signatory
          sig_name: corp.authorizedSignatory?.name || '',

          // Authorized Signatory
          sig_designation: corp.authorizedSignatory?.designation || '',
          sig_signature_label: corp.authorizedSignatory?.signature_label || 'Authorised Signatory',
          sig_signature_img: corp.authorizedSignatory?.signature_img || '',
          sig_stamp_img: corp.authorizedSignatory?.stamp_img || '',

          // Lead APIs
          leadApis: (ap.leadApis || []).map((la: any) => ({
            b2bName: la.b2bName || '',
            url: la.url || '',
            userid: la.userid || '',
            profile_id: la.profile_id || '',
            key: la.key || '',
            isActive: typeof la.isActive === 'boolean' ? la.isActive : true,
          })),

          // Connect Settings (Mail & MSG91)
          mail_host: str(mc.host) ?? 'imap.gmail.com',
          mail_port: str(String(mc.port ?? '')) || '993',
          mail_secure: typeof mc.secure === 'boolean' ? mc.secure : true,
          mail_isActive: typeof mc.isActive === 'boolean' ? mc.isActive : false,
          mail_user: str(mc.auth?.user),
          mail_pass: str(mc.auth?.pass),
          msg91_authkey: str(ap.msg91?.authkey),
          msg91_sender_id: str(ap.msg91?.sender_id),
          msg91_template_id: str(ap.msg91?.template_id),
          msg91_whatsapp_template_id: str(ap.msg91?.whatsapp_template_id),
          msg91_isActive: !!ap.msg91?.isActive,

          cloudinary_cloud_name: str(ap.cloudinary?.cloud_name),
          cloudinary_api_key: str(ap.cloudinary?.api_key),
          cloudinary_api_secret: str(ap.cloudinary?.api_secret),
          cloudinary_isActive: !!ap.cloudinary?.isActive,
          cloudPlaybackUrl: str(ap.cloudPlaybackUrl),

          locations: (corp.locations || []).map((br: any) => ({
            branchName: br.locationName || 'Office',
            isRegisteredOffice: !!br.isRegisteredOffice,
            line1: br.address?.line1,
            city: br.address?.city,
            district: br.address?.district,
            state: br.address?.state,
            pincode: br.address?.pincode,
            country: br.address?.country || 'India',
            lat: br.address?.lat ? String(br.address.lat) : '',
            long: br.address?.long ? String(br.address.long) : '',
            gstin: br.gstin,
            bank_name: br.bankDetails?.bank_name,
            branch: br.bankDetails?.branch,
            account_number: br.bankDetails?.account_number,
            ifsc_code: br.bankDetails?.ifsc_code,
            account_type: br.bankDetails?.account_type || 'Current',
            contactPerson: br.contactPerson,
            contactMobile: br.contactMobile,
            active: typeof br.active === 'boolean' ? br.active : true,
            _id: br._id,
            locationType: br.locationType || 'BO',
            parentId: br.parentId,
          })),
        });
      } catch (e: any) {
        setError(e?.response?.data?.message || e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, corporateId]);

  const handleSave = async (customForm?: CorpForm) => {
    const activeForm = customForm || form;
    if (isNew) {
      if (!activeForm.corporateName) return appService.showToast('Corporate Name is required', 'Error');
      if (!activeForm.corporatePAN || !appService.isValidPAN(activeForm.corporatePAN)) {
        return appService.showToast(
          'Valid 10-character PAN is required for database creation.',
          'Error'
        );
      }
    }

    setSaving(true);
    setError(null);
    try {
      const mappedLocations = activeForm.locations.map((br) => ({
        locationName: br.branchName,
        isRegisteredOffice: br.isRegisteredOffice,
        address: {
          line1: br.line1,
          city: br.city,
          district: br.district,
          state: br.state,
          pincode: br.pincode,
          country: br.country,
          lat: br.lat ? Number(br.lat) : undefined,
          long: br.long ? Number(br.long) : undefined,
        },
        gstin: br.gstin,
        bankDetails: {
          bank_name: br.bank_name,
          branch: br.branch,
          account_number: br.account_number,
          ifsc_code: br.ifsc_code,
          account_type: br.account_type,
        },
        contactMobile: br.contactMobile,
        contactPerson: br.contactPerson,
        active: br.active,
        locationType: br.locationType,
        parentId: br.parentId,
        _id: br._id,
      }));

      // Force inject HO details from the Basic tab into the HO location
      let hoIdx = mappedLocations.findIndex(
        (l) => l.locationType === 'HO'
      );
      if (hoIdx < 0) {
        // Fallback for legacy data: find any Registered Office or Head Office location to convert it to HO
        hoIdx = mappedLocations.findIndex(
          (l) =>
            l.isRegisteredOffice ||
            l.locationName === 'Registered Office' ||
            l.locationName === 'Head Office'
        );
      }

      if (hoIdx >= 0) {
        mappedLocations[hoIdx].locationName = 'Head Office';
        mappedLocations[hoIdx].locationType = 'HO';
        mappedLocations[hoIdx].isRegisteredOffice = true;
        mappedLocations[hoIdx].address.line1 = activeForm.corporateAddress || mappedLocations[hoIdx].address.line1;
        mappedLocations[hoIdx].address.city = activeForm.corporateCity || mappedLocations[hoIdx].address.city;
        mappedLocations[hoIdx].address.district = activeForm.corporateDistrict || mappedLocations[hoIdx].address.district;
        mappedLocations[hoIdx].address.state = activeForm.corporateState || mappedLocations[hoIdx].address.state;
        mappedLocations[hoIdx].address.pincode = activeForm.corporatePin || mappedLocations[hoIdx].address.pincode;
        mappedLocations[hoIdx].address.lat = activeForm.corporateLat
          ? Number(activeForm.corporateLat)
          : mappedLocations[hoIdx].address.lat;
        mappedLocations[hoIdx].address.long = activeForm.corporateLong
          ? Number(activeForm.corporateLong)
          : mappedLocations[hoIdx].address.long;
      } else {
        mappedLocations.unshift({
          _id: undefined,
          locationName: 'Head Office',
          locationType: 'HO',
          isRegisteredOffice: true,
          address: {
            line1: activeForm.corporateAddress,
            city: activeForm.corporateCity,
            district: activeForm.corporateDistrict,
            state: activeForm.corporateState,
            pincode: activeForm.corporatePin,
            country: 'India',
            lat: activeForm.corporateLat ? Number(activeForm.corporateLat) : undefined,
            long: activeForm.corporateLong ? Number(activeForm.corporateLong) : undefined,
          },
          gstin: activeForm.corporatePAN,
          bankDetails: {
            bank_name: '',
            branch: '',
            account_number: '',
            ifsc_code: '',
            account_type: 'Current',
          },
          contactMobile: '',
          contactPerson: '',
          active: true,
          parentId: undefined,
        });
        hoIdx = 0;
      }

      // Enforce only one location matches locationType === 'HO'
      mappedLocations.forEach((l, i) => {
        if (i !== hoIdx && l.locationType === 'HO') {
          l.locationType = 'BO';
        }
      });

      const payload = {
        corporateName: activeForm.corporateName,
        corporateTagName: activeForm.corporateTagName,
        corporateEmail: activeForm.corporateEmail,
        corporateAddress: activeForm.corporateAddress,
        corporateCity: activeForm.corporateCity,
        corporateDistrict: activeForm.corporateDistrict,
        corporateState: activeForm.corporateState,
        corporatePin: activeForm.corporatePin,
        corporatePAN: activeForm.corporatePAN,
        ownershipType: activeForm.ownershipType,
        corporateActive: activeForm.corporateActive,
        CorpProfileImage: activeForm.CorpProfileImage,

        centralRegistrations: {
          tan: activeForm.tan,
          cin: activeForm.cin,
          iec: activeForm.iec,
          msme_udyam: activeForm.msme_udyam,
          fssai: activeForm.fssai,
          drug_license: activeForm.drug_license,
          import_export_code: activeForm.import_export_code,
          corporateMobile: activeForm.corporateMobile,
          corporateTelephone: activeForm.corporateTelephone,
          Quotation_TC: activeForm.Quotation_TC,
          TaxInvoiceTC: activeForm.TaxInvoiceTC,
        },
        authorizedSignatory: {
          name: str(activeForm.sig_name),
          designation: str(activeForm.sig_designation),
          signature_label: str(activeForm.sig_signature_label),
          signature_img: activeForm.sig_signature_img,
          stamp_img: activeForm.sig_stamp_img,
        },
        apiUrls: {
          leadApis: activeForm.leadApis.map((la) => ({
            b2bName: la.b2bName,
            url: la.url,
            userid: la.userid,
            profile_id: la.profile_id,
            key: la.key,
            isActive: la.isActive,
          })),
          mailConfigure: {
            host: activeForm.mail_host,
            port: parseInt(activeForm.mail_port) || 0,
            secure: activeForm.mail_secure,
            isActive: activeForm.mail_isActive,
            auth: { user: activeForm.mail_user, pass: activeForm.mail_pass },
          },
          msg91: {
            authkey: activeForm.msg91_authkey,
            sender_id: activeForm.msg91_sender_id,
            template_id: activeForm.msg91_template_id,
            whatsapp_template_id: activeForm.msg91_whatsapp_template_id,
            isActive: activeForm.msg91_isActive,
          },
          cloudinary: {
            cloud_name: activeForm.cloudinary_cloud_name,
            api_key: activeForm.cloudinary_api_key,
            api_secret: activeForm.cloudinary_api_secret,
            isActive: activeForm.cloudinary_isActive,
          },
          cloudPlaybackUrl: activeForm.cloudPlaybackUrl,
        },
        locations: mappedLocations,
      };

      const endpoint = isNew ? `/setting/update/add-corporate` : `/setting/update/corporate`;
      const method = isNew ? 'post' : 'put';

      const res = await appService.httpClient[method](endpoint, payload, {
        params: isNew ? {} : { corporateId, corpAdminId },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (isNew && res.data?.data?.dbName) {
        appService.showToast('New corporate created! Switching...', 'Success');
        const newDbName = res.data.data.dbName;
        setTimeout(async () => {
          await switchCorporate(newDbName);
          router.replace('/');
        }, 1500);
      } else {
        setSaved(true);
        appService.showToast('Corporate profile updated', 'Success');
      }
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message);
      appService.showToast(e?.response?.data?.message || e.message, 'Error');
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (field: 'sig_signature_img' | 'sig_stamp_img') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: field === 'sig_signature_img' ? [3, 1] : [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setSaving(true);
      try {
        const mimeType = result.assets[0].mimeType || 'image/jpeg';
        const res = await appService.httpClient.post('auth/update-profile-image', {
          userId: user?.userId,
          imageBase64: `data:${mimeType};base64,${result.assets[0].base64}`,
          fieldToUpdate: 'CorpProfileImage', // Temporary workaround using generic endpoint
        });
        if (res.data.success) {
          set(field, res.data.url);
          appService.showToast('Image uploaded!', 'Success');
        }
      } catch (e: any) {
        appService.showToast('Upload failed', 'Error');
      } finally {
        setSaving(false);
      }
    }
  };

  const tabContent: Record<CorpTab, React.ReactNode> = {
    Basic: (
      <>
        <SectionCard th={th}>
          <SectionTitle label="Company Identity" icon="🏢" th={th} />
          <Field
            th={th}
            label="Corporate Name"
            value={form.corporateName}
            onChange={(v: any) => set('corporateName', v)}
            autoCapitalize="words"
            icon="business"
          />
          <SelectField
            th={th}
            label="Ownership Type"
            value={form.ownershipType}
            onPress={() => setOwnershipPickerVisible(true)}
            icon="people"
          />
          <Field
            th={th}
            label="Tagline / Short Name"
            value={form.corporateTagName}
            onChange={(v: any) => set('corporateTagName', v)}
            icon="pricetag"
          />

          <View
            style={[
              G.mb16,
              G.p12,
              G.br8,
              { backgroundColor: th.inputBg, borderWidth: 1, borderColor: th.border },
            ]}
          >
            <Field
              th={th}
              label="Head Office Address"
              value={form.corporateAddress}
              onChange={(v: any) => set('corporateAddress', v)}
              multiline
              numberOfLines={3}
              icon="location"
            />

            <Row>
              <Field
                th={th}
                label="HO Latitude"
                value={form.corporateLat || ''}
                onChange={() => {}}
                half
                editable={false}
                icon="pin-outline"
              />
              <Field
                th={th}
                label="HO Longitude"
                value={form.corporateLong || ''}
                onChange={() => {}}
                half
                editable={false}
                icon="pin-outline"
              />
            </Row>

            <View style={[G.row, { justifyContent: 'flex-end', marginTop: 8 }]}>
              <TouchableOpacity
                style={[
                  G.rowCenter,
                  G.ph12,
                  { paddingVertical: 6, borderRadius: 6 },
                  { backgroundColor: C.primary + '20' },
                ]}
                onPress={async () => {
                  if (hoLocationLoading) return;
                  try {
                    setHoLocationLoading(true);
                    const loc = await refreshGPS();
                    if (loc && loc.latitude && loc.longitude) {
                      setForm((prev) => {
                        const updated = { ...prev };
                        updated.corporateLat = String(loc.latitude);
                        updated.corporateLong = String(loc.longitude);
                        if (loc.reverseGeoCity && loc.reverseGeoCity !== 'Unknown') updated.corporateCity = loc.reverseGeoCity;
                        
                        // Match state from geocoder result — only update if a positive match is found;
                        // never clear an existing value when matching fails
                        if (loc.reverseGeoState) {
                          const lowerState = loc.reverseGeoState.trim().toLowerCase();
                          const foundState = GST_STATES.find(s => {
                            const lowerName = s.name.toLowerCase();
                            return lowerName.includes(lowerState) || lowerState.includes(lowerName);
                          });
                          if (foundState) {
                            updated.corporateState = foundState.name;
                            // Match district only when state matched
                            if (loc.reverseGeoDistrict) {
                              const stateCode = getStateCodeByName(foundState.name);
                              const districtsList = GST_DISTRICTS[stateCode] || [];
                              const lowerDist = loc.reverseGeoDistrict.trim().toLowerCase();
                              const foundDist = districtsList.find(d => {
                                const lowerName = d.toLowerCase();
                                return lowerName.includes(lowerDist) || lowerDist.includes(lowerName);
                              });
                              if (foundDist) {
                                updated.corporateDistrict = foundDist;
                              } else {
                                // District name mismatch — log for debugging, leave field unchanged
                                console.warn(`[TagLocation HO] District not matched: "${loc.reverseGeoDistrict}" for state "${foundState.name}"`);
                              }
                            }
                          } else {
                            // State name mismatch — log, leave field unchanged
                            console.warn(`[TagLocation HO] State not matched: "${loc.reverseGeoState}"`);
                          }
                        }
                        
                        // Pincode is a raw string, always apply when returned
                        if (loc.reverseGeoPincode && loc.reverseGeoPincode.length === 6) updated.corporatePin = loc.reverseGeoPincode;
                        return updated;
                      });
                      appService.showToast('Location tagged successfully!', 'Success');
                    }
                  } catch (e: any) {
                    appService.showToast(e.message || 'Could not get location', 'Error');
                  } finally {
                    setHoLocationLoading(false);
                  }
                }}
              >
                {hoLocationLoading ? (
                  <ActivityIndicator size="small" color={C.primary} style={G.mr4 as any} />
                ) : (
                  <Ionicons name="locate" size={16} color={C.primary} style={G.mr4} />
                )}
                <Text style={[G.fs12, G.bold600, { color: C.primary }]}>
                  {hoLocationLoading ? 'Tagging...' : 'Tag Location'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Row>
            <Field
              th={th}
              label="HO City / Town"
              value={form.corporateCity}
              onChange={(v: any) => set('corporateCity', v)}
              half
              icon="map"
            />
            <SelectField
              th={th}
              label="HO District"
              value={form.corporateDistrict}
              onPress={() => setDistrictPickerVisible(true)}
              half
              icon="navigate"
            />
          </Row>

          <Row>
            <SelectField
              th={th}
              label="HO State"
              value={form.corporateState}
              onPress={() => setStatePickerVisible(true)}
              half
              icon="flag"
            />
            <Field
              th={th}
              label="HO Pincode"
              value={form.corporatePin}
              onChange={(v: any) => set('corporatePin', v)}
              keyboardType="numeric"
              half
              icon="pin"
            />
          </Row>

          <Field
            th={th}
            label="Tag / Short Name"
            value={form.corporateTagName}
            onChange={(v: any) => set('corporateTagName', v)}
            autoCapitalize="characters"
            icon="bookmark"
          />
          <Field
            th={th}
            label="Corporate Email"
            value={form.corporateEmail}
            onChange={(v: any) => set('corporateEmail', v)}
            keyboardType="email-address"
            icon="mail"
          />
          <Toggle
            label="Corporate Active"
            description="Deactivate to disable this corporate from the system"
            value={form.corporateActive}
            onChange={(v) => set('corporateActive', v)}
            th={th}
          />
        </SectionCard>
        <SectionCard th={th}>
          <SectionTitle label="Identity & Contact" icon="📍" th={th} />
          <Row>
            <Field
              th={th}
              label="Regd. Mobile"
              value={form.corporateMobile}
              onChange={(v: any) => set('corporateMobile', v)}
              keyboardType="phone-pad"
              half
              icon="call"
            />
            <Field
              th={th}
              label="Regd. Telephone"
              value={form.corporateTelephone}
              onChange={(v: any) => set('corporateTelephone', v)}
              keyboardType="phone-pad"
              half
              icon="phone-portrait"
            />
          </Row>
        </SectionCard>
        <SectionCard th={th}>
          <SectionTitle th={th} label="Global Terms & Conditions" icon="📜" />
          <Text style={[G.fs13, G.mb12, { color: th.txtSec }]}>
            Set your default terms for documents.
          </Text>
          <Field
            th={th}
            label="Quotation T&C"
            value={form.Quotation_TC}
            onChange={(v: any) => set('Quotation_TC', v)}
            autoCapitalize="none"
          />
          <Field
            th={th}
            label="Tax Invoice T&C"
            value={form.TaxInvoiceTC}
            onChange={(v: any) => set('TaxInvoiceTC', v)}
            autoCapitalize="none"
          />
        </SectionCard>
      </>
    ),
    Branches: (
      <>
        <SectionCard th={th}>
          <SectionTitle label="Branch Offices & Locations" icon="🏢" th={th} />
          <Text style={[G.fs13, G.mb12, { color: th.txtSec }]}>
            Manage multiple office locations. The 'Head Office' will be used as the primary for
            legal documents.
          </Text>
          {form.locations.map((br, idx) => (
            <View
              key={idx}
              style={[
                G.mb16,
                G.pv12,
                G.ph12,
                G.br14,
                { backgroundColor: th.inputBg, borderWidth: 1, borderColor: th.border },
              ]}
            >
              <View style={G.rowBetween}>
                <Text style={[G.fs14, G.bold800, { color: th.txt }]}>
                  {br.branchName || `Location ${idx + 1}`}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const nb = [...form.locations];
                    nb.splice(idx, 1);
                    set('locations', nb);
                  }}
                >
                  <Ionicons name="trash" size={18} color={C.danger} />
                </TouchableOpacity>
              </View>

              <View style={G.mt12}>
                <Field
                  th={th}
                  label="Branch Name"
                  value={br.branchName}
                  onChange={(v) => {
                    const nb = [...form.locations];
                    nb[idx].branchName = v || '';
                    set('locations', nb);
                  }}
                  icon="location-outline"
                />

                <SelectField
                  th={th}
                  label="Office Type"
                  value={br.locationType === 'RO' ? 'Regional Office' : 'Branch Office'}
                  onPress={() => {
                    setActiveBranchIdx(idx);
                    setBranchPickerType('type');
                  }}
                  icon="ribbon-outline"
                />

                <View
                  style={[
                    G.mb16,
                    G.p12,
                    G.br8,
                    { backgroundColor: th.inputBg, borderWidth: 1, borderColor: th.border },
                  ]}
                >
                  <Field
                    th={th}
                    label="Branch Address"
                    value={br.line1}
                    onChange={(v) => {
                      const nb = [...form.locations];
                      nb[idx].line1 = v || '';
                      set('locations', nb);
                    }}
                    multiline
                    numberOfLines={3}
                    icon="map-outline"
                  />

                  <Row>
                    <Field
                      th={th}
                      label="Latitude"
                      value={br.lat || ''}
                      onChange={() => {}}
                      half
                      editable={false}
                      icon="pin-outline"
                    />
                    <Field
                      th={th}
                      label="Longitude"
                      value={br.long || ''}
                      onChange={() => {}}
                      half
                      editable={false}
                      icon="pin-outline"
                    />
                  </Row>

                  <View style={[G.row, { justifyContent: 'flex-end', marginTop: 8 }]}>
                    <TouchableOpacity
                      style={[
                        G.rowCenter,
                        G.ph12,
                        { paddingVertical: 6, borderRadius: 6 },
                        { backgroundColor: C.primary + '20' },
                      ]}
                      onPress={async () => {
                        if (branchLocationLoading[idx]) return;
                        try {
                          setBranchLocationLoading(p => ({ ...p, [idx]: true }));
                          const loc = await refreshGPS();
                          if (loc && loc.latitude && loc.longitude) {
                            const nb = [...form.locations];
                            nb[idx].lat = String(loc.latitude);
                            nb[idx].long = String(loc.longitude);
                            if (loc.reverseGeoCity && loc.reverseGeoCity !== 'Unknown') nb[idx].city = loc.reverseGeoCity;
                            
                            // Match state from geocoder result — only update if a positive match is found;
                            // never clear an existing value when matching fails
                            if (loc.reverseGeoState) {
                              const lowerState = loc.reverseGeoState.trim().toLowerCase();
                              const foundState = GST_STATES.find(s => {
                                const lowerName = s.name.toLowerCase();
                                return lowerName.includes(lowerState) || lowerState.includes(lowerName);
                              });
                              if (foundState) {
                                nb[idx].state = foundState.name;
                                // Match district only when state matched
                                if (loc.reverseGeoDistrict) {
                                  const stateCode = getStateCodeByName(foundState.name);
                                  const districtsList = GST_DISTRICTS[stateCode] || [];
                                  const lowerDist = loc.reverseGeoDistrict.trim().toLowerCase();
                                  const foundDist = districtsList.find(d => {
                                    const lowerName = d.toLowerCase();
                                    return lowerName.includes(lowerDist) || lowerDist.includes(lowerName);
                                  });
                                  if (foundDist) {
                                    nb[idx].district = foundDist;
                                  } else {
                                    console.warn(`[TagLocation BO] District not matched: "${loc.reverseGeoDistrict}" for state "${foundState.name}"`);
                                  }
                                }
                              } else {
                                console.warn(`[TagLocation BO] State not matched: "${loc.reverseGeoState}"`);
                              }
                            }
                            
                            if (loc.reverseGeoPincode && loc.reverseGeoPincode.length === 6) nb[idx].pincode = loc.reverseGeoPincode;
                            set('locations', nb);
                            appService.showToast('Location tagged successfully!', 'Success');
                          }
                        } catch (e: any) {
                          appService.showToast(e.message || 'Could not get location', 'Error');
                        } finally {
                          setBranchLocationLoading(p => ({ ...p, [idx]: false }));
                        }
                      }}
                    >
                      {branchLocationLoading[idx] ? (
                        <ActivityIndicator size="small" color={C.primary} style={G.mr4 as any} />
                      ) : (
                        <Ionicons name="locate" size={16} color={C.primary} style={G.mr4} />
                      )}
                      <Text style={[G.fs12, G.bold600, { color: C.primary }]}>
                        {branchLocationLoading[idx] ? 'Tagging...' : 'Tag Location'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Row>
                  <SelectField
                    th={th}
                    label="City / District"
                    value={br.district || br.city}
                    onPress={() => {
                      setActiveBranchIdx(idx);
                      setBranchPickerType('district');
                    }}
                    half
                    icon="business-outline"
                  />
                  <SelectField
                    th={th}
                    label="State"
                    value={br.state}
                    onPress={() => {
                      setActiveBranchIdx(idx);
                      setBranchPickerType('state');
                    }}
                    half
                    icon="navigate-outline"
                  />
                </Row>

                <Row>
                  <Field
                    th={th}
                    label="Pincode"
                    value={br.pincode}
                    onChange={(v) => {
                      const nb = [...form.locations];
                      nb[idx].pincode = v;
                      set('locations', nb);
                    }}
                    half
                    keyboardType="numeric"
                    icon="pin-outline"
                  />
                  <Field
                    th={th}
                    label="GSTIN"
                    value={br.gstin}
                    onChange={(v) => {
                      const nb = [...form.locations];
                      nb[idx].gstin = v;
                      set('locations', nb);
                    }}
                    half
                    autoCapitalize="characters"
                    icon="document-text-outline"
                  />
                </Row>

                <Row>
                  <Field
                    th={th}
                    label="Contact Person"
                    value={br.contactPerson}
                    onChange={(v) => {
                      const nb = [...form.locations];
                      nb[idx].contactPerson = v;
                      set('locations', nb);
                    }}
                    half
                    icon="person-outline"
                  />
                  <Field
                    th={th}
                    label="Contact Mobile"
                    value={br.contactMobile}
                    onChange={(v) => {
                      const nb = [...form.locations];
                      nb[idx].contactMobile = v;
                      set('locations', nb);
                    }}
                    half
                    keyboardType="numeric"
                    icon="call-outline"
                  />
                </Row>

                <View style={[G.mt12, G.pt12, { borderTopWidth: 1, borderTopColor: th.border }]}>
                  <View style={[G.rowBetween, G.mb12]}>
                    <SectionTitle label="Branch Banking" icon="🏦" th={th} />
                  </View>
                  <Row>
                    <Field
                      th={th}
                      label="Bank Name"
                      value={br.bank_name}
                      onChange={(v) => {
                        const nb = [...form.locations];
                        nb[idx].bank_name = v;
                        set('locations', nb);
                      }}
                      half
                      icon="business"
                    />
                    <Field
                      th={th}
                      label="Branch"
                      value={br.branch}
                      onChange={(v) => {
                        const nb = [...form.locations];
                        nb[idx].branch = v;
                        set('locations', nb);
                      }}
                      half
                      icon="trail-sign"
                    />
                  </Row>
                  <Row>
                    <Field
                      th={th}
                      label="Account No."
                      value={br.account_number}
                      onChange={(v) => {
                        const nb = [...form.locations];
                        nb[idx].account_number = v;
                        set('locations', nb);
                      }}
                      half
                      icon="card"
                    />
                    <Field
                      th={th}
                      label="IFSC"
                      value={br.ifsc_code}
                      onChange={(v) => {
                        const nb = [...form.locations];
                        nb[idx].ifsc_code = v;
                        set('locations', nb);
                      }}
                      half
                      icon="barcode"
                    />
                  </Row>

                  <Text style={[G.fs11, G.bold700, G.mb8, G.mt8, { color: th.txtSec }]}>
                    ACCOUNT TYPE
                  </Text>
                  <View style={[G.row, { gap: 8 }]}>
                    {['Current', 'Savings', 'OD', 'CC'].map((t) => {
                      const active = br.account_type === t;
                      return (
                        <TouchableOpacity
                          key={t}
                          onPress={() => {
                            const nb = [...form.locations];
                            nb[idx].account_type = t;
                            set('locations', nb);
                          }}
                          style={[
                            G.pv8,
                            G.ph12,
                            G.br10,
                            {
                              backgroundColor: active ? th.primary : th.inputBg,
                              borderWidth: 1,
                              borderColor: active ? th.primary : th.border,
                            },
                          ]}
                        >
                          <Text style={[G.fs12, G.bold700, { color: active ? '#fff' : th.txtSec }]}>
                            {t}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Hierarchy Settings */}
                <View style={[G.mt8, G.pt8, { borderTopWidth: 1, borderTopColor: th.border }]}>
                  <Text style={[G.fs12, G.bold700, G.mb8, { color: th.txtSec }]}>
                    OFFICE HIERARCHY
                  </Text>
                  <Row>
                    <View style={{ flex: 0.4 }}>
                      <Text style={[G.fs11, G.bold700, G.mb4, { color: th.txtSec }]}>TYPE</Text>
                      <View style={G.rowCenter}>
                        {['HO', 'RO', 'BO'].map((type) => (
                          <TouchableOpacity
                            key={type}
                            onPress={() => {
                              const nb = [...form.locations];
                              nb[idx].locationType = type as any;
                              set('locations', nb);
                            }}
                            style={[
                              G.pv8,
                              G.ph10,
                              G.br8,
                              G.mr4,
                              {
                                backgroundColor: br.locationType === type ? C.primary : th.inputBg,
                                borderWidth: 1,
                                borderColor: br.locationType === type ? C.primary : th.border,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: '800',
                                color: br.locationType === type ? '#fff' : th.txtSec,
                              }}
                            >
                              {type}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={{ flex: 0.6 }}>
                      <Text style={[G.fs11, G.bold700, G.mb4, { color: th.txtSec }]}>
                        PARENT OFFICE
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <TouchableOpacity
                          onPress={() => {
                            const nb = [...form.locations];
                            nb[idx].parentId = undefined;
                            set('locations', nb);
                          }}
                          style={[
                            G.pv8,
                            G.ph10,
                            G.br8,
                            G.mr4,
                            {
                              backgroundColor: !br.parentId ? C.success + '20' : th.inputBg,
                              borderWidth: 1,
                              borderColor: !br.parentId ? C.success : th.border,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '800',
                              color: !br.parentId ? C.success : th.txtSec,
                            }}
                          >
                            NONE (TOP)
                          </Text>
                        </TouchableOpacity>
                        {form.locations
                          .filter(
                            (l, i) =>
                              i !== idx && (l.locationType === 'HO' || l.locationType === 'RO')
                          )
                          .map((parent) => (
                            <TouchableOpacity
                              key={parent._id || parent.branchName}
                              onPress={() => {
                                const nb = [...form.locations];
                                nb[idx].parentId = parent._id;
                                set('locations', nb);
                              }}
                              style={[
                                G.pv8,
                                G.ph10,
                                G.br8,
                                G.mr4,
                                {
                                  backgroundColor:
                                    br.parentId === parent._id ? C.primary + '20' : th.inputBg,
                                  borderWidth: 1,
                                  borderColor: br.parentId === parent._id ? C.primary : th.border,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '800',
                                  color: br.parentId === parent._id ? C.primary : th.txtSec,
                                }}
                              >
                                {parent.branchName || 'Unnamed'}
                              </Text>
                            </TouchableOpacity>
                          ))}
                      </ScrollView>
                    </View>
                  </Row>
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={[
              G.pv12,
              G.ph16,
              G.br14,
              G.rowCenter,
              {
                backgroundColor: th.inputBg,
                borderStyle: 'dashed',
                borderWidth: 2,
                borderColor: th.border,
              },
            ]}
            onPress={() => {
              set('locations', [...form.locations, NEW_BRANCH()]);
            }}
          >
            <Ionicons name="add-circle" size={24} color={th.primary} />
            <Text style={[G.fs14, G.bold700, G.ml8, { color: th.primary }]}>
              Add New Branch / Location
            </Text>
          </TouchableOpacity>
        </SectionCard>
      </>
    ),
    Registrations: (
      <SectionCard th={th}>
        <SectionTitle label="Tax Registrations" icon="📋" th={th} />
        <Row>
          <Field
            th={th}
            label="PAN"
            value={form.corporatePAN}
            onChange={(v: any) => set('corporatePAN', v)}
            autoCapitalize="characters"
            half
            icon="card"
            editable={isNew}
          />
          <Field
            th={th}
            label="TAN"
            value={form.tan}
            onChange={(v: any) => set('tan', v)}
            autoCapitalize="characters"
            half
            icon="receipt"
          />
        </Row>
        <Row>
          <Field
            th={th}
            label="CIN"
            value={form.cin}
            onChange={(v: any) => set('cin', v)}
            autoCapitalize="characters"
            half
            icon="ribbon"
          />
          <Field
            th={th}
            label="IEC"
            value={form.iec}
            onChange={(v: any) => set('iec', v)}
            autoCapitalize="characters"
            half
            icon="airplane"
          />
        </Row>
        <Row>
          <Field
            th={th}
            label="MSME / Udyam"
            value={form.msme_udyam}
            onChange={(v: any) => set('msme_udyam', v)}
            autoCapitalize="characters"
            half
            icon="briefcase"
          />
          <Field
            th={th}
            label="FSSAI Licence"
            value={form.fssai}
            onChange={(v: any) => set('fssai', v)}
            half
            icon="fast-food"
          />
        </Row>
        <Row>
          <Field
            th={th}
            label="Drug Licence"
            value={form.drug_license}
            onChange={(v: any) => set('drug_license', v)}
            half
            icon="medical"
          />
          <Field
            th={th}
            label="Import / Export Code (IEC)"
            value={form.import_export_code}
            onChange={(v: any) => set('import_export_code', v)}
            autoCapitalize="characters"
            half
            icon="git-compare"
          />
        </Row>
      </SectionCard>
    ),
    Signatory: (
      <SectionCard th={th}>
        <SectionTitle label="Authorized Signatory" icon="✍️" th={th} />
        <Row>
          <Field
            th={th}
            label="Full Name"
            value={form.sig_name}
            onChange={(v: any) => set('sig_name', v)}
            autoCapitalize="words"
            half
            icon="person"
          />
          <Field
            th={th}
            label="Designation"
            value={form.sig_designation}
            onChange={(v: any) => set('sig_designation', v)}
            autoCapitalize="words"
            half
            icon="ribbon"
          />
        </Row>
        <Field
          th={th}
          label="Signature Label"
          value={form.sig_signature_label}
          onChange={(v: any) => set('sig_signature_label', v)}
          placeholder="Authorised Signatory"
          icon="text"
        />

        <Row>
          <View style={[G.w48, G.mb16]}>
            <Text style={[G.fs13, G.bold700, G.mb10, { color: th.txtSec }]}>Signature Image</Text>
            <TouchableOpacity
              onPress={() => uploadImage('sig_signature_img')}
              style={[
                G.center,
                G.br14,
                {
                  height: 80,
                  backgroundColor: th.inputBg,
                  borderStyle: 'dashed',
                  borderWidth: 1,
                  borderColor: th.border,
                  overflow: 'hidden',
                },
              ]}
            >
              {form.sig_signature_img ? (
                <Image
                  source={{ uri: form.sig_signature_img }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons name="cloud-upload" size={24} color={th.txtSec} />
              )}
            </TouchableOpacity>
          </View>
          <View style={[G.w48, G.mb16]}>
            <Text style={[G.fs13, G.bold700, G.mb10, { color: th.txtSec }]}>Company Stamp</Text>
            <TouchableOpacity
              onPress={() => uploadImage('sig_stamp_img')}
              style={[
                G.center,
                G.br14,
                {
                  height: 80,
                  backgroundColor: th.inputBg,
                  borderStyle: 'dashed',
                  borderWidth: 1,
                  borderColor: th.border,
                  overflow: 'hidden',
                },
              ]}
            >
              {form.sig_stamp_img ? (
                <Image
                  source={{ uri: form.sig_stamp_img }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons name="print" size={24} color={th.txtSec} />
              )}
            </TouchableOpacity>
          </View>
        </Row>
      </SectionCard>
    ),
    Connect: (
      <>
        <SectionCard th={th}>
          <SectionTitle label="Lead Capture APIs" icon="🔌" th={th} />
          {form.leadApis.map((la, idx) => (
            <View
              key={idx}
              style={[
                G.mb16,
                G.p12,
                G.br14,
                { backgroundColor: th.bg, borderWidth: 1, borderColor: th.border },
              ]}
            >
              <Row>
                <View style={G.flex1}>
                  <Field
                    th={th}
                    label="B2B Source Name"
                    value={la.b2bName}
                    onChange={(v) => {
                      const nl = [...form.leadApis];
                      nl[idx].b2bName = v || '';
                      set('leadApis', nl);
                    }}
                    placeholder="e.g. IndiaMart, TradeIndia"
                  />
                </View>
                <TouchableOpacity
                  onPress={() => {
                    const nl = form.leadApis.filter((_, i) => i !== idx);
                    set('leadApis', nl);
                  }}
                  style={[G.ml12, G.center, { marginTop: 20 }]}
                >
                  <Ionicons name="trash" size={20} color={C.danger} />
                </TouchableOpacity>
              </Row>
              <Field
                th={th}
                label="API URL"
                value={la.url}
                onChange={(v) => {
                  const nl = [...form.leadApis];
                  nl[idx].url = v || '';
                  set('leadApis', nl);
                }}
                autoCapitalize="none"
              />
              <Row>
                <Field
                  th={th}
                  label="User ID"
                  value={la.userid}
                  onChange={(v) => {
                    const nl = [...form.leadApis];
                    nl[idx].userid = v || '';
                    set('leadApis', nl);
                  }}
                  half
                  autoCapitalize="none"
                />
                <Field
                  th={th}
                  label="Profile ID"
                  value={la.profile_id}
                  onChange={(v) => {
                    const nl = [...form.leadApis];
                    nl[idx].profile_id = v || '';
                    set('leadApis', nl);
                  }}
                  half
                  autoCapitalize="none"
                />
              </Row>
              <Field
                th={th}
                label="API Key"
                value={la.key}
                onChange={(v) => {
                  const nl = [...form.leadApis];
                  nl[idx].key = v || '';
                  set('leadApis', nl);
                }}
                autoCapitalize="none"
              />
            </View>
          ))}
          <TouchableOpacity
            style={[
              G.pv12,
              G.ph16,
              G.br14,
              G.rowCenter,
              {
                backgroundColor: th.inputBg,
                borderStyle: 'dashed',
                borderWidth: 2,
                borderColor: th.border,
              },
            ]}
            onPress={() =>
              set('leadApis', [
                ...form.leadApis,
                { b2bName: '', url: '', userid: '', profile_id: '', key: '', isActive: true },
              ])
            }
          >
            <Ionicons name="add-circle" size={20} color={th.primary} />
            <Text style={[G.fs14, G.bold700, G.ml8, { color: th.primary }]}>
              Add B2B Lead Source
            </Text>
          </TouchableOpacity>
        </SectionCard>

        <SectionCard th={th}>
          <SectionTitle label="MSG91 (SMS & WhatsApp)" icon="📲" th={th} />
          <Toggle
            label="Enable MSG91"
            value={form.msg91_isActive}
            onChange={(v) => set('msg91_isActive', v)}
            th={th}
          />
          {form.msg91_isActive && (
            <>
              <Field
                th={th}
                label="Auth Key"
                value={form.msg91_authkey}
                onChange={(v: any) => set('msg91_authkey', v)}
                autoCapitalize="none"
                icon="key"
              />
              <Field
                th={th}
                label="Sender ID"
                value={form.msg91_sender_id}
                onChange={(v: any) => set('msg91_sender_id', v)}
                autoCapitalize="characters"
                icon="megaphone"
              />
              <Row>
                <Field
                  th={th}
                  label="SMS Template ID"
                  value={form.msg91_template_id}
                  onChange={(v: any) => set('msg91_template_id', v)}
                  half
                  icon="text"
                />
                <Field
                  th={th}
                  label="WhatsApp Template ID"
                  value={form.msg91_whatsapp_template_id}
                  onChange={(v: any) => set('msg91_whatsapp_template_id', v)}
                  half
                  icon="logo-whatsapp"
                />
              </Row>
            </>
          )}
        </SectionCard>

        <SectionCard th={th}>
          <SectionTitle label="Cloudinary (Media Storage)" icon="☁️" th={th} />
          <Toggle
            label="Enable Tenant Media"
            value={form.cloudinary_isActive}
            onChange={(v) => set('cloudinary_isActive', v)}
            th={th}
          />
          {form.cloudinary_isActive && (
            <>
              <Field
                th={th}
                label="Cloud Name"
                value={form.cloudinary_cloud_name}
                onChange={(v: any) => set('cloudinary_cloud_name', v)}
                autoCapitalize="none"
                icon="cloud"
              />
              <Field
                th={th}
                label="API Key"
                value={form.cloudinary_api_key}
                onChange={(v: any) => set('cloudinary_api_key', v)}
                autoCapitalize="none"
                icon="key"
              />
              <Field
                th={th}
                label="Cloudinary API Secret"
                value={form.cloudinary_api_secret}
                onChange={(v: any) => set('cloudinary_api_secret', v)}
                autoCapitalize="none"
                icon="lock-closed-outline"
              />
              <Toggle
                label="Enable Media Auto-Sync"
                description="Sync lead media across devices"
                value={form.cloudinary_isActive}
                onChange={(v) => set('cloudinary_isActive', v)}
                th={th}
              />
            </>
          )}
        </SectionCard>

        <SectionCard th={th}>
          <SectionTitle label="Call Recording Cloud Settings" icon="☁️" th={th} />
          <Field
            th={th}
            label="Cloud Playback Base URL"
            value={form.cloudPlaybackUrl}
            onChange={(v: any) => set('cloudPlaybackUrl', v)}
            autoCapitalize="none"
            placeholder="https://your-server.com/recordings/"
            icon="globe-outline"
          />
          <Text style={[G.fs12, G.mt4, { color: th.txtSec, fontStyle: 'italic' }]}>
            This URL will be used to stream recordings when "Cloud Playback" is toggled on.
          </Text>
        </SectionCard>

        <SectionCard th={th}>
          <SectionTitle label="Email (SMTP/IMAP)" icon="✉️" th={th} />
          <Toggle
            label="Enable Email Sync"
            value={form.mail_isActive}
            onChange={(v) => set('mail_isActive', v)}
            th={th}
          />
          {form.mail_isActive && (
            <>
              <Field
                th={th}
                label="Host"
                value={form.mail_host}
                onChange={(v: any) => set('mail_host', v)}
                placeholder="imap.gmail.com"
                icon="server"
              />
              <Row>
                <Field
                  th={th}
                  label="Port"
                  value={form.mail_port}
                  onChange={(v: any) => set('mail_port', v)}
                  keyboardType="numeric"
                  half
                  icon="options"
                />
                <Toggle
                  label="Secure"
                  value={form.mail_secure}
                  onChange={(v) => set('mail_secure', v)}
                  th={th}
                />
              </Row>
              <Field
                th={th}
                label="Username / Email"
                value={form.mail_user}
                onChange={(v: any) => set('mail_user', v)}
                autoCapitalize="none"
                icon="mail"
              />
              <Field
                th={th}
                label="Password / App Key"
                value={form.mail_pass}
                onChange={(v: any) => set('mail_pass', v)}
                secureTextEntry
                icon="lock-closed"
              />
            </>
          )}
        </SectionCard>
      </>
    ),
  };

  if (loading)
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 15 }}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={{ color: th.txtSec, fontSize: 13, fontWeight: '600' }}>
          Loading corporate profile…
        </Text>
      </View>
    );

  return (
    <View style={G.flex1}>
      <View
        style={[
          G.row,
          G.pt8,
          {
            backgroundColor: th.card,
            borderBottomWidth: 1,
            borderBottomColor: th.border,
            paddingHorizontal: 8,
          },
        ]}
      >
        {CORP_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              activeOpacity={0.8}
              style={[
                G.flex1,
                G.pv12,
                G.center,
                {
                  borderBottomWidth: active ? 3 : 0,
                  borderBottomColor: active ? C.primary : 'transparent',
                },
              ]}
            >
              <Ionicons name={t.icon as any} size={20} color={active ? C.primary : th.txtSec} />
              <Text
                style={[
                  G.mt6,
                  G.bold800,
                  {
                    fontSize: 10,
                    fontWeight: active ? '800' : '600',
                    color: active ? C.primary : th.txtSec,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  },
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={[G.ph16, G.pt20, G.pb100]}>
        {tabContent[tab]}
        <SaveButton onPress={handleSave} saving={saving} saved={saved} />
      </ScrollView>

      <StatePicker
        visible={statePickerVisible}
        onClose={() => setStatePickerVisible(false)}
        onSelect={(name) => {
          set('corporateState', name);
          set('corporateDistrict', undefined); // Reset district when state changes
        }}
      />
      <DistrictPicker
        visible={districtPickerVisible}
        onClose={() => setDistrictPickerVisible(false)}
        onSelect={(name) => set('corporateDistrict', name)}
        stateCode={getStateCodeByName(form.corporateState || '')}
      />

      <StatePicker
        visible={branchPickerType === 'state'}
        onClose={() => {
          setBranchPickerType(null);
          setActiveBranchIdx(null);
        }}
        onSelect={(name) => {
          if (activeBranchIdx !== null) {
            const nb = [...form.locations];
            nb[activeBranchIdx].state = name;
            // Reset city/district if needed, but here it's just state
            set('locations', nb);
          }
        }}
      />
      <DistrictPicker
        visible={branchPickerType === 'district'}
        onClose={() => {
          setBranchPickerType(null);
          setActiveBranchIdx(null);
        }}
        onSelect={(name) => {
          if (activeBranchIdx !== null) {
            const nb = [...form.locations];
            nb[activeBranchIdx].city = name;
            nb[activeBranchIdx].district = name;
            set('locations', nb);
          }
        }}
        stateCode={
          activeBranchIdx !== null
            ? getStateCodeByName(form.locations[activeBranchIdx].state || '')
            : ''
        }
      />
      <GenericPicker
        visible={ownershipPickerVisible}
        onClose={() => setOwnershipPickerVisible(false)}
        onSelect={(item) => set('ownershipType', item.value)}
        title="Ownership Type"
        th={th}
        options={[
          { label: 'Proprietorship', value: 'Proprietorship' },
          { label: 'Partnership', value: 'Partnership' },
          { label: 'LLP', value: 'LLP' },
          { label: 'Private Limited', value: 'Private Limited' },
          { label: 'Public Limited', value: 'Public Limited' },
          { label: 'Trust', value: 'Trust' },
          { label: 'Society', value: 'Society' },
        ]}
      />

      <GenericPicker
        visible={branchPickerType === 'type'}
        onClose={() => setBranchPickerType(null)}
        onSelect={(item) => {
          if (activeBranchIdx !== null) {
            const nb = [...form.locations];
            nb[activeBranchIdx].locationType = item.value as any;
            set('locations', nb);
          }
        }}
        title="Office Type"
        th={th}
        options={[
          { label: 'Branch Office (BO)', value: 'BO' },
          { label: 'Regional Office (RO)', value: 'RO' },
        ]}
      />
    </View>
  );
};

export default function CorporateSetupScreen() {
  const { user } = useUserContext();
  const { refresh: refreshGPS } = useGPSCoordinates();
  const isDark = useColorScheme() === 'dark';
  const th = useTheme(isDark);
  const token = user?.token || '';
  const router = useRouter();
  const [corpName, setCorpName] = useState('Corporate Name');

  return (
    <SafeAreaView style={[G.flex1, { backgroundColor: th.bg }] as any} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={G.flex1 as any}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <AppHeader title={corpName} onBackPress={() => router.back()} />
        <View style={G.flex1 as any}>
          <CorporateEditor isDark={isDark} token={token} onNameLoad={setCorpName} refreshGPS={refreshGPS} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};
