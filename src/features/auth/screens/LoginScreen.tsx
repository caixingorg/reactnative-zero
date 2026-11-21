import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type { LoginResult } from '@/core/network/types';
import { useAppRuntime } from '@/core/runtime';
import { AppText, Box, Button, Screen, TextField, VStack, type TextFieldHandle } from '@/core/ui';

interface LoginFormValues {
  username: string;
  password: string;
}

export function LoginScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { identity, httpClient, authSessionStore } = useAppRuntime();
  const passwordInputRef = useRef<TextFieldHandle>(null);
  const [serverError, setServerError] = useState<string | null>(null);

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

  return (
    <Screen scrollable>
      <VStack flex={1} justify="center" gap="lg" py="xl">
        <VStack gap="xs">
          <AppText variant="caption" tone="brand" weight="600">
            {identity.displayName}
          </AppText>
          <AppText variant="titleLg">{t('auth.title')}</AppText>
          <AppText variant="bodySm" tone="secondary">
            {t('auth.subtitle')}
          </AppText>
        </VStack>

        <VStack p="lg" gap="md" bg="surface" radius="lg" bordered>
          {serverError ? (
            <Box p="md" bg="surfaceMuted" radius="md" bordered>
              <AppText variant="bodySm" tone="danger">
                {serverError}
              </AppText>
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

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                ref={passwordInputRef}
                label={t('auth.passwordLabel')}
                placeholder={t('auth.passwordPlaceholder')}
                secureTextEntry
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

          <Button
            label={t('auth.submitButton')}
            loading={isSubmitting}
            onPress={() => {
              void onSubmit();
            }}
          />
        </VStack>
      </VStack>
    </Screen>
  );
}
