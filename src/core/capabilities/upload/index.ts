import { useMemo } from 'react';
import { useAppRuntime } from '../../runtime';
import {
  createNativeImageCompressionDriver,
  type ImageCompressionDriver,
} from './image-compression';
import {
  createTusResumableUploader,
  type TusFileReader,
  type TusResumableUploader,
} from './tus-upload-driver';
import { createNativeUploadDriver, createUploadService, type UploadDriver } from './upload-service';

export {
  cleanupTemporaryUploadFile,
  compressImageForUpload,
  computeResize,
  type CompressedImage,
  type ImageCompressionDriver,
  type ImageCompressionOptions,
} from './image-compression';
export {
  createExpoTusFileReader,
  createMmkvTusUrlStorage,
  createTusResumableUploader,
  DEFAULT_TUS_CHUNK_SIZE_BYTES,
  TUS_URL_STORAGE_KEY,
  type TusFileDescriptor,
  type TusFileReader,
  type TusFileSource,
  type TusResumableUploadRequest,
  type TusResumableUploadResult,
  type TusResumableUploader,
  type TusResumableUploaderOptions,
} from './tus-upload-driver';
export {
  createUploadQueueStore,
  type UploadQueueItemInput,
  type UploadQueueState,
  type UploadQueueStore,
  type UploadQueueStoreOptions,
  type UploadQueueTask,
  type UploadQueueTaskExecutionContext,
  type UploadTaskStatus,
} from './upload-queue-store';
export {
  createUploadService,
  UploadError,
  type UploadDriver,
  type UploadDriverRequest,
  type UploadDriverResponse,
  type UploadFailureKind,
  type UploadHttpMethod,
  type UploadProgressEvent,
  type UploadRequest,
  type UploadResult,
  type UploadService,
  type UploadSessionType,
  type UploadTransferType,
} from './upload-service';

declare module '../../runtime/app-runtime' {
  interface CapabilityOverrideMap {
    uploadDriver?: UploadDriver;
    imageCompressionDriver?: ImageCompressionDriver;
    tusFileReader?: TusFileReader;
    tusUploader?: TusResumableUploader;
  }
}

// 原因：上传只用到已有的选图/文件权限，不新增清单权限；驱动可被覆写，便于测试与替换为对象存储直传或 TUS 断点续传
export function useUploadCapability() {
  const { httpClient, keyValueStorage, capabilityOverrides } = useAppRuntime();
  const uploadOverride = capabilityOverrides?.uploadDriver;
  const compressionOverride = capabilityOverrides?.imageCompressionDriver;
  const tusFileReaderOverride = capabilityOverrides?.tusFileReader;
  const tusUploaderOverride = capabilityOverrides?.tusUploader;

  return useMemo(
    () => ({
      uploadService: createUploadService({
        httpClient,
        driver: uploadOverride ?? createNativeUploadDriver(),
      }),
      tusUploader:
        tusUploaderOverride ??
        createTusResumableUploader({
          httpClient,
          keyValueStorage,
          fileReader: tusFileReaderOverride,
        }),
      compressionDriver: compressionOverride ?? createNativeImageCompressionDriver(),
    }),
    [
      httpClient,
      keyValueStorage,
      uploadOverride,
      compressionOverride,
      tusFileReaderOverride,
      tusUploaderOverride,
    ],
  );
}
