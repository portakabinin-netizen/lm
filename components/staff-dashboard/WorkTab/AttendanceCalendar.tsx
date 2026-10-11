import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TOKENS } from '../theme/tokens';
import { appService } from '@/UtilServices/appHelper';
import { Language, t } from '../i18n';

export interface AttendanceLog {
  _id: string;
  date: string;
  dutyStart: string;
  dutyEnd?: string;
  hoursWorked?: number;
  site_name?: string;
  markedByDevice?: boolean;
  markedByUserName?: string;
}

interface AttendanceCalendarProps {
  attendance: AttendanceLog[];
  dbActiveDutyId?: string;
  language: Language;
  monthDate: Date; // e.g., current date or previous month date
}

export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({
  attendance,
  dbActiveDutyId,
  language,
  monthDate,
}) => {
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay();

  // Generate an array of day numbers from 1 to daysInMonth
  const calendarDays = useMemo(() => {
    const daysArray = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      daysArray.push({ dayNum: i, dateStr });
    }
    return daysArray;
  }, [monthDate, daysInMonth]);

  // Map attendance records to dates
  const attendanceMap = useMemo(() => {
    const map: { [date: string]: AttendanceLog[] } = {};
    attendance.forEach(log => {
      if (!log.date) return;
      const d = log.date.split('T')[0];
      if (!map[d]) map[d] = [];
      map[d].push(log);
    });
    return map;
  }, [attendance]);

  return (
    <View style={styles.container}>
      <View style={styles.calendarContainer}>
        {/* Days grid */}
        <View style={styles.daysGrid}>
          {calendarDays.map(({ dayNum, dateStr }) => {
            const dayRecords = attendanceMap[dateStr] || [];
            const hasRecords = dayRecords.length > 0;
            const isDoubleDuty = dayRecords.length > 1;

            return (
              <View 
                key={dateStr} 
                style={[
                  styles.dayCell, 
                  hasRecords ? styles.dayCellPresent : styles.dayCellAbsent
                ]}
              >
                <Text style={styles.dayNumber}>
                  {dayNum}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1, gap: 1 }}>
                  <Text style={[
                    styles.statusText,
                    hasRecords ? styles.statusTextPresent : styles.statusTextAbsent
                  ]}>
                    {hasRecords ? 'P' : 'A'}
                  </Text>
                  {isDoubleDuty && (
                    <Text style={[styles.statusText, styles.statusTextPresent, { fontSize: 10, marginLeft: -2 }]}>+</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Legend */}
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, styles.dayCellPresent]} />
            <Text style={styles.legendText}>{t('Present', language)}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, styles.dayCellAbsent]} />
            <Text style={styles.legendText}>{t('Absent', language)}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, styles.dayCellPresent]} >
              <Text style={[styles.statusText, styles.statusTextPresent, { fontSize: 10 }]}>P+</Text>
            </View>
            <Text style={styles.legendText}>{t('Double Duty', language)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: TOKENS.spacing.md,
  },
  calendarContainer: {
    backgroundColor: TOKENS.colors.background.light,
    borderRadius: TOKENS.radius.lg,
    padding: TOKENS.spacing.md,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  dayCell: {
    width: '12.5%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    margin: '0.8%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dayCellPresent: {
    borderColor: TOKENS.colors.secondaryLight,
    backgroundColor: '#f0fdf4',
  },
  dayCellAbsent: {
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  dayNumber: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '900',
  },
  statusTextPresent: {
    color: '#15803d',
  },
  statusTextAbsent: {
    color: TOKENS.colors.danger,
  },
  legendContainer: {
    flexDirection: 'row',
    marginTop: TOKENS.spacing.lg,
    justifyContent: 'center',
    gap: TOKENS.spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendText: {
    fontSize: TOKENS.typography.size.xs,
    color: TOKENS.colors.text.muted,
    fontWeight: 'bold',
  },
});
