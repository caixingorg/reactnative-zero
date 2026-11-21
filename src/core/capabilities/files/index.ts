import { useMemo } from 'react';
import { useAppRuntime } from '../../runtime';

export interface PickedDocumentAsset {
  name: string;
  uri: string;
  mimeType?: string;
}

export interface SharedSandboxFileResult {
  fileUri: string;
  shared: boolean;
}

export interface PickDocumentOptions {
  /** MIME 类型过滤，如 ['audio/*']；不传则不限制 */
  types?: string[];
}

export interface FilesCapabilityDriver {
  pickDocument(options?: PickDocumentOptions): Promise<PickedDocumentAsset | null>;
  writeSandboxTextFile(fileName: string, content: string): Promise<string>;
  writeSandboxBytesFile?(fileName: string, bytes: Uint8Array): Promise<string>;
  readSandboxTextFile(fileName: string): Promise<string | null>;
  writeTextFileAndShare(fileName: string, content: string): Promise<SharedSandboxFileResult>;
}

declare module '../../runtime/app-runtime' {
  interface CapabilityOverrideMap {
    files?: FilesCapabilityDriver;
  }
}

export interface FilesCapability {
  readonly enabled: boolean;
  pickDocument(options?: PickDocumentOptions): Promise<PickedDocumentAsset | null>;
  writeSandboxTextFile(fileName: string, content: string): Promise<string | null>;
  writeSandboxBytesFile(fileName: string, bytes: Uint8Array): Promise<string | null>;
  readSandboxTextFile(fileName: string): Promise<string | null>;
  writeTextFileAndShare(fileName: string, content: string): Promise<SharedSandboxFileResult | null>;
}

const SAFE_SANDBOX_FILENAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

// 原因：强制限制沙盒文件名为单层安全字符，阻断 ../ 路径穿越或子目录逃逸读写应用私有目录
export function assertSafeSandboxFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!SAFE_SANDBOX_FILENAME_REGEX.test(trimmed) || trimmed.includes('..')) {
    throw new Error(
      `Invalid sandbox fileName "${fileName}": only flat alphanumeric, dot, underscore, and hyphen characters are permitted.`,
    );
  }
  return trimmed;
}

// 原因：分块转换字节数组，避免 String.fromCharCode(...bytes) 在大文件（>64KB）下触发 JS 调用栈溢出
function decodeBytesChunked(bytes: Uint8Array): string {
  const chunkSize = 8192;
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    parts.push(String.fromCharCode(...slice));
  }
  return parts.join('');
}

function createNativeFilesDriver(): FilesCapabilityDriver {
  return {
    async pickDocument(pickOptions?: PickDocumentOptions): Promise<PickedDocumentAsset | null> {
      const DocumentPicker =
        require('expo-document-picker') as typeof import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        ...(pickOptions?.types ? { type: pickOptions.types } : {}),
      });
      if (result.canceled || !result.assets[0]) {
        return null;
      }
      const doc = result.assets[0];
      return {
        name: doc.name,
        uri: doc.uri,
        mimeType: doc.mimeType,
      };
    },

    async writeSandboxTextFile(fileName: string, content: string): Promise<string> {
      const safeName = assertSafeSandboxFileName(fileName);
      const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
      const targetFile = new File(Paths.cache, safeName);
      targetFile.write(content);
      return targetFile.uri;
    },

    async writeSandboxBytesFile(fileName: string, bytes: Uint8Array): Promise<string> {
      const safeName = assertSafeSandboxFileName(fileName);
      const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
      const targetFile = new File(Paths.cache, safeName);
      targetFile.write(bytes);
      return targetFile.uri;
    },

    async readSandboxTextFile(fileName: string): Promise<string | null> {
      const safeName = assertSafeSandboxFileName(fileName);
      const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
      const targetFile = new File(Paths.cache, safeName);
      if (!targetFile.exists) {
        return null;
      }
      return targetFile.text();
    },

    async writeTextFileAndShare(
      fileName: string,
      content: string,
    ): Promise<SharedSandboxFileResult> {
      const fileUri = await this.writeSandboxTextFile(fileName, content);

      const Sharing = require('expo-sharing') as typeof import('expo-sharing');
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri);
      }
      return {
        fileUri,
        shared: canShare,
      };
    },
  };
}

// 原因：遵循 ADR-0005，完整覆盖文档选择、沙盒文件读写与原生分享且完全自包含，支持按需直接物理删除目录
export function createFilesCapability(options: {
  enabled: boolean;
  driver?: FilesCapabilityDriver;
}): FilesCapability {
  const activeDriver = options.driver ?? createNativeFilesDriver();

  return {
    enabled: options.enabled,
    async pickDocument(pickOptions) {
      return options.enabled ? activeDriver.pickDocument(pickOptions) : null;
    },
    async writeSandboxTextFile(fileName, content) {
      if (!options.enabled) {
        return null;
      }
      return activeDriver.writeSandboxTextFile(assertSafeSandboxFileName(fileName), content);
    },
    async writeSandboxBytesFile(fileName, bytes) {
      if (!options.enabled) {
        return null;
      }
      const safeName = assertSafeSandboxFileName(fileName);
      if (activeDriver.writeSandboxBytesFile) {
        return activeDriver.writeSandboxBytesFile(safeName, bytes);
      }
      return activeDriver.writeSandboxTextFile(safeName, decodeBytesChunked(bytes));
    },
    async readSandboxTextFile(fileName) {
      if (!options.enabled) {
        return null;
      }
      return activeDriver.readSandboxTextFile(assertSafeSandboxFileName(fileName));
    },
    async writeTextFileAndShare(fileName, content) {
      if (!options.enabled) {
        return null;
      }
      return activeDriver.writeTextFileAndShare(assertSafeSandboxFileName(fileName), content);
    },
  };
}

export function useFilesCapability(): FilesCapability {
  const { identity, capabilityOverrides } = useAppRuntime();
  const driverOverride = capabilityOverrides?.files;

  return useMemo(
    () =>
      createFilesCapability({
        enabled: identity.capabilities.filesAndSharing,
        driver: driverOverride,
      }),
    [driverOverride, identity.capabilities.filesAndSharing],
  );
}
