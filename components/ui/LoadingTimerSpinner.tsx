import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, useColorScheme } from 'react-native';
import { appService } from '@/UtilServices/appHelper';

// ============================================================================
// 1. Types & Interfaces
// ============================================================================

export interface LoadingTimerSpinnerProps {
  /** Optional status label displayed below the spinner */
  label?: string;
  /** ActivityIndicator size (default 'large') */
  size?: 'small' | 'large' | number;
  /** Spinner color (default '#16a34a') */
  color?: string;
  /** Whether to render as a full flex container taking available space */
  fullScreen?: boolean;
  /** Custom outer container style */
  style?: any;
  /** Estimated completion time in seconds (e.g., 1.8 for ~1.8s) */
  estimatedSeconds?: number;
  /** Estimated completion time in milliseconds (alternative to estimatedSeconds) */
  estimatedMs?: number;
  /** Whether to show the estimated time comparison badge (default: true if estimate provided) */
  showEstimatedBadge?: boolean;
}

export interface TelemetryConfig {
  /** Descriptive name of the operation for logging and user messages */
  taskName: string;
  /** Calculated or expected duration in seconds (default: 1.5s) */
  estimatedSeconds?: number;
  /** Whether to display a toast notification upon successful completion (default: false) */
  showToastOnSuccess?: boolean;
  /** Whether to display a toast notification on error (default: true) */
  showToastOnError?: boolean;
  /** Custom success message builder */
  successMessage?: (actualSec: string, estSec: string) => string;
  /** Callback fired before the action starts */
  onStart?: (estSec: number) => void;
  /** Callback fired upon success */
  onSuccess?: (data: any, actualSec: number) => void;
  /** Callback fired upon error */
  onError?: (err: any, actualSec: number) => void;
}

export interface TelemetryResult<T> {
  data: T | null;
  error: any;
  actualSeconds: number;
  estimatedSeconds: number;
  success: boolean;
}

// ============================================================================
// 2. Estimation Utility
// ============================================================================

/**
 * Calculates estimated completion time in seconds based on payload size and network factors.
 */
export function calculateEstimatedTime(options?: {
  itemCount?: number;
  parallelRequests?: number;
  baseLatencySec?: number;
}): number {
  const base = options?.baseLatencySec ?? 1.2;
  const items = options?.itemCount ?? 0;
  const batches = Math.ceil(items / 8);
  const est = base + (batches * 0.22);
  return Number(Math.max(0.8, est).toFixed(1));
}

// ============================================================================
// 3. Telemetry & Wrapped Error Handling Execution Runner
// ============================================================================

/**
 * Wraps an async action with automatic duration measurement, formatted console
 * telemetry, and user-facing toast notifications (estimate vs. actual).
 *
 * @example
 * const res = await runWithTelemetry(async () => {
 *   return await appService.httpClient.get('/api/data');
 * }, { taskName: 'Sync Attendance', estimatedSeconds: 1.8 });
 */
export async function runWithTelemetry<T>(
  action: () => Promise<T>,
  config: TelemetryConfig
): Promise<TelemetryResult<T>> {
  const {
    taskName,
    estimatedSeconds = 1.5,
    showToastOnSuccess = false,
    showToastOnError = true,
    successMessage,
    onStart,
    onSuccess,
    onError,
  } = config;

  const startTime = Date.now();
  onStart?.(estimatedSeconds);

  console.info(
    `⏳ [Telemetry: ${taskName}] Started. Estimated time: ~${estimatedSeconds.toFixed(1)}s`
  );

  try {
    const data = await action();
    const actualMs = Date.now() - startTime;
    const actualSeconds = Number((actualMs / 1000).toFixed(1));

    console.info(
      `✅ [Telemetry: ${taskName}] Completed in ${actualSeconds}s (Estimated: ~${estimatedSeconds.toFixed(1)}s)`
    );

    if (showToastOnSuccess) {
      const msg = successMessage
        ? successMessage(actualSeconds.toFixed(1), estimatedSeconds.toFixed(1))
        : `${taskName} completed in ${actualSeconds}s (Est: ~${estimatedSeconds.toFixed(1)}s)`;
      appService.showToast(msg, 'Success');
    }

    onSuccess?.(data, actualSeconds);

    return {
      data,
      error: null,
      actualSeconds,
      estimatedSeconds,
      success: true,
    };
  } catch (err: any) {
    const actualMs = Date.now() - startTime;
    const actualSeconds = Number((actualMs / 1000).toFixed(1));
    const errorMsg =
      err?.response?.data?.message || err?.message || 'An unexpected network error occurred';

    console.error(
      `🔴 [Telemetry: ${taskName}] Failed after ${actualSeconds}s (Estimated: ~${estimatedSeconds.toFixed(1)}s):`,
      err
    );

    if (showToastOnError) {
      appService.showToast(
        `${taskName} failed (${actualSeconds}s): ${errorMsg}`,
        'Error'
      );
    }

    onError?.(err, actualSeconds);

    return {
      data: null,
      error: err,
      actualSeconds,
      estimatedSeconds,
      success: false,
    };
  }
}

