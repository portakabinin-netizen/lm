/**
 * 🛡️ AwakeChallengeModal.tsx
 *
 * Full-screen, non-dismissable modal that appears when a guard alertness
 * challenge is received.
 *
 * Features:
 *  - Cannot be dismissed by back button or swipe
 *  - 60-second countdown timer
 *  - Correct code → alarm stops + modal closes
 *  - Wrong code → error shown, alarm continues
 *  - Timeout → failure reported to server, supervisor notified
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Keyboard,
  Modal,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { awakeMonitoringService, MonitoringChallenge } from "../services/AwakeMonitoringService";

// ─── Constants ────────────────────────────────────────────────────────────────
const CHALLENGE_DURATION = 60; // seconds

// ─── Props ────────────────────────────────────────────────────────────────────
interface AwakeChallengeModalProps {
  visible: boolean;
  challenge: MonitoringChallenge | null;
  onDismiss: () => void; // called after pass or timeout
}

// ─── Component ────────────────────────────────────────────────────────────────
export const AwakeChallengeModal: React.FC<AwakeChallengeModalProps> = ({
  visible,
  challenge,
  onDismiss,
}) => {
  const [enteredCode, setEnteredCode]   = useState("");
  const [timeLeft, setTimeLeft]         = useState(CHALLENGE_DURATION);
  const [errorMsg, setErrorMsg]         = useState("");
  const [submitted, setSubmitted]       = useState(false);
  const [resultMsg, setResultMsg]       = useState("");
  const [isSuccess, setIsSuccess]       = useState<boolean | null>(null);
  const [loading, setLoading]           = useState(false);

  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const shakeAnim  = useRef(new Animated.Value(0)).current;

  // ── Pulsing red ring animation ──────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [visible, pulseAnim]);

  // ── Shake animation for wrong code ─────────────────────────────────────────
  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  // ── Countdown timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !challenge) return;

    // Reset state
    setEnteredCode("");
    setErrorMsg("");
    setSubmitted(false);
    setResultMsg("");
    setIsSuccess(null);
    setLoading(false);

    // Compute remaining from expiresAt (use server timestamp for accuracy)
    const expiresAt = new Date(challenge.expiresAt).getTime();
    const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    setTimeLeft(remaining);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          // Timeout → report failure
          awakeMonitoringService.reportFailure("No response within 60 seconds").then(onDismiss);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, challenge?.challengeId]);

  // ── Block Android back button ───────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true); // blocks
    return () => sub.remove();
  }, [visible]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const code = enteredCode.trim();
    if (code.length === 0) {
      setErrorMsg("Please enter the code");
      triggerShake();
      return;
    }
    Keyboard.dismiss();
    setLoading(true);
    setErrorMsg("");

    const result = await awakeMonitoringService.submitChallenge(code);
    setLoading(false);

    if (result.success) {
      setIsSuccess(true);
      setResultMsg("✅ Alertness Confirmed!");
      setSubmitted(true);
      setTimeout(onDismiss, 1200);
    } else if (result.failed) {
      setIsSuccess(false);
      setResultMsg("❌ Failed — Supervisor Notified");
      setSubmitted(true);
      clearInterval(timerRef.current!);
      setTimeout(onDismiss, 2000);
    } else {
      setErrorMsg(result.message ?? "Wrong code. Try again.");
      setEnteredCode("");
      triggerShake();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!visible || !challenge) return null;

  const timerColor =
    timeLeft > 30 ? "#10b981" : timeLeft > 10 ? "#f59e0b" : "#ef4444";
  const timerPct = timeLeft / CHALLENGE_DURATION;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={() => {}} // blocked — cannot dismiss
    >
      <StatusBar backgroundColor="#0f172a" barStyle="light-content" />
      <View style={s.overlay}>
        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={s.header}>
          <Ionicons name="shield-checkmark" size={32} color="#f97316" />
          <Text style={s.headerTitle}>ALERTNESS CHECK</Text>
          <Text style={s.headerSub}>Security Guard Verification</Text>
        </View>

        {/* ── Pulsing ring + code display ──────────────────────────── */}
        <Animated.View style={[s.codeRing, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={s.codeLabel}>ENTER CODE</Text>
          <Text style={s.challengeCode}>{challenge.code}</Text>
        </Animated.View>

        {/* ── Input + submit ──────────────────────────────────────── */}
        {!submitted && (
          <Animated.View style={{ transform: [{ translateX: shakeAnim }], width: "80%" }}>
            <TextInput
              style={s.input}
              value={enteredCode}
              onChangeText={(t) => {
                setEnteredCode(t.replace(/\D/g, "").slice(0, 4));
                setErrorMsg("");
              }}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="_ _ _ _"
              placeholderTextColor="#475569"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              editable={!loading}
            />
            {errorMsg ? <Text style={s.errorText}>{errorMsg}</Text> : null}

            <TouchableOpacity
              style={[s.submitBtn, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.submitBtnText}>CONFIRM ALERTNESS</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Result message ───────────────────────────────────────── */}
        {submitted && (
          <View style={{ alignItems: "center", marginTop: 12 }}>
            <Text
              style={[
                s.resultMsg,
                { color: isSuccess ? "#10b981" : "#ef4444" },
              ]}
            >
              {resultMsg}
            </Text>
          </View>
        )}

        {/* ── Timer ──────────────────────────────────────────────── */}
        <View style={s.timerContainer}>
          {/* Progress bar */}
          <View style={s.timerTrack}>
            <View
              style={[
                s.timerFill,
                { width: `${timerPct * 100}%` as any, backgroundColor: timerColor },
              ]}
            />
          </View>
          <Text style={[s.timerText, { color: timerColor }]}>
            ⏱ Time Remaining: {timeLeft}s
          </Text>
        </View>

        {/* ── Warning strip ───────────────────────────────────────── */}
        <View style={s.warnStrip}>
          <Ionicons name="warning" size={14} color="#f97316" />
          <Text style={s.warnText}>
            Failure to respond will alert your supervisor
          </Text>
        </View>
      </View>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  overlay: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 24,
  },
  header: {
    alignItems: "center" as const,
    marginBottom: 36,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900" as const,
    letterSpacing: 2,
    marginTop: 10,
  },
  headerSub: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 4,
    letterSpacing: 0.5,
  },

  codeRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 4,
    borderColor: "#f97316",
    backgroundColor: "#1e293b",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 40,
    shadowColor: "#f97316",
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 20,
  },
  codeLabel: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "800" as const,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  challengeCode: {
    color: "#f97316",
    fontSize: 44,
    fontWeight: "900" as const,
    letterSpacing: 8,
  },

  input: {
    backgroundColor: "#1e293b",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 14,
    padding: 18,
    color: "#fff",
    fontSize: 28,
    fontWeight: "800" as const,
    textAlign: "center" as const,
    letterSpacing: 12,
    marginBottom: 8,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "600" as const,
    textAlign: "center" as const,
    marginBottom: 10,
  },
  submitBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center" as const,
    marginTop: 8,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900" as const,
    letterSpacing: 1,
  },

  resultMsg: {
    fontSize: 20,
    fontWeight: "900" as const,
    textAlign: "center" as const,
  },

  timerContainer: {
    width: "80%" as any,
    marginTop: 36,
    alignItems: "center" as const,
  },
  timerTrack: {
    width: "100%" as any,
    height: 6,
    backgroundColor: "#1e293b",
    borderRadius: 3,
    overflow: "hidden" as const,
    marginBottom: 8,
  },
  timerFill: {
    height: "100%" as any,
    borderRadius: 3,
  },
  timerText: {
    fontSize: 13,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
  },

  warnStrip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 28,
    backgroundColor: "#1e293b",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f97316" + "55",
  },
  warnText: {
    color: "#f97316",
    fontSize: 11,
    fontWeight: "600" as const,
    flex: 1,
  },
} as const;

export default AwakeChallengeModal;
