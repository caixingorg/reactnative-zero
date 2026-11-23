import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMediaCapability } from '@/core/capabilities/media';
import {
  cleanupTemporaryUploadFile,
  compressImageForUpload,
  UploadError,
  useUploadCapability,
  type CompressedImage,
} from '@/core/capabilities/upload';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppText, Button, VStack } from '@/core/ui';

type UploadState =
  | { phase: 'idle' }
  | { phase: 'compressing' }
  | { phase: 'uploading'; percent: number }
  | { phase: 'done'; width: number; height: number }
  | { phase: 'cancelled' }
  | { phase: 'failed'; reason: string; image?: CompressedImage };

// 原因：基础版上传只演示「选图 → 压缩 → 上传 → 进度/取消/重试」主链路；失败后重试复用已压缩的文件，不重复选图与压缩
export function ImageUploadCard(): React.JSX.Element {
  const { t } = useTranslation();
  const { tokens } = useAppTheme();
  const mediaCapability = useMediaCapability();
  const { uploadService, compressionDriver } = useUploadCapability();
  const [state, setState] = useState<UploadState>({ phase: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);
  const pendingTempUriRef = useRef<string | null>(null);
  const sourceUriRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      const activeController = controllerRef.current;
      if (activeController) {
        activeController.abort();
        return;
      }
      if (pendingTempUriRef.current) {
        cleanupTemporaryUploadFile(pendingTempUriRef.current, sourceUriRef.current ?? undefined);
        pendingTempUriRef.current = null;
      }
      sourceUriRef.current = null;
    };
  }, []);

  const runUpload = useCallback(
    async (image: CompressedImage): Promise<void> => {
      const controller = new AbortController();
      controllerRef.current = controller;
      const sourceUri = sourceUriRef.current ?? undefined;
      const isTempFile = sourceUri !== undefined && image.uri !== sourceUri;
      pendingTempUriRef.current = isTempFile ? image.uri : null;
      if (isMountedRef.current) {
        setState({ phase: 'uploading', percent: 0 });
      }
      try {
        await uploadService.upload({
          fileUri: image.uri,
          mimeType: image.mimeType,
          signal: controller.signal,
          onProgress: ({ bytesSent, totalBytes }) => {
            if (!isMountedRef.current) {
              return;
            }
            const percent = totalBytes > 0 ? Math.round((bytesSent / totalBytes) * 100) : 0;
            setState((prev) =>
              prev.phase === 'uploading' && prev.percent === Math.min(100, percent)
                ? prev
                : { phase: 'uploading', percent: Math.min(100, percent) },
            );
          },
        });
        if (isTempFile) {
          cleanupTemporaryUploadFile(image.uri, sourceUri);
        }
        if (pendingTempUriRef.current === image.uri) {
          pendingTempUriRef.current = null;
        }
        if (sourceUriRef.current === sourceUri) {
          sourceUriRef.current = null;
        }
        if (isMountedRef.current) {
          setState({ phase: 'done', width: image.width, height: image.height });
        }
      } catch (error) {
        if (error instanceof UploadError && error.kind === 'cancelled') {
          if (isTempFile) {
            cleanupTemporaryUploadFile(image.uri, sourceUri);
          }
          if (pendingTempUriRef.current === image.uri) {
            pendingTempUriRef.current = null;
          }
          if (sourceUri !== undefined && sourceUriRef.current === sourceUri) {
            sourceUriRef.current = null;
          }
          if (isMountedRef.current) {
            setState({ phase: 'cancelled' });
          }
          return;
        }
        if (!isMountedRef.current) {
          if (isTempFile) {
            cleanupTemporaryUploadFile(image.uri, sourceUri);
          }
          if (pendingTempUriRef.current === image.uri) {
            pendingTempUriRef.current = null;
          }
          if (sourceUri !== undefined && sourceUriRef.current === sourceUri) {
            sourceUriRef.current = null;
          }
          return;
        }
        setState({
          phase: 'failed',
          reason: error instanceof Error ? error.message : String(error),
          image,
        });
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      }
    },
    [uploadService],
  );

  const handlePickAndUpload = async (): Promise<void> => {
    const asset = await mediaCapability.pickImageWithPermission({
      title: t('lab.photoRationaleTitle'),
      description: t('lab.photoRationaleDesc'),
    });
    if (!asset || !isMountedRef.current) {
      return;
    }
    if (pendingTempUriRef.current) {
      cleanupTemporaryUploadFile(pendingTempUriRef.current, sourceUriRef.current ?? undefined);
      pendingTempUriRef.current = null;
    }
    sourceUriRef.current = asset.uri;
    setState({ phase: 'compressing' });
    try {
      const compressed = await compressImageForUpload(asset, compressionDriver);
      if (!isMountedRef.current) {
        if (compressed.uri !== asset.uri) {
          cleanupTemporaryUploadFile(compressed.uri, asset.uri);
        }
        sourceUriRef.current = null;
        return;
      }
      if (compressed.uri !== asset.uri) {
        pendingTempUriRef.current = compressed.uri;
      }
      await runUpload(compressed);
    } catch (error) {
      sourceUriRef.current = null;
      if (isMountedRef.current) {
        setState({
          phase: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  const busy = state.phase === 'compressing' || state.phase === 'uploading';

  return (
    <VStack gap="sm">
      <AppText variant="caption" tone="secondary">
        {t('lab.uploadRationaleHint')}
      </AppText>
      <Button
        testID="upload-pick"
        label={t('lab.uploadPickAction')}
        variant="outline"
        disabled={busy}
        onPress={() => {
          void handlePickAndUpload();
        }}
      />
      {state.phase === 'compressing' ? (
        <AppText variant="bodySm">{t('lab.uploadCompressing')}</AppText>
      ) : null}
      {state.phase === 'uploading' ? (
        <VStack gap="xs">
          <AppText variant="bodySm" testID="upload-progress">
            {t('lab.uploadProgress', { percent: state.percent })}
          </AppText>
          <View style={[styles.track, { backgroundColor: tokens.colors.surfaceMuted }]}>
            <View
              style={[
                styles.fill,
                { width: `${state.percent}%`, backgroundColor: tokens.colors.primary },
              ]}
            />
          </View>
          <Button
            testID="upload-cancel"
            label={t('lab.uploadCancelAction')}
            variant="ghost"
            onPress={() => controllerRef.current?.abort()}
          />
        </VStack>
      ) : null}
      {state.phase === 'done' ? (
        <AppText variant="bodySm" tone="success" testID="upload-result">
          {t('lab.uploadDone', { width: state.width, height: state.height })}
        </AppText>
      ) : null}
      {state.phase === 'cancelled' ? (
        <AppText variant="bodySm" tone="secondary" testID="upload-result">
          {t('lab.uploadCancelled')}
        </AppText>
      ) : null}
      {state.phase === 'failed' ? (
        <VStack gap="xs">
          <AppText variant="bodySm" tone="danger" testID="upload-result">
            {t('lab.uploadFailed', { reason: state.reason })}
          </AppText>
          {state.image ? (
            <Button
              testID="upload-retry"
              label={t('lab.uploadRetryAction')}
              variant="secondary"
              onPress={() => {
                if (state.image) {
                  void runUpload(state.image);
                }
              }}
            />
          ) : null}
        </VStack>
      ) : null}
    </VStack>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6 },
});
