import { useMemo } from 'react';
import { BIOMETRIC_PROTECTED_TOKEN_SECRET_KEY } from '../../auth/auth-session-store';
import { useAppRuntime } from '../../runtime';
import type { SecretStorageDriver } from '../../storage/types';

export { BIOMETRIC_PROTECTED_TOKEN_SECRET_KEY };

export type BiometricModality = 'facial' | 'fingerprint' | 'iris';

export interface BiometricSupportInfo {
  available: boolean;
  biometricTypes: BiometricModality[];
}

export interface BiometricAuthResult {
  authenticated: boolean;
  error?: string;
}

export interface BiometricKeystoreEnrollResult {
  enrolled: boolean;
  error?: string;
}

export interface BiometricKeystoreUnlockResult {
  unlocked: boolean;
  secret: string | null;
  error?: string;
}

export interface BiometricsCapabilityDriver {
  checkSupport(): Promise<BiometricSupportInfo>;
  authenticate(promptMessage: string): Promise<BiometricAuthResult>;
}

declare module '../../runtime/app-runtime' {
  interface CapabilityOverrideMap {
    biometrics?: BiometricsCapabilityDriver;
  }
}

export interface BiometricsCapability {
  readonly enabled: boolean;
  checkSupport(): Promise<BiometricSupportInfo>;
  authenticate(promptMessage: string): Promise<BiometricAuthResult | null>;
  enrollBiometricSecret(
    secretValue: string,
    promptMessage: string,
  ): Promise<BiometricKeystoreEnrollResult | null>;
  unlockBiometricSecret(promptMessage: string): Promise<BiometricKeystoreUnlockResult | null>;
  clearBiometricSecret(): Promise<void>;
}

function createNativeBiometricsDriver(): BiometricsCapabilityDriver {
  return {
    async checkSupport(): Promise<BiometricSupportInfo> {
      const LocalAuth =
        require('expo-local-authentication') as typeof import('expo-local-authentication');
      const [hasHardware, isEnrolled, rawTypes] = await Promise.all([
        LocalAuth.hasHardwareAsync(),
        LocalAuth.isEnrolledAsync(),
        LocalAuth.supportedAuthenticationTypesAsync(),
      ]);

      const biometricTypes: BiometricModality[] = rawTypes.map((item) => {
        if (item === LocalAuth.AuthenticationType.FACIAL_RECOGNITION) {
          return 'facial';
        }
        if (item === LocalAuth.AuthenticationType.IRIS) {
          return 'iris';
        }
        return 'fingerprint';
      });

      return {
        available: hasHardware && isEnrolled,
        biometricTypes,
      };
    },

    async authenticate(promptMessage: string): Promise<BiometricAuthResult> {
      const LocalAuth =
        require('expo-local-authentication') as typeof import('expo-local-authentication');
      const result = await LocalAuth.authenticateAsync({
        promptMessage,
        disableDeviceFallback: false,
      });
      if (result.success) {
        return { authenticated: true };
      }
      return {
        authenticated: false,
        error: result.error,
      };
    },
  };
}

// 原因：遵循 ADR-0005，面容/指纹核身与硬件级生物识别密钥库绑定独立封装于自包含目录；通过 requireAuthentication 将令牌锁入系统 Keychain/Keystore，杜绝纯 UI 布尔返回值被 Hook 绕过
export function createBiometricsCapability(options: {
  enabled: boolean;
  secretStorage?: SecretStorageDriver;
  driver?: BiometricsCapabilityDriver;
}): BiometricsCapability {
  const activeDriver = options.driver ?? createNativeBiometricsDriver();

  return {
    enabled: options.enabled,
    async checkSupport() {
      if (!options.enabled) {
        return { available: false, biometricTypes: [] };
      }
      return activeDriver.checkSupport();
    },
    async authenticate(promptMessage: string) {
      if (!options.enabled) {
        return null;
      }
      return activeDriver.authenticate(promptMessage);
    },
    async enrollBiometricSecret(secretValue: string, promptMessage: string) {
      if (!options.enabled) {
        return null;
      }
      if (!options.secretStorage) {
        return { enrolled: false, error: 'secret_storage_unavailable' };
      }
      const support = await activeDriver.checkSupport();
      if (!support.available) {
        return { enrolled: false, error: 'biometrics_unavailable' };
      }
      try {
        await options.secretStorage.setSecret(BIOMETRIC_PROTECTED_TOKEN_SECRET_KEY, secretValue, {
          requireAuthentication: true,
          authenticationPrompt: promptMessage,
        });
        return { enrolled: true };
      } catch (err) {
        return {
          enrolled: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    async unlockBiometricSecret(promptMessage: string) {
      if (!options.enabled) {
        return null;
      }
      if (!options.secretStorage) {
        return { unlocked: false, secret: null, error: 'secret_storage_unavailable' };
      }
      try {
        const secret = await options.secretStorage.getSecret(BIOMETRIC_PROTECTED_TOKEN_SECRET_KEY, {
          requireAuthentication: true,
          authenticationPrompt: promptMessage,
        });
        return {
          unlocked: secret !== null,
          secret,
        };
      } catch (err) {
        return {
          unlocked: false,
          secret: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    async clearBiometricSecret() {
      await options.secretStorage?.deleteSecret(BIOMETRIC_PROTECTED_TOKEN_SECRET_KEY);
    },
  };
}

export function useBiometricsCapability(): BiometricsCapability {
  const { identity, secretStorage, capabilityOverrides } = useAppRuntime();
  const driverOverride = capabilityOverrides?.biometrics;

  return useMemo(
    () =>
      createBiometricsCapability({
        enabled: identity.capabilities.biometrics,
        secretStorage,
        driver: driverOverride,
      }),
    [driverOverride, identity.capabilities.biometrics, secretStorage],
  );
}
