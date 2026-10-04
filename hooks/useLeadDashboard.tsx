import { useUserContext } from "@/context/AuthContext";
import { appService } from "@/UtilServices/appHelper";
import { appModules } from "@/UtilServices/appModals";
import { documentDirectory, downloadAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getSocket, joinTenantRoom } from "@/hooks/Socket";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TextInput } from "react-native";
import ShowLeads from "@/dashboards/showLeads";

export interface LeadDashboardConfig {
  token: string;
  userId: string;
  name: string;
  isDark: boolean;
  statusMap: Record<string, string>;
  allStatusTabs: readonly string[];
  initialTab: string;
}

export function useLeadDashboard({
  token, userId, name,
  isDark, statusMap, allStatusTabs, initialTab,
}: LeadDashboardConfig) {

  const { user, visitingCardUri } = useUserContext();

  const [leads, setLeads] = useState<any[]>([]);
  const [allLeads, setAllLeads] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false); // 🚀 FIXED: Start false to avoid stuck spinner if no fetch occurs
  const [activeTab, setActiveTab] = useState(initialTab);
  const [panelVisible, setPanelVisible] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [callSyncInProgress, setCallSyncInProgress] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    text: string;
    visible: boolean;
    overallPercent: number;
    stats: { totalFetched: number; uniqueCount: number; duplicateCount: number; savedCount?: number; isComplete?: boolean };
  }>({ text: "", visible: false, overallPercent: 0, stats: { totalFetched: 0, uniqueCount: 0, duplicateCount: 0 } });
  const [callLogVisible, setCallLogVisible] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const tokenRef = useRef(token);
  const isDarkRef = useRef(isDark);
  const nameRef = useRef(name);
  const userRef = useRef(user); // 🚀 NEW: Reference to user to check dbName

  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);
  useEffect(() => { nameRef.current = name; }, [name]);
  useEffect(() => { userRef.current = user; }, [user]);

  const fetchLeads = useCallback(async (isRefreshing = false) => {
    // 🚀 FIX: Do not fetch if dbName is missing (tenant resolution not complete)
    if (!tokenRef.current || !userRef.current?.dbName) return;
    if (isRefreshing) setRefreshing(true);
    else {
      setLeads(current => {
        if (current.length === 0) setInitialLoading(true);
        return current;
      });
    }

    try {
      const res = await appService.httpClient.get(
        `service/leads/status/${statusMap[activeTab] ?? activeTab}`,
        { headers: { Authorization: `Bearer ${tokenRef.current}` } },
      );
      setLeads(res.data?.success ? res.data.data : []);
    } catch (error: any) {
      const msg = error?.response?.data?.message ?? error?.message ?? "Something went wrong";
      console.error("fetchLeads error:", msg);
      appService.showToast(msg, "Error");
      setLeads([]);
    } finally {
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, [activeTab, statusMap]);

  const fetchAllLeads = useCallback(async (force = false) => {
    if (!tokenRef.current || !userRef.current?.dbName) return;
    if (!force && allLeads.length > 0) return;

    try {
      const res = await appService.httpClient.get(
        `service/leads/list`,
        { headers: { Authorization: `Bearer ${tokenRef.current}` } },
      );
      setAllLeads(res.data?.success ? res.data.data : []);
    } catch { }
  }, [allLeads.length]);

  const fetchRef = useRef(fetchLeads);
  const fetchAllRef = useRef(fetchAllLeads);
  
  useEffect(() => { fetchRef.current = fetchLeads; }, [fetchLeads]);
  useEffect(() => { fetchAllRef.current = fetchAllLeads; }, [fetchAllLeads]);

  useEffect(() => {
    const unsub = appModules.subscribe((type, state) => {
      if (type === "lead" && !(state as any).visible) fetchRef.current(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user?.dbName) return;

    joinTenantRoom(user.dbName);
    const socket = getSocket();

    const onUpdate = () => {
      fetchRef.current(true);
      fetchAllRef.current(true); // 🚀 Force refresh allLeads for Activity Marquee
    };

    socket.on("lead:created", onUpdate);
    socket.on("lead:updated", onUpdate);
    socket.on("lead:deleted", onUpdate);
    socket.on("lead:batch_created", onUpdate);

    socket.on("sync:progress", (data: { percent: number; text: string; type: string; stats?: any }) => {
      setSyncProgress(prev => {
        const isFinished = data.stats?.isComplete || (data.type === "sync_stats" && data.percent === 100);
        if (isFinished) return { ...prev, visible: false, overallPercent: 100 };

        const newPercent = Number(data.percent);
        return {
          ...prev,
          overallPercent: isNaN(newPercent) ? prev.overallPercent : newPercent,
          text: data.text || prev.text,
          visible: true,
          stats: { ...prev.stats, ...data.stats }
        };
      });
    });

    return () => {
      socket.off("lead:created", onUpdate);
      socket.off("lead:updated", onUpdate);
      socket.off("lead:deleted", onUpdate);
      socket.off("lead:batch_created", onUpdate);
      socket.off("sync:progress");
    };
  }, [user?.dbName]);

  const stableOnStatusChange = useCallback(() => fetchRef.current(false), []);

  const sortedLeads = useMemo(
    () => [...leads].sort((a, b) => (b.lead_no || 0) - (a.lead_no || 0)),
    [leads],
  );
  const sortedAllLeads = useMemo(
    () => [...allLeads].sort((a, b) => (b.lead_no || 0) - (a.lead_no || 0)),
    [allLeads],
  );

  const renderItem = useCallback(({ item, index }: any) => (
    <ShowLeads
      item={item}
      token={tokenRef.current}
      isDark={isDarkRef.current}
      isFirst={index === 0}
      onStatusChange={stableOnStatusChange}
      currentUser={nameRef.current}
      corporateName={user?.corporateName ?? undefined}
      corporateEmail={user?.corporateEmail ?? undefined}
      corporateAddress={user?.corporateAddress ?? undefined}
      userMobile={user?.mobile ?? undefined}
      userDisplayName={user?.userDisplayName ?? undefined}
      corpProfileImage={user?.CorpProfileImage ?? undefined}
      visitingCardUri={visitingCardUri ?? undefined}
    />
  ), [
    stableOnStatusChange, 
    user?.corporateName, 
    user?.corporateEmail, 
    user?.corporateAddress, 
    user?.mobile, 
    user?.userDisplayName, 
    user?.CorpProfileImage,
    visitingCardUri
  ]);

  const keyExtractor = useCallback((item: any) => String(item._id), []);
  const filteredLeads = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return sortedLeads;
    return sortedAllLeads.filter((l: any) =>
      l?.sender_name?.toLowerCase().includes(q) ||
      l?.sender_mobile?.includes(q),
    );
  }, [sortedLeads, sortedAllLeads, searchInput]);


  const switchTab = useCallback((t: string) => {
    setActiveTab(t); setSearchInput(""); setSearchVisible(false); setPanelVisible(false);
  }, []);
  const togglePanel = useCallback(() => setPanelVisible(v => !v), []);
  const openSearch = useCallback(() => {
    setSearchVisible(true); setPanelVisible(false);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);
  const closeSearch = useCallback(() => {
    setSearchVisible(false); setSearchInput(""); searchInputRef.current?.blur();
  }, []);
  const openModal = useCallback(() => {
    setPanelVisible(false);
    appModules.openLead();
  }, []);

  const doRefresh = useCallback(async () => {
    setIsActionLoading(true);
    searchInputRef.current?.blur();
    try {
      await fetchRef.current(true);
      setPanelVisible(false);
      appService.showToast("Data Refreshed", "Success");
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  const doCallSync = useCallback(() => {
    setPanelVisible(false);
    setCallLogVisible(true); // 🚀 OPEN NEW CALL LOG MODAL
    searchInputRef.current?.blur();
  }, []);

  const handleRefresh = useCallback(() => fetchRef.current(true), []);

  const isSyncingRef = useRef(false);
  const doDownload = useCallback(async () => {
    if (isSyncingRef.current) return;

    // 1️⃣ INITIALIZE: Prepare UI for sync
    isSyncingRef.current = true;
    setDownloading(true);
    searchInputRef.current?.blur();
    
    // Set first visible step
    setSyncProgress({ 
      text: "Waking up sync gateway...", 
      visible: true, 
      overallPercent: 2,
      stats: { totalFetched: 0, uniqueCount: 0, duplicateCount: 0 }
    });

    try {
      // 2️⃣ GATEWAY: Small delay to show "Initiating" state before API call
      setSyncProgress(p => ({ ...p, text: "Authenticating with external services...", overallPercent: 5 }));

      const res = await appService.httpClient.post("service/email/readInbox", {}, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // 3️⃣ RESPONSE: Handle result (Socket messages would have handled intermediate steps)
      if (res.data?.success || res.data?.status === "success") {
        const total = res.data.total ?? res.data.count ?? 0;
        appService.showToast(`Successfully synced ${total} leads.`, "Success");
        
        // Final UI cleanup
        setSyncProgress(p => ({ ...p, text: "Sync completed!", overallPercent: 100 }));
        setTimeout(() => setSyncProgress(p => ({ ...p, visible: false })), 1000);
        
        fetchRef.current(true); // Refresh list
        setPanelVisible(false);
      } else {
        throw new Error(res.data?.message || "Sync was interrupted");
      }

    } catch (error: any) {
      const msg = error?.response?.data?.message ?? error?.message ?? "Network Error";
      appService.showToast(msg, "Error");
      setSyncProgress(p => ({ ...p, visible: false }));
    } finally {
      setDownloading(false);
      isSyncingRef.current = false;
    }
  }, [token]);

  const doExportExcel = useCallback(async () => {
    setIsActionLoading(true);
    setPanelVisible(false);
    try {
      const fileName = `Leads_Export_${new Date().getTime()}.xlsx`;
      const fileUri = (documentDirectory || "") + fileName;

      const downloadRes = await downloadAsync(
        `${appService.httpClient.defaults.baseURL}service/leads/export/excel?dbName=${user?.dbName}`,
        fileUri,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (downloadRes.status === 200) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloadRes.uri);
        } else {
          appService.showToast("Sharing not available", "Error");
        }
      } else {
        appService.showToast("Download failed", "Error");
      }
    } catch (error: any) {
      appService.showToast(error.message, "Error");
    } finally {
      setIsActionLoading(false);
    }
  }, [token, user?.dbName]);

  return {
    // state
    leads, allLeads, refreshing, initialLoading, activeTab, panelVisible,
    searchInput, setSearchInput, searchVisible, setSearchVisible,
    downloading, callSyncInProgress, isActionLoading, searchInputRef,
    callLogVisible, setCallLogVisible, syncProgress,
    // derived
    filteredLeads,
    // render helpers
    renderItem, keyExtractor,
    // fetchers
    fetchLeads, fetchAllLeads, fetchRef,
    stableOnStatusChange,
    // handlers
    switchTab, togglePanel, openSearch, closeSearch,
    openModal, doRefresh, handleRefresh, doDownload, doCallSync, doExportExcel,
    setPanelVisible,
  };
}