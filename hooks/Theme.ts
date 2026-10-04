// theme.ts

// 🎨 Centralized Color Tokens (Single Source of Truth)
export const C = {
    primary: "#1e3a8a",
    primaryDark: "#172554",
    primarySoft: "#eff6ff",

    secondary: "#64748B",
    accent: "#6366F1",

    success: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
    info: "#0EA5E9",

    bgLight: "#F8FAFC",
    bgDark: "#0F172A",

    cardLight: "#FFFFFF",
    cardDark: "#1E293B",

    border: "#E2E8F0",
    borderDark: "#334155",
    divider: "#f1f5f9",

    textDark: "#0F172A",
    textLight: "#F8FAFC",
    textMuted: "#94A3B8",
    textSub: "#475569",

    white: "#FFFFFF",
    tilebg: "#F1F5F9",

    inputDark: "#020617",
    inputLight: "#ffffff",
} as const;

// 🌗 Theme Hook (Dynamic usage)
export const useTheme = (isDark: boolean) => ({
    bg: isDark ? C.bgDark : C.bgLight,
    card: isDark ? C.cardDark : C.cardLight,
    border: isDark ? C.borderDark : C.border,
    txt: isDark ? C.textLight : C.textDark,
    txtSec: isDark ? C.textMuted : C.secondary,
    inputBg: isDark ? C.inputDark : C.inputLight,
    primary: C.primary,
    success: C.success,
    danger: C.danger,
    accent: C.primary,
    isDark,
});

export type Theme = ReturnType<typeof useTheme>;