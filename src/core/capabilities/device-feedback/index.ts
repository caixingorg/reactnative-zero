import { useMemo } from 'react';
import { useAppRuntime } from '../../runtime';

export interface DeviceSummaryInfo {
  brand: string;
  modelName: string;
  osName: string;
  osVersion: string;
  appVersion: string;
}

export interface DeviceFeedbackDriver {
  copyToClipboard(text: string): Promise<void>;
  readFromClipboard(): Promise<string>;
  triggerImpact(): Promise<void>;
  getDeviceSummary(): DeviceSummaryInfo;
}

declare module '../../runtime/app-runtime' {
  interface CapabilityOverrideMap {
    deviceFeedback?: DeviceFeedbackDriver;
  }
}

function createNativeDeviceFeedbackDriver(): DeviceFeedbackDriver {
  return {
    async copyToClipboard(text: string): Promise<void> {
      const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
      await Clipboard.setStringAsync(text);
    },

    async readFromClipboard(): Promise<string> {
      const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
      return Clipboard.getStringAsync();
    },

    async triggerImpact(): Promise<void> {
      const Haptics = require('expo-haptics') as typeof import('expo-haptics');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },

    getDeviceSummary(): DeviceSummaryInfo {
      const Device = require('expo-device') as typeof import('expo-device');
      const Application = require('expo-application') as typeof import('expo-application');
      return {
        brand: Device.brand ?? 'Unknown',
        modelName: Device.modelName ?? 'Unknown',
        osName: Device.osName ?? 'Unknown',
        osVersion: Device.osVersion ?? 'Unknown',
        appVersion: Application.nativeApplicationVersion ?? '1.0.0',
      };
    },
  };
}

export function useDeviceFeedbackCapability(): DeviceFeedbackDriver {
  const { capabilityOverrides } = useAppRuntime();
  const driverOverride = capabilityOverrides?.deviceFeedback;

  return useMemo(() => driverOverride ?? createNativeDeviceFeedbackDriver(), [driverOverride]);
}
