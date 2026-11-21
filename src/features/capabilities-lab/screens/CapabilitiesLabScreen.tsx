import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StandardVideoPlayer, useAudioVideoCapability } from '@/core/capabilities/audio-video';
import { useBiometricsCapability } from '@/core/capabilities/biometrics';
import {
  BarcodeScannerView,
  CameraCaptureModal,
  useCameraCapability,
} from '@/core/capabilities/camera';
import { useDeviceFeedbackCapability } from '@/core/capabilities/device-feedback';
import { useFilesCapability } from '@/core/capabilities/files';
import { useLocationCapability } from '@/core/capabilities/location';
import { useMediaCapability } from '@/core/capabilities/media';
import { useNotificationsCapability } from '@/core/capabilities/notifications';
import { SecureHybridWebView, type WebViewBridgeChannelHandle } from '@/core/capabilities/webview';
import { useAppRuntime } from '@/core/runtime';
import { AppText, Box, Button, Screen, VStack } from '@/core/ui';
import { useCommercialVendorAdapters } from '@/core/vendors';
import { ImageUploadCard } from '../components/ImageUploadCard';

// 原因：使用合法的 1x1 RGB PNG 二进制头与 CRC32 数据块作为默认演示海报，确保 iOS PHPhotoLibrary 与 Android MediaStore 均可正常解析入库（避免伪 SVG 报错）
const MINIMAL_VALID_PNG_BYTES = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0,
  0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0, 0, 3, 1, 1, 0,
  24, 221, 141, 176, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

interface CapabilityLabCardProps {
  title: string;
  enabled: boolean;
  disabledHint: string;
  children: React.ReactNode;
}

function CapabilityLabCard({
  title,
  enabled,
  disabledHint,
  children,
}: CapabilityLabCardProps): React.JSX.Element {
  return (
    <VStack p="lg" gap="md" bg="surface" radius="lg" bordered>
      <AppText variant="titleMd">{title}</AppText>
      {enabled ? (
        children
      ) : (
        <Box p="md" bg="surfaceMuted" radius="md">
          <AppText variant="bodySm" tone="secondary">
            {disabledHint}
          </AppText>
        </Box>
      )}
    </VStack>
  );
}

