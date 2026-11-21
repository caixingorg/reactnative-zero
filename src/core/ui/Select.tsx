import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from './AppText';
import { BottomSheetModal } from './BottomSheetModal';

export interface SelectOption<T extends string = string> {
  label: string;
  value: T;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  label?: string;
  placeholder?: string;
  modalTitle?: string;
  options: readonly SelectOption<T>[];
  value?: T | null;
  onChange: (nextValue: T) => void;
  error?: string;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

// 原因：复用内核 BottomSheetModal 承载单选列表，零新增原生弹窗依赖且天然兼容 react-hook-form 受控模式
export function Select<T extends string = string>({
  label,
  placeholder,
  modalTitle,
  options,
  value,
  onChange,
  error,
  disabled = false,
  testID,
  style,
}: SelectProps<T>): React.JSX.Element {
  const { t } = useTranslation();
  const { tokens } = useAppTheme();
  const [open, setOpen] = useState(false);

  const selectedOption = useMemo(
    () => options.find((item) => item.value === value),
    [options, value],
  );
  const resolvedPlaceholder = placeholder ?? t('common.selectPlaceholder');

  function handleSelect(option: SelectOption<T>): void {
    if (option.disabled) {
      return;
    }
    onChange(option.value);
    setOpen(false);
  }

  return (
    <View style={[styles.container, { gap: tokens.spacing.xs }, style]}>
      {label ? (
        <AppText variant="bodySm" weight="600" tone="secondary">
          {label}
        </AppText>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? resolvedPlaceholder}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        testID={testID}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: tokens.colors.surface,
            borderColor: error ? tokens.colors.danger : tokens.colors.border,
            borderRadius: tokens.radii.md,
            paddingHorizontal: tokens.spacing.md,
            paddingVertical: tokens.spacing.sm + 2,
            opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <AppText
          variant="bodyMd"
          tone={selectedOption ? 'primary' : 'secondary'}
          numberOfLines={1}
          style={styles.triggerText}
        >
          {selectedOption ? selectedOption.label : resolvedPlaceholder}
        </AppText>
        <AppText variant="caption" tone="secondary">
          ▾
        </AppText>
      </Pressable>

      {error ? (
        <AppText variant="caption" tone="danger">
          {error}
        </AppText>
      ) : null}

      <BottomSheetModal
        visible={open}
        title={modalTitle ?? label ?? resolvedPlaceholder}
        onClose={() => setOpen(false)}
      >
        <ScrollView
          style={styles.optionList}
          contentContainerStyle={{ gap: tokens.spacing.xs }}
          bounces={false}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled: Boolean(option.disabled) }}
                disabled={option.disabled}
                onPress={() => handleSelect(option)}
                style={({ pressed }) => [
                  styles.optionRow,
                  {
                    backgroundColor: isSelected
                      ? tokens.colors.primarySoft
                      : pressed
                        ? tokens.colors.surfaceMuted
                        : 'transparent',
                    borderRadius: tokens.radii.md,
                    paddingHorizontal: tokens.spacing.md,
                    paddingVertical: tokens.spacing.sm + 2,
                    opacity: option.disabled ? 0.45 : 1,
                  },
                ]}
              >
                <View style={styles.optionTextGroup}>
                  <AppText
                    variant="bodyMd"
                    weight={isSelected ? '700' : '500'}
                    tone={isSelected ? 'brand' : 'primary'}
                  >
                    {option.label}
                  </AppText>
                  {option.description ? (
                    <AppText variant="caption" tone="secondary">
                      {option.description}
                    </AppText>
                  ) : null}
                </View>
                {isSelected ? (
                  <AppText variant="bodyMd" weight="700" tone="brand">
                    ✓
                  </AppText>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  trigger: {
    minHeight: 46,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerText: {
    flex: 1,
  },
  optionList: {
    maxHeight: 320,
  },
  optionRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionTextGroup: {
    flex: 1,
    gap: 2,
  },
});
