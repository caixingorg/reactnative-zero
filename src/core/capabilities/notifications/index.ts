import { useMemo } from 'react';
import { Platform } from 'react-native';
import type { AppVariant } from '../../config/types';
import {
  mapExpoPermissionResponse,
  type CapabilityPermissionProbe,
  type PermissionCoordinator,
  type PermissionRationaleCopy,
  type RawExpoPermissionShape,
} from '../../permissions/types';
import { useAppRuntime } from '../../runtime';

export interface LocalNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface ScheduledNotificationResult {
  notificationId: string;
}

export interface NotificationTapPayload {
  readonly notificationId?: string;
  readonly route?: string;
  readonly data: Record<string, unknown>;
}

export interface RawExpoNotificationResponse {
  notification?: {
    request?: {
      identifier?: string;
      content?: {
        data?: unknown;
      };
    };
  };
}

export interface NotificationsCapabilityDriver {
  scheduleLocalNotification(
    payload: LocalNotificationPayload,
  ): Promise<ScheduledNotificationResult>;
  setBadgeCount(count: number): Promise<boolean>;
  getDevicePushToken(): Promise<string>;
  subscribeNotificationResponses?(handler: (payload: NotificationTapPayload) => void): () => void;
  getInitialNotificationResponse?(): Promise<NotificationTapPayload | null>;
}

declare module '../../runtime/app-runtime' {
  interface CapabilityOverrideMap {
    notifications?: NotificationsCapabilityDriver;
  }
}

export interface ExpoNotificationsSdkLike {
  AndroidImportance: { HIGH: number };
  setNotificationHandler(handler: {
    handleNotification: () => Promise<{
      shouldShowBanner: boolean;
      shouldShowList: boolean;
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
    }>;
  }): void;
  setNotificationChannelAsync(
    channelId: string,
    channel: { name: string; importance: number },
  ): Promise<unknown>;
  getPermissionsAsync(): Promise<RawExpoPermissionShape>;
  requestPermissionsAsync(): Promise<RawExpoPermissionShape>;
  scheduleNotificationAsync(request: {
    content: { title: string; body: string; data?: Record<string, unknown> };
    trigger: null;
  }): Promise<string>;
  setBadgeCountAsync(count: number): Promise<boolean>;
  getDevicePushTokenAsync(): Promise<{ data: unknown }>;
  addNotificationResponseReceivedListener?(
    listener: (response: RawExpoNotificationResponse) => void,
  ): { remove(): void };
  getLastNotificationResponseAsync?(): Promise<RawExpoNotificationResponse | null>;
}

export interface NotificationsCapability {
  readonly enabled: boolean;
  scheduleLocalNotificationWithPermission(
    payload: LocalNotificationPayload,
    rationale: PermissionRationaleCopy,
  ): Promise<ScheduledNotificationResult | null>;
  setBadgeCount(count: number): Promise<boolean>;
  getDevicePushTokenWithPermission(rationale: PermissionRationaleCopy): Promise<string | null>;
  subscribeNotificationResponses(handler: (payload: NotificationTapPayload) => void): () => void;
  getInitialNotificationResponse(): Promise<NotificationTapPayload | null>;
}

const PRODUCTION_BLOCKED_NOTIFICATION_PREFIXES = ['/developer-lab'] as const;

// 原因：严格校验通知载荷携带的跳转路径，只允许以单斜杠开头的站内相对路径，拦截外链、协议相对路径（//evil.com）与生产禁用的演示路由
export function sanitizeNotificationRoute(
  rawRoute: unknown,
  options: { appVariant?: AppVariant } = {},
): string | null {
  if (typeof rawRoute !== 'string') {
    return null;
  }
  const trimmed = rawRoute.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('://') ||
    /[\r\n\t\s]/.test(trimmed)
  ) {
    return null;
  }

  const normalizedPath = trimmed.split(/[?#]/)[0]?.toLowerCase() ?? '';
  if (options.appVariant === 'production') {
    for (const prefix of PRODUCTION_BLOCKED_NOTIFICATION_PREFIXES) {
      if (normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)) {
        return null;
      }
    }
  }

  return trimmed;
}

function normalizeNotificationResponse(
  response: RawExpoNotificationResponse | null | undefined,
): NotificationTapPayload | null {
  if (!response || typeof response !== 'object') {
    return null;
  }
  const request = response.notification?.request;
  const rawData = request?.content?.data;
  const data =
    rawData && typeof rawData === 'object' && !Array.isArray(rawData)
      ? (rawData as Record<string, unknown>)
      : {};
  const routeValue =
    typeof data.route === 'string'
      ? data.route
      : typeof data.url === 'string'
        ? data.url
        : undefined;
  return {
    notificationId: request?.identifier,
    route: routeValue,
    data,
  };
}

