import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

const TICKER_COLORS = ['#2563eb', '#dc2626', '#059669', '#7c3aed', '#ea580c'];

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const ActiveUsersMarquee = React.memo(
  ({
    activeStaff,
    allLeads = [],
    userRole,
  }: {
    activeStaff: any[];
    allLeads?: any[];
    userRole?: string;
  }) => {
    const { width } = Dimensions.get('window');
    const animatedValue = useRef(new Animated.Value(width)).current;
    const [contentWidth, setContentWidth] = useState(0);

    const [resolvedSites, setResolvedSites] = useState<Record<string, string>>({});
    const geocodeCache = useRef<Record<string, string>>({});

    const filteredActiveStaff = useMemo(() => {
      // ─── Layer 1: Strip non-employees (Clients, Guests, Vendors) ──────────────
      // Backend marks real employees with isEmployee=true. As a safety net we also
      // exclude known non-employee roles even if isEmployee is missing/undefined.
      const NON_EMPLOYEE_ROLES = new Set([
        'client', 'guest', 'vendor', 'supplier', 'contractor',
      ]);
      const employeesOnly = activeStaff.filter((s) => {
        // If backend explicitly flagged the record, use that
        if (s.isEmployee === false) return false;
        // Otherwise fall back to role name check
        const sr = (s.role || s.userRole || '').toLowerCase();
        return !NON_EMPLOYEE_ROLES.has(sr);
      });

      // ─── Layer 2: Project users don't see admins in their marquee ─────────────
      const currentRole = (userRole || 'project').toLowerCase();
      if (currentRole === 'project') {
        return employeesOnly.filter((s) => {
          const sr = (s.role || s.userRole || '').toLowerCase();
          return !['cropadmin', 'corpadmin', 'useradmin'].includes(sr);
        });
      }
      return employeesOnly;
    }, [activeStaff, userRole]);


    useEffect(() => {
      let isMounted = true;
      const processLocations = async () => {
        const newResolved: Record<string, string> = {};
        let changed = false;

        for (const staff of filteredActiveStaff) {
          const userId = staff.employeeId?._id || staff.userId?._id || staff._id;
          if (!userId) continue;

          let latestLoc = null;
          if (staff.geoHistory && staff.geoHistory.length > 0) {
            latestLoc = staff.geoHistory[staff.geoHistory.length - 1];
          } else if (staff.location) {
            latestLoc = staff.location;
          }

          const lat = latestLoc?.coords?.latitude || latestLoc?.lat || latestLoc?.latitude || staff.lat;
          const lng =
            latestLoc?.coords?.longitude ||
            latestLoc?.lng ||
            latestLoc?.long ||
            latestLoc?.longitude || staff.long;

          if (lat && lng) {
            let matchedLead = null;
            let minDistance = 0.1; // Match within 100 m

            for (const lead of allLeads) {
              const lLat = lead.location?.lat || lead.location?.latitude;
              const lLng = lead.location?.long || lead.location?.lng || lead.location?.longitude;
              if (lLat && lLng) {
                const d = getDistanceFromLatLonInKm(lat, lng, lLat, lLng);
                if (d < minDistance) {
                  minDistance = d;
                  matchedLead = lead;
                }
              }
            }

            if (matchedLead) {
              const sn = matchedLead.sender_name || matchedLead.product_name || 'Site';
              if (resolvedSites[userId] !== sn) {
                newResolved[userId] = sn;
                changed = true;
              }
            } else {
              const coordKey = `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
              if (geocodeCache.current[coordKey]) {
                if (resolvedSites[userId] !== geocodeCache.current[coordKey]) {
                  newResolved[userId] = geocodeCache.current[coordKey];
                  changed = true;
                }
              } else {
                try {
                  let fallback = '';
                  const googleKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
                  if (googleKey) {
                    const gRes = await fetch(
                      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleKey}`
                    );
                    const gData = await gRes.json();

                    if (gData.status === 'OK' && gData.results?.length > 0) {
                       const comps = gData.results[0].address_components || [];
                       const getComp = (types: string[]) => {
                         const comp = comps.find((c: any) => c.types.some((t: string) => types.includes(t)));
                         return comp ? comp.long_name : '';
                       };
                       
                       const streetNumber = getComp(['street_number']);
                       const route = getComp(['route']);
                       const buildingName = getComp(['premise', 'establishment', 'building']);
                       const country = getComp(['country']);
                       const streetArea = [streetNumber, route].map(s => (s || '').trim()).filter(Boolean).join(' ');
                       
                       const locality1 = getComp(['sublocality_level_1', 'sublocality']);
                       const locality2 = getComp(['sublocality_level_2']);
                       const city = getComp(['locality', 'administrative_area_level_2']);
                       const state = getComp(['administrative_area_level_1']);
                       const pincode = getComp(['postal_code']);
                       const localityParts = [locality2, locality1].map(s => (s || '').trim()).filter(Boolean);
                       const locality = localityParts.join(', ');
                       
                       const parts = [
                         buildingName,
                         streetArea,
                         locality,
                         city,
                         state,
                         pincode,
                         country
                       ]
                         .filter(Boolean)
                         .map(s => s.trim())
                         .filter(s => !s.toLowerCase().includes('division'));
                       const uniqueParts = [...new Set(parts)];
                       fallback = uniqueParts.join(', ') || 'HO/Remote';
                       console.log('gRes', gRes);
                    }
                  }

                  if (!fallback) {
                    const results = await Location.reverseGeocodeAsync({
                      latitude: lat,
                      longitude: lng,
                    });
                    if (results.length > 0) {
                      const addr = results[0];
                      const streetArea = [addr.streetNumber, addr.street].map(s => (s || '').trim()).filter(Boolean).join(' ');
                      const localityParts = [addr.district, addr.subregion].map(s => (s || '').trim()).filter(Boolean);
                      const locality = localityParts.join(', ');
                      const parts = [
                        streetArea,
                        locality,
                        addr.city,
                        addr.region,
                        addr.postalCode
                      ]
                        .map((s) => (s || '').trim())
                        .filter((s) => !!s && !s.toLowerCase().includes('division'));
                      const uniqueParts = parts.filter(
                        (val, index) => parts.indexOf(val) === index
                      );
                      fallback = uniqueParts.join(', ') || 'Unknown Location';
                    }
                  }

                  if (fallback && isMounted) {
                    geocodeCache.current[coordKey] = fallback;
                    newResolved[userId] = fallback;
                    changed = true;
                  }
                } catch (e) {
                  // Fall silent
                }
              }
            }
          }
        }

        if (changed && isMounted) {
          setResolvedSites((prev) => ({ ...prev, ...newResolved }));
        }
      };
      processLocations();
      return () => {
        isMounted = false;
      };
    }, [filteredActiveStaff, allLeads]);

    useEffect(() => {
      let anim: Animated.CompositeAnimation | null = null;
      if (contentWidth > 0) {
        animatedValue.stopAnimation();
        animatedValue.setValue(width);
        anim = Animated.loop(
          Animated.timing(animatedValue, {
            toValue: -contentWidth,
            duration: (width + contentWidth) * 15,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        );
        anim.start();
      }
      return () => {
        if (anim) {
          anim.stop();
        }
      };
    }, [contentWidth, width, animatedValue]);

    if (!filteredActiveStaff || filteredActiveStaff.length === 0) {
      return (
        <View style={{ padding: 12, alignItems: 'center' }}>
          <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '700' }}>
            No active users online.
          </Text>
        </View>
      );
    }

    return (
      <View
        style={{
          overflow: 'hidden',
          paddingVertical: 4,
          justifyContent: 'center',
          backgroundColor: '#e2e8f0',
          borderRadius: 12,
          marginHorizontal: 8,
          marginTop: 8,
        }}
      >
        <ScrollView
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          bounces={false}
        >
          <Animated.View
            onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              transform: [{ translateX: animatedValue }],
            }}
          >
            {filteredActiveStaff.map((staff: any, idx: number) => {
              const color = TICKER_COLORS[idx % TICKER_COLORS.length];
              const userId = staff.employeeId?._id || staff.userId?._id || staff._id;
              const name =
                staff.displayName ||
                staff.employeeName ||
                staff.name ||
                (typeof staff.employeeId === 'object'
                  ? staff.employeeId?.name || staff.employeeId?.employeeName
                  : null) ||
                (typeof staff.userId === 'object' ? staff.userId?.name : null) ||
                'Unknown User';

              let latestLoc = null;
              if (staff.geoHistory && staff.geoHistory.length > 0) {
                latestLoc = staff.geoHistory[staff.geoHistory.length - 1];
              } else if (staff.location) {
                latestLoc = staff.location;
              }

              const lat = latestLoc?.coords?.latitude || latestLoc?.lat || latestLoc?.latitude || staff.lat;
              const lng =
                latestLoc?.coords?.longitude ||
                latestLoc?.lng ||
                latestLoc?.long ||
                latestLoc?.longitude || staff.long;

              let leadName = '';
              if (staff.leadId) {
                const leadIdStr = typeof staff.leadId === 'object' ? staff.leadId._id : staff.leadId;
                const foundLead = allLeads.find(l => String(l._id) === String(leadIdStr) || String(l.id) === String(leadIdStr));
                if (foundLead) {
                  leadName = foundLead.displayName || foundLead.sender_name || foundLead.product_name || '';
                } else if (typeof staff.leadId === 'object') {
                  leadName = staff.leadId.displayName || staff.leadId.sender_name || '';
                }
              }

              const assignedSiteName = leadName || staff.site_name || staff.siteName || '';
              let site = '';

              if (assignedSiteName) {
                const sLat = staff.leadId?.location?.lat || staff.leadId?.location?.latitude;
                const sLng = staff.leadId?.location?.long || staff.leadId?.location?.lng || staff.leadId?.location?.longitude;
                if (lat && lng && sLat && sLng) {
                  const dist = getDistanceFromLatLonInKm(lat, lng, sLat, sLng);
                  if (dist > 0.5) { // > 500 meters
                    site = `${assignedSiteName} ⚠️ (Mismatch)`;
                  } else {
                    site = assignedSiteName;
                  }
                } else {
                  site = assignedSiteName;
                }
              } else {
                site = resolvedSites[userId] || (lat && lng ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : '');
              }

              return (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="ellipse" size={10} color="#10B981" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#334155' }}>
                    {site ? `${site}: ` : 'Online: '}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: color }}>
                    {name}
                    {(() => {
                      const enr = staff.employeeId?.enrollment_no || (typeof staff.employeeId === 'object' ? staff.employeeId?.enrollment_no : null) || staff.enrollment_no || staff.enrollmentNo;
                      return enr ? ` (${enr})` : '';
                    })()}
                  </Text>
                  {idx < filteredActiveStaff.length - 1 && (
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: '900',
                        color: '#cbd5e1',
                        marginHorizontal: 12,
                      }}
                    >
                      *
                    </Text>
                  )}
                </View>
              );
            })}
          </Animated.View>
        </ScrollView>
      </View>
    );
  }
);
