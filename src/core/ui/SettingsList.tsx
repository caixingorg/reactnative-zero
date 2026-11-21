/**
 * @module core/ui/SettingsList
 * 职责：通用分组设置列表组件，采用无硬边框的纯白圆角分组容器、柔和色底小图标与左缩进极细分割线。
 * 边界：纯受控声明式列表，不持有业务偏好或导航依赖。
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from './AppText';
import { HStack, VStack } from './Stack';

interface IconBadgeConfig {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  iconBg?: string;
}

export type SettingsListItem =
  | ({
      key: string;
      kind: 'link';
      label: string;
      value?: string;
      onPress: () => void;
      testID?: string;
    } & IconBadgeConfig)
  | ({
      key: string;
      kind: 'switch';
      label: string;
      description?: string;
      value: boolean;
      onValueChange: (nextValue: boolean) => void;
      disabled?: boolean;
      testID?: string;
    } & IconBadgeConfig)
  | ({
      key: string;
      kind: 'info';
      label: string;
      value: string;
      testID?: string;
    } & IconBadgeConfig);

export interface SettingsSection {
  key: string;
  title?: string;
  items: readonly SettingsListItem[];
}

export interface SettingsListProps {
  sections: readonly SettingsSection[];
}

function RowIconBadge({ icon, iconColor, iconBg }: IconBadgeConfig): React.JSX.Element | null {
  const { tokens } = useAppTheme();
  if (!icon) {
    return null;
  }
  return (
    <View
      style={[
        styles.iconBadge,
        {
          backgroundColor: iconBg ?? tokens.colors.surfaceMuted,
          borderRadius: tokens.radii.sm,
        },
      ]}
    >
      <Ionicons name={icon} size={16} color={iconColor ?? tokens.colors.primary} />
    </View>
  );
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
          <View
            style={[
              styles.card,
              {
                backgroundColor: tokens.colors.surface,
                borderRadius: tokens.radii.lg,
              },
            ]}
          >
            {section.items.map((item, idx) => {
              const showDivider = idx > 0;
              const dividerNode = showDivider ? (
                <View
                  style={[
                    styles.insetDivider,
                    {
                      backgroundColor: tokens.colors.border,
                      marginLeft: item.icon ? 56 : 16,
                    },
                  ]}
                />
              ) : null;

              if (item.kind === 'switch') {
                return (
                  <View key={item.key}>
                    {dividerNode}
                    <Pressable
                      testID={item.testID}
                      accessibilityRole="switch"
                      accessibilityLabel={item.label}
                      accessibilityState={{ checked: item.value, disabled: item.disabled }}
                      disabled={item.disabled}
                      onPress={() => item.onValueChange(!item.value)}
                      style={({ pressed }) => [
                        styles.row,
                        pressed && { backgroundColor: tokens.colors.surfaceMuted },
                      ]}
                    >
                      <HStack align="center" justify="space-between" gap="md">
                        <HStack flex={1} align="center" gap="md">
                          <RowIconBadge
                            icon={item.icon}
                            iconColor={item.iconColor}
                            iconBg={item.iconBg}
                          />
                          <VStack flex={1}>
                            <AppText variant="bodyMd" weight="500">
                              {item.label}
                            </AppText>
                            {item.description ? (
                              <AppText variant="caption" tone="secondary">
                                {item.description}
                              </AppText>
                            ) : null}
                          </VStack>
                        </HStack>
                        <View
                          style={[
                            styles.toggleTrack,
                            {
                              backgroundColor: item.value
                                ? tokens.colors.success
                                : tokens.colors.border,
                              borderRadius: tokens.radii.full,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.toggleThumb,
                              {
                                backgroundColor: tokens.colors.onPrimary,
                                borderRadius: tokens.radii.full,
                                transform: [{ translateX: item.value ? 20 : 2 }],
                              },
                            ]}
                          />
                        </View>
                      </HStack>
                    </Pressable>
                  </View>
                );
              }

              if (item.kind === 'info') {
                return (
                  <View key={item.key}>
                    {dividerNode}
                    <HStack
                      testID={item.testID}
                      style={styles.row}
                      justify="space-between"
                      align="center"
                      gap="md"
                    >
                      <HStack align="center" gap="md">
                        <RowIconBadge
                          icon={item.icon}
                          iconColor={item.iconColor}
                          iconBg={item.iconBg}
                        />
                        <AppText variant="bodyMd" weight="500">
                          {item.label}
                        </AppText>
                      </HStack>
                      <AppText
                        variant="bodySm"
                        tone="secondary"
                        numberOfLines={1}
                        style={styles.valueText}
                      >
                        {item.value}
                      </AppText>
                    </HStack>
                  </View>
                );
              }

              return (
                <View key={item.key}>
                  {dividerNode}
                  <Pressable
                    testID={item.testID}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    onPress={item.onPress}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { backgroundColor: tokens.colors.surfaceMuted },
                    ]}
                  >
                    <HStack justify="space-between" align="center" gap="md">
                      <HStack flex={1} align="center" gap="md">
                        <RowIconBadge
                          icon={item.icon}
                          iconColor={item.iconColor}
                          iconBg={item.iconBg}
                        />
                        <AppText variant="bodyMd" weight="500">
                          {item.label}
                        </AppText>
                      </HStack>
                      <HStack align="center" gap="xs">
                        {item.value ? (
                          <AppText variant="bodySm" tone="secondary">
                            {item.value}
                          </AppText>
                        ) : null}
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color={tokens.colors.textSecondary}
                        />
                      </HStack>
                    </HStack>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </VStack>
      ))}
    </VStack>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    paddingHorizontal: 8,
  },
  card: {
    overflow: 'hidden',
  },
  insetDivider: {
    height: StyleSheet.hairlineWidth,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconBadge: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    maxWidth: '58%',
    textAlign: 'right',
  },
  toggleTrack: {
    width: 44,
    height: 26,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 22,
    height: 22,
  },
});
