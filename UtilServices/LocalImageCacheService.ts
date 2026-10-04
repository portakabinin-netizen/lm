/**
 * LocalImageCacheService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Downloads remote profile images and worker avatars into local device storage (file://)
 * using expo-file-system so that Map Markers, Callouts, and lists load immediately
 * with zero network latency, full offline availability, and no Android blank-bitmap issues.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';

// In-memory cache for instant synchronous lookups
const memoryCache = new Map<string, string>();
let isDirInitialized = false;

function getCacheDirectory(): string {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
  return `${base.replace(/\/+$/, '')}/worker_avatars/`;
}

function sanitizeUrlToFilename(url: string): string {
  let ext = '.jpg';
  try {
    const cleanUrl = url.split('?')[0];
    const match = cleanUrl.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i);
    if (match) {
      ext = `.${match[1].toLowerCase()}`;
    }
  } catch {
    ext = '.jpg';
  }

  // Simple, fast hash for unique local filename
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  const safeHash = Math.abs(hash).toString(36);
  const cleanSnippet = url.replace(/[^a-zA-Z0-9]/g, '').slice(-20);

  return `avatar_${safeHash}_${cleanSnippet}${ext}`;
}

export const LocalImageCacheService = {
  /**
   * Ensure local storage directory for worker avatars exists.
   */
  async ensureDirectory(): Promise<string> {
    const dir = getCacheDirectory();
    if (!isDirInitialized && dir) {
      try {
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) {
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        }
        isDirInitialized = true;
      } catch (err) {
        console.warn('[LocalImageCacheService] Failed to create cache directory:', err);
      }
    }
    return dir;
  },

  /**
   * Synchronously get cached local file URI if already available in memory.
   */
  getSyncLocalUri(url: string | null | undefined): string | null {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('file://') || trimmed.startsWith('data:')) return trimmed;
    return memoryCache.get(trimmed) || null;
  },

  /**
   * Get or download an image to local device storage. Returns local file:// URI.
   */
  async getLocalImageUri(url: string | null | undefined): Promise<string | null> {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('file://') || trimmed.startsWith('data:')) {
      return trimmed;
    }

    if (memoryCache.has(trimmed)) {
      return memoryCache.get(trimmed)!;
    }

    try {
      const cacheDir = await this.ensureDirectory();
      if (!cacheDir) return null;

      const filename = sanitizeUrlToFilename(trimmed);
      const localFilePath = `${cacheDir}${filename}`;

      // Check if already downloaded on disk (and has non-zero size)
      const info = await FileSystem.getInfoAsync(localFilePath);
      if (info.exists && (info as any).size > 0) {
        memoryCache.set(trimmed, localFilePath);
        return localFilePath;
      }

      // Delete zero-byte corrupt files before re-downloading
      if (info.exists && (info as any).size === 0) {
        try { await FileSystem.deleteAsync(localFilePath, { idempotent: true }); } catch { /* ignore */ }
      }

      // Download from remote server into device storage
      const result = await FileSystem.downloadAsync(trimmed, localFilePath);
      if (result && result.status === 200 && result.uri) {
        // Verify the downloaded file is non-empty
        const downloaded = await FileSystem.getInfoAsync(result.uri);
        if (downloaded.exists && (downloaded as any).size > 0) {
          memoryCache.set(trimmed, result.uri);
          return result.uri;
        }
        // Empty file downloaded — delete and return null (will retry next render)
        try { await FileSystem.deleteAsync(result.uri, { idempotent: true }); } catch { /* ignore */ }
      }

      // Return null rather than the remote URL — AvatarMarker will show
      // the letter fallback until the file is fully cached on disk.
      return null;
    } catch (err) {
      // Silently fail — AvatarMarker will show the letter avatar fallback
      return null;
    }
  },

  /**
   * Batch download & cache all images for an array of workers/employees.
   */
  async preloadWorkerImages(urls: (string | null | undefined)[]): Promise<void> {
    const validUrls = Array.from(
      new Set(
        urls
          .map((u) => (u && typeof u === 'string' ? u.trim() : ''))
          .filter((u) => u && !u.startsWith('file://') && !u.startsWith('data:'))
      )
    );

    if (validUrls.length === 0) return;

    await this.ensureDirectory();

    await Promise.allSettled(
      validUrls.map((url) => this.getLocalImageUri(url))
    );
  },

  /**
   * Clear the avatar cache folder when needed.
   */
  async clearCache(): Promise<void> {
    try {
      const dir = getCacheDirectory();
      const info = await FileSystem.getInfoAsync(dir);
      if (info.exists) {
        await FileSystem.deleteAsync(dir, { idempotent: true });
        isDirInitialized = false;
        memoryCache.clear();
      }
    } catch (err) {
      console.warn('[LocalImageCacheService] Failed to clear cache:', err);
    }
  },
};

/**
 * Hook to resolve and retrieve a local file:// image URI for components/markers.
 */
export function useLocalAvatar(remoteUrl: string | null | undefined): string | null {
  const [localUri, setLocalUri] = useState<string | null>(() => {
    return LocalImageCacheService.getSyncLocalUri(remoteUrl);
  });

  useEffect(() => {
    if (!remoteUrl) {
      setLocalUri(null);
      return;
    }

    let isMounted = true;
    const sync = LocalImageCacheService.getSyncLocalUri(remoteUrl);
    if (sync) {
      setLocalUri(sync);
      return;
    }

    LocalImageCacheService.getLocalImageUri(remoteUrl).then((uri) => {
      if (isMounted && uri) {
        setLocalUri(uri);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [remoteUrl]);

  return localUri;
}
