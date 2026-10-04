import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TOKENS } from './theme/tokens';
import { dashboardStyles } from './theme/styles';
import { Language, t } from './i18n';

interface ActionTile {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  onPress: () => void;
  badge?: number;
}

interface QuickActionTilesProps {
  onLeaveAdvancePress: () => void;
  language: Language;
}

export const QuickActionTiles: React.FC<QuickActionTilesProps> = ({
  onLeaveAdvancePress,
  language,
}) => {
  const actions: ActionTile[] = [
    {
      icon: 'calendar',
      label: t('Request Leave', language),
      color: TOKENS.colors.warning,
      onPress: onLeaveAdvancePress,
    },
    {
      icon: 'cash',
      label: t('Apply Advance', language),
      color: TOKENS.colors.info,
      onPress: onLeaveAdvancePress,
    },
  ];

  return (
    <View style={styles.container}>
      {actions.map((action, index) => (
        <TouchableOpacity
          key={index}
          style={styles.tile}
          onPress={action.onPress}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: action.color + '20' }]}>
            <Ionicons name={action.icon} size={24} color={action.color} />
            {!!action.badge && action.badge > 0 && (
              <View style={dashboardStyles.badge}>
                <Text style={dashboardStyles.badgeText}>{action.badge}</Text>
              </View>
            )}
          </View>
          <Text style={styles.label}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: TOKENS.spacing.md,
    paddingVertical: TOKENS.spacing.md,
    backgroundColor: TOKENS.colors.background.main,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border.light,
    gap: TOKENS.spacing.md,
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: TOKENS.spacing.xs,
  },
  label: {
    color: TOKENS.colors.text.light,
    fontSize: TOKENS.typography.size.xs,
    fontWeight: TOKENS.typography.weight.semibold,
    textAlign: 'center',
  },
});
