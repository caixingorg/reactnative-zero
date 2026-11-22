import Ionicons from '@expo/vector-icons/Ionicons';
import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { z } from 'zod';
import type { LoginResult } from '@/core/network/types';
import { useAppRuntime, usePrivacyGate } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppText, Button, HStack, Screen, VStack } from '@/core/ui';

interface LoginFormValues {
  username: string;
  password: string;
}

export interface LoginScreenProps {
  onOpenRegister?: () => void;
  onOpenPrivacyPolicy?: () => void;
  onOpenUserAgreement?: () => void;
}

export function LoginScreen({
  onOpenRegister,
  onOpenPrivacyPolicy,
  onOpenUserAgreement,
}: LoginScreenProps = {}): React.JSX.Element {
  const { t } = useTranslation();
  const { identity, env, httpClient, authSessionStore, privacyGateStore } = useAppRuntime();
  const isPrivacyAccepted = usePrivacyGate((state) => state.phase === 'ready');
  const { tokens } = useAppTheme();
  const passwordInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focusedField, setFocusedField] = useState<'username' | 'password' | null>(null);
  const [consentChecked, setConsentChecked] = useState(isPrivacyAccepted);

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

  const requireConsent = identity.compliance.requirePrivacyConsent;
  const effectiveConsent = !requireConsent || consentChecked || isPrivacyAccepted;

  const handleToggleConsent = (): void => {
    const next = !effectiveConsent;
    setConsentChecked(next);
    if (next) {
      setServerError(null);
      if (privacyGateStore.getState().phase !== 'ready') {
        privacyGateStore.getState().acceptPrivacyPolicy();
      }
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    if (!effectiveConsent) {
      setServerError('请先阅读并勾选同意《用户协议》与《隐私政策》');
      return;
    }
    if (privacyGateStore.getState().phase !== 'ready') {
      privacyGateStore.getState().acceptPrivacyPolicy();
    }
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
    <Screen scrollable backgroundColor={tokens.colors.surface}>
      <VStack flex={1} justify="space-between" style={styles.root}>
        <VStack gap="xl" style={styles.main}>
          {/* 极简品牌头：无卡片、无杂乱徽章，靠大字号与留白建立原生质感 */}
          <VStack gap="sm" style={styles.header}>
            <View style={[styles.brandBar, { backgroundColor: tokens.colors.primary }]} />
            <AppText variant="caption" tone="secondary" weight="600" style={styles.kicker}>
              {identity.displayName}
            </AppText>
            <AppText variant="titleLg" style={styles.headline}>
              {t('auth.title')}
            </AppText>
            <AppText variant="bodySm" tone="secondary">
              欢迎回来，请输入账号密码继续使用
            </AppText>
          </VStack>

          {/* 无外框卡片的原生填充输入框组 */}
          <VStack gap="md">
            {serverError ? (
              <HStack
                align="center"
                gap="xs"
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: tokens.colors.primarySoft,
                    borderRadius: tokens.radii.md,
                  },
                ]}
              >
                <Ionicons name="alert-circle-outline" size={16} color={tokens.colors.danger} />
                <AppText variant="bodySm" tone="danger" style={styles.flex}>
                  {serverError}
                </AppText>
              </HStack>
            ) : null}

            <Controller
              control={control}
              name="username"
              render={({ field: { onChange, onBlur, value } }) => (
                <VStack gap="xs">
                  <View
                    style={[
                      styles.fieldRow,
                      {
                        backgroundColor: tokens.colors.surfaceMuted,
                        borderColor: errors.username
                          ? tokens.colors.danger
                          : focusedField === 'username'
                            ? tokens.colors.primary
                            : 'transparent',
                      },
                    ]}
                  >
                    <Ionicons
                      name="person-outline"
                      size={19}
                      color={
                        focusedField === 'username'
                          ? tokens.colors.primary
                          : tokens.colors.textSecondary
                      }
                    />
                    <TextInput
                      accessibilityLabel={t('auth.usernameLabel')}
                      placeholder={t('auth.usernamePlaceholder')}
                      placeholderTextColor={tokens.colors.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                      value={value}
                      onFocus={() => setFocusedField('username')}
                      onBlur={() => {
                        setFocusedField((cur) => (cur === 'username' ? null : cur));
                        onBlur();
                      }}
                      onChangeText={onChange}
                      onSubmitEditing={() => passwordInputRef.current?.focus()}
                      style={[styles.input, { color: tokens.colors.textPrimary }]}
                    />
                  </View>
                  {errors.username?.message ? (
                    <AppText variant="caption" tone="danger" style={styles.fieldError}>
                      {errors.username.message}
                    </AppText>
                  ) : null}
                </VStack>
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <VStack gap="xs">
                  <View
                    style={[
                      styles.fieldRow,
                      {
                        backgroundColor: tokens.colors.surfaceMuted,
                        borderColor: errors.password
                          ? tokens.colors.danger
                          : focusedField === 'password'
                            ? tokens.colors.primary
                            : 'transparent',
                      },
                    ]}
                  >
                    <Ionicons
                      name="lock-closed-outline"
                      size={19}
                      color={
                        focusedField === 'password'
                          ? tokens.colors.primary
                          : tokens.colors.textSecondary
                      }
                    />
                    <TextInput
                      ref={passwordInputRef}
                      accessibilityLabel={t('auth.passwordLabel')}
                      placeholder={t('auth.passwordPlaceholder')}
                      placeholderTextColor={tokens.colors.textSecondary}
                      secureTextEntry={!passwordVisible}
                      autoCapitalize="none"
                      returnKeyType="done"
                      value={value}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => {
                        setFocusedField((cur) => (cur === 'password' ? null : cur));
                        onBlur();
                      }}
                      onChangeText={onChange}
                      onSubmitEditing={() => {
                        void onSubmit();
                      }}
                      style={[styles.input, { color: tokens.colors.textPrimary }]}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={passwordVisible ? '隐藏密码' : '显示密码'}
                      onPress={() => setPasswordVisible((prev) => !prev)}
                      hitSlop={10}
                      style={styles.eyeButton}
                    >
                      <Ionicons
                        name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                        size={19}
                        color={tokens.colors.textSecondary}
                      />
                    </Pressable>
                  </View>
                  {errors.password?.message ? (
                    <AppText variant="caption" tone="danger" style={styles.fieldError}>
                      {errors.password.message}
                    </AppText>
                  ) : null}
                </VStack>
              )}
            />

            <View style={styles.submitWrap}>
              <Button
                label={t('auth.submitButton')}
                loading={isSubmitting}
                onPress={() => {
                  void onSubmit();
                }}
              />
            </View>

            {/* 轻量级辅助操作行：去除厚重灰底胶囊，左右自然对齐 */}
            <HStack justify="space-between" align="center" style={styles.auxRow}>
              {env.appVariant !== 'production' ? (
                <Pressable
                  testID="login-demo-autofill"
                  accessibilityRole="button"
                  onPress={handleFillDemoAccount}
                  hitSlop={8}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <AppText variant="caption" tone="secondary" weight="600">
                    填入测试账号
                  </AppText>
                </Pressable>
              ) : (
                <View />
              )}

              {onOpenRegister ? (
                <Pressable
                  testID="login-open-register"
                  accessibilityRole="button"
                  onPress={onOpenRegister}
                  hitSlop={8}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <AppText variant="caption" tone="brand" weight="700">
                    注册新账号 →
                  </AppText>
                </Pressable>
              ) : null}
            </HStack>
          </VStack>
        </VStack>

        <HStack align="center" justify="center" gap="xs" style={styles.footerNote}>
          <Pressable
            testID="login-privacy-checkbox"
            accessibilityRole="checkbox"
            accessibilityLabel="同意用户协议与隐私政策"
            accessibilityState={{ checked: effectiveConsent }}
            onPress={handleToggleConsent}
            hitSlop={10}
            style={styles.checkboxHit}
          >
            <Ionicons
              name={effectiveConsent ? 'checkbox' : 'square-outline'}
              size={18}
              color={effectiveConsent ? tokens.colors.primary : tokens.colors.textSecondary}
            />
          </Pressable>
          <AppText variant="caption" tone="secondary" style={styles.consentText}>
            我已阅读并同意{' '}
            <AppText
              variant="caption"
              tone="brand"
              weight="600"
              onPress={onOpenUserAgreement ?? onOpenPrivacyPolicy}
            >
              《用户协议》
            </AppText>{' '}
            和{' '}
            <AppText variant="caption" tone="brand" weight="600" onPress={onOpenPrivacyPolicy}>
              《隐私政策》
            </AppText>
          </AppText>
        </HStack>
      </VStack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 8,
  },
  main: {
    gap: 32,
  },
  flex: {
    flex: 1,
  },
  header: {
    gap: 6,
  },
  brandBar: {
    width: 28,
    height: 4,
    borderRadius: 99,
    marginBottom: 8,
  },
  kicker: {
    letterSpacing: 0.5,
  },
  headline: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
  },
  errorBanner: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  fieldRow: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
  },
  eyeButton: {
    padding: 4,
  },
  fieldError: {
    paddingHorizontal: 4,
  },
  submitWrap: {
    marginTop: 8,
  },
  auxRow: {
    paddingHorizontal: 2,
    marginTop: 2,
  },
  footerNote: {
    marginTop: 40,
  },
  checkboxHit: {
    padding: 2,
  },
  consentText: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.65,
  },
});
