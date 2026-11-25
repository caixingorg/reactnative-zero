import Ionicons from '@expo/vector-icons/Ionicons';
import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { z } from 'zod';
import type { LoginResult } from '@/core/network/types';
import { useAppRuntime, usePrivacyGate, useToast } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppText, BottomSheetModal, Button, HStack, Screen, TextField, VStack } from '@/core/ui';
import { getDemoLoginCredentials } from '../demo-credentials';

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
  const toast = useToast();
  const { tokens } = useAppTheme();
  const passwordInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focusedField, setFocusedField] = useState<'username' | 'password' | null>(null);
  const [consentChecked, setConsentChecked] = useState(isPrivacyAccepted);
  const [resetVisible, setResetVisible] = useState(false);
  const [resetUsername, setResetUsername] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);

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
  const effectiveConsent = !requireConsent || consentChecked;

  // 原因：勾选框只切换本地意图，允许用户在点登录前自由勾选或取消；真正点击登录时再落盘隐私同意
  const handleToggleConsent = (): void => {
    setConsentChecked((prev) => {
      const next = !prev;
      if (next) {
        setServerError(null);
      }
      return next;
    });
  };

  const onSubmit = handleSubmit(async (values) => {
    if (!effectiveConsent) {
      setServerError(t('auth.consentRequiredError'));
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

  const demoCredentials = getDemoLoginCredentials();

  const handleFillTestAccount = (): void => {
    if (!demoCredentials) {
      return;
    }
    setValue('username', demoCredentials.username, { shouldValidate: true });
    setValue('password', demoCredentials.password, { shouldValidate: true });
  };

  const handleResetPassword = async (): Promise<void> => {
    const cleanUser = resetUsername.trim();
    const cleanPass = resetNewPassword.trim();
    if (cleanUser.length < 3) {
      setResetError(t('auth.usernameMinError'));
      return;
    }
    if (cleanPass.length < 6) {
      setResetError(t('auth.resetNewPasswordMinError'));
      return;
    }
    setResetError(null);
    setResetSubmitting(true);
    try {
      await httpClient.post(
        '/auth/reset-password',
        { username: cleanUser, newPassword: cleanPass },
        { skipAuth: true },
      );
      setResetVisible(false);
      setResetNewPassword('');
      setValue('username', cleanUser, { shouldValidate: true });
      toast.show({ message: t('auth.resetSuccess'), tone: 'success' });
    } catch (err) {
      setResetError(err instanceof Error ? err.message : t('auth.resetFailed'));
    } finally {
      setResetSubmitting(false);
    }
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
              {t('auth.welcomeSubtitle')}
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
                      accessibilityLabel={
                        passwordVisible ? t('auth.hidePassword') : t('auth.showPassword')
                      }
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
              <HStack gap="md" align="center">
                {env.appVariant !== 'production' && demoCredentials !== null ? (
                  <Pressable
                    testID="login-test-autofill"
                    accessibilityRole="button"
                    onPress={handleFillTestAccount}
                    hitSlop={8}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <AppText variant="caption" tone="secondary" weight="600">
                      {t('auth.fillTestAccount')}
                    </AppText>
                  </Pressable>
                ) : null}
                <Pressable
                  testID="login-forgot-password"
                  accessibilityRole="button"
                  onPress={() => {
                    setResetError(null);
                    setResetVisible(true);
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <AppText variant="caption" tone="secondary" weight="600">
                    {t('auth.forgotPassword')}
                  </AppText>
                </Pressable>
              </HStack>

              {onOpenRegister ? (
                <Pressable
                  testID="login-open-register"
                  accessibilityRole="button"
                  onPress={onOpenRegister}
                  hitSlop={8}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <AppText variant="caption" tone="brand" weight="700">
                    {t('auth.registerLink')}
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
            accessibilityLabel={t('auth.consentCheckboxLabel')}
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
            {t('auth.consentPrefix')}{' '}
            <AppText
              variant="caption"
              tone="brand"
              weight="600"
              onPress={onOpenUserAgreement ?? onOpenPrivacyPolicy}
            >
              {t('auth.userAgreementBook')}
            </AppText>{' '}
            {t('auth.consentAnd')}{' '}
            <AppText variant="caption" tone="brand" weight="600" onPress={onOpenPrivacyPolicy}>
              {t('auth.privacyPolicyBook')}
            </AppText>
          </AppText>
        </HStack>
      </VStack>

      <BottomSheetModal
        visible={resetVisible}
        title={t('auth.resetTitle')}
        onClose={() => setResetVisible(false)}
      >
        <VStack gap="md">
          {resetError ? (
            <AppText variant="caption" tone="danger">
              {resetError}
            </AppText>
          ) : null}
          <TextField
            testID="reset-username-input"
            label={t('auth.usernameLabel')}
            placeholder={t('auth.resetUsernamePlaceholder')}
            autoCapitalize="none"
            value={resetUsername}
            onChangeText={setResetUsername}
          />
          <TextField
            testID="reset-password-input"
            label={t('auth.resetNewPasswordLabel')}
            placeholder={t('auth.resetNewPasswordPlaceholder')}
            secureTextEntry
            value={resetNewPassword}
            onChangeText={setResetNewPassword}
          />
          <Button
            testID="reset-password-submit"
            label={t('auth.resetSubmitButton')}
            loading={resetSubmitting}
            onPress={() => {
              void handleResetPassword();
            }}
          />
        </VStack>
      </BottomSheetModal>
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
