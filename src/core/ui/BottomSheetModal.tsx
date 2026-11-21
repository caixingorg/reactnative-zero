import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from './AppText';

export interface BottomSheetModalProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function BottomSheetModal({
  visible,
  title,
  onClose,
  children,
}: BottomSheetModalProps): React.JSX.Element {
  const { t } = useTranslation();
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.closeBackdrop')}
          style={[styles.backdrop, { backgroundColor: tokens.colors.scrim }]}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: tokens.colors.surface,
              borderTopLeftRadius: tokens.radii.lg,
              borderTopRightRadius: tokens.radii.lg,
              paddingHorizontal: tokens.spacing.lg,
              paddingTop: tokens.spacing.md,
              paddingBottom: Math.max(insets.bottom, tokens.spacing.lg),
              gap: tokens.spacing.md,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: tokens.colors.border }]} />
          {title ? <AppText variant="titleMd">{title}</AppText> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  sheet: {
    width: '100%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
  },
});
