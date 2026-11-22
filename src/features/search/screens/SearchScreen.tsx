import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useAppRuntime } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppText, EmptyState, HStack, Screen, SearchBar, VStack } from '@/core/ui';

export interface SearchResultItem {
  id: string;
  title: string;
  category: string;
}

export interface SearchScreenProps {
  onBack?: () => void;
  onSelectResult?: (id: string, item: SearchResultItem) => void;
}

const SEARCH_HISTORY_STORAGE_KEY = 'search.history.v1';
const DEFAULT_SEARCH_HISTORY: readonly string[] = ['四层架构', '离线缓存'];
const HOT_KEYWORDS = ['四层架构', '抽屉手势', '离线缓存', '包体积守卫', 'Design Token'] as const;

const SEARCH_CORPUS: readonly SearchResultItem[] = [
  { id: 's-1', title: '企业级移动底座四层架构规范', category: '架构' },
  { id: 's-2', title: 'Reanimated 抽屉手势与边缘冲突隔离', category: '交互' },
  { id: 's-3', title: '弱网离线缓存与单飞刷新方案', category: '网络' },
  { id: 's-4', title: 'Android 包体积守卫与基线管理', category: '性能' },
  { id: 's-5', title: '零依赖 Design Token 亮暗主题切换', category: '样式' },
];

function readPersistedHistory(raw: string | undefined): string[] {
  if (raw === undefined) {
    return [...DEFAULT_SEARCH_HISTORY];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
      return parsed.slice(0, 8);
    }
  } catch {
    // 忽略损坏缓存，回退默认搜索建议
  }
  return [...DEFAULT_SEARCH_HISTORY];
}

export function SearchScreen({
  onBack,
  onSelectResult,
}: SearchScreenProps = {}): React.JSX.Element {
  const { keyValueStorage } = useAppRuntime();
  const { tokens } = useAppTheme();
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<string[]>(() =>
    readPersistedHistory(keyValueStorage.getString(SEARCH_HISTORY_STORAGE_KEY)),
  );

  const trimmed = query.trim();

  const results = useMemo(() => {
    if (!trimmed) {
      return [];
    }
    const lower = trimmed.toLowerCase();
    return SEARCH_CORPUS.filter(
      (item) =>
        item.title.toLowerCase().includes(lower) || item.category.toLowerCase().includes(lower),
    );
  }, [trimmed]);

  const updateHistory = (next: string[]): void => {
    setHistory(next);
    keyValueStorage.setString(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(next));
  };

  const recordSearch = (keyword: string): void => {
    const clean = keyword.trim();
    if (!clean) {
      return;
    }
    setQuery(clean);
    updateHistory([clean, ...history.filter((entry) => entry !== clean)].slice(0, 8));
  };

  return (
    <Screen
      edges={['top', 'bottom', 'left', 'right']}
      statusBarBackgroundColor={tokens.colors.surface}
    >
      <HStack
        px="md"
        py="sm"
        gap="sm"
        align="center"
        style={[
          styles.header,
          { backgroundColor: tokens.colors.surface, borderBottomColor: tokens.colors.border },
        ]}
      >
        {onBack ? (
          <Pressable
            testID="search-back-btn"
            accessibilityRole="button"
            accessibilityLabel="返回"
            onPress={onBack}
            hitSlop={8}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={22} color={tokens.colors.textPrimary} />
          </Pressable>
        ) : null}
        <SearchBar
          mode="input"
          value={query}
          onChangeText={setQuery}
          onSubmit={recordSearch}
          placeholder="搜索文章、专题或能力"
        />
      </HStack>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!trimmed ? (
          <VStack gap="lg">
            {history.length > 0 ? (
              <VStack gap="sm">
                <HStack justify="space-between" align="center">
                  <AppText variant="titleMd">搜索历史</AppText>
                  <Pressable
                    testID="search-clear-history"
                    accessibilityRole="button"
                    onPress={() => updateHistory([])}
                  >
                    <AppText variant="caption" tone="secondary">
                      清空
                    </AppText>
                  </Pressable>
                </HStack>
                <View style={styles.chipWrap}>
                  {history.map((item) => (
                    <Pressable
                      key={item}
                      accessibilityRole="button"
                      onPress={() => recordSearch(item)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: tokens.colors.surface,
                          borderColor: tokens.colors.border,
                          borderRadius: tokens.radii.full,
                        },
                      ]}
                    >
                      <AppText variant="bodySm">{item}</AppText>
                    </Pressable>
                  ))}
                </View>
              </VStack>
            ) : null}

            <VStack gap="sm">
              <AppText variant="titleMd">热门搜索</AppText>
              <View style={styles.chipWrap}>
                {HOT_KEYWORDS.map((keyword) => (
                  <Pressable
                    key={keyword}
                    accessibilityRole="button"
                    onPress={() => recordSearch(keyword)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: tokens.colors.primarySoft,
                        borderColor: tokens.colors.primarySoft,
                        borderRadius: tokens.radii.full,
                      },
                    ]}
                  >
                    <AppText variant="bodySm" tone="brand">
                      {keyword}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </VStack>
          </VStack>
        ) : results.length === 0 ? (
          <EmptyState
            title="未找到相关结果"
            description={`没有与“${trimmed}”匹配的内容，换个关键词试试`}
          />
        ) : (
          <VStack gap="sm">
            {results.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => onSelectResult?.(item.id, item)}
              >
                <VStack p="md" gap="xs" bg="surface" radius="lg" bordered>
                  <AppText variant="caption" tone="brand" weight="600">
                    {item.category}
                  </AppText>
                  <AppText variant="bodyMd" weight="600">
                    {item.title}
                  </AppText>
                </VStack>
              </Pressable>
            ))}
          </VStack>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
