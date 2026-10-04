import { Alert, PermissionsAndroid, Platform, Linking } from 'react-native';

/**
 * Requests all essential permissions for the app at once.
 * Used typically on first launch or login.
 */
export const requestAllAppPermissions = async () => {
  if (Platform.OS !== 'android') return;

  try {
    // 1. Core Native Permissions
    const permissionsToRequest = [
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      PermissionsAndroid.PERMISSIONS.WRITE_CONTACTS,
      PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
      PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      PermissionsAndroid.PERMISSIONS.CAMERA,
    ];

    if (Platform.Version >= 30) { // Android 11+ (API 30+)
      permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS);
    }

    if (Platform.Version < 33) { // Android < 13
      permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
      permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
    } else { // Android 13+
      permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }

    const granted = await PermissionsAndroid.requestMultiple(permissionsToRequest);

    // 2. Background Location (Android 10+)
    // Note: This often needs to be requested separately or after foreground is granted
    if (Platform.Version >= 29) {
      const bgGranted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
      );
      granted[PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION] = bgGranted;
    }

    const coreGranted = permissionsToRequest.every(
      (perm) => granted[perm] === PermissionsAndroid.RESULTS.GRANTED
    );

    // Alert removed as requested by the user
    

    return granted;
  } catch (err) {
    console.warn("Permission Error:", err);
  }
};

/**
 * Specifically handles the Call Log permission with a fallback to Settings.
 */
export const requestCallLogPermission = async () => {
  if (Platform.OS !== 'android') return true;

  try {
    // 🚀 DUAL PERMISSION: Some devices require Phone state + Call Log together
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
      PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
    ]);

    const isLogGranted = granted[PermissionsAndroid.PERMISSIONS.READ_CALL_LOG] === PermissionsAndroid.RESULTS.GRANTED;
    const isPhoneGranted = granted[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] === PermissionsAndroid.RESULTS.GRANTED;

    if (isLogGranted && isPhoneGranted) {
      return true;
    }

    const isLogNever = granted[PermissionsAndroid.PERMISSIONS.READ_CALL_LOG] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
    const isPhoneNever = granted[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;

    if (isLogNever || isPhoneNever) {
      Alert.alert(
        "Permissions Permanently Denied",
        "Call history and Phone access are required. Please enable them in the app settings.",
        [
          { text: "Later", style: "cancel" },
          { text: "Settings", onPress: () => Linking.openSettings() }
        ]
      );
    } else {
      Alert.alert(
        "Permissions Required",
        "Both Call Log and Phone access are needed to show your history. Please try again."
      );
    }
    
    return false;
  } catch (err) {
    console.warn("Call Log Permission Error:", err);
    return false;
  }
};

/**
 * Silently checks if call log permission is already granted.
 */
export const checkCallLogPermission = async () => {
  if (Platform.OS !== 'android') return true;
  const callLog = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG);
  const phoneState = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE);
  // Optional but recommended for modern Android
  const phoneNumbers = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS);
  
  return callLog && (phoneState || phoneNumbers);
};