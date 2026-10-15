import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TOKENS } from '../theme/tokens';
import { dashboardStyles } from '../theme/styles';
import { Language, t } from '../i18n';

interface EarningsSummaryProps {
  ledgerSummary: { salaryDues: number; paymentMade: number; advances: number };
  stats: { balance: number };
  onViewFullLedger: () => void;
  language: Language;
}

export const EarningsSummary: React.FC<EarningsSummaryProps> = ({
  ledgerSummary,
  stats,
  onViewFullLedger,
  language,
}) => {
  return (
    <View style={dashboardStyles.card}>
      {/* Earning summary */}
      <View style={styles.statBox}>
        <Text style={styles.statLabel}>{t('Total Earned', language)}</Text>
        <Text style={[styles.statValue, { color: TOKENS.colors.secondaryLight }]}>
          ₹{ledgerSummary.salaryDues.toLocaleString('en-IN')}
        </Text>
      </View>

      <View style={styles.miniStatsContainer}>
        <View style={styles.miniStat}>
          <Text style={styles.miniStatLabel}>{t('Recent Transactions', language)}</Text>
          <Text style={[styles.miniStatValue, { color: TOKENS.colors.info }]}>
            ₹{ledgerSummary.paymentMade.toLocaleString('en-IN')}
          </Text>
        </View>
        <View style={styles.miniStat}>
          <Text style={styles.miniStatLabel}>{t('Net Payable', language)}</Text>
          <Text
            style={[
              styles.miniStatValue,
              {
                fontWeight: TOKENS.typography.weight.extrabold,
                color: stats.balance >= 0 ? TOKENS.colors.secondaryLight : TOKENS.colors.danger,
              },
            ]}
          >
            {stats.balance > 0 ? '+' : stats.balance < 0 ? '-' : ''}₹
            {Math.abs(stats.balance).toLocaleString('en-IN')}
          </Text>
          <Text style={styles.miniStatSub}>
            {stats.balance < 0 ? 'Payable' : 'Receivable'}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={onViewFullLedger}
        style={styles.fullLedgerBtn}
        activeOpacity={0.8}
      >
        <Text style={styles.fullLedgerBtnText}>{t('Recent Transactions', language)}</Text>
        <Ionicons name="chevron-forward" size={16} color={TOKENS.colors.text.light} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  statBox: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.background.light,
    padding: TOKENS.spacing.lg,
    borderRadius: TOKENS.radius.lg,
  },
  statLabel: {
    fontSize: TOKENS.typography.size.xs,
    fontWeight: TOKENS.typography.weight.extrabold,
    color: TOKENS.colors.text.secondaryDark,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 32,
    fontWeight: TOKENS.typography.weight.extrabold,
    marginTop: TOKENS.spacing.xs,
  },
  miniStatsContainer: {
    flexDirection: 'row',
    gap: TOKENS.spacing.md,
    marginTop: TOKENS.spacing.lg,
  },
  miniStat: {
    flex: 1,
    backgroundColor: TOKENS.colors.background.light,
    padding: TOKENS.spacing.md,
    borderRadius: TOKENS.radius.lg,
    alignItems: 'center',
  },
  miniStatLabel: {
    fontSize: TOKENS.typography.size.xs,
    fontWeight: TOKENS.typography.weight.extrabold,
    color: TOKENS.colors.text.muted,
  },
  miniStatValue: {
    fontSize: TOKENS.typography.size.lg,
    fontWeight: TOKENS.typography.weight.bold,
    marginTop: TOKENS.spacing.xs,
  },
  miniStatSub: {
    fontSize: 9,
    color: TOKENS.colors.text.muted,
    marginTop: 2,
    fontWeight: TOKENS.typography.weight.semibold,
  },
  fullLedgerBtn: {
    flexDirection: 'row',
    backgroundColor: TOKENS.colors.primary,
    paddingVertical: TOKENS.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: TOKENS.radius.md,
    marginTop: TOKENS.spacing.xl,
    gap: TOKENS.spacing.xs,
  },
  fullLedgerBtnText: {
    color: TOKENS.colors.text.light,
    fontWeight: TOKENS.typography.weight.bold,
    fontSize: TOKENS.typography.size.sm,
  },
});