// 原因：遵循 ADR-0004 严禁顶层导入期副作用；以单飞 Promise 惰性配置前台横幅与 Android 13+ 通知渠道，若渠道创建失败则重置锁允许下次重试
function createLazyNotificationsRuntime(sdkOverride?: ExpoNotificationsSdkLike): {
  ensureConfigured: () => Promise<ExpoNotificationsSdkLike>;
  permissionProbe: CapabilityPermissionProbe;
  driver: NotificationsCapabilityDriver;
} {
  let configPromise: Promise<ExpoNotificationsSdkLike> | null = null;

  const ensureConfigured = (): Promise<ExpoNotificationsSdkLike> => {
    if (!configPromise) {
      configPromise = (async () => {
        const Notifications =
          sdkOverride ?? (require('expo-notifications') as unknown as ExpoNotificationsSdkLike);
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.HIGH,
          });
        }
        return Notifications;
      })().catch((err: unknown) => {
        configPromise = null;
        throw err;
      });
    }
    return configPromise;
  };

  return {
    ensureConfigured,
    permissionProbe: {
      async getStatus() {
        const Notifications = await ensureConfigured();
        return mapExpoPermissionResponse(await Notifications.getPermissionsAsync());
      },
      async requestPermission() {
        const Notifications = await ensureConfigured();
        return mapExpoPermissionResponse(await Notifications.requestPermissionsAsync());
      },
    },
    driver: {
      async scheduleLocalNotification(payload): Promise<ScheduledNotificationResult> {
        const Notifications = await ensureConfigured();
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: payload.title,
            body: payload.body,
          },
          trigger: null,
        });
        return { notificationId };
      },

      async setBadgeCount(count: number): Promise<boolean> {
        const Notifications = await ensureConfigured();
        return Notifications.setBadgeCountAsync(count);
      },

      async getDevicePushToken(): Promise<string> {
        const Notifications = await ensureConfigured();
        const token = await Notifications.getDevicePushTokenAsync();
        return String(token.data);
      },

      subscribeNotificationResponses(handler): () => void {
        let disposed = false;
        let subscription: { remove(): void } | null = null;
        void ensureConfigured()
          .then((Notifications) => {
            if (disposed || !Notifications.addNotificationResponseReceivedListener) {
              return;
            }
            subscription = Notifications.addNotificationResponseReceivedListener((response) => {
              const normalized = normalizeNotificationResponse(response);
              if (normalized) {
                handler(normalized);
              }
            });
          })
          .catch(() => {
            // 通知模块在当前运行环境不可用时静默降级，不中断主界面渲染
          });
        return () => {
          disposed = true;
          subscription?.remove();
          subscription = null;
        };
      },

      async getInitialNotificationResponse(): Promise<NotificationTapPayload | null> {
        try {
          const Notifications = await ensureConfigured();
          if (!Notifications.getLastNotificationResponseAsync) {
            return null;
          }
          const raw = await Notifications.getLastNotificationResponseAsync();
          return normalizeNotificationResponse(raw);
        } catch {
          return null;
        }
      },
    },
  };
}

// 原因：统一封装本地通知调度、桌面角标与底层设备推送令牌获取，与具体商业推送通道解耦
export function createNotificationsCapability(options: {
  enabled: boolean;
  permissionCoordinator: PermissionCoordinator;
  driver?: NotificationsCapabilityDriver;
  sdk?: ExpoNotificationsSdkLike;
}): NotificationsCapability {
  const lazyRuntime = createLazyNotificationsRuntime(options.sdk);
  const activeDriver = options.driver ?? lazyRuntime.driver;
  const notificationPermissionProbe = lazyRuntime.permissionProbe;

  return {
    enabled: options.enabled,
    scheduleLocalNotificationWithPermission(payload, rationale) {
      return options.permissionCoordinator.runIfPermitted(
        {
          enabled: options.enabled,
          kind: 'notifications',
          rationale,
          nativeProbe: notificationPermissionProbe,
        },
        () => activeDriver.scheduleLocalNotification(payload),
      );
    },
    async setBadgeCount(count: number) {
      if (!options.enabled) {
        return false;
      }
      return activeDriver.setBadgeCount(count);
    },
    getDevicePushTokenWithPermission(rationale) {
      return options.permissionCoordinator.runIfPermitted(
        {
          enabled: options.enabled,
          kind: 'notifications',
          rationale,
          nativeProbe: notificationPermissionProbe,
        },
        () => activeDriver.getDevicePushToken(),
      );
    },
    subscribeNotificationResponses(handler) {
      if (!options.enabled || !activeDriver.subscribeNotificationResponses) {
        return () => {};
      }
      return activeDriver.subscribeNotificationResponses(handler);
    },
    async getInitialNotificationResponse() {
      if (!options.enabled || !activeDriver.getInitialNotificationResponse) {
        return null;
      }
      return activeDriver.getInitialNotificationResponse();
    },
  };
}

export function useNotificationsCapability(): NotificationsCapability {
  const { identity, permissionCoordinator, capabilityOverrides } = useAppRuntime();
  const driverOverride = capabilityOverrides?.notifications;

  return useMemo(
    () =>
      createNotificationsCapability({
        enabled: identity.capabilities.notifications,
        permissionCoordinator,
        driver: driverOverride,
      }),
    [driverOverride, identity.capabilities.notifications, permissionCoordinator],
  );
}
