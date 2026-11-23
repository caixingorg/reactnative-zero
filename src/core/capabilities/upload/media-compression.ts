/**
 * @module core/capabilities/upload/media-compression
 * 职责：基于 `react-native-compressor` 的可选视频与大媒体硬件压缩能力封装，提供取消传播、跳过识别与临时文件回收。
 * 边界：`react-native-compressor` 在模块加载期即通过 Nitro 初始化原生混合对象，因此严禁顶层静态运行时 import，
 * 必须在驱动异步方法内部按需 lazy `require('react-native-compressor')`；且清理逻辑严禁误删用户原始 `sourceUri`。
 */
import { cleanupTemporaryUploadFile } from './image-compression';
import { UploadError } from './upload-service';

export type MediaCompressionMethod = 'auto' | 'manual';

export interface VideoCompressionOptions {
  compressionMethod?: MediaCompressionMethod;
  /** 目标最长边像素上限（正数生效；原生库将 0 视为 falsy 并回退为 640，故仅透传正数） */
  maxSize?: number;
  bitrate?: number;
  /** 小于该阈值（MB）的视频由原生侧直接跳过压缩并返回原路径 */
  minimumFileSizeForCompress?: number;
  progressDivider?: number;
  stripAudio?: boolean;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

export interface HardwareImageCompressionOptions {
  compressionMethod?: MediaCompressionMethod;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  output?: 'jpg' | 'png';
  disablePngTransparency?: boolean;
  returnableOutputType?: 'uri' | 'base64';
  progressDivider?: number;
  signal?: AbortSignal;
}

export interface CompressedMediaResult {
  uri: string;
  sourceUri: string;
  isTemporary: boolean;
  skipped: boolean;
  sizeBytes?: number;
}

export interface MediaCompressionDriver {
  compressVideo(uri: string, options?: VideoCompressionOptions): Promise<string>;
  compressImage(uri: string, options?: HardwareImageCompressionOptions): Promise<string>;
  getFileSize?(uri: string): Promise<number | undefined>;
}

export interface MediaCompressionCapability {
  readonly enabled: boolean;
  compressVideo(uri: string, options?: VideoCompressionOptions): Promise<CompressedMediaResult>;
  compressImage(
    uri: string,
    options?: HardwareImageCompressionOptions,
  ): Promise<CompressedMediaResult>;
  getFileSize(uri: string): Promise<number | undefined>;
}

export interface RunUploadWithMediaCleanupOptions<T> {
  sourceUri: string;
  prepare: () => Promise<CompressedMediaResult>;
  upload: (prepared: CompressedMediaResult) => Promise<T>;
  signal?: AbortSignal;
  cleanupTemporaryFile?: (uri: string, sourceUri?: string) => void;
}

const REMOTE_OR_DATA_URI_REGEX = /^(https?:|data:)/i;

function isLocalTemporaryPath(resultUri: string, sourceUri: string): boolean {
  return Boolean(resultUri) && resultUri !== sourceUri && !REMOTE_OR_DATA_URI_REGEX.test(resultUri);
}

// 原因：react-native-compressor/Main.js 在模块求值期即执行 NitroModules.createHybridObject('Compressor')，
// 仅在真正调用原生方法时延迟 require，确保 Jest、app.config.ts 与未启用能力的运行时零崩溃
export function createCompressorMediaDriver(): MediaCompressionDriver {
  return {
    async compressVideo(uri: string, options?: VideoCompressionOptions): Promise<string> {
      if (!uri) {
        throw new Error('Video compression source URI is empty.');
      }
      if (options?.signal?.aborted) {
        throw new UploadError('cancelled', '视频压缩已取消');
      }

      const { Video } =
        require('react-native-compressor') as typeof import('react-native-compressor');

      let cancellationId: string | undefined;
      let aborted = false;

      const handleAbort = (): void => {
        aborted = true;
        if (cancellationId) {
          Video.cancelCompression(cancellationId);
        }
      };

      options?.signal?.addEventListener('abort', handleAbort, { once: true });

      try {
        const nativeOptions: Parameters<typeof Video.compress>[1] = {
          getCancellationId: (id: string) => {
            cancellationId = id;
            if (aborted || options?.signal?.aborted) {
              Video.cancelCompression(id);
            }
          },
        };

        if (options?.compressionMethod !== undefined) {
          nativeOptions.compressionMethod = options.compressionMethod;
        }
        if (options?.bitrate !== undefined) {
          nativeOptions.bitrate = options.bitrate;
        }
        if (
          options?.maxSize !== undefined &&
          Number.isFinite(options.maxSize) &&
          options.maxSize > 0
        ) {
          nativeOptions.maxSize = options.maxSize;
        }
        if (options?.minimumFileSizeForCompress !== undefined) {
          nativeOptions.minimumFileSizeForCompress = options.minimumFileSizeForCompress;
        }
        if (options?.progressDivider !== undefined) {
          nativeOptions.progressDivider = options.progressDivider;
        }
        if (options?.stripAudio !== undefined) {
          nativeOptions.stripAudio = options.stripAudio;
        }

        const resultUri = await Video.compress(uri, nativeOptions, options?.onProgress);

        if (aborted || options?.signal?.aborted) {
          if (isLocalTemporaryPath(resultUri, uri)) {
            cleanupTemporaryUploadFile(resultUri, uri);
          }
          throw new UploadError('cancelled', '视频压缩已取消');
        }

        return resultUri;
      } catch (error) {
        if (aborted || options?.signal?.aborted) {
          if (error instanceof UploadError && error.kind === 'cancelled') {
            throw error;
          }
          throw new UploadError('cancelled', '视频压缩已取消');
        }
        throw error;
      } finally {
        options?.signal?.removeEventListener('abort', handleAbort);
      }
    },

    async compressImage(uri: string, options?: HardwareImageCompressionOptions): Promise<string> {
      if (!uri) {
        throw new Error('Image compression source URI is empty.');
      }
      if (options?.signal?.aborted) {
        throw new UploadError('cancelled', '图片压缩已取消');
      }

      const { Image } =
        require('react-native-compressor') as typeof import('react-native-compressor');

      const nativeOptions: Parameters<typeof Image.compress>[1] = {};
      if (options?.compressionMethod !== undefined) {
        nativeOptions.compressionMethod = options.compressionMethod;
      }
      if (options?.maxWidth !== undefined) {
        nativeOptions.maxWidth = options.maxWidth;
      }
      if (options?.maxHeight !== undefined) {
        nativeOptions.maxHeight = options.maxHeight;
      }
      if (options?.quality !== undefined && Number.isFinite(options.quality)) {
        nativeOptions.quality = Math.min(1, Math.max(0, options.quality));
      }
      if (options?.output !== undefined) {
        nativeOptions.output = options.output;
      }
      if (options?.disablePngTransparency !== undefined) {
        nativeOptions.disablePngTransparency = options.disablePngTransparency;
      }
      if (options?.returnableOutputType !== undefined) {
        nativeOptions.returnableOutputType = options.returnableOutputType;
      }
      if (options?.progressDivider !== undefined) {
        nativeOptions.progressDivider = options.progressDivider;
      }

      const resultUri = await Image.compress(uri, nativeOptions);

      if (options?.signal?.aborted) {
        if (options.returnableOutputType !== 'base64' && isLocalTemporaryPath(resultUri, uri)) {
          cleanupTemporaryUploadFile(resultUri, uri);
        }
        throw new UploadError('cancelled', '图片压缩已取消');
      }

      return resultUri;
    },

    async getFileSize(uri: string): Promise<number | undefined> {
      if (!uri) {
        return undefined;
      }
      const Compressor =
        require('react-native-compressor') as typeof import('react-native-compressor');
      const raw = await Compressor.getFileSize(uri);
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    },
  };
}

export function createMediaCompressionCapability(options: {
  enabled: boolean;
  driver: MediaCompressionDriver;
}): MediaCompressionCapability {
  const { enabled, driver } = options;

  return {
    enabled,

    async compressVideo(
      uri: string,
      videoOptions?: VideoCompressionOptions,
    ): Promise<CompressedMediaResult> {
      if (!enabled) {
        return {
          uri,
          sourceUri: uri,
          isTemporary: false,
          skipped: true,
        };
      }

      const resultUri = await driver.compressVideo(uri, videoOptions);
      const isTemporary = isLocalTemporaryPath(resultUri, uri);
      const skipped = !isTemporary && resultUri === uri;
      const sizeBytes =
        driver.getFileSize && !REMOTE_OR_DATA_URI_REGEX.test(resultUri)
          ? await driver.getFileSize(resultUri).catch(() => undefined)
          : undefined;

      return {
        uri: resultUri,
        sourceUri: uri,
        isTemporary,
        skipped,
        ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      };
    },

    async compressImage(
      uri: string,
      imageOptions?: HardwareImageCompressionOptions,
    ): Promise<CompressedMediaResult> {
      if (!enabled) {
        return {
          uri,
          sourceUri: uri,
          isTemporary: false,
          skipped: true,
        };
      }

      const resultUri = await driver.compressImage(uri, imageOptions);
      const isBase64 = imageOptions?.returnableOutputType === 'base64';
      const isTemporary = !isBase64 && isLocalTemporaryPath(resultUri, uri);
      const skipped = !isTemporary && resultUri === uri;
      const sizeBytes =
        !isBase64 && driver.getFileSize && !REMOTE_OR_DATA_URI_REGEX.test(resultUri)
          ? await driver.getFileSize(resultUri).catch(() => undefined)
          : undefined;

      return {
        uri: resultUri,
        sourceUri: uri,
        isTemporary,
        skipped,
        ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      };
    },

    async getFileSize(uri: string): Promise<number | undefined> {
      if (!enabled || !driver.getFileSize) {
        return undefined;
      }
      return driver.getFileSize(uri);
    },
  };
}

export async function runUploadWithMediaCleanup<T>(
  options: RunUploadWithMediaCleanupOptions<T>,
): Promise<T> {
  const cleanup = options.cleanupTemporaryFile ?? cleanupTemporaryUploadFile;
  if (options.signal?.aborted) {
    throw new UploadError('cancelled', '上传已取消');
  }

  let prepared: CompressedMediaResult | undefined;
  try {
    prepared = await options.prepare();
    if (options.signal?.aborted) {
      throw new UploadError('cancelled', '上传已取消');
    }
    return await options.upload(prepared);
  } finally {
    if (prepared?.isTemporary) {
      try {
        cleanup(prepared.uri, options.sourceUri);
      } catch {
        // 临时缓存清理失败不阻断主流程
      }
    }
  }
}
