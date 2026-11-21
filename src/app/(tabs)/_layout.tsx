import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '@/core/theme/theme-context';

// 原因：Route Shell 底部标签壳仅负责声明式路由与图标映射，具体界面逻辑位于各自的 Feature Slice
export default function MainTabsLayout(): React.JSX.Element {
  const { t } = useTranslation();
  const { tokens } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
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
        name="lab"
        options={{
          title: t('tabs.lab'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="flask-outline"
              size={size}
              color={typeof color === 'string' ? color : tokens.colors.textSecondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="settings-outline"
              size={size}
              color={typeof color === 'string' ? color : tokens.colors.textSecondary}
            />
          ),
        }}
      />
    </Tabs>
  );
}
