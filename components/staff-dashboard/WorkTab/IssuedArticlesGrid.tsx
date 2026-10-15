import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TOKENS } from '../theme/tokens';
import { appService } from '@/UtilServices/appHelper';
import { Language, t } from '../i18n';

interface IssuedArticle {
  _id: string;
  employeeId: string;
  articleType: 'uniform' | 'equipment' | 'other';
  articleName: string;
  issuedDate: string;
  returnedDate?: string;
  status: 'issued' | 'returned' | 'lost';
}

interface IssuedArticlesGridProps {
  articles: IssuedArticle[];
  language: Language;
}

const articleIcon = (
  type: IssuedArticle['articleType']
): React.ComponentProps<typeof Ionicons>['name'] => {
  const map: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
    uniform: 'shirt',
    equipment: 'hammer',
    other: 'cube',
  };
  return map[type] ?? 'cube';
};

const articleStatusColor = (status: IssuedArticle['status']): string => {
  if (status === 'issued') return TOKENS.colors.secondary;
  if (status === 'returned') return TOKENS.colors.warning;
  return TOKENS.colors.danger;
};

const EmptyState = ({ text }: { text: string }) => (
  <View style={styles.emptyState}>
    <Ionicons name="search-outline" size={36} color="#cbd5e1" />
    <Text style={styles.emptyStateText}>{text}</Text>
  </View>
);

export const IssuedArticlesGrid: React.FC<IssuedArticlesGridProps> = ({ articles, language }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('ISSUED ARTICLES', language)}</Text>
      {articles.length === 0 ? (
        <EmptyState text={t('No articles issued yet', language)} />
      ) : (
        <View style={styles.grid}>
          {articles.map((article) => (
            <View key={article._id} style={styles.articleCard}>
              <View style={styles.iconWrapper}>
                <Ionicons name={articleIcon(article.articleType)} size={22} color={TOKENS.colors.info} />
              </View>
              <Text style={styles.articleName} numberOfLines={1}>
                {article.articleName}
              </Text>
              <Text style={styles.articleDate}>
                {appService.formatDate(article.issuedDate)}
              </Text>
              <View style={[styles.articleBadge, { backgroundColor: articleStatusColor(article.status) + '20' }]}>
                <Text style={[styles.articleBadgeText, { color: articleStatusColor(article.status) }]}>
                  {t(article.status, language).toUpperCase()}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: TOKENS.spacing.xl,
  },
  sectionTitle: {
    fontSize: TOKENS.typography.size.xs,
    fontWeight: TOKENS.typography.weight.extrabold,
    color: TOKENS.colors.text.muted,
    letterSpacing: 0.6,
    marginBottom: TOKENS.spacing.md,
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TOKENS.spacing.md,
  },
  articleCard: {
    width: '48%',
    backgroundColor: TOKENS.colors.background.light,
    padding: TOKENS.spacing.md,
    borderRadius: TOKENS.radius.lg,
    borderWidth: 1,
    borderColor: TOKENS.colors.border.dark,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: TOKENS.colors.background.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: TOKENS.spacing.sm,
    ...TOKENS.shadows.sm,
  },
  articleName: {
    fontSize: TOKENS.typography.size.sm,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.dark,
    marginBottom: 4,
  },
  articleDate: {
    fontSize: TOKENS.typography.size.xs,
    color: TOKENS.colors.text.secondaryDark,
    marginBottom: TOKENS.spacing.md,
  },
  articleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: TOKENS.radius.sm,
  },
  articleBadgeText: {
    fontSize: 9,
    fontWeight: TOKENS.typography.weight.extrabold,
  },
});
