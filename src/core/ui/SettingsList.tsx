/**
 * @module core/ui/SettingsList
 * 职责：通用分组设置列表组件，统一渲染分组标题、箭头跳转行、语义开关行（复用内核 Switch）与只读信息值行。
 * 边界：纯受控声明式列表，不持有业务偏好或导航依赖。
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from './AppText';
import { HStack, VStack } from './Stack';
import { Switch } from './Switch';

export type SettingsListItem =
  | {
      key: string;
      kind: 'link';
      label: string;
      value?: string;
      onPress: () => void;
      testID?: string;
    }
  | {
      key: string;
      kind: 'switch';
      label: string;
      description?: string;
      value: boolean;
      onValueChange: (nextValue: boolean) => void;
      disabled?: boolean;
      testID?: string;
    }
  | {
      key: string;
      kind: 'info';
      label: string;
      value: string;
      testID?: string;
    };

export interface SettingsSection {
  key: string;
  title?: string;
  items: readonly SettingsListItem[];
}

export interface SettingsListProps {
  sections: readonly SettingsSection[];
}

export function SettingsList({ sections }: SettingsListProps): React.JSX.Element {
  const { tokens } = useAppTheme();

  return (
    <VStack gap="lg">
      {sections.map((section) => (
        <VStack key={section.key} gap="xs">
          {section.title ? (
            <AppText variant="caption" tone="secondary" style={styles.sectionTitle}>
              {section.title}
            </AppText>
          ) : null}
          <VStack bg="surface" radius="lg" bordered>
            {section.items.map((item, idx) => {
              const showDivider = idx > 0;
              const dividerStyle = showDivider
                ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.colors.border }
                : undefined;

              if (item.kind === 'switch') {
                return (
                  <View key={item.key} style={[styles.switchWrap, dividerStyle]}>
                    <Switch
                      testID={item.testID}
                      label={item.label}
                      description={item.description}
                      value={item.value}
                      disabled={item.disabled}
                      onValueChange={item.onValueChange}
                    />
                  </View>
                );
              }

              if (item.kind === 'info') {
                return (
                  <HStack
                    key={item.key}
                    testID={item.testID}
                    px="md"
                    py="md"
                    justify="space-between"
                    align="center"
                    style={dividerStyle}
                  >
                    <AppText variant="bodyMd">{item.label}</AppText>
                    <AppText variant="bodySm" tone="secondary">
                      {item.value}
                    </AppText>
                  </HStack>
                );
              }

              return (
                <Pressable
                  key={item.key}
                  testID={item.testID}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  onPress={item.onPress}
                  style={({ pressed }) => [
                    styles.linkRow,
                    dividerStyle,
                    pressed && { backgroundColor: tokens.colors.surfaceMuted },
                  ]}
                >
                  <HStack justify="space-between" align="center" gap="sm">
                    <AppText variant="bodyMd">{item.label}</AppText>
                    <HStack align="center" gap="xs">
                      {item.value ? (
                        <AppText variant="bodySm" tone="secondary">
                          {item.value}
                        </AppText>
                      ) : null}
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={tokens.colors.textSecondary}
                      />
                    </HStack>
                  </HStack>
                </Pressable>
              );
            })}
          </VStack>
        </VStack>
      ))}
    </VStack>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    paddingHorizontal: 4,
  },
  linkRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  switchWrap: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
});
