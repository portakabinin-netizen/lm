/**
 * useTenantData.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook that reads from TenantStore (in-memory / AsyncStorage cache)
 * and subscribes to the relevant Socket.IO events to keep the cache hot.
 *
 * NO HTTP CALLS ARE MADE ON BUTTON CLICKS.
 * Data is served from memory. Socket events patch individual records.
 * A full re-fetch only happens on first launch or after a corporate switch.
 *
 * Usage:
 *   const { data: leads, loading, refresh } = useTenantData('leads');
 */

import { getSocket, joinTenantRoom } from '@/hooks/Socket';
import { useUserContext } from '@/context/AuthContext';
import { tenantStore, TenantDomain } from '@/UtilServices/TenantStore';
import { useCallback, useEffect, useRef, useState } from 'react';

// ── Socket event map ──────────────────────────────────────────────────────────
// Maps socket event names → which domain they affect and what operation.

type Op = 'patch' | 'remove' | 'setDoc' | 'refresh';

interface SocketBinding {
  event: string;
  domain: TenantDomain;
  op: Op;
  /** Pull the record/id out of the event payload */
  extract?: (payload: any) => any;
}

const SOCKET_BINDINGS: SocketBinding[] = [
  // ── Leads ──────────────────────────────────────────────────────────────────
  { event: 'lead:created',      domain: 'leads',      op: 'patch',   extract: (p) => p?.data ?? p },
  { event: 'lead:updated',      domain: 'leads',      op: 'patch',   extract: (p) => p?.data ?? p },
  { event: 'lead:deleted',      domain: 'leads',      op: 'remove',  extract: (p) => p?.id ?? p?._id ?? p },
  { event: 'lead:batch_created',domain: 'leads',      op: 'refresh' },

  // ── Employees ───────────────────────────────────────────────────────────────
  { event: 'employee:created',  domain: 'employees',  op: 'patch',   extract: (p) => p?.data ?? p },
  { event: 'employee:updated',  domain: 'employees',  op: 'patch',   extract: (p) => p?.data ?? p },
  { event: 'employee:deleted',  domain: 'employees',  op: 'remove',  extract: (p) => p?.id ?? p?._id ?? p },

  // ── Attendance ──────────────────────────────────────────────────────────────
  { event: 'attendance:updated',        domain: 'attendance', op: 'patch',   extract: (p) => p?.data ?? p },
  { event: 'attendance:deleted',        domain: 'attendance', op: 'remove',  extract: (p) => p?.id ?? p?._id ?? p },
  // active_updated patches both the attendance list and triggers activeStaff refresh
  { event: 'attendance:active_updated', domain: 'attendance', op: 'patch',   extract: (p) => p?.data ?? p },
  { event: 'attendance:active_updated', domain: 'activeStaff',op: 'refresh' },
  { event: 'attendance:duty_on',        domain: 'activeStaff',op: 'refresh' },
  { event: 'attendance:duty_off',       domain: 'activeStaff',op: 'refresh' },

  // ── Parties ─────────────────────────────────────────────────────────────────
  { event: 'party:created',     domain: 'parties',    op: 'patch',   extract: (p) => p?.data ?? p },
  { event: 'party:updated',     domain: 'parties',    op: 'patch',   extract: (p) => p?.data ?? p },
  { event: 'party:deleted',     domain: 'parties',    op: 'remove',  extract: (p) => p?.id ?? p?._id ?? p },

  // ── Products ────────────────────────────────────────────────────────────────
  { event: 'product:created',   domain: 'products',   op: 'patch',   extract: (p) => p?.data ?? p },
  { event: 'product:updated',   domain: 'products',   op: 'patch',   extract: (p) => p?.data ?? p },
  { event: 'product:deleted',   domain: 'products',   op: 'remove',  extract: (p) => p?.id ?? p?._id ?? p },

  // ── Staff ───────────────────────────────────────────────────────────────────
  { event: 'staff:created',     domain: 'staff',      op: 'patch',   extract: (p) => p?.data ?? p },
  { event: 'staff:updated',     domain: 'staff',      op: 'patch',   extract: (p) => p?.data ?? p },
  { event: 'staff:deleted',     domain: 'staff',      op: 'remove',  extract: (p) => p?.id ?? p?._id ?? p },

  // ── Categories ───────────────────────────────────────────────────────────────
  { event: 'category:created',  domain: 'categories', op: 'patch',   extract: (p) => p?.data ?? p },
  { event: 'category:updated',  domain: 'categories', op: 'patch',   extract: (p) => p?.data ?? p },
  { event: 'category:deleted',  domain: 'categories', op: 'remove',  extract: (p) => p?.id ?? p?._id ?? p },

  // ── Profile ─────────────────────────────────────────────────────────────────
  { event: 'corp:updated',      domain: 'profile',    op: 'setDoc',  extract: (p) => p?.data ?? p },
];

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseTenantDataResult<T> {
  data: T | null;
  loading: boolean;
  /** Manually trigger a full server refresh for this domain */
  refresh: () => void;
}

export function useTenantData<T = any>(domain: TenantDomain): UseTenantDataResult<T> {
  const { user } = useUserContext();
  const dbName = user?.dbName;

  const [data, setData] = useState<T | null>(() => tenantStore.get<T>(domain));
  const [loading, setLoading] = useState<boolean>(tenantStore.isLoading(domain));
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Subscribe to store changes for this domain
  useEffect(() => {
    const unsub = tenantStore.subscribe<T>(domain, (val) => {
      if (mountedRef.current) setData(val);
    });
    const unsubLoading = tenantStore.subscribeLoading(domain, (val) => {
      if (mountedRef.current) setLoading(val);
    });
    return () => { unsub(); unsubLoading(); };
  }, [domain]);

  // Subscribe to socket events once per dbName
  useEffect(() => {
    if (!dbName) return;

    joinTenantRoom(dbName);
    const socket = getSocket();

    const relevantBindings = SOCKET_BINDINGS.filter((b) => b.domain === domain);

    const handlers: Array<{ event: string; fn: (payload: any) => void }> = [];

    for (const binding of relevantBindings) {
      const fn = (payload: any) => {
        const extracted = binding.extract ? binding.extract(payload) : payload;

        switch (binding.op) {
          case 'patch':
            if (extracted && typeof extracted === 'object' && extracted._id) {
              tenantStore.patchRecord(domain, extracted);
            }
            break;
          case 'remove': {
            const id = typeof extracted === 'string'
              ? extracted
              : extracted?._id ?? extracted?.id ?? String(extracted);
            if (id) tenantStore.removeRecord(domain, id);
            break;
          }
          case 'setDoc':
            if (extracted) tenantStore.setDoc(domain, extracted);
            break;
          case 'refresh':
            tenantStore.refresh(domain);
            break;
        }
      };

      socket.on(binding.event, fn);
      handlers.push({ event: binding.event, fn });
    }

    return () => {
      for (const { event, fn } of handlers) {
        socket.off(event, fn);
      }
    };
  }, [domain, dbName]);

  const refresh = useCallback(() => {
    tenantStore.refresh(domain);
  }, [domain]);

  return { data, loading, refresh };
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

export const useLeads      = () => useTenantData<any[]>('leads');
export const useEmployees  = () => useTenantData<any[]>('employees');
export const useAttendanceCache = () => useTenantData<any[]>('attendance');
export const useParties    = () => useTenantData<any[]>('parties');
export const useProducts   = () => useTenantData<any[]>('products');
export const useProfile    = () => useTenantData<any>('profile');
export const useStaff      = () => useTenantData<any[]>('staff');
export const useCategories = () => useTenantData<any[]>('categories');
