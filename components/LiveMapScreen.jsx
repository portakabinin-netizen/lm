import React from 'react';
import { StyleSheet, View } from 'react-native';
import LiveTracker from '@/UtilServices/LiveTracker';

/**
 * LiveMapScreen
 * ─────────────────────────────────────────────────────────────────────────────
 * Clean live tracker map view component:
 *  • Active duty workers from attendance database.
 *  • Geofencing with site perimeters.
 *  • Movement on route (road-snapped polyline).
 *  • Marker ONLY on map, showing ONLY worker images (no text callouts).
 *  • Latest tracking logic (hardware filter, SmartLocationBuffer, Socket.io).
 */
const LiveMapScreen = (props) => {
  const routeParams = props.route?.params || {};
  const workerId = props.workerId || routeParams.workerId || undefined;
  const workerPhotoUrl = props.workerPhotoUrl || routeParams.workerPhotoUrl || undefined;
  const workerName = props.workerName || routeParams.workerName || undefined;

  return (
    <View style={styles.container}>
      <LiveTracker
        workerId={workerId}
        profileImage={workerPhotoUrl}
        name={workerName}
        activeStaff={props.activeStaff || []}
        leads={props.leads || []}
        geoHistory={props.geoHistory || []}
        activeDuty={props.activeDuty || undefined}
        employees={props.employees || []}
        onRefresh={props.onRefresh}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
});

export default LiveMapScreen;
