import { MaterialCommunityIcons as MTC } from "@expo/vector-icons";
import { AudioPlayer, createAudioPlayer } from 'expo-audio';
import * as Contacts from "expo-contacts";
import * as FileSystem from 'expo-file-system';
import { Directory, File as FSFile } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
const { cacheDirectory, FileSystemUploadType } = FileSystemLegacy;
import { copyAsync as legacyCopyAsync } from 'expo-file-system/legacy';
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  NativeModules,
  Platform,
  SectionList,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";


import { appService } from "@/UtilServices/appHelper";
import { appModules } from "@/UtilServices/appModals";
import { requestCallLogPermission } from "@/hooks/unifiedPermissions";
import { COLORS, getThemeStyles, styles } from "@/styles/stylesIndex";

const { CallTrackerModule } = NativeModules;

const safeDecodeURI = (uri: string): string => {
  try {
    return decodeURIComponent(uri);
  } catch (e) {
    return uri;
  }
};

const dur = (sec: number): string => {
  sec = Number(sec) || 0;
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
};

interface CallLogModalProps {
  visible: boolean;
  onClose: () => void;
  leads: any[]; // All leads for matching
  isDark: boolean;
}

interface CallRecord {
  phoneNumber: string;
  sender_name: string;
  duration: string;
  timestamp: string;
  direction: "INCOMING" | "OUTGOING" | "MISSED" | "REJECTED" | "OTHER";
  matchedLead?: any;
  isContactDevice?: boolean;
  hasRecording?: boolean;
  fileDate?: string | null;
  recordingUri?: string | null; // 🚀 Stored path/URI for instant play
}

interface GroupedCall {
  phoneNumber: string;
  displayName: string;
  category: "CLIENTS" | "EMPLOYEES" | "VENDORS" | "KNOWN" | "NEW";
  latestTimestamp: number;
  calls: CallRecord[];
  matchedLead?: any;
  isContactDevice?: boolean;
}

