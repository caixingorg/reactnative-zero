/**
 * @module core/capabilities/upload/image-compression
 * 职责：上传前把图片缩放到最长边上限并重新编码为 JPEG（HEIC 同样转成 JPEG）。
 * 边界：重新编码不携带原图 EXIF（含 GPS 位置）；该行为依赖原生编码器，真机核验前按「未验证」对待。
 */

export interface ImageCompressionOptions {
  /** 最长边像素上限，默认 1600 */
  maxEdge?: number;
  /** JPEG 质量 0-1，默认 0.8 */
  quality?: number;
}

export interface ImageCompressionInput {
  uri: string;
  width?: number;
  height?: number;
}

export interface CompressedImage {
  uri: string;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
}

export interface ImageCompressionDriver {
  compress(input: {
    uri: string;
    resize?: { width?: number; height?: number };
    quality: number;
  }): Promise<{ uri: string; width: number; height: number }>;
}

export const DEFAULT_MAX_EDGE = 1600;
export const DEFAULT_QUALITY = 0.8;

// 原因：只在原图超过上限时缩小，且只指定长边、让原生按比例算短边，避免放大小图或拉伸变形
export function computeResize(
  width: number | undefined,
  height: number | undefined,
  maxEdge: number,
): { width?: number; height?: number } | undefined {
  if (!width || !height) {
    return { width: maxEdge };
  }
  if (Math.max(width, height) <= maxEdge) {
    return undefined;
  }
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

export async function compressImageForUpload(
  input: ImageCompressionInput,
  driver: ImageCompressionDriver,
  options: ImageCompressionOptions = {},
): Promise<CompressedImage> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = Math.min(1, Math.max(0.1, options.quality ?? DEFAULT_QUALITY));
  const result = await driver.compress({
    uri: input.uri,
    resize: computeResize(input.width, input.height, maxEdge),
    quality,
  });
  return { ...result, mimeType: 'image/jpeg' };
}

export function cleanupTemporaryUploadFile(uri: string): void {
  try {
    const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
    const file = new FileSystem.File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // 临时缓存清理失败不阻断主流程
  }
}

export function createNativeImageCompressionDriver(): ImageCompressionDriver {
  return {
    async compress({ uri, resize, quality }) {
      const Manipulator =
        require('expo-image-manipulator') as typeof import('expo-image-manipulator');
      const result = await Manipulator.manipulateAsync(uri, resize ? [{ resize }] : [], {
        compress: quality,
        format: Manipulator.SaveFormat.JPEG,
      });
      return { uri: result.uri, width: result.width, height: result.height };
    },
  };
}
