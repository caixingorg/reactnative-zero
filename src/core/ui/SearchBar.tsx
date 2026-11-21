/**
 * @module core/ui/SearchBar
 * 职责：通用搜索条，支持“点击跳转入口态（trigger）”与“实时输入提交态（input）”，内置清空按钮与搜索图标。
 * 边界：受控组件，不持有搜索历史或检索结果。
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from './AppText';
import { HStack } from './Stack';

export type SearchBarProps =
  | {
      mode: 'trigger';
      placeholder?: string;
      onPress: () => void;
      testID?: string;
    }
  | {
      mode: 'input';
      value: string;
      onChangeText: (text: string) => void;
      onSubmit?: (text: string) => void;
      placeholder?: string;
      autoFocus?: boolean;
      testID?: string;
    };

export function SearchBar(props: SearchBarProps): React.JSX.Element {
  const { tokens } = useAppTheme();

  if (props.mode === 'trigger') {
    return (
      <Pressable
        testID={props.testID ?? 'search-bar-trigger'}
        accessibilityRole="button"
        accessibilityLabel={props.placeholder ?? '搜索'}
        onPress={props.onPress}
        style={({ pressed }) => [
          styles.container,
          {
            backgroundColor: tokens.colors.surfaceMuted,
            borderRadius: tokens.radii.full,
          },
          pressed && styles.pressed,
        ]}
      >
        <HStack align="center" gap="sm">
          <Ionicons name="search-outline" size={18} color={tokens.colors.textSecondary} />
          <AppText variant="bodySm" tone="secondary" numberOfLines={1}>
            {props.placeholder ?? '搜索'}
          </AppText>
        </HStack>
      </Pressable>
    );
  }

  return (
    <HStack
      align="center"
      gap="sm"
      style={[
        styles.container,
        {
          backgroundColor: tokens.colors.surfaceMuted,
          borderRadius: tokens.radii.full,
        },
      ]}
    >
      <Ionicons name="search-outline" size={18} color={tokens.colors.textSecondary} />
      <TextInput
        testID={props.testID ?? 'search-bar-input'}
        value={props.value}
        onChangeText={props.onChangeText}
        onSubmitEditing={() => props.onSubmit?.(props.value)}
        placeholder={props.placeholder ?? '搜索'}
        placeholderTextColor={tokens.colors.textSecondary}
        returnKeyType="search"
        autoFocus={props.autoFocus}
        style={[styles.input, { color: tokens.colors.textPrimary }]}
      />
      {props.value.length > 0 ? (
        <Pressable
          testID="search-bar-clear"
          accessibilityRole="button"
          accessibilityLabel="清空搜索"
          onPress={() => props.onChangeText('')}
          hitSlop={8}
        >
          <Ionicons name="close-circle" size={18} color={tokens.colors.textSecondary} />
        </Pressable>
      ) : null}
    </HStack>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 38,
    paddingHorizontal: 12,
    justifyContent: 'center',
    flex: 1,
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 6,
  },
  pressed: {
    opacity: 0.75,
  },
});
