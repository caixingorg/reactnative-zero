import Ionicons from '@expo/vector-icons/Ionicons';
import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import type { LoginResult } from '@/core/network/types';
import { useAppRuntime } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import {
  AppText,
  Box,
  Button,
  HStack,
  Screen,
  TextField,
  VStack,
  type TextFieldHandle,
} from '@/core/ui';

interface LoginFormValues {
  username: string;
  password: string;
}

export interface LoginScreenProps {
  onOpenRegister?: () => void;
}

export function LoginScreen({ onOpenRegister }: LoginScreenProps = {}): React.JSX.Element {
  const { t } = useTranslation();
  const { identity, env, httpClient, authSessionStore } = useAppRuntime();
  const { tokens } = useAppTheme();
  const passwordInputRef = useRef<TextFieldHandle>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const loginSchema = useMemo(
    () =>
      z.object({
        username: z.string().trim().min(3, t('auth.usernameMinError')),
        password: z.string().min(6, t('auth.passwordMinError')),
      }),
    [t],
  );

  // 原因：开启 mode: 'onChange' 提供输入期即时格式校验反馈，无需等到首次点击提交才提示格式不合法
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await httpClient.post<LoginResult>('/auth/login', values, {
        skipAuth: true,
      });
      await authSessionStore.getState().establishSession(result);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : String(err));
    }
  });

  const handleFillDemoAccount = (): void => {
    setValue('username', 'admin', { shouldValidate: true });
    setValue('password', 'password123', { shouldValidate: true });
  };

  return (
    <Screen scrollable>
      <VStack flex={1} justify="center" gap="xl" style={styles.root}>
        {/* Editorial Brand Header */}
        <VStack gap="md" style={styles.brandHeader}>
          <HStack align="center" gap="sm">
            <View
              style={[
                styles.brandEmblem,
                { backgroundColor: tokens.colors.primary, borderRadius: tokens.radii.lg },
              ]}
            >
              <Ionicons name="sparkles" size={24} color="#FFFFFF" />
            </View>
            <View
              style={[
                styles.identityPill,
                { backgroundColor: tokens.colors.primarySoft, borderRadius: tokens.radii.full },
              ]}
            >
              <AppText variant="caption" tone="brand" weight="700">
                {identity.displayName}
              </AppText>
            </View>
          </HStack>

          <VStack gap="xs">
            <AppText variant="titleLg" style={styles.headline}>
              {t('auth.title')}
            </AppText>
            <AppText variant="bodySm" tone="secondary">
              {t('auth.subtitle')}
            </AppText>
          </VStack>
        </VStack>

        {/* Clean Borderless Form Card */}
        <VStack
          gap="md"
          style={[
            styles.formCard,
            {
              backgroundColor: tokens.colors.surface,
              borderRadius: 22,
              borderColor: tokens.isDark ? tokens.colors.border : 'transparent',
              borderWidth: tokens.isDark ? StyleSheet.hairlineWidth : 0,
            },
          ]}
        >
          {serverError ? (
            <Box p="md" bg="surfaceMuted" radius="md">
              <HStack align="center" gap="xs">
                <Ionicons name="alert-circle-outline" size={16} color={tokens.colors.danger} />
                <AppText variant="bodySm" tone="danger" style={styles.flex}>
                  {serverError}
                </AppText>
              </HStack>
            </Box>
          ) : null}

          <Controller
            control={control}
            name="username"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label={t('auth.usernameLabel')}
                placeholder={t('auth.usernamePlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                errorMessage={errors.username?.message}
              />
            )}
          />

          <View style={styles.passwordWrap}>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  ref={passwordInputRef}
                  label={t('auth.passwordLabel')}
                  placeholder={t('auth.passwordPlaceholder')}
                  secureTextEntry={!passwordVisible}
                  autoCapitalize="none"
                  returnKeyType="done"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  onSubmitEditing={() => {
                    void onSubmit();
                  }}
                  errorMessage={errors.password?.message}
                />
              )}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={passwordVisible ? '隐藏密码' : '显示密码'}
              onPress={() => setPasswordVisible((prev) => !prev)}
              hitSlop={8}
              style={styles.eyeButton}
            >
              <Ionicons
                name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                size={19}
                color={tokens.colors.textSecondary}
              />
            </Pressable>
          </View>

          <View style={styles.submitWrap}>
            <Button
              label={t('auth.submitButton')}
              loading={isSubmitting}
              onPress={() => {
                void onSubmit();
              }}
            />
          </View>

          {env.appVariant !== 'production' ? (
            <Pressable
              testID="login-demo-autofill"
              accessibilityRole="button"
              onPress={handleFillDemoAccount}
              style={({ pressed }) => [
                styles.demoFillPill,
                { backgroundColor: tokens.colors.surfaceMuted, borderRadius: tokens.radii.md },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="flash-outline" size={15} color={tokens.colors.primary} />
              <AppText variant="caption" tone="secondary" weight="600">
                一键填入演示账号（admin / password123）
              </AppText>
            </Pressable>
          ) : null}
        </VStack>

        {/* Registration Form Demo Entry */}
        {onOpenRegister ? (
          <HStack justify="center" align="center" gap="xs">
            <AppText variant="bodySm" tone="secondary">
              还没有账号？
            </AppText>
            <Pressable
              testID="login-open-register"
              accessibilityRole="button"
              onPress={onOpenRegister}
              hitSlop={8}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <AppText variant="bodySm" tone="brand" weight="700">
                去注册用户资料 →
              </AppText>
            </Pressable>
          </HStack>
        ) : null}
      </VStack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingVertical: 28,
  },
  flex: {
    flex: 1,
  },
  brandHeader: {
    paddingHorizontal: 4,
  },
  brandEmblem: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  headline: {
    fontSize: 28,
    lineHeight: 36,
  },
  formCard: {
    padding: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  passwordWrap: {
    position: 'relative',
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: 34,
    padding: 4,
  },
  submitWrap: {
    marginTop: 6,
  },
  demoFillPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  pressed: {
    opacity: 0.72,
  },
});
