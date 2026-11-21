/**
 * @module shared/components/QuickComposerCard
 * 职责：轻量化动态发布快捷条，自然融入拍照、相册选图与定位打卡能力，打破纯列表单调感。
 * 边界：归属 Shared Layer；所有能力受 AppIdentity 开关与权限用途告知门禁约束。
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useCameraCapability } from '@/core/capabilities/camera';
import { useLocationCapability } from '@/core/capabilities/location';
import { useMediaCapability } from '@/core/capabilities/media';
import { useToast } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppText, HStack, VStack } from '@/core/ui';

export interface QuickComposerCardProps {
  onPublished?: (summary: string) => void;
}

export function QuickComposerCard({ onPublished }: QuickComposerCardProps = {}): React.JSX.Element {
  const { tokens } = useAppTheme();
  const camera = useCameraCapability();
  const media = useMediaCapability();
  const location = useLocationCapability();
  const toast = useToast();
  const [attachmentNote, setAttachmentNote] = useState<string | null>(null);

  const handleCamera = async (): Promise<void> => {
    const photo = await camera.capturePhotoWithPermission({
      title: '相机权限说明',
      description: '用于拍摄现场照片并附带到您的动态中。',
    });
    if (photo) {
      const note = '已拍摄照片附件';
      setAttachmentNote(note);
      onPublished?.(note);
      toast.show({ message: note, tone: 'success' });
    }
  };

  const handlePickPhoto = async (): Promise<void> => {
    const asset = await media.pickImageWithPermission({
      title: '相册权限说明',
      description: '用于从手机相册挑选图片发布动态。',
    });
    if (asset) {
      const note = '已选取相册图片';
      setAttachmentNote(note);
      onPublished?.(note);
      toast.show({ message: note, tone: 'success' });
    }
  };

  const handleLocation = async (): Promise<void> => {
    const coords = await location.getCurrentPositionWithPermission({
      title: '定位权限说明',
      description: '用于为当前动态添加所在位置标记。',
    });
    if (coords) {
      const note = `位置打卡：${coords.latitude.toFixed(2)}, ${coords.longitude.toFixed(2)}`;
      setAttachmentNote(note);
      onPublished?.(note);
      toast.show({ message: note, tone: 'success' });
    }
  };

  return (
    <VStack
      testID="quick-composer-card"
      p="md"
      gap="sm"
      bg="surface"
      radius="lg"
      bordered
      style={styles.card}
    >
      <HStack justify="space-between" align="center">
        <AppText variant="bodyMd" weight="600">
          记录此刻动态
        </AppText>
        {attachmentNote ? (
          <AppText variant="caption" tone="brand">
            {attachmentNote}
          </AppText>
        ) : (
          <AppText variant="caption" tone="secondary">
            支持图文与定位
          </AppText>
        )}
      </HStack>

      <HStack gap="sm">
        <Pressable
          testID="composer-camera-btn"
          accessibilityRole="button"
          onPress={() => {
            void handleCamera();
          }}
          style={[
            styles.actionChip,
            { backgroundColor: tokens.colors.surfaceMuted, borderRadius: tokens.radii.md },
          ]}
        >
          <HStack align="center" gap="xs">
            <Ionicons name="camera-outline" size={16} color={tokens.colors.primary} />
            <AppText variant="caption" weight="600">
              随手拍
            </AppText>
          </HStack>
        </Pressable>

        <Pressable
          testID="composer-photo-btn"
          accessibilityRole="button"
          onPress={() => {
            void handlePickPhoto();
          }}
          style={[
            styles.actionChip,
            { backgroundColor: tokens.colors.surfaceMuted, borderRadius: tokens.radii.md },
          ]}
        >
          <HStack align="center" gap="xs">
            <Ionicons name="images-outline" size={16} color={tokens.colors.success} />
            <AppText variant="caption" weight="600">
              选图片
            </AppText>
          </HStack>
        </Pressable>

        <Pressable
          testID="composer-location-btn"
          accessibilityRole="button"
          onPress={() => {
            void handleLocation();
          }}
          style={[
            styles.actionChip,
            { backgroundColor: tokens.colors.surfaceMuted, borderRadius: tokens.radii.md },
          ]}
        >
          <HStack align="center" gap="xs">
            <Ionicons name="location-outline" size={16} color={tokens.colors.warning} />
            <AppText variant="caption" weight="600">
              定位打卡
            </AppText>
          </HStack>
        </Pressable>
      </HStack>
    </VStack>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  actionChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
