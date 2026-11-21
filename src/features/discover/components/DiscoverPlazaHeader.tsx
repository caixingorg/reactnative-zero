import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFilesCapability } from '@/core/capabilities/files';
import { useLocationCapability } from '@/core/capabilities/location';
import { useMediaCapability } from '@/core/capabilities/media';
import { useMusicCapability } from '@/core/capabilities/music';
import { useToast } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppText, HStack, VStack } from '@/core/ui';
import type { MockListRecord } from '@/shared';

export interface DiscoverPlazaHeaderProps {
  onSelectRecord?: (record: MockListRecord) => void;
  onOpenScanner: () => void;
  onOpenWebView?: () => void;
}

// 原因：仅在「广场」子页挂载时订阅音乐/相机/定位/文件能力，避免榜单与专题子页重复订阅和随播放状态联动重渲染
export function DiscoverPlazaHeader({
  onSelectRecord,
  onOpenScanner,
  onOpenWebView,
}: DiscoverPlazaHeaderProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const music = useMusicCapability();
  const media = useMediaCapability();
  const location = useLocationCapability();
  const files = useFilesCapability();
  const toast = useToast();

  const isPlaying = music.state.status === 'playing';

  const handleMusicAction = async (): Promise<void> => {
    if (!music.state.track) {
      const asset = await files.pickDocument({ types: ['audio/*'] });
      if (!asset) {
        return;
      }
      await music.player.loadAndPlay({ uri: asset.uri, name: asset.name });
      toast.show({ message: `正在播放：${asset.name}`, tone: 'info' });
      return;
    }
    music.player.togglePlayPause();
  };

  return (
    <VStack testID="discover-tools-grid" gap="sm" style={styles.bentoSection}>
      {/* Row 1: Asymmetric Bento — Left Dark Vinyl Music Card + Right 2 Pastel Tool Cards */}
      <HStack gap="sm" style={styles.bentoTopRow}>
        <Pressable
          testID="discover-tool-music"
          accessibilityRole="button"
          onPress={() => {
            void handleMusicAction();
          }}
          style={({ pressed }) => [styles.musicBentoCard, pressed && styles.pressed]}
        >
          <AppText variant="bodySm" weight="700" style={styles.musicBentoTitle} numberOfLines={1}>
            {music.state.track?.name ?? '本地音乐随身听'}
          </AppText>

          <View style={styles.vinylOuter}>
            <View style={styles.vinylMiddle}>
              <View style={styles.vinylCore} />
            </View>
          </View>

          <View style={styles.playPill}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color="#18181B" />
          </View>
        </Pressable>

        <VStack flex={1} gap="sm">
          <Pressable
            testID="discover-tool-scan"
            accessibilityRole="button"
            onPress={onOpenScanner}
            style={({ pressed }) => [
              styles.pastelBentoCard,
              { backgroundColor: tokens.isDark ? '#1E3A5F' : '#DBEAFE' },
              pressed && styles.pressed,
            ]}
          >
            <AppText
              variant="bodySm"
              weight="700"
              style={{ color: tokens.isDark ? '#BFDBFE' : '#1E3A8A' }}
            >
              扫一扫
            </AppText>
            <Ionicons name="scan-outline" size={28} color={tokens.isDark ? '#93C5FD' : '#2563EB'} />
          </Pressable>

          <Pressable
            testID="discover-tool-location"
            accessibilityRole="button"
            onPress={() => {
              void location
                .getCurrentPositionWithPermission({
                  title: '定位权限说明',
                  description: '用于获取您当前所在位置完成打卡。',
                })
                .then((pos) => {
                  if (pos) {
                    toast.show({
                      message: `附近打卡：${pos.latitude.toFixed(2)}, ${pos.longitude.toFixed(2)}`,
                      tone: 'success',
                    });
                  }
                });
            }}
            style={({ pressed }) => [
              styles.pastelBentoCard,
              { backgroundColor: tokens.isDark ? '#4C1D24' : '#FFE4E6' },
              pressed && styles.pressed,
            ]}
          >
            <AppText
              variant="bodySm"
              weight="700"
              style={{ color: tokens.isDark ? '#FECDD3' : '#9F1239' }}
            >
              附近打卡
            </AppText>
            <Ionicons
              name="location-outline"
              size={28}
              color={tokens.isDark ? '#FDA4AF' : '#E11D48'}
            />
          </Pressable>
        </VStack>
      </HStack>

      {/* Row 2: 3 Clean Utility Pills */}
      <HStack gap="sm">
        <Pressable
          testID="discover-tool-photo"
          accessibilityRole="button"
          onPress={() => {
            void media
              .pickImageWithPermission({
                title: '相册权限说明',
                description: '用于从手机相册挑选图片上传。',
              })
              .then((asset) => {
                if (asset) {
                  toast.show({ message: '已选取相册图片', tone: 'success' });
                }
              });
          }}
          style={({ pressed }) => [
            styles.utilityPill,
            { backgroundColor: tokens.colors.surfaceMuted, borderRadius: tokens.radii.md },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="cloud-upload-outline" size={20} color={tokens.colors.textPrimary} />
          <AppText variant="caption" weight="600">
            图库上传
          </AppText>
        </Pressable>

        <Pressable
          testID="discover-tool-files"
          accessibilityRole="button"
          onPress={() => {
            void files.pickDocument().then((doc) => {
              if (doc) {
                toast.show({ message: `已选文件：${doc.name}`, tone: 'info' });
              }
            });
          }}
          style={({ pressed }) => [
            styles.utilityPill,
            { backgroundColor: tokens.colors.surfaceMuted, borderRadius: tokens.radii.md },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="document-outline" size={20} color={tokens.colors.textPrimary} />
          <AppText variant="caption" weight="600">
            文件快传
          </AppText>
        </Pressable>

        <Pressable
          testID="discover-tool-h5"
          accessibilityRole="button"
          onPress={() => {
            if (onOpenWebView) {
              onOpenWebView();
            } else {
              toast.show({ message: '请在完整路由环境中打开 H5 容器', tone: 'info' });
            }
          }}
          style={({ pressed }) => [
            styles.utilityPill,
            { backgroundColor: tokens.colors.surfaceMuted, borderRadius: tokens.radii.md },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="globe-outline" size={20} color={tokens.colors.textPrimary} />
          <AppText variant="caption" weight="600">
            H5 轻应用
          </AppText>
        </Pressable>
      </HStack>

      {/* Row 3: Weekly Editorial Poster Card */}
      <Pressable
        testID="discover-weekly-poster"
        accessibilityRole="button"
        onPress={() =>
          onSelectRecord?.({
            id: 'weekly-poster',
            title: '本周专题画报 · 探索数字生活新方式',
            tag: '专题画报',
            summary: '精选本周最具启发性的产品评测、自动化工作流与跨端工程实践。',
            meta: '共 12 篇精选',
          })
        }
        style={({ pressed }) => [styles.posterCard, pressed && styles.pressed]}
      >
        <VStack flex={1} justify="center" align="center" gap="xs">
          <AppText variant="titleLg" style={styles.posterTitle}>
            本周专题画报
          </AppText>
          <AppText variant="caption" style={styles.posterSub}>
            探索数字生活新方式 · 共 12 篇精选
          </AppText>
        </VStack>
      </Pressable>
    </VStack>
  );
}

const styles = StyleSheet.create({
  bentoSection: {
    marginBottom: 14,
  },
  bentoTopRow: {
    height: 184,
  },
  musicBentoCard: {
    flex: 1.25,
    borderRadius: 20,
    backgroundColor: '#18181B',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  musicBentoTitle: {
    color: '#FFFFFF',
  },
  vinylOuter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinylMiddle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#3F3F46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinylCore: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#D7191A',
  },
  playPill: {
    paddingHorizontal: 22,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastelBentoCard: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  utilityPill: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  posterCard: {
    height: 136,
    borderRadius: 20,
    backgroundColor: '#241B19',
    padding: 18,
  },
  posterTitle: {
    color: '#FFFFFF',
  },
  posterSub: {
    color: 'rgba(255, 255, 255, 0.78)',
  },
  pressed: {
    opacity: 0.72,
  },
});
