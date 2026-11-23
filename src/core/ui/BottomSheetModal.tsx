/**
 * @module core/ui/BottomSheetModal
 * 职责：基于 `@gorhom/bottom-sheet` 封装的声明式底部弹窗原语，支持手势下拉关闭、动态高度/自定义吸附点（snapPoints）、键盘交互避让与多弹窗无冲突呈现。
 * 边界：对外保持 `visible / title / onClose` 声明式契约，将 `@gorhom/bottom-sheet` 的命令式 `present / dismiss` 收敛在 `src/core/ui` 内部。
 */
import {
  BottomSheetBackdrop,
  BottomSheetModal as GorhomBottomSheetModal,
  BottomSheetModalProvider,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from './AppText';

export { BottomSheetModalProvider };

export interface BottomSheetModalProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  /** 可选吸附高度列表（如 ['50%', '85%']）；未传时默认启用动态内容高度 */
  snapPoints?: (string | number)[];
  /** 是否允许下拉手势关闭，默认 true */
  enablePanDownToClose?: boolean;
  children: React.ReactNode;
}

export function BottomSheetModal({
  visible,
  title,
  onClose,
  snapPoints,
  enablePanDownToClose = true,
  children,
}: BottomSheetModalProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<GorhomBottomSheetModal | null>(null);
  const presentedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      presentedRef.current = true;
      sheetRef.current?.present();
    } else if (presentedRef.current) {
      presentedRef.current = false;
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    if (presentedRef.current) {
      presentedRef.current = false;
      onClose();
    }
  }, [onClose]);

  const renderBackdrop = useCallback(
    (backdropProps: BottomSheetBackdropProps) => (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <BottomSheetBackdrop
          {...backdropProps}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.closeBackdrop')}
          style={[styles.backdropTap, { backgroundColor: tokens.colors.scrim }]}
          onPress={onClose}
        />
      </View>
    ),
    [onClose, t, tokens.colors.scrim],
  );

  if (!visible) {
    return null;
  }

  const useDynamicSizing = !snapPoints || snapPoints.length === 0;

  return (
    <GorhomBottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      enableDynamicSizing={useDynamicSizing}
      enablePanDownToClose={enablePanDownToClose}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={[styles.handle, { backgroundColor: tokens.colors.border }]}
      backgroundStyle={{
        backgroundColor: tokens.colors.surface,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
      }}
    >
      <BottomSheetView
        style={[
          styles.sheet,
          {
            paddingHorizontal: tokens.spacing.lg,
            paddingTop: tokens.spacing.sm,
            paddingBottom: insets.bottom + tokens.spacing.xl,
            gap: tokens.spacing.md,
          },
        ]}
      >
        {title ? <AppText variant="titleMd">{title}</AppText> : null}
        {children}
      </BottomSheetView>
    </GorhomBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  backdropTap: {
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
