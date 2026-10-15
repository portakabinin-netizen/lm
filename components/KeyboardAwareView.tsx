/**
 * KeyboardAwareView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A drop-in wrapper that ensures TextInput fields are never hidden under the
 * keyboard on both iOS and Android.
 *
 * Usage:
 *   <KeyboardAwareView>
 *     <YourFormContent />
 *   </KeyboardAwareView>
 *
 * For Modal content:
 *   <KeyboardAwareModal>
 *     <YourModalContent />
 *   </KeyboardAwareModal>
 */

import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';

interface KeyboardAwareViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Additional vertical offset (e.g. for headers). Default: 0 */
  offset?: number;
  /** Disable the ScrollView wrapper — use when the child already has a ScrollView */
  noScroll?: boolean;
}

/**
 * Full-screen keyboard-aware view (for page-level screens).
 * Wraps content in a ScrollView so any input can be reached.
 */
export const KeyboardAwareView: React.FC<KeyboardAwareViewProps> = ({
  children,
  style,
  contentContainerStyle,
  offset = 0,
  noScroll = false,
}) => (
  <KeyboardAvoidingView
    style={[styles.flex1, style]}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    keyboardVerticalOffset={Platform.OS === 'ios' ? offset : 0}
  >
    {noScroll ? (
      children
    ) : (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      >
        {children}
      </ScrollView>
    )}
  </KeyboardAvoidingView>
);

/**
 * Modal-level keyboard-aware view.
 * Use this inside Modal containers where the keyboard must push content up.
 */
export const KeyboardAwareModal: React.FC<KeyboardAwareViewProps> = ({
  children,
  style,
  contentContainerStyle,
  offset = 0,
  noScroll = false,
}) => (
  <KeyboardAvoidingView
    style={[styles.flex1, style]}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    keyboardVerticalOffset={Platform.OS === 'ios' ? offset + 60 : 20}
  >
    {noScroll ? (
      children
    ) : (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      >
        {children}
      </ScrollView>
    )}
  </KeyboardAvoidingView>
);

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 40 },
});
