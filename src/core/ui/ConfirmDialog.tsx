import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from './AppText';
import { Box } from './Box';
import { Button } from './Button';
import { HStack, VStack } from './Stack';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 危险操作（如退出登录、清空数据）设为 `true`，确认按钮切换为 `danger` 变体。 */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// 原因：提供跨平台一致且遵循语义 Token 的居中二次确认弹窗，替代不可定制样式且在测试环境难以断言的原生 Alert.alert
export function ConfirmDialog({
  visible,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const { tokens } = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.overlay, { padding: tokens.spacing.xl }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.closeBackdrop')}
          disabled={loading}
          style={[styles.backdrop, { backgroundColor: tokens.colors.scrim }]}
          onPress={onCancel}
        />

        <VStack p="xl" gap="md" bg="surface" radius="lg" bordered style={styles.card}>
          <AppText variant="titleMd">{title}</AppText>
          {description ? (
            <AppText variant="bodySm" tone="secondary">
              {description}
            </AppText>
          ) : null}

          <HStack gap="sm" style={styles.actions}>
            <Box flex={1}>
              <Button
                label={cancelLabel ?? t('common.cancel')}
                variant="outline"
                disabled={loading}
                onPress={onCancel}
              />
            </Box>
            <Box flex={1}>
              <Button
                label={confirmLabel ?? t('common.confirm')}
                variant={destructive ? 'danger' : 'primary'}
                loading={loading}
                onPress={onConfirm}
              />
            </Box>
          </HStack>
        </VStack>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    width: '100%',
    maxWidth: 360,
  },
  actions: {
    marginTop: 4,
  },
});
