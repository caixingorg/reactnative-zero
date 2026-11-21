import { useMemo } from 'react';
import { useAppRuntime } from '../../runtime';
import {
  createNativeImageCompressionDriver,
  type ImageCompressionDriver,
} from './image-compression';
import { createNativeUploadDriver, createUploadService, type UploadDriver } from './upload-service';

export {
  compressImageForUpload,
  computeResize,
  type CompressedImage,
  type ImageCompressionDriver,
  type ImageCompressionOptions,
} from './image-compression';
export {
  createUploadService,
  UploadError,
  type UploadDriver,
  type UploadDriverRequest,
  type UploadDriverResponse,
  type UploadFailureKind,
  type UploadProgressEvent,
  type UploadRequest,
  type UploadResult,
  type UploadService,
} from './upload-service';

declare module '../../runtime/app-runtime' {
  interface CapabilityOverrideMap {
    uploadDriver?: UploadDriver;
    imageCompressionDriver?: ImageCompressionDriver;
  }
}

// 原因：上传只用到已有的选图/文件权限，不新增清单权限；驱动可被覆写，便于测试与替换为对象存储直传
export function useUploadCapability() {
  const { httpClient, capabilityOverrides } = useAppRuntime();
  const uploadOverride = capabilityOverrides?.uploadDriver;
  const compressionOverride = capabilityOverrides?.imageCompressionDriver;

  return useMemo(
    () => ({
      uploadService: createUploadService({
        httpClient,
        driver: uploadOverride ?? createNativeUploadDriver(),
      }),
      compressionDriver: compressionOverride ?? createNativeImageCompressionDriver(),
    }),
    [httpClient, uploadOverride, compressionOverride],
  );
}
