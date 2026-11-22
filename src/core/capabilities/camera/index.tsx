import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  mapExpoPermissionResponse,
  type CapabilityPermissionProbe,
  type PermissionCoordinator,
  type PermissionRationaleCopy,
} from '../../permissions/types';
import { useAppRuntime } from '../../runtime';
import { useAppTheme } from '../../theme/theme-context';
import { BottomSheetModal, Button, HStack } from '../../ui';

export interface CameraCaptureAsset {
  uri: string;
  width?: number;
  height?: number;
}

export interface ScannerPreviewRenderProps {
  height: number;
  borderRadius: number;
  backgroundColor: string;
  onScanned: (payload: { type: string; data: string }) => void;
}

export interface CameraCapabilityDriver {
  capturePhoto(): Promise<CameraCaptureAsset | null>;
  ScannerPreviewComponent?: React.ComponentType<ScannerPreviewRenderProps>;
  CapturePreviewComponent?: React.ComponentType;
}

declare module '../../runtime/app-runtime' {
  interface CapabilityOverrideMap {
    camera?: CameraCapabilityDriver;
  }
}

interface PendingCaptureSession {
  resolve: (asset: CameraCaptureAsset | null) => void;
}

interface CameraCaptureSessionState {
  activeSession: PendingCaptureSession | null;
  hasMountedHost: boolean;
  setMountedHost: (mounted: boolean) => void;
  openCaptureSession: () => Promise<CameraCaptureAsset | null>;
  completeCaptureSession: (asset: CameraCaptureAsset | null) => void;
}

export interface CameraCapability {
  readonly enabled: boolean;
  readonly captureSessionStore: StoreApi<CameraCaptureSessionState>;
  capturePhotoWithPermission(
    rationale: PermissionRationaleCopy,
  ): Promise<CameraCaptureAsset | null>;
  requestScannerAccess(rationale: PermissionRationaleCopy): Promise<boolean>;
}

const cameraPermissionProbe: CapabilityPermissionProbe = {
  async getStatus() {
    const { Camera } = require('expo-camera') as typeof import('expo-camera');
    return mapExpoPermissionResponse(await Camera.getCameraPermissionsAsync());
  },
  async requestPermission() {
    const { Camera } = require('expo-camera') as typeof import('expo-camera');
    return mapExpoPermissionResponse(await Camera.requestCameraPermissionsAsync());
  },
};

function createCaptureSessionStore(): StoreApi<CameraCaptureSessionState> {
  return createStore<CameraCaptureSessionState>((set, get) => ({
    activeSession: null,
    hasMountedHost: false,
    setMountedHost: (mounted) => {
      if (!mounted) {
        const pending = get().activeSession;
        set({ hasMountedHost: false, activeSession: null });
        pending?.resolve(null);
        return;
      }
      set({ hasMountedHost: true });
    },
    openCaptureSession: () => {
      if (!get().hasMountedHost) {
        throw new Error(
          'CameraCaptureModal is not mounted. Render <CameraCaptureModal camera={camera} /> in your screen to capture real photos.',
        );
      }
      return new Promise<CameraCaptureAsset | null>((resolve) => {
        const previous = get().activeSession;
        if (previous) {
          previous.resolve(null);
        }
        set({ activeSession: { resolve } });
      });
    },
    completeCaptureSession: (asset) => {
      const current = get().activeSession;
      set({ activeSession: null });
      current?.resolve(asset);
    },
  }));
}

// 原因：遵循 ADR-0005，通过本模块内建的 CameraView.takePictureAsync() 会话实拍产出真实沙盒照片，零耦合相册模块 (expo-image-picker)
export function createCameraCapability(options: {
  enabled: boolean;
  permissionCoordinator: PermissionCoordinator;
  driver?: CameraCapabilityDriver;
}): CameraCapability {
  const captureSessionStore = createCaptureSessionStore();
  const activeDriver: CameraCapabilityDriver = options.driver ?? {
    capturePhoto: () => captureSessionStore.getState().openCaptureSession(),
  };

  return {
    enabled: options.enabled,
    captureSessionStore,
    capturePhotoWithPermission(rationale) {
      return options.permissionCoordinator.runIfPermitted(
        {
          enabled: options.enabled,
          kind: 'camera',
          rationale,
          nativeProbe: cameraPermissionProbe,
        },
        () => activeDriver.capturePhoto(),
      );
    },
    async requestScannerAccess(rationale) {
      const result = await options.permissionCoordinator.runIfPermitted(
        {
          enabled: options.enabled,
          kind: 'camera',
          rationale,
          nativeProbe: cameraPermissionProbe,
        },
        async () => true,
      );
      return Boolean(result);
    },
  };
}

export function useCameraCapability(): CameraCapability {
  const { identity, permissionCoordinator, capabilityOverrides } = useAppRuntime();
  const driverOverride = capabilityOverrides?.camera;

  return useMemo(
    () =>
      createCameraCapability({
        enabled: identity.capabilities.camera,
        permissionCoordinator,
        driver: driverOverride,
      }),
    [driverOverride, identity.capabilities.camera, permissionCoordinator],
  );
}

interface NativeCameraViewHandle {
  takePictureAsync(options?: { quality?: number }): Promise<
    | {
        uri: string;
        width: number;
        height: number;
      }
    | undefined
  >;
}

export interface CameraCaptureModalProps {
  camera: CameraCapability;
}

