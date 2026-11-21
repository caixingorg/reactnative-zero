/**
 * @module core/ui/DatePickerField
 * 职责：零额外原生依赖的通用日期选择表单项，复用 BottomSheetModal 提供年/月/日三列滚动选择，天然适配 react-hook-form 受控模式。
 * 边界：仅处理 YYYY-MM-DD 本地日期字符串，不绑定具体业务含义。
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
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
import { Button } from './Button';
import { HStack, VStack } from './Stack';

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

function parseDateYmd(
  raw: string | null | undefined,
  fallbackYear: number,
): { year: number; month: number; day: number } {
  if (raw) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
    if (match) {
      const year = Number(match[1]);
      const month = Math.min(12, Math.max(1, Number(match[2])));
      const maxDay = getDaysInMonth(year, month);
      const day = Math.min(maxDay, Math.max(1, Number(match[3])));
      return { year, month, day };
    }
  }
  return { year: fallbackYear, month: 1, day: 1 };
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
  const initial = parseDateYmd(value, defaultYear);
  const [draftYear, setDraftYear] = useState(initial.year);
  const [draftMonth, setDraftMonth] = useState(initial.month);
  const [draftDay, setDraftDay] = useState(initial.day);

  const years = useMemo(
    () => Array.from({ length: Math.max(1, maxYear - minYear + 1) }, (_, idx) => maxYear - idx),
    [maxYear, minYear],
  );
  const months = useMemo(() => Array.from({ length: 12 }, (_, idx) => idx + 1), []);
  const maxDay = getDaysInMonth(draftYear, draftMonth);
  const safeDraftDay = Math.min(draftDay, maxDay);
  const days = useMemo(() => Array.from({ length: maxDay }, (_, idx) => idx + 1), [maxDay]);

  const handleOpen = (): void => {
    const parsed = parseDateYmd(value, defaultYear);
    setDraftYear(parsed.year);
    setDraftMonth(parsed.month);
    setDraftDay(parsed.day);
    setOpen(true);
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

          <HStack gap="sm" style={styles.columns}>
            <ScrollView style={styles.column} showsVerticalScrollIndicator={false}>
              {years.map((y) => {
                const selected = y === draftYear;
                return (
                  <Pressable
                    key={y}
                    testID={testID ? `${testID}-year-${y}` : undefined}
                    onPress={() => setDraftYear(y)}
                    style={[
                      styles.option,
                      {
                        backgroundColor: selected ? tokens.colors.primarySoft : 'transparent',
                        borderRadius: tokens.radii.sm,
                      },
                    ]}
                  >
                    <AppText
                      variant="bodySm"
                      tone={selected ? 'brand' : 'primary'}
                      weight={selected ? '700' : '400'}
                    >
                      {y}年
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>

            <ScrollView style={styles.column} showsVerticalScrollIndicator={false}>
              {months.map((m) => {
                const selected = m === draftMonth;
                return (
                  <Pressable
                    key={m}
                    testID={testID ? `${testID}-month-${m}` : undefined}
                    onPress={() => setDraftMonth(m)}
                    style={[
                      styles.option,
                      {
                        backgroundColor: selected ? tokens.colors.primarySoft : 'transparent',
                        borderRadius: tokens.radii.sm,
                      },
                    ]}
                  >
                    <AppText
                      variant="bodySm"
                      tone={selected ? 'brand' : 'primary'}
                      weight={selected ? '700' : '400'}
                    >
                      {String(m).padStart(2, '0')}月
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>

            <ScrollView style={styles.column} showsVerticalScrollIndicator={false}>
              {days.map((d) => {
                const selected = d === safeDraftDay;
                return (
                  <Pressable
                    key={d}
                    testID={testID ? `${testID}-day-${d}` : undefined}
                    onPress={() => setDraftDay(d)}
                    style={[
                      styles.option,
                      {
                        backgroundColor: selected ? tokens.colors.primarySoft : 'transparent',
                        borderRadius: tokens.radii.sm,
                      },
                    ]}
                  >
                    <AppText
                      variant="bodySm"
                      tone={selected ? 'brand' : 'primary'}
                      weight={selected ? '700' : '400'}
                    >
                      {String(d).padStart(2, '0')}日
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </HStack>

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
  columns: {
    height: 220,
  },
  column: {
    flex: 1,
  },
  option: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
