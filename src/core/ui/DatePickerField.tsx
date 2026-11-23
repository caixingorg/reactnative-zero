/**
 * @module core/ui/DatePickerField
 * 职责：基于 `@react-native-community/datetimepicker` 与 `BottomSheetModal` 的通用日期选择表单项，调用系统原生日期选择器并保持 `YYYY-MM-DD` 受控字符串契约（天然适配 react-hook-form）。
 * 边界：仅处理 `YYYY-MM-DD` 本地日期字符串，将第三方原生控件封装在 `src/core/ui` 内部。
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from './AppText';
import { BottomSheetModal } from './BottomSheetModal';
import { Button } from './Button';
import { VStack } from './Stack';

export interface DatePickerFieldProps {
  label?: string;
  placeholder?: string;
  modalTitle?: string;
  /** YYYY-MM-DD 格式日期字符串。 */
  value?: string | null;
  onChange: (nextDate: string) => void;
  minYear?: number;
  maxYear?: number;
  error?: string;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function formatDateYmd(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function parseDateYmd(
  raw: string | null | undefined,
  fallbackYear: number,
  minYear?: number,
  maxYear?: number,
): { year: number; month: number; day: number } {
  const clampYear = (y: number): number => {
    const lower = minYear !== undefined ? Math.max(minYear, y) : y;
    return maxYear !== undefined ? Math.min(maxYear, lower) : lower;
  };
  if (raw) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
    if (match) {
      const year = clampYear(Number(match[1]));
      const month = Math.min(12, Math.max(1, Number(match[2])));
      const maxDay = getDaysInMonth(year, month);
      const day = Math.min(maxDay, Math.max(1, Number(match[3])));
      return { year, month, day };
    }
  }
  return { year: clampYear(fallbackYear), month: 1, day: 1 };
}

// 原因：固定使用本地正午 12:00 构造 Date 对象，避免夏令时或时区偏移在跨午夜边界时造成日期回退一天
function toLocalNoonDate(year: number, month: number, day: number): Date {
  const safeDay = Math.min(day, getDaysInMonth(year, month));
  return new Date(year, month - 1, safeDay, 12, 0, 0, 0);
}

export function DatePickerField({
  label,
  placeholder = '请选择日期',
  modalTitle,
  value,
  onChange,
  minYear = 1960,
  maxYear = 2026,
  error,
  disabled = false,
  testID,
  style,
}: DatePickerFieldProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const [open, setOpen] = useState(false);

  const defaultYear = Math.min(maxYear, Math.max(minYear, 1996));
  const initial = parseDateYmd(value, defaultYear, minYear, maxYear);
  const [draftYear, setDraftYear] = useState(initial.year);
  const [draftMonth, setDraftMonth] = useState(initial.month);
  const [draftDay, setDraftDay] = useState(initial.day);

  const maxDay = getDaysInMonth(draftYear, draftMonth);
  const safeDraftDay = Math.min(draftDay, maxDay);

  const draftDate = useMemo(
    () => toLocalNoonDate(draftYear, draftMonth, safeDraftDay),
    [draftYear, draftMonth, safeDraftDay],
  );
  const minimumDate = useMemo(() => toLocalNoonDate(minYear, 1, 1), [minYear]);
  const maximumDate = useMemo(() => toLocalNoonDate(maxYear, 12, 31), [maxYear]);

  const handleOpen = (): void => {
    const parsed = parseDateYmd(value, defaultYear, minYear, maxYear);
    setDraftYear(parsed.year);
    setDraftMonth(parsed.month);
    setDraftDay(parsed.day);
    setOpen(true);
  };

  const handleNativeChange = (event: DateTimePickerEvent, selectedDate?: Date): void => {
    if (event.type === 'dismissed' || !selectedDate || Number.isNaN(selectedDate.getTime())) {
      return;
    }
    const nextYear = Math.min(maxYear, Math.max(minYear, selectedDate.getFullYear()));
    const nextMonth = Math.min(12, Math.max(1, selectedDate.getMonth() + 1));
    const nextMaxDay = getDaysInMonth(nextYear, nextMonth);
    const nextDay = Math.min(nextMaxDay, Math.max(1, selectedDate.getDate()));
    setDraftYear(nextYear);
    setDraftMonth(nextMonth);
    setDraftDay(nextDay);
  };

  const handleConfirm = (): void => {
    onChange(formatDateYmd(draftYear, draftMonth, safeDraftDay));
    setOpen(false);
  };

  return (
    <View style={[styles.container, { gap: tokens.spacing.xs }, style]}>
      {label ? (
        <AppText variant="bodySm" weight="600" tone="secondary">
          {label}
        </AppText>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        testID={testID}
        onPress={handleOpen}
        style={[
          styles.trigger,
          {
            backgroundColor: disabled ? tokens.colors.surfaceMuted : tokens.colors.surface,
            borderColor: error ? tokens.colors.danger : tokens.colors.border,
            borderRadius: tokens.radii.md,
            paddingHorizontal: tokens.spacing.md,
          },
        ]}
      >
        <AppText
          variant="bodyMd"
          tone={value ? 'primary' : 'secondary'}
          numberOfLines={1}
          style={styles.flex}
        >
          {value || placeholder}
        </AppText>
        <Ionicons name="calendar-outline" size={18} color={tokens.colors.textSecondary} />
      </Pressable>

      {error ? (
        <AppText variant="caption" tone="danger">
          {error}
        </AppText>
      ) : null}

      <BottomSheetModal
        visible={open}
        title={modalTitle ?? label ?? '选择日期'}
        onClose={() => setOpen(false)}
      >
        <VStack gap="md">
          <AppText variant="bodySm" tone="brand" weight="700" align="center">
            {formatDateYmd(draftYear, draftMonth, safeDraftDay)}
          </AppText>

          <DateTimePicker
            testID={testID ? `${testID}-native` : 'date-picker-native'}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            value={draftDate}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={handleNativeChange}
          />

          <Button
            label="确定"
            testID={testID ? `${testID}-confirm` : undefined}
            onPress={handleConfirm}
          />
        </VStack>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  flex: {
    flex: 1,
  },
  trigger: {
    minHeight: 44,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
