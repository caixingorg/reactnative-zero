import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { AppRuntimeProvider } from '@/core/runtime';
import {
  createMemoryKeyValueStorage,
  createMemorySecretStorage,
} from '@/core/storage/memory-storage';
import { createNativeKeyValueStorage } from '@/core/storage/native-storage';
import { buildDesignTokens } from '@/core/theme/tokens';
import { BottomSheetModal, Box, Button, EmptyState, Skeleton, TextField } from '@/core/ui';
import { SettingsScreen } from '@/features/settings';
import { appTranslationResources } from '@/shared';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

describe('Seam 1: Dual-tier storage isolation, Design Tokens, UI primitives, and Settings Starter Slice', () => {
  it('isolates hardware secret credentials from general key-value storage', async () => {
    const secretStorage = createMemorySecretStorage();
    const keyValueStorage = createMemoryKeyValueStorage();

    const runtime = createTestRuntime({
      identity: appIdentity,
      env: TEST_RUNTIME_ENV,
      overrides: {
        secretStorage,
        keyValueStorage,
      },
    });

    await runtime.secretStorage.setSecret('auth.access_token', 'jwt-secret-value');
    runtime.keyValueStorage.setString('ui.banner_dismissed', 'true');

    expect(runtime.keyValueStorage.getString('auth.access_token')).toBeUndefined();
    expect(await runtime.secretStorage.getSecret('ui.banner_dismissed')).toBeNull();
    expect(await runtime.secretStorage.getSecret('auth.access_token')).toBe('jwt-secret-value');

    runtime.keyValueStorage.clearAll();
    expect(runtime.keyValueStorage.getString('ui.banner_dismissed')).toBeUndefined();
    expect(await runtime.secretStorage.getSecret('auth.access_token')).toBe('jwt-secret-value');

    // Non-test mode must fail fast instead of silently degrading MMKV failure into memory storage
    expect(() =>
      createNativeKeyValueStorage('non-test-probe', { allowTestMemoryFallback: false }),
    ).toThrow(/Failed to initialize native MMKV storage/);

    // SecretStorage supports biometric authentication binding metadata & OTA coordinator defaults to disabled
    await secretStorage.setSecret('auth.biometric_unlock_key', 'bio-token-1', {
      requireAuthentication: true,
      authenticationPrompt: '请验证面容以读取密钥',
    });
    expect(secretStorage.requiresBiometricAuth('auth.biometric_unlock_key')).toBe(true);
    expect(runtime.otaCoordinator.enabled).toBe(false);
    expect(await runtime.otaCoordinator.checkForUpdate()).toEqual({
      enabled: false,
      updateAvailable: false,
    });
  });

  it('derives light/dark semantic palettes, spacing, and radii from a single BrandThemeSeed and rejects malformed hex colors', () => {
    const customSeed = {
      primaryLight: '#0D9488',
      primaryDark: '#2DD4BF',
      radiusBase: 14,
      spacingUnit: 6,
    };

    const lightTokens = buildDesignTokens('light', customSeed);
    const darkTokens = buildDesignTokens('dark', customSeed);

    expect(lightTokens.colors.primary).toBe('#0D9488');
    expect(darkTokens.colors.primary).toBe('#2DD4BF');
    expect(lightTokens.radii.md).toBe(14);
    expect(lightTokens.spacing.md).toBe(18);

    expect(() =>
      buildDesignTokens('light', {
        ...customSeed,
        primaryLight: 'teal',
      }),
    ).toThrow(/#RRGGBB/);
  });

  it('switches theme mode and language live in SettingsScreen and restores preferences across cold restarts', async () => {
    const user = userEvent.setup();
    const sharedKvStorage = createMemoryKeyValueStorage();
    const sharedSecretStorage = createMemorySecretStorage();
    const customIdentity = {
      ...appIdentity,
      theme: {
        ...appIdentity.theme,
        primaryLight: '#0D9488',
        primaryDark: '#2DD4BF',
      },
      compliance: {
        ...appIdentity.compliance,
        requirePrivacyConsent: false,
      },
    };

    const firstRuntime = createTestRuntime({
      identity: customIdentity,
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        keyValueStorage: sharedKvStorage,
        secretStorage: sharedSecretStorage,
        initialSystemColorScheme: 'light',
        initialDeviceLocale: 'zh-CN',
      },
    });

    const firstRender = await render(
      <AppRuntimeProvider runtime={firstRuntime}>
        <SettingsScreen />
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('个人设置')).toBeTruthy();
    expect(screen.getByText('外观模式')).toBeTruthy();

    await user.press(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Appearance')).toBeTruthy();

    await user.press(screen.getByRole('button', { name: 'Dark' }));
    expect(firstRuntime.preferencesStore.getState().themePreference).toBe('dark');

    await firstRender.unmount();

    const secondRuntime = createTestRuntime({
      identity: customIdentity,
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        keyValueStorage: sharedKvStorage,
        secretStorage: sharedSecretStorage,
        initialSystemColorScheme: 'light',
        initialDeviceLocale: 'zh-CN',
      },
    });

    await render(
      <AppRuntimeProvider runtime={secondRuntime}>
        <SettingsScreen />
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('Settings')).toBeTruthy();
    expect(secondRuntime.preferencesStore.getState().language).toBe('en-US');
    expect(secondRuntime.preferencesStore.getState().themePreference).toBe('dark');
  });

  it('prevents duplicate button presses while loading, displays TextField validation errors, and handles EmptyState + BottomSheetModal interactions', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    const onRetry = jest.fn();
    const onCloseSheet = jest.fn();

    const runtime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: {
          ...appIdentity.compliance,
          requirePrivacyConsent: false,
        },
      },
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        keyValueStorage: createMemoryKeyValueStorage(),
        secretStorage: createMemorySecretStorage(),
      },
    });

    function PrimitivesHarness(): React.JSX.Element {
      const [text, setText] = React.useState('');
      const [sheetVisible, setSheetVisible] = React.useState(false);
      return (
        <Box p="md" gap="md">
          <TextField
            label="账号"
            value={text}
            onChangeText={setText}
            placeholder="请输入手机号"
            errorMessage={text === 'bad' ? '格式不正确' : undefined}
          />
          <Button label="提交中" loading onPress={onSubmit} />
          <Button label="打开抽屉" variant="outline" onPress={() => setSheetVisible(true)} />
          <Skeleton height={20} testID="demo-skeleton" />
          <EmptyState
            title="暂无订单"
            description="稍后再试"
            actionLabel="重新加载"
            onAction={onRetry}
          />
          <BottomSheetModal
            visible={sheetVisible}
            title="操作菜单"
            onClose={() => {
              onCloseSheet();
              setSheetVisible(false);
            }}
          >
            <Button
              label="确认关闭"
              onPress={() => {
                onCloseSheet();
                setSheetVisible(false);
              }}
            />
          </BottomSheetModal>
        </Box>
      );
    }

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <PrimitivesHarness />
      </AppRuntimeProvider>,
    );

    const input = screen.getByPlaceholderText('请输入手机号');
    await user.type(input, 'bad');
    expect(screen.getByText('格式不正确')).toBeTruthy();

    await user.press(screen.getByRole('button', { name: '提交中' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.press(screen.getByRole('button', { name: '重新加载' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    await user.press(screen.getByRole('button', { name: '打开抽屉' }));
    expect(screen.getByText('操作菜单')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: '确认关闭' }));
    expect(onCloseSheet).toHaveBeenCalledTimes(1);
  });
});
