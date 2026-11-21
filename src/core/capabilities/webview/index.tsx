import React, { useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WebViewProps } from 'react-native-webview';
import { useAppRuntime } from '../../runtime';
import { useAppTheme } from '../../theme/theme-context';
import { AppText, Box, Button, EmptyState, HStack, Screen, VStack } from '../../ui';
import {
  createReadOnlyBridgeInjectionScript,
  dispatchBridgeMessage,
  extractTrustedHostsFromUrls,
  generateBridgeSessionNonce,
  isSafeExternalHttpUrl,
  isTrustedWebUrl,
  type BridgeDispatchOutcome,
  type BridgeResponseEnvelope,
} from './bridge';

export {
  createReadOnlyBridgeInjectionScript,
  dispatchBridgeMessage,
  extractTrustedHostsFromUrls,
  generateBridgeSessionNonce,
  isSafeExternalHttpUrl,
  isTrustedWebUrl,
  READONLY_HOST_BRIDGE_INJECTION_SCRIPT,
  type BridgeDispatchOutcome,
  type BridgeHandlers,
  type BridgeHostContextData,
  type BridgeResponseEnvelope,
  type SafeAreaInsetsSnapshot,
} from './bridge';

interface WebViewBridgeHandle {
  injectJavaScript(script: string): void;
}

export interface WebViewBridgeChannelHandle {
  readonly sessionNonce: string;
  receiveMessageFromWeb(
    rawMessage: string,
    originUrl: string,
    options?: { attachTopFrameToken?: boolean },
  ): Promise<BridgeDispatchOutcome>;
}

export interface WebViewCapabilityOverride {
  renderSurface?: (props: { url: string }) => React.JSX.Element;
}

declare module '../../runtime/app-runtime' {
  interface CapabilityOverrideMap {
    webview?: WebViewCapabilityOverride;
  }
}

export interface SecureHybridWebViewProps {
  url: string;
  title?: string;
  trustedHosts?: readonly string[];
  /**
   * 是否允许内嵌页面访问 Web Storage（localStorage / sessionStorage）。
   * 默认为 false（安全最小化基线，防止协议/营销页持久化追踪标识）；内嵌需读写 localStorage 的自有受信任 SPA 轻应用时显式传 true。
   */
  allowDomStorage?: boolean;
  compactHeight?: number;
  bridgeChannelRef?: React.Ref<WebViewBridgeChannelHandle>;
  onBridgeReply?: (reply: BridgeResponseEnvelope) => void;
  onClose?: () => void;
}

