/**
 * Utilities for parsing Aadhar QR code data.
 * Handles both older XML format and newer Secure Binary format strings.
 */
import pako from 'pako';

export interface AadharData {
  uid: string;
  name: string;
  co?: string;      // 👨 Care Of / Father's Name
  gender?: string;
  dob?: string;
  mobile?: string;
  email?: string;
  address?: string;
  // Granular fields
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  street?: string;
  house?: string;
}

export const parseAadharQR = (data: string): AadharData | null => {
  if (!data) return null;

  const clean = data.trim();

  // Helper for XML attributes (handles both ' and " and case-insensitivity)
  const getAttr = (xml: string, ...attrs: string[]): string => {
    for (const attr of attrs) {
      const regex = new RegExp(`${attr}\\s*=\\s*['"]([^'"]+)['"]`, 'i');
      const match = xml.match(regex);
      if (match) return match[1].trim();
    }
    return "";
  };

  const dobParser = (val: string | undefined): string => {
    if (!val) return "";
    const v = val.trim().replace(/[\/\-]/g, '-');
    // DD-MM-YYYY
    const dmy = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    // YYYY-MM-DD
    const ymd = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) return v;
    // YYYY only
    if (v.match(/^\d{4}$/)) return `${v}-01-01`;
    return v;
  };

  // 1. XML Format (Legacy)
  if (clean.includes('PrintLetterBarcodeData') || clean.includes('<')) {
    try {
      const uid = getAttr(clean, 'uid');
      const name = getAttr(clean, 'name');
      const co = getAttr(clean, 'co');
      const dob = dobParser(getAttr(clean, 'dob'));
      const gender = getAttr(clean, 'gender', 'g', 'gen');
      const mobile = getAttr(clean, 'mobile', 'm', 'phone');
      const email = getAttr(clean, 'email', 'e');
      
      const house = getAttr(clean, 'house', 'h');
      const street = getAttr(clean, 'street', 's');
      const city = getAttr(clean, 'vtc', 'loc', 'v');
      const dist = getAttr(clean, 'dist', 'd');
      const state = getAttr(clean, 'state', 'st');
      const pc = getAttr(clean, 'pc', 'pincode');

      if (uid || name) {
        return {
          uid, name, co, dob, email, mobile, house, street, city, district: dist, state, pincode: pc,
          gender: gender.startsWith('M') ? 'Male' : gender.startsWith('F') ? 'Female' : 'Male',
          address: [house, street, city, dist, state, pc].filter(Boolean).join(", ")
        };
      }
    } catch (e) {}
  }

  // 2. JSON Format (Modern Scanners)
  try {
    const json = JSON.parse(clean);
    const uid = json.uid || json.UID || "";
    const name = json.name || json.NAME || "";
    if (uid || name) {
      return {
        uid,
        name,
        co: json.co || json.careof || "",
        dob: dobParser(json.dob || json.yob || ""),
        gender: (json.gender || json.g || "").startsWith('M') ? 'Male' : 'Female',
        mobile: json.mobile || json.m || "",
        email: json.email || json.e || "",
        city: json.vtc || json.city || "",
        district: json.dist || json.district || "",
        state: json.state || "",
        pincode: json.pc || json.pincode || "",
        address: json.address || ""
      };
    }
  } catch (e) {}

  // 3. Secure QR Detection (Base10 Numeric String compressed via gzip)
  if (/^\d{100,}$/.test(clean)) {
    try {
      // Convert BigInt string to Byte Array
      let hex = BigInt(clean).toString(16);
      if (hex.length % 2 !== 0) hex = '0' + hex;
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
      }

      // Decompress using pako
      const decompressed = pako.inflate(bytes);

      // Parse delimited fields (Delimiter is 255 / 0xFF)
      const fields: Uint8Array[] = [];
      let currentField: number[] = [];
      for (let i = 0; i < decompressed.length; i++) {
        if (decompressed[i] === 255) {
          fields.push(new Uint8Array(currentField));
          currentField = [];
        } else {
          currentField.push(decompressed[i]);
        }
      }
      if (currentField.length > 0) fields.push(new Uint8Array(currentField));

      // Extract fields according to UIDAI Secure QR V2 specification
      const decodeStr = (arr: Uint8Array) => {
        try {
          // Attempt modern TextDecoder if available
          if (typeof TextDecoder !== 'undefined') {
            return new TextDecoder('utf-8').decode(arr);
          }
          // Fallback UTF-8 decoding trick
          let str = "";
          for (let i = 0; i < arr.length; i++) {
            str += String.fromCharCode(arr[i]);
          }
          return decodeURIComponent(escape(str));
        } catch (e) {
          // Plain ASCII fallback
          let str = "";
          for (let i = 0; i < arr.length; i++) {
            str += String.fromCharCode(arr[i]);
          }
          return str;
        }
      };

      const name = decodeStr(fields[3] || new Uint8Array());
      const dob = decodeStr(fields[4] || new Uint8Array());
      const genderRaw = decodeStr(fields[5] || new Uint8Array());
      const co = decodeStr(fields[6] || new Uint8Array());
      const dist = decodeStr(fields[7] || new Uint8Array());
      const state = decodeStr(fields[9] || new Uint8Array());
      const street = decodeStr(fields[10] || new Uint8Array());
      const vtc = decodeStr(fields[12] || new Uint8Array());
      const pc = decodeStr(fields[14] || new Uint8Array());

      if (name) {
        return {
          uid: "", // Secure QR masks the UID, you only get Reference ID
          name,
          co,
          dob: dobParser(dob),
          gender: genderRaw.startsWith('M') ? 'Male' : genderRaw.startsWith('F') ? 'Female' : 'Male',
          address: [co, street, vtc, dist, state, pc].filter(Boolean).join(", "),
          street,
          city: vtc,
          district: dist,
          state,
          pincode: pc
        };
      }
    } catch (e) {
      console.warn("Failed to decode Aadhaar Secure QR:", e);
    }
  }

  // 3.5. Encoded Base64 XML (mAadhaar offline zip/base64 generic share)
  if (/^[A-Za-z0-9+/=]+$/.test(clean) && clean.length > 50) {
    try {
      // Decode Base64 string natively without Node Buffer
      const atob = (str: string) => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        let strContent = String(str).replace(/=+$/, '');
        let output = '';
        for (let bc = 0, bs = 0, buffer, i = 0; buffer = strContent.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
          buffer = chars.indexOf(buffer);
        }
        return output;
      };
      
      const decodedXML = atob(clean);
      if (decodedXML.includes('PrintLetterBarcodeData') || decodedXML.includes('<')) {
         // Recursive call with the unencoded XML
         return parseAadharQR(decodedXML);
      }
    } catch (e) {
      console.warn("Failed to decode Base64 Aadhaar string:", e);
    }
  }

  // 4. Simple Text Fallback / Manual Scan
  // Look for 12 consecutive digits (UID) or 12 digits with spaces
  const uidMatch = clean.match(/\b\d{4}\s\d{4}\s\d{4}\b/) || clean.match(/\b\d{12}\b/);
  if (uidMatch) {
    const uid = uidMatch[0].replace(/\s/g, "");
    return {
      uid: uid,
      name: "Identity Card Scan",
    };
  }

  return null;
};
