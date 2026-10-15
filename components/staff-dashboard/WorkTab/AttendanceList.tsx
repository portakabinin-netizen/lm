import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TOKENS } from '../theme/tokens';
import { appService } from '@/UtilServices/appHelper';
import { Language, t } from '../i18n';

interface AttendanceLog {
  _id: string;
  date: string;
  dutyStart: string;
  dutyEnd?: string;
  hoursWorked?: number;
  site_name?: string;
  markedByDevice?: boolean;
  markedByUserName?: string;
}

interface AttendanceListProps {
  attendance: AttendanceLog[];
  dbActiveDutyId?: string;
  formatHoursWorked: (hours: number) => string;
  language: Language;
}

const EmptyState = ({ text }: { text: string }) => (
  <View style={styles.emptyState}>
    <Ionicons name="search-outline" size={36} color="#cbd5e1" />
    <Text style={styles.emptyStateText}>{text}</Text>
  </View>
);

export const AttendanceList: React.FC<AttendanceListProps> = ({
  attendance,
  dbActiveDutyId,
  formatHoursWorked,
  language,
}) => {
  const data = attendance.filter((att) => att._id !== dbActiveDutyId);

  const renderItem = ({ item }: { item: AttendanceLog }) => (
    <View style={styles.recordItem}>
      <View style={styles.recordIndicator} />
      <View style={{ flex: 1 }}>
        <Text style={styles.siteName} numberOfLines={1}>
          {item.site_name || '—'}
        </Text>
        <Text style={styles.dateText}>{appService.formatDate(item.date)}</Text>
        {item.markedByDevice === false && (
          <Text style={styles.supervisorMarked}>
            👤 {t('Marked by:', language)} {item.markedByUserName ?? t('Supervisor', language)}
          </Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.hoursText}>{formatHoursWorked(item.hoursWorked ?? 0)} Hrs</Text>
        <Text style={styles.statusText}>{t('DONE', language)}</Text>
      </View>
    </View>
  );

  if (data.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>{t('Sites Worked', language)}</Text>
        <EmptyState text={t('No attendance records found', language)} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('Sites Worked', language)}</Text>
      <View style={{ minHeight: 100 }}>
        {data.map((item, index) => (
          <React.Fragment key={item._id ?? index.toString()}>
            {renderItem({ item })}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: TOKENS.spacing.lg,
  },
  sectionTitle: {
    fontSize: TOKENS.typography.size.md,
    fontWeight: TOKENS.typography.weight.extrabold,
    color: TOKENS.colors.text.dark,
    marginBottom: TOKENS.spacing.sm,
  },
  emptyState: {
    padding: TOKENS.spacing.xxl,
    alignItems: 'center',
  },
  emptyStateText: {
    color: TOKENS.colors.text.muted,
    fontSize: TOKENS.typography.size.sm,
    marginTop: TOKENS.spacing.sm,
  },
  recordItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: TOKENS.spacing.md,
    paddingHorizontal: TOKENS.spacing.sm,
    backgroundColor: TOKENS.colors.background.white,
    borderRadius: TOKENS.radius.md,
    marginBottom: TOKENS.spacing.xs,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  recordIndicator: {
    width: 4,
    height: '100%',
    backgroundColor: TOKENS.colors.secondary,
    borderRadius: 2,
    marginRight: TOKENS.spacing.md,
  },
  siteName: {
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.dark,
    fontSize: TOKENS.typography.size.sm,
  },
  dateText: {
    fontSize: TOKENS.typography.size.xs,
    color: TOKENS.colors.text.secondaryDark,
    marginTop: 2,
  },
  supervisorMarked: {
    fontSize: TOKENS.typography.size.xs,
    color: TOKENS.colors.warning,
    fontWeight: TOKENS.typography.weight.bold,
    marginTop: 4,
  },
  hoursText: {
    fontSize: TOKENS.typography.size.sm,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.info,
  },
  statusText: {
    fontSize: 9,
    color: TOKENS.colors.text.muted,
    marginTop: 2,
    fontWeight: TOKENS.typography.weight.bold,
  },
});