const CallLogModal: React.FC<CallLogModalProps> = ({
  visible, onClose, leads, isDark
}) => {
  const t = getThemeStyles(isDark);
  const [calls, setCalls] = useState<any[]>([]); // Grouped for SectionList
  const isDarkTheme = isDark; // Use prop
  const txtPri = isDarkTheme ? "#fff" : "#000";
  const txtSec = isDarkTheme ? "#999" : "#666";
  const border = isDarkTheme ? "#333" : "#eee";

  const [syncMessage, setSyncMessage] = useState<string | null>("");
  const [loadingText, setLoadingText] = useState("Initializing..."); 
  const [cloudPlaybackUrl, setCloudPlaybackUrl] = useState<string | null>(null);
  const [playFromCloud, setPlayFromCloud] = useState(false);

  const theme = getThemeStyles(isDark);
  const [loading, setLoading] = useState(true);
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [fileSamples, setFileSamples] = useState<string[]>([]); // 🚀 Diagnostic samples
  const [player, setPlayer] = useState<AudioPlayer | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [showPathPicker, setShowPathPicker] = useState(false); // 🚀 NEW: Toggle for manual path menu
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<any[]>([]); // Detailed contacts for name matching
  const [expandedNums, setExpandedNums] = useState<Set<string>>(new Set());

  // 🚀 Caching to prevent redundant fetches
  const [cachedEmployees, setCachedEmployees] = useState<any[]>([]);
  const [cachedVendors, setCachedVendors] = useState<any[]>([]);

  // 1. Load Data
  useEffect(() => {
    if (visible) {
      const init = async () => {
        const savedPath = await appService.getRecordingPath();
        if (savedPath) setRecordingPath(savedPath);

        // Fetch cloud playback URL from corporate profile
        try {
          const res = await (appService as any).httpClient.get("/setting/update/corporate");
          const url = res.data?.data?.accessCorporate?.apiUrls?.cloudPlaybackUrl;
          if (url) setCloudPlaybackUrl(url);
        } catch (e) {}

        fetchCallLogs(savedPath);
      };
      init();
    }
    return () => {
      // Cleanup player on close
      if (player) {
        player.release();
      }
    };
  }, [visible]);

  const fetchCallLogs = async (overridePath?: string | null | any) => {
    const isPathStr = typeof overridePath === 'string';
    const safePath = isPathStr ? overridePath : recordingPath;

    // 🚀 IMPROVED: Handle Development Environment (Expo Go) with Mock Data
    const isDevFallback = !CallTrackerModule && (__DEV__ || Platform.OS === "ios");

    if (Platform.OS !== "android" && !isDevFallback) {
      setLoading(false);
      return;
    }

    if (!safePath) {
      setSyncMessage("Select path first");
    }

    const isInitialLoad = calls.length === 0;

    if (isInitialLoad) {
      setLoading(true);
      setLoadingText("Fetching call logs...");
    } else {
      setSyncMessage("Refreshing logs...");
    }
    
    setPermissionDenied(false);

    try {
      let rows: any[] = [];

      // 1. Native Module Diagnostic
      if (CallTrackerModule) {
        if (isInitialLoad) setLoadingText("Pinging Native Module...");
        try {
          const pingPromise = CallTrackerModule.ping();
          const pingTimeout = new Promise((_, r) => setTimeout(() => r("TIMEOUT"), 1000));
          await Promise.race([pingPromise, pingTimeout]);
          if (isInitialLoad) setLoadingText("Native Module: SUCCESS");
        } catch (p) {
        }
      }

      // 2. Permissions Check
      if (isInitialLoad) setLoadingText("Checking Permissions...");
      const hasPermission = await requestCallLogPermission();
      if (isInitialLoad) setLoadingText(hasPermission ? "Permission: GRANTED" : "Permission: DENIED");

      if (!hasPermission) {
        setPermissionDenied(true);
        if (isInitialLoad) setLoading(false);
        return;
      }

      // 3. Fetch Data
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("NATIVE_TIMEOUT")), 8000));
      rows = await Promise.race([
        CallTrackerModule.getDeviceCallLogs(),
        timeoutPromise
      ]) as any[];

      // 🚀 FILTER: Current Week (Last 7 Days)
      const startOfToday = new Date().setHours(0, 0, 0, 0);
      const oneWeekAgoLimit = startOfToday - (6 * 24 * 60 * 60 * 1000); // 6 days back from today's start

      rows = (rows || []).filter(r => {
        const ts = Number(r.timestamp);
        const dur = Number(r.duration);
        return ts >= oneWeekAgoLimit && dur > 10;
      });


      if (isInitialLoad) setLoadingText("Indexing call logs...");

      // 🚀 PERFORMANCE: Pre-normalized matching function
      const norm = (n: any) => appService.formatMobile(n)?.plain || String(n || "").replace(/\D/g, "").slice(-10);

      // 🚀 ASYNC: Get Employees and Vendors (Use Cache if available)
      let employees: any[] = cachedEmployees;
      let vendors: any[] = cachedVendors;
      
      if (employees.length === 0 || vendors.length === 0) {
        try {
          const fetchEmp = async () => { try { return await (appService as any).getEmployeeList?.(); } catch (e) { return null; } };
          const fetchVen = async () => { try { return await (appService as any).getVendorList?.(); } catch (e) { return null; } };
          
          const syncTimeout = new Promise((resolve) => setTimeout(() => resolve("SYNC_TIMEOUT"), 5000));
          const syncPromise = Promise.all([fetchEmp(), fetchVen()]);

          const result: any = await Promise.race([syncPromise, syncTimeout]);
          if (result !== "SYNC_TIMEOUT") {
            const [empRes, venRes] = result;
            if (empRes?.success) {
               employees = empRes.data || [];
               setCachedEmployees(employees);
            }
            if (venRes?.success) {
               vendors = venRes.data || [];
               setCachedVendors(vendors);
            }
          }
        } catch (err) { }
      }

      let currentContacts: any[] = deviceContacts;
      if (currentContacts.length === 0) {
        try {
          const permTimeout = new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), 3000));
          const permPromise = Contacts.requestPermissionsAsync();
          const pResult: any = await Promise.race([permPromise, permTimeout]);

          if (pResult !== "TIMEOUT" && pResult.status === 'granted') {
            const contactTimeout = new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), 3000));
            const contactPromise = Contacts.getContactsAsync({
              fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.FirstName, Contacts.Fields.LastName],
            });
            const cResult: any = await Promise.race([contactPromise, contactTimeout]);

            if (cResult !== "TIMEOUT" && cResult?.data) {
              currentContacts = cResult.data.map((c: any) => ({
                name: `${c.firstName || ""} ${c.lastName || ""}`.trim(),
                numbers: (c.phoneNumbers || []).map((p: any) => norm(p.number))
              }));
              setDeviceContacts(currentContacts);
            }
          }
        } catch (ce) {
        }
      }

      // 🚀 PERFORMANCE: Create Look-up Maps for O(1) matching speed
      const clientMap = new Map();
      (leads || []).forEach(l => {
        const n = norm(l.sender_mobile);
        if (n) clientMap.set(n, l);
      });

      const employeeMap = new Map();
      employees.forEach(e => {
        const n = norm(e.mobile);
        if (n) employeeMap.set(n, e.name || e.first_name || e.full_name || "Employee");
      });

      const vendorMap = new Map();
      vendors.forEach(v => {
        const p = norm(v.mobile);
        if (p) vendorMap.set(p, v.name);
      });

      // 🚀 PROCESSING: Group by number and Categorize
      const contactMap = new Map();
      currentContacts.forEach(c => {
        (c.numbers || []).forEach((n: string) => contactMap.set(n, c));
      });

      const groups: Record<string, GroupedCall> = {};

      rows.forEach(call => {
        const cleanNum = norm(call.phoneNumber);
        if (!cleanNum) return;

        if (!groups[cleanNum]) {
          let category: "CLIENTS" | "EMPLOYEES" | "VENDORS" | "KNOWN" | "NEW" = "NEW";
          let displayName = call.name || "New Call";

          if (clientMap.has(cleanNum)) {
            category = "CLIENTS";
            const lead = clientMap.get(cleanNum);
            displayName = lead.sender_name || lead.full_name || displayName;
          } else if (employeeMap.has(cleanNum)) {
            category = "EMPLOYEES";
            displayName = employeeMap.get(cleanNum);
          } else if (vendorMap.has(cleanNum)) {
            category = "VENDORS";
            displayName = vendorMap.get(cleanNum);
          } else if (contactMap.has(cleanNum)) {
            category = "KNOWN";
            displayName = contactMap.get(cleanNum).name;
          }

          groups[cleanNum] = {
            phoneNumber: cleanNum,
            displayName,
            category,
            latestTimestamp: 0,
            calls: [],
            matchedLead: clientMap.get(cleanNum),
            isContactDevice: !!contactMap.has(cleanNum)
          };
        }

        groups[cleanNum].calls.push({ ...call, hasRecording: false });
        const ts = Number(call.timestamp);
        if (ts > groups[cleanNum].latestTimestamp) {
          groups[cleanNum].latestTimestamp = ts;
        }
      });

      // Sort and Sectionify
      const sortedGroups = Object.values(groups).sort((a, b) => b.latestTimestamp - a.latestTimestamp);

      const sections = [
        { title: "CLIENT CALLS", data: sortedGroups.filter(g => g.category === "CLIENTS") },
        { title: "STAFF CALLS", data: sortedGroups.filter(g => g.category === "EMPLOYEES") },
        { title: "VENDOR CALLS", data: sortedGroups.filter(g => g.category === "VENDORS") },
        { title: "KNOWN CALLS", data: sortedGroups.filter(g => g.category === "KNOWN") },
        { title: "NEW CALLS", data: sortedGroups.filter(g => g.category === "NEW") },
      ].filter(s => s.data.length > 0);

      // 🚀 SYNC: Scan Recordings before hiding loading state
      if (safePath) {
        await syncRecordings(sections, safePath, isInitialLoad);
      } else {
        setSyncMessage("Select path first");
        setCalls(sections);
      }
    } catch (e: any) {
      appService.showToast("Failed to fetch logs: " + (e.message || "Unknown error"), "Error");
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  };

  const syncRecordings = async (currentSections: any[], overridePath?: string | null | any, blockUI: boolean = false) => {
    if (blockUI) setLoading(true);
    const isPathStr = typeof overridePath === 'string';
    const activePath = isPathStr ? overridePath : recordingPath;
    if (!activePath) {
      setSyncMessage("Select path first");
      if (blockUI) setLoading(false);
      return;
    }

    try {
      let parsedFiles: any[] = [];
      
      setSyncMessage("Index call recording...");
      if (blockUI) setLoadingText("Index call recording...");

      // 1. Fetch & Parse ALL Files
      if (activePath.startsWith("content://")) {
        const dir = new Directory(activePath);
        const allFiles = dir.list().filter(i => i instanceof FSFile);
        
        for (const f of allFiles) {
           const uri = f.uri;
           const safeUri = safeDecodeURI(uri).toLowerCase();
           const name = safeUri.split("/").pop() || safeUri;
           
           parsedFiles.push({
              original: uri, // Keep full URI
              name: name,
              fDigits: name.replace(/\D/g, ""),
              cleanFName: name.replace(/\s+|_|-/g, "")
           });
        }
      } else {
        const files = await FileSystem.readDirectoryAsync(activePath);
        for (const f of files) {
           const name = f.toLowerCase();
           parsedFiles.push({
              original: `${activePath.endsWith("/") ? activePath : activePath + "/"}${f}`,
              name: name,
              fDigits: name.replace(/\D/g, ""),
              cleanFName: name.replace(/\s+|_|-/g, "")
           });
        }
      }

      setSyncMessage("Linkage call with recording...");
      if (blockUI) setLoadingText("Linkage call with recording...");

      // 🚀 OPTIMIZATION: Pre-calculate unique dates from the past 7 days to group files by date
      const filesByDateMap = new Map<string, any[]>();
      const last7DaysDatePatterns: { dateKey: string; patterns: string[] }[] = [];
      const todayTs = Date.now();
      for (let i = 0; i < 8; i++) {
        const d = new Date(todayTs - i * 24 * 60 * 60 * 1000);
        const year = d.getFullYear().toString();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const shortYear = year.slice(2);
        
        const dateKey = `${year}-${month}-${day}`;
        filesByDateMap.set(dateKey, []);
        last7DaysDatePatterns.push({
          dateKey,
          patterns: [
            year + month + day,
            shortYear + month + day,
            day + month + year,
            day + month + shortYear
          ]
        });
      }

      // Distribute files to date buckets (O(N) * 8 * 4 is extremely fast)
      for (const pf of parsedFiles) {
        for (const day of last7DaysDatePatterns) {
          const hasDate = day.patterns.some(p => pf.cleanFName.includes(p));
          if (hasDate) {
            filesByDateMap.get(day.dateKey)!.push(pf);
          }
        }
      }

      // Pre-extract group matching info to avoid repeated calculations
      const groupInfoList = currentSections.flatMap(section => 
        section.data.map((group: GroupedCall) => {
          const searchName = group.displayName && group.displayName !== "New Call" ? group.displayName.toLowerCase() : null;
          const cleanSearchName = searchName ? searchName.replace(/\s+|_|-/g, "") : null;
          const mobile = group.phoneNumber.replace(/\D/g, "").slice(-10);
          const rawPhoneDigits = group.phoneNumber.replace(/\D/g, "");
          return {
            phoneNumber: group.phoneNumber,
            mobile,
            rawPhoneDigits,
            cleanSearchName,
          };
        })
      );

      // Pre-filter files per group (O(N) * G is extremely fast in a single pass)
      const groupFilesMap = new Map<string, any[]>();
      for (const info of groupInfoList) {
        groupFilesMap.set(info.phoneNumber, []);
      }
      for (const pf of parsedFiles) {
        for (const info of groupInfoList) {
          const isMatch = (info.mobile && pf.fDigits.includes(info.mobile)) ||
                          (info.cleanSearchName && pf.cleanFName.includes(info.cleanSearchName)) ||
                          (info.rawPhoneDigits && pf.cleanFName.includes(info.rawPhoneDigits));
          if (isMatch) {
            groupFilesMap.get(info.phoneNumber)!.push(pf);
          }
        }
      }

      // 2. Map groups
      const updatedSections = currentSections.map(section => ({
        ...section,
        data: section.data.map((group: GroupedCall) => {
          const groupKey = group.phoneNumber;
          const groupFiles = groupFilesMap.get(groupKey) || [];

          return {
            ...group,
            calls: group.calls.map(call => {
              const callTs = Number(call.timestamp);
              const d = new Date(callTs);
              const year = d.getFullYear().toString();
              const month = String(d.getMonth() + 1).padStart(2, "0");
              const day = String(d.getDate()).padStart(2, "0");
              const hour = String(d.getHours()).padStart(2, "0");
              const min = String(d.getMinutes()).padStart(2, "0");
              const shortYear = year.slice(2);
              
              const callDateKey = `${year}-${month}-${day}`;

              // 🚀 FUZZY TIME: Check current, previous, and next minute
              const dPrev = new Date(callTs - 60000);
              const dNext = new Date(callTs + 60000);
              const timePatterns = [
                 hour + min,
                 String(dPrev.getHours()).padStart(2, "0") + String(dPrev.getMinutes()).padStart(2, "0"),
                 String(dNext.getHours()).padStart(2, "0") + String(dNext.getMinutes()).padStart(2, "0")
              ];

              const datePatterns = [
                year + month + day,
                shortYear + month + day,
                day + month + year,
                day + month + shortYear
              ];
              
              const epochSec = Math.floor(callTs / 1000).toString().slice(0, 8);
              const epochMs = callTs.toString().slice(0, 10);

              // Filter group files matching this call's date (very small array)
              const groupFilesForDate = groupFiles.filter(pf => 
                datePatterns.some(p => pf.cleanFName.includes(p))
              );

              // 🔍 STEP 1: Search in Group Files for that date (Files that have phone/name AND call date)
              let match = groupFilesForDate.find(pf => {
                 return timePatterns.some(t => pf.cleanFName.includes(t)) || 
                        pf.cleanFName.includes(epochSec) || 
                        pf.cleanFName.includes(epochMs);
              });

              // 🔍 STEP 2: Global Fallback (Files with Date + Time but NO phone number)
              if (!match) {
                 const globalFilesForDate = filesByDateMap.get(callDateKey) || [];
                 match = globalFilesForDate.find(pf => {
                    return timePatterns.some(t => pf.cleanFName.includes(t)) || 
                           pf.cleanFName.includes(epochSec) || 
                           pf.cleanFName.includes(epochMs);
                 });
              }

              // 🔍 STEP 3: Last Resort Fallbacks
              if (!match) match = groupFilesForDate[0];
              if (!match && groupFiles.length > 0) match = groupFiles[0];

              if (match) {
                 let fileDateStr = "Matched";
                 const dateMatchStr = match.name.match(/(\d{6,8})/);
                 if (dateMatchStr) fileDateStr = dateMatchStr[1];
                 return { ...call, hasRecording: true, recordingUri: match.original, fileDateStr };
              }
              return call;
            })
          };
        })
      }));

      // Diagnostic
      setFileSamples(parsedFiles.slice(0, 3).map(f => f.name));

      setCalls(prev => [...updatedSections]);
      setSyncMessage("Ready for use");
      setTimeout(() => {
        setSyncMessage(prev => prev === "Ready for use" ? null : prev);
      }, 5000);
    } catch (e: any) {
      setSyncMessage("Error during linkage");
      appService.showToast("Background sync error: " + (e.message || "Unknown error"), "Error");
    } finally {
      if (blockUI) setLoading(false);
    }
  };

  const handleShareAudio = async (call: CallRecord) => {
    if (!recordingPath) {
      appService.showToast("Recording path not set", "Info");
      return;
    }

    try {
      let targetUri = call.recordingUri;
      if (!targetUri) {
        appService.showToast("No recording found to share", "Info");
        return;
      }

      // If it's a content URI, copy to cache first to ensure sharing works
      if (targetUri.startsWith("content://")) {
        const parts = targetUri.split('.');
        const ext = parts.length > 1 ? parts.pop() : 'm4a';
        const cacheFile = `${cacheDirectory}share_temp.${ext}`;
        await legacyCopyAsync({ from: targetUri, to: cacheFile });
        targetUri = cacheFile;
      }

      // 🚀 EXPO SHARING: Open native share sheet
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(targetUri, {
          mimeType: 'audio/mpeg',
          dialogTitle: `Share Recording: ${call.phoneNumber}`,
          UTI: 'public.mp3'
        });
      } else {
        appService.showToast("Sharing not available on this device", "Error");
      }
    } catch (e: any) {
      appService.showToast("Cannot share recording: " + e.message, "Error");
    }
  };

  const handleUploadToCloud = async (call: CallRecord) => {
    if (!cloudPlaybackUrl) {
      appService.showToast("Cloud path not configured in corporate settings", "Error");
      return;
    }
    if (!call.recordingUri) {
      appService.showToast("No local recording found to upload", "Error");
      return;
    }

    try {
      setSyncMessage("Uploading...");
      const fileName = call.recordingUri.split("/").pop() || "recording.mp3";
      
      const uploadRes = await FileSystem.uploadAsync(cloudPlaybackUrl, call.recordingUri, {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        parameters: {
          phoneNumber: call.phoneNumber,
          timestamp: String(call.timestamp),
          dbName: (await appService.getSession())?.dbName || ""
        }
      });

      if (uploadRes.status === 200 || uploadRes.status === 201) {
        appService.showToast("Uploaded successfully", "Success");
      } else {
        appService.showToast(`Upload failed (${uploadRes.status})`, "Error");
      }
    } catch (e: any) {
      appService.showToast("Upload error: " + e.message, "Error");
    } finally {
      setSyncMessage("");
    }
  };

  // 2. Recording Logic
  const handlePlayRecording = async (call: CallRecord, name?: string) => {
    if (!recordingPath && !playFromCloud) {
      promptForPath();
      return;
    }

    // 🚀 TOGGLE: If the exact same recording is playing, stop it and exit
    if (playingId === call.timestamp && player) {
      try {
        player.pause();
        player.release();
      } catch (e) {
      }
      setPlayer(null);
      setPlayingId(null);
      setLoadingAudioId(null);
      return;
    }

    // 🚀 SAFE CLEANUP: Stop any existing player before starting a new one
    if (player) {
      try {
        player.pause();
        player.release();
      } catch (e) {
      }
      setPlayer(null);
      setPlayingId(null);
    }

    try {
      setLoadingAudioId(call.timestamp);
      let targetUri = call.recordingUri;

      if (playFromCloud && cloudPlaybackUrl) {
         // Construct cloud URL
         const fileName = call.recordingUri ? call.recordingUri.split("/").pop() : null;
         if (fileName) {
            targetUri = cloudPlaybackUrl.endsWith("/") ? cloudPlaybackUrl + fileName : cloudPlaybackUrl + "/" + fileName;
         }
      }

      if (!targetUri) {
        setLoadingAudioId(null);
        appService.showToast("No recording found for " + (name || call.phoneNumber), "Info");
        return;
      }

      // 🚀 ANDROID MEDIA PLAYER FIX
      if (targetUri.startsWith("content://") && Platform.OS === 'android') {
        try {
          const parts = targetUri.split('.');
          const ext = parts.length > 1 ? parts.pop() : 'm4a';
          const localFile = new FSFile(cacheDirectory || "", `temp_playback.${ext}`);
          const localUri = localFile.uri;

          await legacyCopyAsync({
            from: targetUri,
            to: localUri
          });

          targetUri = localUri;
        } catch (copyErr) {
        }
      }

      const newPlayer = createAudioPlayer(targetUri);
      newPlayer.addListener('playbackStatusUpdate', (status: any) => {
        if (status.didJustFinish) setPlayingId(null);
        if (status.error) {
          appService.showToast("Playback error", "Error");
          setPlayingId(null);
        }
      });

      setPlayer(newPlayer);
      setPlayingId(call.timestamp);
      setLoadingAudioId(null);

      try {
        newPlayer.play();
      } catch (playErr: any) {
        appService.showToast("Play failed: " + playErr.message, "Error");
        setPlayingId(null);
        setLoadingAudioId(null);
      }
    } catch (e: any) {
      appService.showToast("Cannot play: " + e.message, "Error");
      setPlayingId(null);
      setLoadingAudioId(null);
    }
  };

  const promptForPath = async () => {
    if (Platform.OS !== 'android') return;

    try {
      // 🚀 MODERN SDK 54: Using pickDirectoryAsync
      const directory = await Directory.pickDirectoryAsync();
      if (directory) {
        await appService.saveRecordingPath(directory.uri);
        setRecordingPath(directory.uri);
        fetchCallLogs(directory.uri); // 🚀 FIX: Pass path explicitly
      }
    } catch (e: any) {
      appService.showToast("Setup cancelled or failed", "Info");
    }
  };

  const handleAddLead = (mobile: string, name?: string) => {
    // 🚀 USE CENTRALIZED HELPER: Format for better prefix handling
    const formatted = appService.formatMobile(mobile);
    const cleanMobile = formatted ? formatted.plain : mobile.replace(/\D/g, "").slice(-10);

    appModules.openLead({
      mobile: cleanMobile,
      name: name && name !== "New Call" ? name : "", // Pass name if it's a real name
      onComplete: () => fetchCallLogs()
    });
  };

  const handleCallBack = (mobile: string) => {
    Linking.openURL(`tel:${mobile}`);
  };

  const toggleExpand = (num: string) => {
    setExpandedNums(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  const getStatusConfig = (direction: string) => {
    switch (direction) {
      case "INCOMING":
        return { icon: "phone-incoming", color: "#10b981", label: "Incoming" };
      case "OUTGOING":
        return { icon: "phone-outgoing", color: "#3b82f6", label: "Outgoing" };
      case "MISSED":
        return { icon: "phone-missed", color: "#ef4444", label: "Missed" };
      case "REJECTED":
        return { icon: "phone-cancel", color: "#6b7280", label: "Rejected" };
      default:
        return { icon: "phone-outline", color: COLORS.textMuted, label: "Call" };
    }
  };

  const renderSectionHeader = ({ section: { title } }: any) => (
    <View style={{ backgroundColor: isDark ? "#1e293b" : "#f1f5f9", paddingHorizontal: 16, paddingVertical: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: "800", color: COLORS.textMuted, letterSpacing: 1 }}>{title}</Text>
    </View>
  );

  const renderItem = ({ item }: { item: GroupedCall }) => {
    const isMatched = item.category === "CLIENTS";
    const isExpanded = expandedNums.has(item.phoneNumber);

    return (
      <View style={[styles.clCard, t.card, { marginVertical: 4, marginHorizontal: 12, padding: 12 }]}>

        {/* ── LINE 1: Name + Icons ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={[styles.clName, t.text, isMatched && { color: COLORS.primary }, { flex: 1 }]} numberOfLines={1}>
            {item.displayName}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <TouchableOpacity onPress={() => handleCallBack(item.phoneNumber)}>
              <MTC name="phone" size={20} color={COLORS.success} />
            </TouchableOpacity>
            {!isMatched && item.category === "NEW" && (
              <TouchableOpacity onPress={() => handleAddLead(item.phoneNumber, item.displayName)}>
                <MTC name="account-plus" size={20} color={COLORS.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── LINE 2: Mobile + Toggle + Date ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginRight: 8 }}>
              {item.phoneNumber}
            </Text>

            <TouchableOpacity
              onPress={() => toggleExpand(item.phoneNumber)}
              style={{
                backgroundColor: isExpanded ? COLORS.primary : COLORS.divider + "40",
                paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12,
                flexDirection: 'row', alignItems: 'center', gap: 4
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: isExpanded ? COLORS.white : COLORS.textMuted }}>
                {item.calls.length} calls
              </Text>
              <MTC name={isExpanded ? "chevron-up" : "chevron-down"} size={12} color={isExpanded ? COLORS.white : COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: '600' }}>
            {appService.formatDateTime(item.latestTimestamp)}
          </Text>
        </View>

        {/* ── EXPANDED SECTION: Individual Calls ── */}
        {isExpanded && (
          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.divider + "40", paddingTop: 8 }}>
            {item.calls.map((call, idx) => {
              const conf = getStatusConfig(call.direction);
              const dateStr = appService.formatDateTime(Number(call.timestamp));
              const isPlaying = playingId === call.timestamp;

              return (
                <View key={`${item.phoneNumber}-${idx}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: idx === item.calls.length - 1 ? 0 : 0.5, borderBottomColor: COLORS.divider + "20" }}>
                  <MTC name={conf.icon as any} size={18} color={conf.color} style={{ marginRight: 10 }} />

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[t.text, { fontSize: 13, fontWeight: '700', color: COLORS.primary }]}>{dateStr}</Text>
                      <View style={{
                        backgroundColor: COLORS.divider + "20",
                        paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4
                      }}>
                        <Text style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: '700' }}>{dur(Number(call.duration))}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <TouchableOpacity onPress={() => handlePlayRecording(call, item.displayName)}>
                      {loadingAudioId === call.timestamp ? (
                        <ActivityIndicator size="small" color={call.hasRecording ? COLORS.success : COLORS.textMuted} style={{ width: 26 }} />
                      ) : (
                        <MTC name={isPlaying ? "pause-circle" : "play-circle"} size={26} color={call.hasRecording ? COLORS.success : COLORS.textMuted} />
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => handleShareAudio(call)}>
                      <MTC name="share-variant" size={20} color={COLORS.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => handleUploadToCloud(call)}>
                      <MTC name="cloud-upload" size={20} color={COLORS.success} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.clOverlay}>
        <View style={[styles.clContainer, t.safeArea]}>
          <View style={[styles.clHeader, { borderBottomColor: COLORS.divider }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {/* 🚀 REFINED: Call Icon is now the Refresh Button */}
              <TouchableOpacity
                onPress={fetchCallLogs}
                disabled={loading}
                activeOpacity={0.7}
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  backgroundColor: COLORS.primary + "15",
                  justifyContent: 'center', alignItems: 'center',
                  marginRight: 12
                }}
              >
                <MTC name={loading ? "clock-outline" : "phone"} size={20} color={COLORS.primary} />
              </TouchableOpacity>

              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={styles.clTitle}>Call Log History</Text>
                </View>
                                <Text style={styles.clSubtitle}>
                  {loading ? "Refreshing..." : `${calls.length} logs found • ${leads.length} leads for matching`}
                </Text>
                {syncMessage && (
                  <Text style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: (syncMessage === 'Ready for use' || syncMessage === 'Select path first') ? COLORS.success : COLORS.primary,
                    marginTop: 4,
                    letterSpacing: 0.5,
                  }}>
                    {syncMessage}
                  </Text>
                )}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {cloudPlaybackUrl && (
                <TouchableOpacity 
                  onPress={() => setPlayFromCloud(!playFromCloud)} 
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    backgroundColor: playFromCloud ? COLORS.primary + "20" : COLORS.divider + "40", 
                    paddingHorizontal: 8, 
                    paddingVertical: 4, 
                    borderRadius: 20,
                    marginRight: 4
                  }}
                >
                  <MTC name={playFromCloud ? "cloud-check" : "cellphone-link"} size={16} color={playFromCloud ? COLORS.primary : COLORS.textMuted} />
                  <Text style={{ fontSize: 10, fontWeight: '800', color: playFromCloud ? COLORS.primary : COLORS.textMuted, marginLeft: 4 }}>
                    {playFromCloud ? "CLOUD" : "DEVICE"}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowPathPicker(!showPathPicker)} style={{ padding: 8 }}>
                <MTC name="folder-edit-outline" size={24} color={showPathPicker ? COLORS.primary : COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
                <MTC name="close" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* 🚀 NEW: Manual Path Picker Sub-Menu */}
          {showPathPicker && (
            <View style={{ padding: 15, backgroundColor: isDark ? '#1a1a1a' : '#f0f4f8', borderBottomWidth: 1, borderBottomColor: COLORS.divider }}>
              <Text style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: '700', marginBottom: 8, letterSpacing: 1 }}>RECORDING FOLDER SETTINGS</Text>

              <TextInput
                style={{
                  backgroundColor: isDark ? '#2a2a2a' : '#fff',
                  color: isDark ? '#fff' : '#000',
                  padding: 12,
                  borderRadius: 10,
                  fontSize: 12,
                  borderWidth: 1.5,
                  borderColor: COLORS.divider,
                  marginBottom: 10
                }}
                placeholder="Paste path (content://...)"
                placeholderTextColor={COLORS.textMuted}
                value={recordingPath || ''}
                onChangeText={(val) => {
                  setRecordingPath(val);
                  // 🚀 Instant Preview: If path looks valid, try to grab samples
                  if (val.length > 10) {
                    setTimeout(() => syncRecordings(calls, val, true), 300);
                  }
                }}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={async () => {
                    if (Platform.OS !== 'android') return;
                    try {
                      const directory = await Directory.pickDirectoryAsync();
                      if (directory) {
                        setRecordingPath(directory.uri);
                        await appService.saveRecordingPath(directory.uri);
                        setShowPathPicker(false);
                        fetchCallLogs(directory.uri);
                      }
                    } catch (e) {
                      appService.showToast("Setup cancelled", "Info");
                    }
                  }}
                  style={{ flex: 1, backgroundColor: COLORS.divider, paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: txtPri }}>SEARCH FOLDER</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={async () => {
                    if (recordingPath) {
                      await appService.saveRecordingPath(recordingPath);
                    }
                    setShowPathPicker(false);
                    fetchCallLogs();
                  }}
                  style={{ flex: 1, backgroundColor: COLORS.primary, paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>USE THIS PATH</Text>
                </TouchableOpacity>
              </View>

              {/* 🚀 NEW: Live Preview of files in the pasted path */}
              {fileSamples.length > 0 && (
                <View style={{ marginTop: 15, padding: 10, backgroundColor: isDark ? '#222' : '#eef', borderRadius: 8 }}>
                  <Text style={{ fontSize: 9, color: COLORS.textMuted, marginBottom: 5, fontWeight: '700' }}>SAMPLES DETECTED IN THIS FOLDER:</Text>
                  {fileSamples.map((s, idx) => (
                    <Text key={idx} style={{ fontSize: 10, color: COLORS.success, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>• {s}</Text>
                  ))}
                </View>
              )}
            </View>
          )}

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={[styles.clSubtitle, { marginTop: 12, fontWeight: '700', color: COLORS.primary }]}>
                {loadingText}
              </Text>
            </View>
          ) : (
            <SectionList
              sections={calls}
              keyExtractor={(item, index) => item.phoneNumber + index}
              stickySectionHeadersEnabled={true}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              contentContainerStyle={[styles.clList, { paddingHorizontal: 0 }]}
              ListEmptyComponent={
                <View style={styles.center}>
                  <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.divider + "40", justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                    <MTC name={permissionDenied ? "lock" : "phone"} size={40} color={COLORS.textMuted} />
                  </View>
                  <Text style={[styles.clTitle, t.text, { fontSize: 16 }]}>
                    {permissionDenied ? "Permission Required" : "0 Logs Found"}
                  </Text>
                  <Text style={[styles.clSubtitle, { textAlign: 'center', paddingHorizontal: 40, marginTop: 8 }]}>
                    {permissionDenied
                      ? "Native-level permission is missing. Please grant 'Call Log' access in App Info."
                      : "If you have calls, your device may be blocking access in 'Privacy Protection'.\n\nIf you see 'System-Test-Success', the app is working but your device log is empty."}
                  </Text>
                </View>
              }
            />
          )}

          <TouchableOpacity style={[styles.clFooter, { backgroundColor: isDark ? COLORS.cardDark : "#f8fafc" }]} onPress={promptForPath}>
            <MTC name="folder-open" size={16} color={COLORS.primary} style={{ marginRight: 8 }} />
            <Text style={[styles.clSubtitle, { flex: 1 }]} numberOfLines={1}>
              Storage: {recordingPath ? (decodeURIComponent(recordingPath).split('/').pop() || "Folder Set") : "Set Recording Path"}
            </Text>
            <MTC name="chevron-right" size={14} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default CallLogModal;
