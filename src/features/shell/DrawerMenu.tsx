/**
 * @module features/shell/DrawerMenu
 * 职责：全局侧边抽屉的业务菜单内容（用户头像/登录入口、快捷导航项、深色模式开关、版本号与退出登录）。
 * 边界：归属业务层而非 Template Core，由 Route Shell 根布局注入 DrawerHost；路由跳转由外层回调提供，未接入路由时在本层提示。
 */
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useAppRuntime, useAuthSession, useToast } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppText, HStack, VStack } from '@/core/ui';

export type DrawerNavTarget =
  'profile' | 'login' | 'favorites' | 'history' | 'settings' | 'feedback' | 'about';

export interface DrawerMenuProps {
  onClose: () => void;
  /** 返回 false 表示外层尚未为该目标挂载路由，由菜单自身给出友好提示。 */
  onNavigate?: (target: DrawerNavTarget) => boolean | void;
  versionLabel?: string;
}

interface MenuItemConfig {
  target: Exclude<DrawerNavTarget, 'profile' | 'login'>;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const MENU_ITEMS: readonly MenuItemConfig[] = [
  { target: 'favorites', label: '收藏', icon: 'bookmark-outline' },
  { target: 'history', label: '历史', icon: 'time-outline' },
  { target: 'settings', label: '设置', icon: 'settings-outline' },
  { target: 'feedback', label: '意见反馈', icon: 'chatbox-ellipses-outline' },
  { target: 'about', label: '关于', icon: 'information-circle-outline' },
];

export function DrawerMenu({
  onClose,
  onNavigate,
  versionLabel,
}: DrawerMenuProps): React.JSX.Element {
  const { authSessionStore } = useAppRuntime();
  const status = useAuthSession((state) => state.status);
  const user = useAuthSession((state) => state.user);
  const { tokens, setThemePreference } = useAppTheme();
  const toast = useToast();

  const resolvedVersion = versionLabel ?? Constants.expoConfig?.version ?? '1.0.0';
  const isAuthenticated = status === 'authenticated' && user !== null;
  const avatarText = isAuthenticated ? user.displayName.slice(0, 1).toUpperCase() : '?';

  const handleNav = (target: DrawerNavTarget): void => {
    onClose();
    const handled = onNavigate?.(target);
    if (handled === false) {
      toast.show({ message: '该页面将在后续切片上线', tone: 'info' });
    }
  };

  const handleSignOut = async (): Promise<void> => {
    await authSessionStore.getState().clearSession();
    onClose();
  };

  return (
    <VStack flex={1} justify="space-between" style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Pressable
          testID="drawer-profile-entry"
          accessibilityRole="button"
          onPress={() => handleNav(isAuthenticated ? 'profile' : 'login')}
          style={({ pressed }) => [
            styles.profileCard,
            {
              backgroundColor: tokens.colors.surfaceMuted,
              borderRadius: tokens.radii.lg,
            },
            pressed && styles.pressed,
          ]}
        >
          <HStack align="center" gap="md">
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: tokens.colors.primary,
                  borderRadius: tokens.radii.full,
                },
              ]}
            >
              <AppText variant="titleMd" tone="inverse" weight="700">
                {avatarText}
              </AppText>
            </View>
            <VStack flex={1} gap="xs">
              {isAuthenticated ? (
                <>
                  <AppText variant="titleMd" numberOfLines={1}>
                    {user.displayName}
                  </AppText>
                  <AppText variant="caption" tone="secondary" numberOfLines={1}>
                    @{user.username}
                  </AppText>
                </>
              ) : (
                <>
                  <AppText variant="titleMd">去登录</AppText>
                  <AppText variant="caption" tone="secondary">
                    登录后同步个人数据
                  </AppText>
                </>
              )}
            </VStack>
            <Ionicons name="chevron-forward" size={18} color={tokens.colors.textSecondary} />
          </HStack>
        </Pressable>

        <HStack
          justify="space-around"
          align="center"
          style={[
            styles.statsRow,
            {
              borderTopColor: tokens.colors.border,
              borderBottomColor: tokens.colors.border,
            },
          ]}
        >
          <VStack align="center">
            <AppText variant="bodyMd" weight="700">
              24
            </AppText>
            <AppText variant="caption" tone="secondary">
              已收藏
            </AppText>
          </VStack>
          <VStack align="center">
            <AppText variant="bodyMd" weight="700">
              86
            </AppText>
            <AppText variant="caption" tone="secondary">
              足迹
            </AppText>
          </VStack>
          <VStack align="center">
            <AppText variant="bodyMd" weight="700">
              12
            </AppText>
            <AppText variant="caption" tone="secondary">
              发布
            </AppText>
          </VStack>
        </HStack>

        <VStack gap="xs" style={styles.menuList}>
          {MENU_ITEMS.map((item) => (
            <Pressable
              key={item.target}
              accessibilityRole="button"
              onPress={() => handleNav(item.target)}
              style={({ pressed }) => [
                styles.menuRow,
                { borderRadius: tokens.radii.md },
                pressed && { backgroundColor: tokens.colors.surfaceMuted },
              ]}
            >
              <HStack align="center" gap="md">
                <Ionicons name={item.icon} size={20} color={tokens.colors.textPrimary} />
                <AppText variant="bodyMd">{item.label}</AppText>
              </HStack>
            </Pressable>
          ))}

          {/* 原因：与上方菜单保持同一行高与无边框视觉，使用纯 Token 胶囊开关替代带外框卡片的表单 Switch */}
          <Pressable
            testID="drawer-dark-mode-switch"
            accessibilityRole="switch"
            accessibilityLabel="深色模式"
            accessibilityState={{ checked: tokens.isDark }}
            onPress={() => setThemePreference(tokens.isDark ? 'light' : 'dark')}
            style={({ pressed }) => [
              styles.menuRow,
              { borderRadius: tokens.radii.md },
              pressed && { backgroundColor: tokens.colors.surfaceMuted },
            ]}
          >
            <HStack align="center" justify="space-between">
              <HStack align="center" gap="md">
                <Ionicons
                  name={tokens.isDark ? 'moon' : 'moon-outline'}
                  size={20}
                  color={tokens.colors.textPrimary}
                />
                <AppText variant="bodyMd">深色模式</AppText>
              </HStack>
              <View
                style={[
                  styles.toggleTrack,
                  {
                    backgroundColor: tokens.isDark ? tokens.colors.primary : tokens.colors.border,
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
                      transform: [{ translateX: tokens.isDark ? 18 : 2 }],
                    },
                  ]}
                />
              </View>
            </HStack>
          </Pressable>
        </VStack>
      </ScrollView>

      <VStack gap="sm" style={[styles.footer, { borderTopColor: tokens.colors.border }]}>
        {isAuthenticated ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="退出登录"
            onPress={() => {
              void handleSignOut();
            }}
            style={({ pressed }) => [
              styles.signOutRow,
              {
                backgroundColor: tokens.colors.surfaceMuted,
                borderRadius: tokens.radii.md,
              },
              pressed && styles.pressed,
            ]}
          >
            <HStack align="center" justify="center" gap="xs">
              <Ionicons name="log-out-outline" size={16} color={tokens.colors.danger} />
              <AppText variant="bodySm" tone="danger" weight="600">
                退出登录
              </AppText>
            </HStack>
          </Pressable>
        ) : null}
        <AppText variant="caption" tone="secondary" align="center">
          v{resolvedVersion}
        </AppText>
      </VStack>
    </VStack>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 16,
  },
  profileCard: {
    padding: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuList: {
    marginTop: 4,
  },
  statsRow: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  toggleTrack: {
    width: 40,
    height: 24,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 20,
    height: 20,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  signOutRow: {
    width: '100%',
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