export function CapabilitiesLabScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { identity, env } = useAppRuntime();
  const cameraCapability = useCameraCapability();
  const mediaCapability = useMediaCapability();
  const filesCapability = useFilesCapability();
  const biometricsCapability = useBiometricsCapability();
  const locationCapability = useLocationCapability();
  const notificationsCapability = useNotificationsCapability();
  const audioVideoCapability = useAudioVideoCapability();
  const deviceFeedback = useDeviceFeedbackCapability();
  const vendorAdapters = useCommercialVendorAdapters();
  const webViewBridgeRef = useRef<WebViewBridgeChannelHandle | null>(null);

  const [lastResult, setLastResult] = useState<string | null>(null);
  const [lastAssetUri, setLastAssetUri] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const cameraRationale = useMemo(
    () => ({
      title: t('lab.cameraRationaleTitle'),
      description: t('lab.cameraRationaleDesc'),
    }),
    [t],
  );

  const notificationsRationale = useMemo(
    () => ({
      title: t('lab.notificationsRationaleTitle'),
      description: t('lab.notificationsRationaleDesc'),
    }),
    [t],
  );

  const handleCaptureCamera = async (): Promise<void> => {
    const photo = await cameraCapability.capturePhotoWithPermission(cameraRationale);
    if (photo) {
      setLastAssetUri(photo.uri);
      setLastResult(photo.uri);
    }
  };

  const handlePickImage = async (): Promise<void> => {
    const asset = await mediaCapability.pickImageWithPermission({
      title: t('lab.photoRationaleTitle'),
      description: t('lab.photoRationaleDesc'),
    });
    if (asset) {
      setLastAssetUri(asset.uri);
      setLastResult(asset.uri);
    }
  };

  const handleSaveMedia = async (): Promise<void> => {
    const sourceUri =
      lastAssetUri ??
      (await filesCapability.writeSandboxBytesFile(
        'generated-poster.png',
        MINIMAL_VALID_PNG_BYTES,
      )) ??
      '';
    if (!sourceUri) {
      return;
    }
    const saved = await mediaCapability.saveAssetWithPermission(sourceUri, {
      title: t('lab.mediaSaveRationaleTitle'),
      description: t('lab.mediaSaveRationaleDesc'),
    });
    if (saved) {
      setLastResult(saved.uri);
    }
  };

  const handlePickDocument = async (): Promise<void> => {
    const doc = await filesCapability.pickDocument();
    if (doc) {
      setLastResult(`${doc.name} (${doc.uri})`);
    }
  };

  const handleWriteAndShare = async (): Promise<void> => {
    const shared = await filesCapability.writeTextFileAndShare(
      'export.txt',
      'Enterprise RN Template Diagnostic Export',
    );
    if (shared) {
      setLastResult(shared.fileUri);
    }
  };

  const handleReadSandboxFile = async (): Promise<void> => {
    const content = await filesCapability.readSandboxTextFile('export.txt');
    if (content) {
      setLastResult(content);
    }
  };

  const handleBiometrics = async (): Promise<void> => {
    const support = await biometricsCapability.checkSupport();
    const res = await biometricsCapability.authenticate(t('lab.biometricsPrompt'));
    if (res?.authenticated) {
      setLastResult(`${t('lab.biometricsPassed')} (${support.biometricTypes.join(',') || 'bio'})`);
    } else {
      setLastResult(`${t('lab.biometricsFailed')}: ${res?.error ?? 'cancelled'}`);
    }
  };

  const handleBiometricKeystoreRoundTrip = async (): Promise<void> => {
    const prompt = t('lab.biometricsPrompt');
    const enrolled = await biometricsCapability.enrollBiometricSecret(
      'hw-bound-bio-secret',
      prompt,
    );
    if (!enrolled?.enrolled) {
      setLastResult(`${t('lab.biometricsFailed')}: ${enrolled?.error ?? 'unavailable'}`);
      return;
    }
    const unlocked = await biometricsCapability.unlockBiometricSecret(prompt);
    if (unlocked?.unlocked && unlocked.secret) {
      setLastResult(`keystore:${unlocked.secret}`);
    } else {
      setLastResult(`${t('lab.biometricsFailed')}: ${unlocked?.error ?? 'locked'}`);
    }
  };

  const handleGetLocation = async (): Promise<void> => {
    const coords = await locationCapability.getCurrentPositionWithPermission({
      title: t('lab.locationRationaleTitle'),
      description: t('lab.locationRationaleDesc'),
    });
    if (coords) {
      setLastResult(`${coords.latitude}, ${coords.longitude}`);
    }
  };

  const handleScheduleNotification = async (): Promise<void> => {
    const scheduled = await notificationsCapability.scheduleLocalNotificationWithPermission(
      {
        title: t('lab.notificationSampleTitle'),
        body: t('lab.notificationSampleBody'),
      },
      notificationsRationale,
    );
    if (scheduled) {
      await notificationsCapability.setBadgeCount(1);
      setLastResult(scheduled.notificationId);
    }
  };

  const handleGetPushToken = async (): Promise<void> => {
    const token =
      await notificationsCapability.getDevicePushTokenWithPermission(notificationsRationale);
    if (token) {
      setLastResult(token);
    }
  };

  const handlePlayAudio = async (): Promise<void> => {
    const audio = await audioVideoCapability.playSampleAudio();
    if (audio) {
      setLastResult(audio.sourceUri);
    }
  };

  const handleClipboardAndHaptics = async (): Promise<void> => {
    const summary = deviceFeedback.getDeviceSummary();
    await deviceFeedback.copyToClipboard(`${summary.brand} ${summary.modelName}`);
    await deviceFeedback.triggerImpact();
    const echoed = await deviceFeedback.readFromClipboard();
    setLastResult(echoed);
  };

  const handleBridgeGetContext = async (): Promise<void> => {
    await webViewBridgeRef.current?.receiveMessageFromWeb(
      JSON.stringify({
        bridgeVersion: '1.0',
        requestId: 'lab-ctx-1',
        action: 'getHostContext',
      }),
      env.privacyPolicyUrl,
    );
  };

  const handleBridgeShowNotice = async (): Promise<void> => {
    await webViewBridgeRef.current?.receiveMessageFromWeb(
      JSON.stringify({
        bridgeVersion: '1.0',
        requestId: 'lab-notice-1',
        action: 'showNotice',
        payload: { message: t('webview.simulatedNoticeContent') },
      }),
      env.privacyPolicyUrl,
    );
  };

  const handleVendorSocialAuth = async (): Promise<void> => {
    const res = await vendorAdapters.socialAuth.signInWithProvider('wechat');
    setLastResult(`${res.provider}:${res.authCode}`);
  };

  const handleVendorPayment = async (): Promise<void> => {
    const res = await vendorAdapters.payment.checkoutOrder({
      channel: 'wechat_pay',
      orderId: 'ORD-2026',
      amountCents: 9900,
    });
    setLastResult(`${res.status}:${res.transactionId}`);
  };

  const handleVendorMap = async (): Promise<void> => {
    const res = await vendorAdapters.mapNavigation.openExternalMapNavigation({
      label: t('lab.vendorMapDestinationLabel'),
      latitude: 31.2304,
      longitude: 121.4737,
    });
    setLastResult(res.provider);
  };

  const handleVendorPush = async (): Promise<void> => {
    const res = await vendorAdapters.vendorPush.registerVendorPushChannel();
    setLastResult(`${res.vendor}:${res.registrationId}`);
  };

  const disabledHint = t('lab.disabledHint');

  return (
    <Screen scrollable>
      <AppText variant="titleLg">{t('lab.title')}</AppText>

      {lastResult ? (
        <Box p="md" bg="primarySoft" radius="md">
          <AppText variant="caption" tone="brand" weight="600">
            {lastResult}
          </AppText>
        </Box>
      ) : null}

      <CapabilityLabCard
        title={t('lab.cameraTitle')}
        enabled={cameraCapability.enabled}
        disabledHint={disabledHint}
      >
        <VStack gap="sm">
          <CameraCaptureModal camera={cameraCapability} />
          <Button
            label={t('lab.cameraAction')}
            onPress={() => {
              void handleCaptureCamera();
            }}
          />
          <Button
            label={scannerOpen ? t('lab.toggleScannerClose') : t('lab.toggleScannerOpen')}
            variant="outline"
            onPress={() => setScannerOpen((prev) => !prev)}
          />
          {scannerOpen ? (
            <BarcodeScannerView
              rationale={cameraRationale}
              onScanned={(payload) => {
                setScannerOpen(false);
                setLastResult(`${payload.type}:${payload.data}`);
              }}
            />
          ) : null}
        </VStack>
      </CapabilityLabCard>

      <CapabilityLabCard
        title={t('lab.uploadTitle')}
        enabled={mediaCapability.photoLibraryEnabled}
        disabledHint={disabledHint}
      >
        <ImageUploadCard />
      </CapabilityLabCard>

      <CapabilityLabCard
        title={t('lab.mediaTitle')}
        enabled={mediaCapability.photoLibraryEnabled || mediaCapability.mediaLibraryEnabled}
        disabledHint={disabledHint}
      >
        <VStack gap="sm">
          {mediaCapability.photoLibraryEnabled ? (
            <Button
              label={t('lab.pickImageAction')}
              variant="outline"
              onPress={() => {
                void handlePickImage();
              }}
            />
          ) : null}
          {mediaCapability.mediaLibraryEnabled ? (
            <Button
              label={t('lab.saveMediaAction')}
              variant="outline"
              onPress={() => {
                void handleSaveMedia();
              }}
            />
          ) : null}
        </VStack>
      </CapabilityLabCard>

      <CapabilityLabCard
        title={t('lab.filesTitle')}
        enabled={filesCapability.enabled}
        disabledHint={disabledHint}
      >
        <VStack gap="sm">
          <Button
            label={t('lab.pickDocAction')}
            variant="outline"
            onPress={() => {
              void handlePickDocument();
            }}
          />
          <Button
            label={t('lab.shareFileAction')}
            variant="secondary"
            onPress={() => {
              void handleWriteAndShare();
            }}
          />
          <Button
            label={t('lab.readFileAction')}
            variant="ghost"
            onPress={() => {
              void handleReadSandboxFile();
            }}
          />
        </VStack>
      </CapabilityLabCard>

      <CapabilityLabCard
        title={t('lab.biometricsTitle')}
        enabled={biometricsCapability.enabled}
        disabledHint={disabledHint}
      >
        <VStack gap="sm">
          <Button
            label={t('lab.biometricsAction')}
            variant="outline"
            onPress={() => {
              void handleBiometrics();
            }}
          />
          <Button
            label={t('lab.biometricsKeystoreAction')}
            variant="secondary"
            onPress={() => {
              void handleBiometricKeystoreRoundTrip();
            }}
          />
        </VStack>
      </CapabilityLabCard>

      <CapabilityLabCard
        title={t('lab.locationTitle')}
        enabled={locationCapability.enabled}
        disabledHint={disabledHint}
      >
        <Button
          label={t('lab.locationAction')}
          variant="outline"
          onPress={() => {
            void handleGetLocation();
          }}
        />
      </CapabilityLabCard>

      <CapabilityLabCard
        title={t('lab.notificationsTitle')}
        enabled={notificationsCapability.enabled}
        disabledHint={disabledHint}
      >
        <VStack gap="sm">
          <Button
            label={t('lab.notificationsAction')}
            variant="outline"
            onPress={() => {
              void handleScheduleNotification();
            }}
          />
          <Button
            label={t('lab.pushTokenAction')}
            variant="secondary"
            onPress={() => {
              void handleGetPushToken();
            }}
          />
        </VStack>
      </CapabilityLabCard>

      <CapabilityLabCard
        title={t('lab.audioVideoTitle')}
        enabled={audioVideoCapability.enabled}
        disabledHint={disabledHint}
      >
        <VStack gap="sm">
          <Button
            label={t('lab.audioPlayAction')}
            variant="outline"
            onPress={() => {
              void handlePlayAudio();
            }}
          />
          <StandardVideoPlayer sourceUri="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4" />
        </VStack>
      </CapabilityLabCard>

      <CapabilityLabCard title={t('lab.deviceFeedbackTitle')} enabled disabledHint={disabledHint}>
        <Button
          label={t('lab.clipboardHapticAction')}
          variant="secondary"
          onPress={() => {
            void handleClipboardAndHaptics();
          }}
        />
      </CapabilityLabCard>

      <CapabilityLabCard
        title={t('lab.webviewTitle')}
        enabled={identity.capabilities.webview}
        disabledHint={disabledHint}
      >
        <VStack gap="sm">
          <Box radius="md" bordered>
            <SecureHybridWebView
              url={env.privacyPolicyUrl}
              compactHeight={140}
              bridgeChannelRef={webViewBridgeRef}
              onBridgeReply={(reply) => {
                setLastResult(JSON.stringify(reply.data ?? reply));
              }}
            />
          </Box>
          <Button
            label={t('lab.webviewGetContextAction')}
            variant="outline"
            onPress={() => {
              void handleBridgeGetContext();
            }}
          />
          <Button
            label={t('lab.webviewShowNoticeAction')}
            variant="secondary"
            onPress={() => {
              void handleBridgeShowNotice();
            }}
          />
        </VStack>
      </CapabilityLabCard>

      <CapabilityLabCard title={t('lab.vendorsTitle')} enabled disabledHint={disabledHint}>
        <VStack gap="sm">
          <Button
            label={t('lab.vendorWechatAuthAction')}
            variant="outline"
            onPress={() => {
              void handleVendorSocialAuth();
            }}
          />
          <Button
            label={t('lab.vendorPaymentAction')}
            variant="outline"
            onPress={() => {
              void handleVendorPayment();
            }}
          />
          <Button
            label={t('lab.vendorMapAction')}
            variant="ghost"
            onPress={() => {
              void handleVendorMap();
            }}
          />
          <Button
            label={t('lab.vendorPushAction')}
            variant="secondary"
            onPress={() => {
              void handleVendorPush();
            }}
          />
        </VStack>
      </CapabilityLabCard>
    </Screen>
  );
}