// ============================================================================
// 4. React Hook for Telemetry State Management
// ============================================================================

/**
 * Hook providing turnkey loading state, estimated vs actual duration, and safe runner.
 */
export function useAsyncTelemetry(defaultTaskName = 'Data Operation') {
  const [loading, setLoading] = useState(false);
  const [estimatedSec, setEstimatedSec] = useState(1.5);
  const [lastDurationSec, setLastDurationSec] = useState<number | null>(null);

  const execute = useCallback(
    async <T,>(action: () => Promise<T>, customConfig?: Partial<TelemetryConfig>) => {
      setLoading(true);
      const est = customConfig?.estimatedSeconds ?? estimatedSec;

      const result = await runWithTelemetry(action, {
        taskName: customConfig?.taskName || defaultTaskName,
        estimatedSeconds: est,
        ...customConfig,
      });

      setLastDurationSec(result.actualSeconds);
      setLoading(false);
      return result;
    },
    [defaultTaskName, estimatedSec]
  );

  return {
    loading,
    setLoading,
    estimatedSec,
    setEstimatedSec,
    lastDurationSec,
    execute,
  };
}

// ============================================================================
// 5. Visual Loading Timer Spinner UI Component
// ============================================================================

export const LoadingTimerSpinner: React.FC<LoadingTimerSpinnerProps> = ({
  label = 'Loading data...',
  size = 'large',
  color = '#16a34a',
  fullScreen = false,
  style,
  estimatedSeconds,
  estimatedMs,
  showEstimatedBadge = true,
}) => {
  const isDark = useColorScheme() === 'dark';
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef(Date.now());

  const targetEstSec = estimatedSeconds ?? (estimatedMs ? estimatedMs / 1000 : undefined);

  useEffect(() => {
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const elapsedSecNumber = elapsedMs / 1000;
  const elapsedSecondsStr = elapsedSecNumber.toFixed(1);
  const outerDiameter = typeof size === 'number' ? size : size === 'large' ? 76 : 50;
  const indicatorSize = typeof size === 'number' ? 'large' : size;

  // Visual dynamic latency feedback
  const isOverdue = Boolean(targetEstSec !== undefined && elapsedSecNumber > targetEstSec);

  return (
    <View style={[styles.container, fullScreen && styles.fullScreen, style]}>
      {/* Centered Circular Spinner with Timer inside */}
      <View
        style={[
          styles.spinnerWrapper,
          { width: outerDiameter, height: outerDiameter, borderRadius: outerDiameter / 2 },
        ]}
      >
        <ActivityIndicator
          size={indicatorSize}
          color={isOverdue ? '#f59e0b' : color}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.timerBadge}>
          <Text
            style={[
              styles.timerText,
              { color: isDark ? '#f8fafc' : '#0f172a' },
              isOverdue && { color: '#f59e0b' },
            ]}
          >
            {elapsedSecondsStr}s
          </Text>
        </View>
      </View>

      {/* Main Status Label */}
      {!!label && (
        <Text style={[styles.labelText, { color: isDark ? '#f1f5f9' : '#1e293b' }]}>
          {label}
        </Text>
      )}

      {/* Estimated vs Actual Time Telemetry Badge */}
      {showEstimatedBadge && targetEstSec !== undefined && (
        <View
          style={[
            styles.telemetryBadge,
            {
              backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
              borderColor: isOverdue ? '#f59e0b50' : (isDark ? '#334155' : '#e2e8f0'),
            },
          ]}
        >
          <Text style={[styles.telemetryText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
            Est: <Text style={{ fontWeight: '700' }}>~{targetEstSec.toFixed(1)}s</Text>
            {'  •  '}
            Actual: <Text style={{ fontWeight: '700', color: isOverdue ? '#f59e0b' : (isDark ? '#cbd5e1' : '#334155') }}>{elapsedSecondsStr}s</Text>
          </Text>
        </View>
      )}

      {/* Dynamic latency hint if running long */}
      {elapsedMs > 4500 && (
        <Text style={styles.latencyHint}>
          {elapsedMs > 8500
            ? 'Server cold-start or heavy dataset in progress…'
            : 'Optimizing data stream…'}
        </Text>
      )}
    </View>
  );
};

// ============================================================================
// 6. Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  fullScreen: {
    flex: 1,
    minHeight: 200,
  },
  spinnerWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  timerBadge: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 8,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  labelText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  telemetryBadge: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  telemetryText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  latencyHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});

export default LoadingTimerSpinner;
