import * as SMS from 'expo-sms';
import { Alert, Platform, ToastAndroid } from 'react-native';

type NotificationType = 'Success' | 'Error' | 'Info';

// --- 1. Your Existing Toast Function ---
export const showGlobalToast = (
  msg: string, 
  type: NotificationType = 'Info'
) => {
  const title = type === 'Error' ? '⚠️ Error' : '✅ ' + type;

  if (Platform.OS === 'android') {
    ToastAndroid.show(`${title}: ${msg}`, ToastAndroid.SHORT);
  } else {
    Alert.alert(title, msg);
  }
};


// --- 2. Mobile No and send SMS ---
/*
const getMyNumber = async () => {
  // Only works on Android and only if the carrier saved it to the SIM
  const phoneNumber = await DeviceInfo.getPhoneNumber();
  console.log("Device Number:", phoneNumber); 
  // Often returns "" or "unknown"
};*/

export const sendGlobalSMS = async (phoneNumbers: string | string[], message: string) => {
  try {
    const isAvailable = await SMS.isAvailableAsync();
    
    if (!isAvailable) {
      showGlobalToast("SMS is not supported on this device", "Error");
      return;
    }

    const recipients = Array.isArray(phoneNumbers) ? phoneNumbers : [phoneNumbers];
    
    // The 'result' variable tells us what the user did in the SMS app
    const { result } = await SMS.sendSMSAsync(recipients, message);

    if (result === 'sent') {
      showGlobalToast("Message sent!", "Success");
    } else if (result === 'cancelled') {
      showGlobalToast("User closed the SMS app", "Info");
    } else if (result === 'unknown') {
      // Common on Android: The app was opened, but the OS won't tell us if 'Send' was clicked
      showGlobalToast("SMS app opened", "Info");
    }
  } catch (error) {
    showGlobalToast("Failed to open SMS", "Error");
    console.error("SMS Error:", error);
  }
};