import { useMemo } from 'react';
import { Platform } from 'react-native';
import {
  mapExpoPermissionResponse,
  type CapabilityPermissionProbe,
  type PermissionCoordinator,
  type PermissionRationaleCopy,
} from '../../permissions/types';
import { useAppRuntime } from '../../runtime';

export interface PickedImageAsset {
  uri: string;
  width?: number;
  height?: number;
}

export interface SavedMediaResult {
  saved: boolean;
  uri: string;
}

export interface PickImageOptions {
  allowsEditing?: boolean;
}

export interface MediaCapabilityDriver {
  pickImage(options?: PickImageOptions): Promise<PickedImageAsset | null>;
  saveToLibrary(localUri: string): Promise<SavedMediaResult>;
}

declare module '../../runtime/app-runtime' {
  interface CapabilityOverrideMap {
    media?: MediaCapabilityDriver;
  }
}

export interface MediaCapability {
  readonly photoLibraryEnabled: boolean;
  readonly mediaLibraryEnabled: boolean;
  pickImageWithPermission(
    rationale: PermissionRationaleCopy,
    options?: PickImageOptions,
  ): Promise<PickedImageAsset | null>;
  saveAssetWithPermission(
    localUri: string,
    rationale: PermissionRationaleCopy,
  ): Promise<SavedMediaResult | null>;
}

function usesPermissionlessSystemPhotoPicker(): boolean {
  if (Platform.OS === 'ios') {
    return true;
  }
  if (Platform.OS === 'android') {
    return Number(Platform.Version) >= 33;
  }
  return false;
}

// 原因：iOS 14+ PHPicker 与 Android 13+ 系统照片选择器无需申请运行时相册读权限，仅在低版本 Android 按需请求，杜绝过度索权
const photoPermissionProbe: CapabilityPermissionProbe = {
  async getStatus() {
    if (usesPermissionlessSystemPhotoPicker()) {
      return 'granted';
    }
    const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
    return mapExpoPermissionResponse(await ImagePicker.getMediaLibraryPermissionsAsync());
  },
  async requestPermission() {
    if (usesPermissionlessSystemPhotoPicker()) {
      return 'granted';
    }
    const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
    return mapExpoPermissionResponse(await ImagePicker.requestMediaLibraryPermissionsAsync());
  },
};

function usesPermissionlessMediaSave(): boolean {
  return Platform.OS === 'android' && Number(Platform.Version) >= 33;
}

// 原因：Android 13+ 向 MediaStore 插入新图片无需任何运行时存储权限，iOS 与低版本 Android 则显式请求 writeOnly=true 的最小添加权限
const mediaSavePermissionProbe: CapabilityPermissionProbe = {
  async getStatus() {
    if (usesPermissionlessMediaSave()) {
      return 'granted';
    }
    const MediaLibrary = require('expo-media-library') as typeof import('expo-media-library');
    return mapExpoPermissionResponse(await MediaLibrary.getPermissionsAsync(true));
  },
  async requestPermission() {
    if (usesPermissionlessMediaSave()) {
      return 'granted';
    }
    const MediaLibrary = require('expo-media-library') as typeof import('expo-media-library');
    return mapExpoPermissionResponse(await MediaLibrary.requestPermissionsAsync(true));
  },
};

function createNativeMediaDriver(): MediaCapabilityDriver {
  let inFlightPick: Promise<PickedImageAsset | null> | null = null;

  return {
    async pickImage(pickOptions?: PickImageOptions): Promise<PickedImageAsset | null> {
      if (inFlightPick) {
        return inFlightPick;
      }

      inFlightPick = (async () => {
        const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
        // 原因：默认关闭 allowsEditing 以便 iOS 直接走原生 PHPickerViewController 极速拉起相册；头像等场景可显式传 allowsEditing: true 开启裁剪
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: pickOptions?.allowsEditing ?? false,
          quality: 0.85,
        });
        if (result.canceled || !result.assets[0]) {
          return null;
        }
        const asset = result.assets[0];
        return {
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        };
      })().finally(() => {
        inFlightPick = null;
      });

      return inFlightPick;
    },
    // 原因：必须使用 saveToLibraryAsync（底层 resolveWithAdditionalData=false）而非 createAssetAsync，避免保存后反查 MediaStore/PHAsset 触发相册读权限异常
    async saveToLibrary(localUri: string): Promise<SavedMediaResult> {
      const MediaLibrary = require('expo-media-library') as typeof import('expo-media-library');
      await MediaLibrary.saveToLibraryAsync(localUri);
      return {
        saved: true,
        uri: localUri,
      };
    },
  };
}

// 原因：遵循 ADR-0005，相册选图与媒体库保存独立封装并自带权限探针，支持独立禁用或物理删除目录
export function createMediaCapability(options: {
  photoLibraryEnabled: boolean;
  mediaLibraryEnabled: boolean;
  permissionCoordinator: PermissionCoordinator;
  driver?: MediaCapabilityDriver;
}): MediaCapability {
  const activeDriver = options.driver ?? createNativeMediaDriver();

  return {
    photoLibraryEnabled: options.photoLibraryEnabled,
    mediaLibraryEnabled: options.mediaLibraryEnabled,

    pickImageWithPermission(rationale, pickOptions) {
      return options.permissionCoordinator.runIfPermitted(
        {
          enabled: options.photoLibraryEnabled,
          kind: 'photoLibrary',
          rationale,
          nativeProbe: photoPermissionProbe,
        },
        () => activeDriver.pickImage(pickOptions),
      );
    },

    saveAssetWithPermission(localUri, rationale) {
      return options.permissionCoordinator.runIfPermitted(
        {
          enabled: options.mediaLibraryEnabled,
          kind: 'mediaLibrary',
          rationale,
          nativeProbe: mediaSavePermissionProbe,
        },
        () => activeDriver.saveToLibrary(localUri),
      );
    },
  };
}

export function useMediaCapability(): MediaCapability {
  const { identity, permissionCoordinator, capabilityOverrides } = useAppRuntime();
  const driverOverride = capabilityOverrides?.media;

  return useMemo(
    () =>
      createMediaCapability({
        photoLibraryEnabled: identity.capabilities.photoLibrary,
        mediaLibraryEnabled: identity.capabilities.mediaLibrary,
        permissionCoordinator,
        driver: driverOverride,
      }),
    [
      driverOverride,
      identity.capabilities.mediaLibrary,
      identity.capabilities.photoLibrary,
      permissionCoordinator,
    ],
  );
}
