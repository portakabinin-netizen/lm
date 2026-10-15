import { useAuthContext } from '@/context/AuthContext';
import { COLORS } from '@/styles/stylesIndex';
import { appService } from '@/UtilServices/appHelper';
import { CORP_IMG_CACHE } from '@/components/AppHeader';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { documentDirectory } from 'expo-file-system/legacy';
import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';

export const VCARD_DIR = `${documentDirectory}visiting_cards/`;
export const getPermanentVCardUri = (dbName?: string, userId?: string) =>
  `${VCARD_DIR}vcard_${(dbName || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')}_${(userId || 'user').replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;

export default function VisitingCardGenerator() {
  const { user, visitingCardUri, setVisitingCardUri } = useAuthContext();
  const viewShotRef = useRef<ViewShot>(null);

  const [logoLoaded, setLogoLoaded] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [fetchAttempted, setFetchAttempted] = useState(false);

  // Fetched live data
  const [corpData, setCorpData] = useState<{
    corporateName?: string;
    corporateTagName?: string;
    corporateEmail?: string;
    corporateMobile?: string;
    corporateAddress?: string;
    CorpProfileImage?: string;
  }>({});
  const [userData, setUserData] = useState<{
    userDisplayName?: string;
    userEmail?: string;
    userMobile?: string;
    userRole?: string;
  }>({});

  // Fallback chain: fetched → cache → session
  const corpProfileImage =
    corpData.CorpProfileImage ||
    (user?.dbName && CORP_IMG_CACHE[user.dbName]) ||
    user?.CorpProfileImage;

  // ── Fetch corporate & user data before capture ──────────────────────────────
  useEffect(() => {
    if (visitingCardUri || !user?.userId) {
      setFetchAttempted(true);
      return;
    }

    const fetchAll = async () => {
      try {
        const [corpRes, userRes] = await Promise.all([
          appService.httpClient.get(`/auth/get-profile-history`, {
            params: { userId: user.userId, type: 'corp' },
          }).catch(() => null),
          appService.httpClient.get(`/setting/update/user`).catch(() => null),
        ]);

        // ── Corporate image from Cloudinary history ──────────────────────────
        if (corpRes?.data?.resources?.length > 0) {
          const url = corpRes?.data?.resources[0]?.url;
          if (url) {
            setCorpData(prev => ({ ...prev, CorpProfileImage: url }));
            if (user?.dbName) CORP_IMG_CACHE[user.dbName] = url;
          }
        }

        // ── Corporate profile fields from ProfileMaster ───────────────────────
        // Also fetch full corporate profile for name/tag/email/mobile/address
        const corpProfileRes = await appService.httpClient
          .get(`/setting/update/corporate`)
          .catch(() => null);

        const profile = corpProfileRes?.data?.data?.accessCorporate;
        if (profile) {
          const hoLocation = Array.isArray(profile.locations)
            ? profile.locations.find((l: any) => l.locationType === 'HO') || profile.locations[0]
            : null;
          const addr = hoLocation?.address;
          const addressStr = [addr?.line1, addr?.city, addr?.state, addr?.pincode]
            .filter(Boolean)
            .join(', ');
          setCorpData(prev => ({
            ...prev,
            corporateName: profile.corporateName,
            corporateTagName: profile.corporateTagName,
            corporateEmail: profile.corporateEmail,
            corporateMobile: profile.centralRegistrations?.corporateMobile,
            corporateAddress: addressStr,
            CorpProfileImage: prev.CorpProfileImage || profile.CorpProfileImage, // Update image from ProfileMaster if not loaded from history
          }));
        }

        // ── User profile fields from userMaster ───────────────────────────────
        const uData = userRes?.data?.data?.user ?? userRes?.data?.data;
        if (uData) {
          setUserData({
            userDisplayName: uData.userDisplayName,
            userEmail: uData.userEmail,
            userMobile: uData.userMobile,
            userRole: uData.userRole,
          });
        }
      } catch (err) {
        console.error('VCard Data Fetch Error:', err);
      } finally {
        setFetchAttempted(true);
      }
    };

    fetchAll();
  }, [user?.userId, user?.dbName, visitingCardUri]);

  // ── Capture snapshot after data is ready ─────────────────────────────────────
  useEffect(() => {
    if (!fetchAttempted) return;
    const isImageReady = corpProfileImage && !logoError ? logoLoaded : true;
    if (user && !visitingCardUri && viewShotRef.current && isImageReady) {
      const timer = setTimeout(async () => {
        try {
          if (viewShotRef.current?.capture) {
            const uri = await viewShotRef.current.capture();
            setVisitingCardUri(uri);
          }
        } catch (error) {
          console.error('Failed to generate visiting card:', error);
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [user, visitingCardUri, setVisitingCardUri, logoLoaded, logoError, corpProfileImage, fetchAttempted]);

  if (!user || visitingCardUri) return null;

  // ── Resolved display values ───────────────────────────────────────────────────
  // Corporate info: fetched live data > session fallback
  const corporateName    = corpData.corporateName    || user.corporateName    || '';
  const corporateTagName = corpData.corporateTagName || user.corporateTagName || '';
  const corporateEmail   = corpData.corporateEmail   || user.corporateEmail   || '';
  const corporateMobile  = corpData.corporateMobile  || '';
  const corporateAddress = corpData.corporateAddress || user.corporateAddress || '';

  // User info: fetched live data > session fallback
  const userDisplayName = userData.userDisplayName || user.userDisplayName || user.name || '';
  const userEmail       = userData.userEmail       || user.userEmail       || '';
  const userMobile      = userData.userMobile      || user.mobile          || '';
  const userRole        = userData.userRole        || user.userRole        || '';

  return (
    <View style={styles.hiddenContainer} pointerEvents="none">
      <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1.0 }}>
        <LinearGradient
          colors={['#1e3a8a', '#3b82f6', '#0ea5e9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardContainer}
        >
          {/* ── Corporate Header ─────────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              {(corpProfileImage && !logoError) ? (
                <Image
                  source={{ uri: corpProfileImage }}
                  style={styles.logo}
                  resizeMode="cover"
                  onLoad={() => setLogoLoaded(true)}
                  onError={() => { setLogoError(true); setLogoLoaded(true); }}
                />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoPlaceholderText}>
                    {(corporateName || 'C').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.corporateInfo}>
              <Text style={styles.corporateName} numberOfLines={1}>
                {corporateName}
              </Text>
              {!!corporateTagName && (
                <Text style={styles.corporateTagLine} numberOfLines={1}>
                  {corporateTagName}
                </Text>
              )}
            </View>
          </View>

          {/* ── User Section ─────────────────────────────────────────────── */}
          <View style={styles.divider} />
          <View style={styles.userSection}>
            <Text style={styles.userName} numberOfLines={1}>{userDisplayName}</Text>
            {!!userRole && (
              <Text style={styles.userRole} numberOfLines={1}>{userRole}</Text>
            )}
          </View>

          {/* ── Contact Details ───────────────────────────────────────────── */}
          <View style={styles.contactSection}>
            {/* Mobile & Email on one line */}
            {(userMobile || userEmail) && (
              <View style={styles.contactRow}>
                {!!userMobile && (
                  <>
                    <View style={styles.iconBox}>
                      <MaterialCommunityIcons name="phone" size={13} color="#0ea5e9" />
                    </View>
                    <Text style={styles.contactText} numberOfLines={1}>{userMobile}</Text>
                  </>
                )}
                {!!userMobile && !!userEmail && (
                  <Text style={styles.dividerText}>|</Text>
                )}
                {!!userEmail && (
                  <>
                    <View style={styles.iconBox}>
                      <MaterialCommunityIcons name="email" size={13} color="#0ea5e9" />
                    </View>
                    <Text style={[styles.contactText, { flex: 2 }]} numberOfLines={1}>{userEmail}</Text>
                  </>
                )}
              </View>
            )}

            {/* Corporate email / mobile if different from user */}
            {(!!corporateMobile || !!corporateEmail) && (
              <View style={styles.contactRow}>
                {!!corporateMobile && (
                  <>
                    <View style={styles.iconBox}>
                      <MaterialCommunityIcons name="office-building" size={13} color="#0ea5e9" />
                    </View>
                    <Text style={styles.contactText} numberOfLines={1}>{corporateMobile}</Text>
                  </>
                )}
                {!!corporateMobile && !!corporateEmail && (
                  <Text style={styles.dividerText}>|</Text>
                )}
                {!!corporateEmail && (
                  <>
                    <View style={styles.iconBox}>
                      <MaterialCommunityIcons name="web" size={13} color="#0ea5e9" />
                    </View>
                    <Text style={[styles.contactText, { flex: 2 }]} numberOfLines={1}>{corporateEmail}</Text>
                  </>
                )}
              </View>
            )}

            {/* Address */}
            {!!corporateAddress && (
              <View style={styles.contactRow}>
                <View style={styles.iconBox}>
                  <MaterialCommunityIcons name="map-marker" size={13} color="#0ea5e9" />
                </View>
                <Text style={styles.contactText} numberOfLines={2}>{corporateAddress}</Text>
              </View>
            )}
          </View>

          {/* Decorative circles */}
          <View style={styles.decorativeCircle1} />
          <View style={styles.decorativeCircle2} />
        </LinearGradient>
      </ViewShot>
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenContainer: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    width: 380,
    height: 240,
    opacity: 1,
    zIndex: -99999,
    pointerEvents: 'none',
  },
  cardContainer: {
    width: 380,
    borderRadius: 18,
    padding: 20,
    overflow: 'hidden',
  },
  // ── Corporate header ─────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    zIndex: 2,
  },
  logoContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    overflow: 'hidden',
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  logoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoPlaceholderText: {
    color: COLORS.primary,
    fontWeight: '900',
    fontSize: 20,
  },
  corporateInfo: {
    flex: 1,
  },
  corporateName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
    lineHeight: 22,
  },
  corporateTagLine: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  // ── Divider ──────────────────────────────────────────────────────────────────
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 10,
    zIndex: 2,
  },
  // ── User section ─────────────────────────────────────────────────────────────
  userSection: {
    marginBottom: 10,
    zIndex: 2,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 24,
  },
  userRole: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.75)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
    marginTop: 2,
  },
  // ── Contact section ──────────────────────────────────────────────────────────
  contactSection: {
    gap: 6,
    zIndex: 2,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '500',
    flex: 1,
  },
  dividerText: {
    color: 'rgba(255, 255, 255, 0.4)',
    marginHorizontal: 2,
    fontSize: 14,
  },
  // ── Decorative ───────────────────────────────────────────────────────────────
  decorativeCircle1: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    zIndex: 1,
  },
  decorativeCircle2: {
    position: 'absolute',
    bottom: -60,
    right: 40,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    zIndex: 1,
  },
});
