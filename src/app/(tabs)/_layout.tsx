import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '@/core/theme/theme-context';
import { pageActionsRegistry } from '@/core/ui';

// 原因：Route Shell 底部标签壳仅负责声明式路由、图标角标映射与重复点击当前标签回顶/刷新转发
export default function MainTabsLayout(): React.JSX.Element {
  const { t } = useTranslation();
  const { tokens } = useAppTheme();

  const createReselectListeners = ({
    navigation,
  }: {
    navigation: { isFocused: () => boolean };
  }) => ({
    tabPress: () => {
      if (navigation.isFocused()) {
        pageActionsRegistry.reselect();
      }
    },
  });

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        tabBarActiveTintColor: tokens.colors.primary,
        tabBarInactiveTintColor: tokens.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: tokens.colors.surface,
          borderTopColor: tokens.colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        listeners={createReselectListeners}
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="home-outline"
              size={size}
              color={typeof color === 'string' ? color : tokens.colors.textSecondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        listeners={createReselectListeners}
        options={{
          title: t('tabs.discover'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="compass-outline"
              size={size}
              color={typeof color === 'string' ? color : tokens.colors.textSecondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        listeners={createReselectListeners}
        options={{
          title: t('tabs.messages'),
          tabBarBadge: 4,
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={size}
              color={typeof color === 'string' ? color : tokens.colors.textSecondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        listeners={createReselectListeners}
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="person-outline"
              size={size}
              color={typeof color === 'string' ? color : tokens.colors.textSecondary}
            />
          ),
        }}
      />
    </Tabs>
  );
}
