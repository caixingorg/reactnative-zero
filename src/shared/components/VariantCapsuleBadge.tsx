import React from 'react';
import { Pressable } from 'react-native';
import { useAppRuntime } from '@/core/runtime';
import { AppText, Box } from '@/core/ui';

// 原因：统一封装多页面复用的构建变体胶囊角标与非生产环境一键呼出 DevTools 快捷手势，消除视图分支重复
export function VariantCapsuleBadge(): React.JSX.Element {
  const { env, devToolsStore } = useAppRuntime();

  const badge = (
    <Box px="md" py="xs" bg="primary" radius="full">
      <AppText variant="caption" tone="onPrimary" weight="700">
        {env.appVariant.toUpperCase()}
      </AppText>
    </Box>
  );

  if (env.appVariant === 'production' || !devToolsStore.getState().enabled) {
    return badge;
  }

  return (
    <Pressable accessibilityRole="button" onPress={() => devToolsStore.getState().openDrawer()}>
      {badge}
    </Pressable>
  );
}
