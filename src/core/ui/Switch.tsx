import React from 'react';
import {
  Platform,
  Pressable,
  Switch as RnSwitch,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from './AppText';

export interface SwitchProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (nextValue: boolean) => void;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

// 原因：统一封装受控语义开关与整行可点击热区，确保双端轨道色跟随品牌 Token 且满足无障碍要求
export function Switch({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  testID,
  style,
}: SwitchProps): React.JSX.Element {
  const { tokens } = useAppTheme();

  function handleToggle(): void {
    if (!disabled) {
      onValueChange(!value);
    }
  }

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={handleToggle}
      testID={testID}
      style={[
        styles.row,
        {
          opacity: disabled ? 0.5 : 1,
          gap: tokens.spacing.md,
        },
        style,
      ]}
    >
      <View style={[styles.textGroup, { gap: tokens.spacing.xs }]}>
        <AppText variant="bodyMd" weight="600">
          {label}
        </AppText>
        {description ? (
          <AppText variant="bodySm" tone="secondary">
            {description}
          </AppText>
        ) : null}
      </View>

      <RnSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{
          false: tokens.colors.border,
          true: tokens.colors.primary,
        }}
        thumbColor={
          Platform.OS === 'android'
            ? value
              ? tokens.colors.onPrimary
              : tokens.colors.surface
            : undefined
        }
        ios_backgroundColor={tokens.colors.border}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  textGroup: {
    flex: 1,
  },
});
