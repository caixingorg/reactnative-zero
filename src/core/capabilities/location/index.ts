import { useMemo } from 'react';
import {
  mapExpoPermissionResponse,
  type CapabilityPermissionProbe,
  type PermissionCoordinator,
  type PermissionRationaleCopy,
} from '../../permissions/types';
import { useAppRuntime } from '../../runtime';

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export interface LocationCapabilityDriver {
  getCurrentPosition(): Promise<GeoCoordinates>;
}

declare module '../../runtime/app-runtime' {
  interface CapabilityOverrideMap {
    location?: LocationCapabilityDriver;
  }
}

export interface LocationCapability {
  readonly enabled: boolean;
  getCurrentPositionWithPermission(
    rationale: PermissionRationaleCopy,
  ): Promise<GeoCoordinates | null>;
}

const locationPermissionProbe: CapabilityPermissionProbe = {
  async getStatus() {
    const Location = require('expo-location') as typeof import('expo-location');
    return mapExpoPermissionResponse(await Location.getForegroundPermissionsAsync());
  },
  async requestPermission() {
    const Location = require('expo-location') as typeof import('expo-location');
    return mapExpoPermissionResponse(await Location.requestForegroundPermissionsAsync());
  },
};

function createNativeLocationDriver(): LocationCapabilityDriver {
  return {
    async getCurrentPosition(): Promise<GeoCoordinates> {
      const Location = require('expo-location') as typeof import('expo-location');
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    },
  };
}

// 原因：前景定位自带权限探针并强制走 Permission Rationale 协调器，支持开关秒级剥离定位权限或物理删除目录
export function createLocationCapability(options: {
  enabled: boolean;
  permissionCoordinator: PermissionCoordinator;
  driver?: LocationCapabilityDriver;
}): LocationCapability {
  const activeDriver = options.driver ?? createNativeLocationDriver();

  return {
    enabled: options.enabled,
    getCurrentPositionWithPermission(rationale) {
      return options.permissionCoordinator.runIfPermitted(
        {
          enabled: options.enabled,
          kind: 'location',
          rationale,
          nativeProbe: locationPermissionProbe,
        },
        () => activeDriver.getCurrentPosition(),
      );
    },
  };
}

export function useLocationCapability(): LocationCapability {
  const { identity, permissionCoordinator, capabilityOverrides } = useAppRuntime();
  const driverOverride = capabilityOverrides?.location;

  return useMemo(
    () =>
      createLocationCapability({
        enabled: identity.capabilities.location,
        permissionCoordinator,
        driver: driverOverride,
      }),
    [driverOverride, identity.capabilities.location, permissionCoordinator],
  );
}