export function CameraCaptureModal({ camera }: CameraCaptureModalProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const { tokens } = useAppTheme();
  const { capabilityOverrides } = useAppRuntime();
  const driverOverride = capabilityOverrides?.camera;
  const activeSession = useStore(camera.captureSessionStore, (state) => state.activeSession);
  const cameraRef = useRef<NativeCameraViewHandle | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    camera.captureSessionStore.getState().setMountedHost(true);
    return () => {
      camera.captureSessionStore.getState().setMountedHost(false);
    };
  }, [camera]);

  if (!camera.enabled || !activeSession) {
    return null;
  }

  const handleClose = (): void => {
    setCameraReady(false);
    setCapturing(false);
    camera.captureSessionStore.getState().completeCaptureSession(null);
  };

  const handleTakePicture = async (): Promise<void> => {
    if (!cameraRef.current || capturing) {
      return;
    }
    setCapturing(true);
    try {
      const captured = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      setCameraReady(false);
      setCapturing(false);
      camera.captureSessionStore.getState().completeCaptureSession(
        captured
          ? {
              uri: captured.uri,
              width: captured.width,
              height: captured.height,
            }
          : null,
      );
    } catch {
      setCapturing(false);
      camera.captureSessionStore.getState().completeCaptureSession(null);
    }
  };

  const CustomCapturePreview = driverOverride?.CapturePreviewComponent;
  const NativeCameraView = CustomCapturePreview
    ? null
    : (
        require('expo-camera') as {
          CameraView: React.ForwardRefExoticComponent<
            React.ComponentProps<typeof import('expo-camera').CameraView> &
              React.RefAttributes<NativeCameraViewHandle>
          >;
        }
      ).CameraView;

  return (
    <BottomSheetModal visible title={t('camera.captureModalTitle')} onClose={handleClose}>
      <View
        style={[
          styles.capturePreview,
          {
            borderRadius: tokens.radii.md,
            backgroundColor: tokens.colors.surfaceMuted,
          },
        ]}
      >
        {CustomCapturePreview ? (
          <CustomCapturePreview />
        ) : NativeCameraView ? (
          <NativeCameraView
            ref={cameraRef}
            style={styles.scannerFill}
            onCameraReady={() => setCameraReady(true)}
          />
        ) : null}
      </View>
      <HStack gap="sm">
        <View style={styles.scannerFill}>
          <Button label={t('common.cancel')} variant="outline" onPress={handleClose} />
        </View>
        <View style={styles.scannerFill}>
          <Button
            label={t('camera.shutterButton')}
            disabled={!cameraReady}
            loading={capturing}
            onPress={() => {
              void handleTakePicture();
            }}
          />
        </View>
      </HStack>
    </BottomSheetModal>
  );
}

export interface BarcodeScannerViewProps {
  rationale: PermissionRationaleCopy;
  onScanned: (payload: { type: string; data: string }) => void;
  scanCooldownMs?: number;
  height?: number;
  fullScreen?: boolean;
}

// 原因：挂载原生 CameraView 前强制经过 Permission Rationale 授权，并内置冷却互斥锁防止同帧连续重复回调同一条码
export function BarcodeScannerView({
  rationale,
  onScanned,
  scanCooldownMs = 1500,
  height = 200,
  fullScreen = false,
}: BarcodeScannerViewProps): React.JSX.Element | null {
  const { tokens } = useAppTheme();
  const { capabilityOverrides } = useAppRuntime();
  const driverOverride = capabilityOverrides?.camera;
  const camera = useCameraCapability();
  const [authorized, setAuthorized] = useState(false);
  const scanLockedRef = useRef(false);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rationaleTitle = rationale.title;
  const rationaleDescription = rationale.description;

  useEffect(() => {
    let active = true;
    if (!camera.enabled) {
      return;
    }
    void camera
      .requestScannerAccess({ title: rationaleTitle, description: rationaleDescription })
      .then((granted) => {
        if (active) {
          setAuthorized(granted);
        }
      });
    return () => {
      active = false;
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
      }
    };
  }, [camera, rationaleTitle, rationaleDescription]);

  if (!camera.enabled || !authorized) {
    return null;
  }

  const handleThrottledScan = (payload: { type: string; data: string }): void => {
    if (scanLockedRef.current) {
      return;
    }
    scanLockedRef.current = true;
    onScanned(payload);
    unlockTimerRef.current = setTimeout(() => {
      scanLockedRef.current = false;
    }, scanCooldownMs);
  };

  const CustomScannerPreview = driverOverride?.ScannerPreviewComponent;
  if (CustomScannerPreview) {
    return (
      <CustomScannerPreview
        height={height}
        borderRadius={tokens.radii.md}
        backgroundColor={tokens.colors.surfaceMuted}
        onScanned={handleThrottledScan}
      />
    );
  }

  const { CameraView } = require('expo-camera') as typeof import('expo-camera');

  return (
    <View
      style={[
        styles.scannerFrame,
        fullScreen ? styles.scannerFullScreen : { height, borderRadius: tokens.radii.md },
      ]}
    >
      <CameraView
        style={styles.scannerFill}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'ean13', 'code128'],
        }}
        onBarcodeScanned={(event) => {
          handleThrottledScan({ type: event.type, data: event.data });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  capturePreview: {
    width: '100%',
    height: 280,
    overflow: 'hidden',
  },
  scannerFrame: {
    width: '100%',
    overflow: 'hidden',
  },
  scannerFullScreen: {
    flex: 1,
    borderRadius: 0,
  },
  scannerFill: {
    flex: 1,
  },
});
