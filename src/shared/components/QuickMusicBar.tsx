/**
 * @module shared/components/QuickMusicBar
 * 职责：精简内联本地音乐播放条（复用 useMusicCapability 与 useFilesCapability），可自然嵌入发现页或媒体卡片。
 * 边界：归属 Shared Layer；受 AppIdentity.capabilities.audioVideo 开关控制，未开启时不渲染。
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFilesCapability } from '@/core/capabilities/files';
import { useMusicCapability } from '@/core/capabilities/music';
import { useToast } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppText, HStack, VStack } from '@/core/ui';

export function QuickMusicBar(): React.JSX.Element | null {
  const { tokens } = useAppTheme();
  const music = useMusicCapability();
  const files = useFilesCapability();
  const toast = useToast();

  if (!music.enabled) {
    return null;
  }

  const isPlaying = music.state.status === 'playing';
  const hasTrack = music.state.track !== null;

  const handlePickTrack = async (): Promise<void> => {
    const asset = await files.pickDocument({ types: ['audio/*'] });
    if (!asset) {
      return;
    }
    await music.player.loadAndPlay({ uri: asset.uri, name: asset.name });
    toast.show({ message: `正在播放：${asset.name}`, tone: 'info' });
  };

  const handleTogglePlay = async (): Promise<void> => {
    if (!hasTrack) {
      await handlePickTrack();
      return;
    }
    music.player.togglePlayPause();
  };

  return (
    <HStack
      testID="quick-music-bar"
      p="md"
      gap="md"
      bg="surface"
      radius="lg"
      bordered
      align="center"
      style={styles.bar}
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: tokens.colors.primarySoft, borderRadius: tokens.radii.md },
        ]}
      >
        <Ionicons name="musical-notes" size={20} color={tokens.colors.primary} />
      </View>

      <VStack flex={1} gap="xs">
        <AppText variant="bodyMd" weight="600" numberOfLines={1}>
          {music.state.track?.name ?? '本地音乐随身听'}
        </AppText>
        <AppText variant="caption" tone="secondary" numberOfLines={1}>
          {isPlaying ? '正在播放 · 支持蓝牙系统音频' : '点击右侧选歌或播放本地音频'}
        </AppText>
      </VStack>

      <HStack align="center" gap="xs">
        <Pressable
          testID="quick-music-pick-btn"
          accessibilityRole="button"
          accessibilityLabel="选择本地音乐"
          onPress={() => {
            void handlePickTrack();
          }}
          hitSlop={6}
          style={[
            styles.circleBtn,
            { backgroundColor: tokens.colors.surfaceMuted, borderRadius: tokens.radii.full },
          ]}
        >
          <Ionicons name="folder-open-outline" size={18} color={tokens.colors.textPrimary} />
        </Pressable>

        <Pressable
          testID="quick-music-play-btn"
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? '暂停播放' : '播放音乐'}
          onPress={() => {
            void handleTogglePlay();
          }}
          hitSlop={6}
          style={[
            styles.circleBtn,
            { backgroundColor: tokens.colors.primary, borderRadius: tokens.radii.full },
          ]}
        >
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color={tokens.colors.onPrimary} />
        </Pressable>
      </HStack>
    </HStack>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginBottom: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
