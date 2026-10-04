import Share from 'react-native-share';
import { Platform } from 'react-native';

/**
 * Sends an image-only attachment directly into a specific WhatsApp 1:1 chat.
 * No caption/text is included — this is intentional to avoid inconsistent
 * caption-parsing behavior across WhatsApp versions.
 * Returns true on success, false if it should fall back to another method.
 */
export async function sendImageToWhatsAppNumber(
  cleanDigits: string,
  fileUri: string,
  variant: 'WHATSAPP' | 'WHATSAPP_BUSINESS' | 'WHATSAPPBUSINESS' = 'WHATSAPP'
): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (!cleanDigits || cleanDigits.length !== 10) {
    console.warn('[sendImageToWhatsAppNumber] invalid number:', cleanDigits);
    return false;
  }
  if (!fileUri) return false;

  try {
    const formattedNumber = `91${cleanDigits}`;
    const socialVariant =
      variant === 'WHATSAPP_BUSINESS' ? Share.Social.WHATSAPPBUSINESS : (Share.Social as any)[variant];

    await Share.shareSingle({
      social: socialVariant,
      whatsAppNumber: formattedNumber,
      recipient: formattedNumber,
      url: fileUri,
      type: 'image/png',
      failOnCancel: false,
    } as any);
    return true;
  } catch (err) {
    console.warn(`[sendImageToWhatsAppNumber] ${variant} failed:`, err);
    return false;
  }
}

/** Tries personal WhatsApp first, then Business, returns true if either succeeded. */
export async function sendImageToWhatsAppWithFallback(
  cleanDigits: string,
  fileUri: string
): Promise<boolean> {
  if (await sendImageToWhatsAppNumber(cleanDigits, fileUri, 'WHATSAPP')) return true;
  return sendImageToWhatsAppNumber(cleanDigits, fileUri, 'WHATSAPP_BUSINESS');
}
