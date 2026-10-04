import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TOKENS } from '../theme/tokens';
import { appService } from '@/UtilServices/appHelper';
import { Language, t } from '../i18n';

interface LedgerEntry {
  _id: string;
  voucherDate: string;
  voucherNarration: string;
  amt: number;
  paymentType: 'Cr' | 'Dr';
}

interface EarningsLedgerListProps {
  ledgerEntries: LedgerEntry[];
  language: Language;
}

export const EarningsLedgerList: React.FC<EarningsLedgerListProps> = ({
  ledgerEntries,
  language,
}) => {
  const renderItem = (item: LedgerEntry) => {
    const narr = (item.voucherNarration || '').toLowerCase();
    
    // Categorize
    let category = 'Salary Paid';
    let iconName: any = 'cash-outline';
    let iconColor = TOKENS.colors.secondaryLight;
    
    if (narr.includes('advance')) {
      category = 'Advance Received';
      iconName = 'wallet-outline';
      iconColor = TOKENS.colors.warning;
    } else if (narr.includes('penalty')) {
      category = 'Penalty';
      iconName = 'warning-outline';
      iconColor = TOKENS.colors.danger;
    } else if (narr.includes('uniform') || narr.includes('equipment') || narr.includes('article')) {
      category = 'Article Issued (Monetary)';
      iconName = 'shirt-outline';
      iconColor = TOKENS.colors.secondary;
    } else if (item.paymentType === 'Cr') {
      category = 'Salary Dues';
      iconName = 'trending-up-outline';
      iconColor = TOKENS.colors.primary;
    }

    const isNegative = item.paymentType === 'Dr';

    return (
      <View key={item._id || Math.random().toString()} style={styles.entryCard}>
        <View style={[styles.iconBox, { backgroundColor: iconColor + '20' }]}>
          <Ionicons name={iconName} size={20} color={iconColor} />
        </View>
        <View style={styles.detailsBox}>
          <Text style={styles.categoryText}>{t(category, language)}</Text>
          <Text style={styles.dateText}>{appService.formatDate(item.voucherDate)}</Text>
          {item.voucherNarration ? (
            <Text style={styles.narrationText} numberOfLines={2}>{item.voucherNarration}</Text>
          ) : null}
        </View>
        <View style={styles.amountBox}>
          <Text style={[styles.amountText, { color: isNegative ? TOKENS.colors.danger : TOKENS.colors.secondaryLight }]}>
            {isNegative ? '-' : '+'}₹{item.amt?.toLocaleString('en-IN') ?? 0}
          </Text>
        </View>
      </View>
    );
  };

  if (!ledgerEntries || ledgerEntries.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="receipt-outline" size={36} color={TOKENS.colors.border.dark} />
        <Text style={styles.emptyText}>{t('No records found.', language)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('Transaction History', language)}</Text>
      {ledgerEntries.map(renderItem)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: TOKENS.spacing.md,
  },
  title: {
    fontSize: TOKENS.typography.size.md,
    fontWeight: TOKENS.typography.weight.extrabold,
    color: TOKENS.colors.text.dark,
    marginBottom: TOKENS.spacing.md,
  },
  emptyState: {
    padding: TOKENS.spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: TOKENS.spacing.xl,
  },
  emptyText: {
    color: TOKENS.colors.text.muted,
    marginTop: TOKENS.spacing.md,
    fontSize: TOKENS.typography.size.sm,
  },
  entryCard: {
    flexDirection: 'row',
    backgroundColor: TOKENS.colors.background.light,
    padding: TOKENS.spacing.md,
    borderRadius: TOKENS.radius.md,
    marginBottom: TOKENS.spacing.sm,
    alignItems: 'center',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: TOKENS.spacing.md,
  },
  detailsBox: {
    flex: 1,
  },
  categoryText: {
    fontSize: TOKENS.typography.size.sm,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.dark,
  },
  dateText: {
    fontSize: TOKENS.typography.size.xs,
    color: TOKENS.colors.text.muted,
    marginTop: 2,
  },
  narrationText: {
    fontSize: TOKENS.typography.size.xs,
    color: TOKENS.colors.text.secondaryDark,
    marginTop: 4,
    fontStyle: 'italic',
  },
  amountBox: {
    marginLeft: TOKENS.spacing.sm,
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: TOKENS.typography.size.sm,
    fontWeight: TOKENS.typography.weight.bold,
  },
});