// 原因：遵循 ADR-0005，安全混合网页容器自包含于独立能力模块，集成白名单拦截、顶层主 frame 令牌防冒用、进度反馈与强校验双向 JSBridge
export function SecureHybridWebView({
  url,
  title,
  trustedHosts,
  allowDomStorage = false,
  compactHeight,
  bridgeChannelRef,
  onBridgeReply,
  onClose,
}: SecureHybridWebViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const { identity, env, logger, capabilityOverrides } = useAppRuntime();
  const webviewOverride = capabilityOverrides?.webview;
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebViewBridgeHandle | null>(null);

  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [bridgeNotice, setBridgeNotice] = useState<string | null>(null);
  const [blockedExternalUrl, setBlockedExternalUrl] = useState<string | null>(null);

  const sessionNonce = useMemo(
    () => generateBridgeSessionNonce(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reloadKey, url],
  );

  const effectiveTrustedHosts = useMemo(
    () => trustedHosts ?? extractTrustedHostsFromUrls([env.privacyPolicyUrl, env.userAgreementUrl]),
    [env.privacyPolicyUrl, env.userAgreementUrl, trustedHosts],
  );

  const isUrlTrusted = isTrustedWebUrl(url, effectiveTrustedHosts);

  const handleIncomingRawMessage = useCallback(
    async (rawMessage: string, originUrl: string): Promise<BridgeDispatchOutcome> => {
      const outcome = await dispatchBridgeMessage({
        rawMessage,
        originUrl,
        trustedHosts: effectiveTrustedHosts,
        expectedBridgeToken: sessionNonce,
        logger,
        handlers: {
          getHostContext: () => ({
            themeScheme: tokens.scheme,
            appVariant: env.appVariant,
            safeAreaInsets: {
              top: insets.top,
              right: insets.right,
              bottom: insets.bottom,
              left: insets.left,
            },
          }),
          onShowNotice: (message) => {
            setBridgeNotice(message);
          },
          onCloseContainer: () => {
            onClose?.();
          },
        },
      });

      if (outcome.accepted) {
        onBridgeReply?.(outcome.response);
        if (webViewRef.current) {
          // 原因：先序列化结构化响应，再二次转义为安全 JS 字符串字面量，防止动态字段引发脚本逃逸
          const serialized = JSON.stringify(outcome.response);
          webViewRef.current.injectJavaScript(
            `window.dispatchEvent(new MessageEvent('host-bridge-reply', { data: ${JSON.stringify(serialized)} })); true;`,
          );
        }
      }

      return outcome;
    },
    [
      effectiveTrustedHosts,
      env.appVariant,
      insets.bottom,
      insets.left,
      insets.right,
      insets.top,
      logger,
      onBridgeReply,
      onClose,
      sessionNonce,
      tokens.scheme,
    ],
  );

  useImperativeHandle(
    bridgeChannelRef,
    () => ({
      sessionNonce,
      receiveMessageFromWeb: (rawMessage, originUrl, options) => {
        const shouldAttach = options?.attachTopFrameToken ?? true;
        if (!shouldAttach) {
          return handleIncomingRawMessage(rawMessage, originUrl);
        }
        try {
          const parsed = JSON.parse(rawMessage) as Record<string, unknown>;
          const withToken = JSON.stringify({
            bridgeToken: sessionNonce,
            ...parsed,
          });
          return handleIncomingRawMessage(withToken, originUrl);
        } catch {
          return handleIncomingRawMessage(rawMessage, originUrl);
        }
      },
    }),
    [handleIncomingRawMessage, sessionNonce],
  );

  const openExternalSafely = (targetUrl: string): void => {
    if (!isSafeExternalHttpUrl(targetUrl)) {
      logger.warn('Blocked unsafe external URL scheme from opening in system browser', {
        targetUrl,
      });
      return;
    }
    void Linking.openURL(targetUrl);
  };

  const Wrapper = compactHeight ? Box : Screen;

  if (!identity.capabilities.webview) {
    return (
      <Wrapper>
        <VStack p="lg" justify="center">
          <EmptyState
            title={t('webview.disabledTitle')}
            description={t('webview.disabledDescription')}
            actionLabel={onClose ? t('common.close') : undefined}
            onAction={onClose}
          />
        </VStack>
      </Wrapper>
    );
  }

  if (!isUrlTrusted) {
    const canOpenExternal = isSafeExternalHttpUrl(url);
    return (
      <Wrapper>
        <VStack p="lg" justify="center" gap="md">
          <EmptyState
            title={t('webview.blockedTitle')}
            description={`${t('webview.blockedDescription')} (${url})`}
            actionLabel={canOpenExternal ? t('webview.openExternalButton') : undefined}
            onAction={canOpenExternal ? () => openExternalSafely(url) : undefined}
          />
          {onClose ? (
            <Button label={t('common.close')} variant="outline" onPress={onClose} />
          ) : null}
        </VStack>
      </Wrapper>
    );
  }

  const contentNode = (
    <View
      style={compactHeight ? [styles.compactContainer, { height: compactHeight }] : styles.flex}
    >
      {!compactHeight ? (
        <HStack px="md" py="sm" justify="space-between" align="center" bg="surface" bordered>
          <AppText variant="titleMd" numberOfLines={1}>
            {title ?? url}
          </AppText>
          {onClose ? <Button label={t('common.close')} variant="ghost" onPress={onClose} /> : null}
        </HStack>
      ) : null}

      {progress > 0 && progress < 1 ? (
        <View style={[styles.progressTrack, { backgroundColor: tokens.colors.surfaceMuted }]}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${Math.round(progress * 100)}%`,
                backgroundColor: tokens.colors.primary,
              },
            ]}
          />
        </View>
      ) : null}

      {bridgeNotice ? (
        <Box px="md" py="sm" bg="primarySoft">
          <AppText variant="bodySm" tone="brand" weight="600">
            {bridgeNotice}
          </AppText>
        </Box>
      ) : null}

      {blockedExternalUrl ? (
        <VStack px="md" py="sm" gap="xs" bg="surfaceMuted" bordered>
          <AppText variant="caption" tone="danger">
            {t('webview.blockedDescription')} ({blockedExternalUrl})
          </AppText>
          {isSafeExternalHttpUrl(blockedExternalUrl) ? (
            <Button
              label={t('webview.openExternalButton')}
              variant="outline"
              onPress={() => {
                const target = blockedExternalUrl;
                setBlockedExternalUrl(null);
                openExternalSafely(target);
              }}
            />
          ) : null}
        </VStack>
      ) : null}

      {loadError ? (
        <VStack flex={1} p="lg" justify="center">
          <EmptyState
            title={t('webview.loadErrorTitle')}
            description={loadError}
            actionLabel={t('common.retry')}
            onAction={() => {
              setLoadError(null);
              setReloadKey((prev) => prev + 1);
            }}
          />
        </VStack>
      ) : webviewOverride?.renderSurface ? (
        webviewOverride.renderSurface({ url })
      ) : (
        <NativeWebViewRenderer
          key={reloadKey}
          webViewRef={webViewRef}
          url={url}
          allowDomStorage={allowDomStorage}
          sessionNonce={sessionNonce}
          trustedHosts={effectiveTrustedHosts}
          onProgress={setProgress}
          onError={setLoadError}
          onBlockedExternalNavigation={setBlockedExternalUrl}
          onMessage={(raw, origin) => {
            void handleIncomingRawMessage(raw, origin);
          }}
        />
      )}
    </View>
  );

  if (compactHeight) {
    return contentNode;
  }

  return <Screen>{contentNode}</Screen>;
}

function NativeWebViewRenderer({
  webViewRef,
  url,
  allowDomStorage,
  sessionNonce,
  trustedHosts,
  onProgress,
  onError,
  onBlockedExternalNavigation,
  onMessage,
}: {
  webViewRef: React.RefObject<WebViewBridgeHandle | null>;
  url: string;
  allowDomStorage: boolean;
  sessionNonce: string;
  trustedHosts: readonly string[];
  onProgress: (value: number) => void;
  onError: (description: string) => void;
  onBlockedExternalNavigation: (blockedUrl: string) => void;
  onMessage: (rawMessage: string, originUrl: string) => void;
}): React.JSX.Element {
  const { WebView } = require('react-native-webview') as {
    WebView: React.ForwardRefExoticComponent<
      WebViewProps & React.RefAttributes<WebViewBridgeHandle>
    >;
  };

  const injectionScript = useMemo(
    () => createReadOnlyBridgeInjectionScript(sessionNonce),
    [sessionNonce],
  );

  return (
    <WebView
      ref={webViewRef}
      style={styles.flex}
      source={{ uri: url }}
      originWhitelist={['https://*']}
      javaScriptEnabled
      // 原因：默认关闭 DOM Storage、本地文件访问、混合内容、多窗口弹窗与 Web 定位，最小化混合容器攻击面
      domStorageEnabled={allowDomStorage}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never"
      setSupportMultipleWindows={false}
      geolocationEnabled={false}
      injectedJavaScriptBeforeContentLoaded={injectionScript}
      onLoadProgress={({ nativeEvent }) => onProgress(nativeEvent.progress)}
      onError={({ nativeEvent }) => onError(nativeEvent.description || 'Web page failed to load')}
      // 原因：拦截非白名单跳转并交由宿主展示用户确认提示，同时静默拦截不可信子帧与 about:blank 避免误报外部跳转横幅
      onShouldStartLoadWithRequest={(request) => {
        if (request.url === 'about:blank') {
          return true;
        }
        if (isTrustedWebUrl(request.url, trustedHosts)) {
          return true;
        }
        if (request.isTopFrame === false) {
          return false;
        }
        onBlockedExternalNavigation(request.url);
        return false;
      }}
      // 原因：严格传递原始 nativeEvent.url，禁止在空来源 (about:blank / 沙箱 iframe) 时回退至初始受信任 url 造成白名单绕过
      onMessage={(event) => {
        onMessage(event.nativeEvent.data, event.nativeEvent.url ?? '');
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  compactContainer: {
    width: '100%',
    overflow: 'hidden',
  },
  progressTrack: {
    height: 3,
    width: '100%',
  },
  progressBar: {
    height: 3,
  },
});
