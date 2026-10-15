import { StyleSheet } from 'react-native';
import { TOKENS } from './tokens';

export const dashboardStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TOKENS.colors.background.main,
  },
  headerGradient: {
    paddingBottom: TOKENS.spacing.md,
    paddingHorizontal: TOKENS.spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  employeeName: {
    color: TOKENS.colors.text.light,
    fontSize: TOKENS.typography.size.xl,
    fontWeight: TOKENS.typography.weight.extrabold,
    letterSpacing: -0.3,
  },
  dutyStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    gap: 6,
  },
  dutyStatusText: {
    fontSize: TOKENS.typography.size.xs,
    fontWeight: TOKENS.typography.weight.extrabold,
    letterSpacing: 0.6,
  },
  dutyStatusSubText: {
    color: TOKENS.colors.text.muted,
    fontSize: TOKENS.typography.size.xs,
    fontWeight: TOKENS.typography.weight.semibold,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: TOKENS.spacing.md,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: TOKENS.colors.danger,
    borderRadius: TOKENS.radius.sm,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.primary,
  },
  badgeText: {
    color: TOKENS.colors.text.light,
    fontSize: TOKENS.typography.size.xs,
    fontWeight: TOKENS.typography.weight.bold,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: TOKENS.spacing.xs,
    paddingHorizontal: TOKENS.spacing.sm,
    borderRadius: TOKENS.radius.full,
  },
  quickActionRow: {
    backgroundColor: TOKENS.colors.background.main,
    paddingHorizontal: TOKENS.spacing.md,
    paddingVertical: TOKENS.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border.light,
  },
  quickActionButtonsContainer: {
    flexDirection: 'row',
    gap: TOKENS.spacing.md,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: TOKENS.spacing.md,
    paddingHorizontal: TOKENS.spacing.md,
    borderRadius: TOKENS.radius.md,
    justifyContent: 'center',
    gap: 6,
  },
  quickActionBtnText: {
    color: TOKENS.colors.text.light,
    fontWeight: TOKENS.typography.weight.bold,
    fontSize: TOKENS.typography.size.sm,
  },
  tabBarContainer: {
    backgroundColor: TOKENS.colors.background.main,
    paddingBottom: TOKENS.spacing.md,
    paddingHorizontal: TOKENS.spacing.lg,
  },
  tabBarInner: {
    flexDirection: 'row',
    backgroundColor: TOKENS.colors.background.card,
    borderRadius: TOKENS.radius.lg,
    padding: TOKENS.spacing.xs,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: TOKENS.spacing.md,
    alignItems: 'center',
    borderRadius: TOKENS.radius.sm,
  },
  tabBtnActive: {
    backgroundColor: TOKENS.colors.secondary,
  },
  tabText: {
    fontSize: TOKENS.typography.size.sm,
    fontWeight: TOKENS.typography.weight.bold,
  },
  tabTextActive: {
    color: TOKENS.colors.text.light,
  },
  tabTextInactive: {
    color: TOKENS.colors.text.muted,
  },
  contentScroll: {
    flex: 1,
    backgroundColor: TOKENS.colors.background.light,
  },
  contentPadding: {
    padding: TOKENS.spacing.lg,
  },
  card: {
    backgroundColor: TOKENS.colors.background.white,
    borderRadius: TOKENS.radius.xl,
    padding: TOKENS.spacing.lg,
    marginBottom: TOKENS.spacing.lg,
    ...TOKENS.shadows.sm,
  },
  cardTitle: {
    fontSize: TOKENS.typography.size.md,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.dark,
    marginBottom: TOKENS.spacing.md,
  },
  // Skeleton styles
  skeletonBase: {
    backgroundColor: '#e2e8f0',
    borderRadius: TOKENS.radius.md,
  },
});
