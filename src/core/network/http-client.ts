/**
 * @module core/network/http-client
 * 职责：封装 Axios 请求执行、自动注入鉴权头、单飞（Single-Flight）Token 刷新互斥锁与过期重放机制。
 * 边界：仅负责传输编排与并发控制；具体协议信封、业务错误码映射及刷新接口由注入的 `BackendAdapter` 实现。
 */
import {
  AxiosHeaders,
  create as createAxiosInstance,
  type AxiosAdapter,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { AuthSessionStore } from '../auth/auth-session-store';
import type { Logger } from '../observability/observability';
import { isTerminalRefreshFailure } from './refresh-failure-policy';
import {
  AppApiError,
  type BackendAdapter,
  type HttpClient,
  type HttpMethod,
  type HttpTransportDriver,
  type AuthorizedAttemptResult,
  type RawHttpRequest,
  type RawHttpResponse,
  type RequestConfig,
  type SessionTokens,
} from './types';

function toAxiosAdapter(transport: HttpTransportDriver): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig) => {
    const base = config.baseURL ? config.baseURL.replace(/\/$/, '') : '';
    const path = config.url ?? '';
    const fullUrl = /^https?:\/\//i.test(path)
      ? path
      : `${base}${path.startsWith('/') ? '' : '/'}${path}`;

    const plainHeaders: Record<string, string> = {};
    if (config.headers) {
      const jsonHeaders = config.headers.toJSON();
      for (const [k, v] of Object.entries(jsonHeaders)) {
        if (typeof v === 'string') {
          plainHeaders[k] = v;
        }
      }
    }

    let parsedData: unknown = config.data;
    if (typeof config.data === 'string') {
      try {
        parsedData = JSON.parse(config.data);
      } catch {
        parsedData = config.data;
      }
    }

    const rawResponse = await transport({
      url: fullUrl,
      method: (config.method?.toUpperCase() as HttpMethod | undefined) ?? 'GET',
      headers: plainHeaders,
      params: config.params as Record<string, unknown> | undefined,
      data: parsedData,
    });

    return {
      data: rawResponse.data,
      status: rawResponse.status,
      statusText: String(rawResponse.status),
      headers: rawResponse.headers,
      config,
    };
  };
}

export interface CreateHttpClientOptions {
  getBaseUrl: () => string;
  backendAdapter: BackendAdapter;
  authSessionStore: AuthSessionStore;
  logger: Logger;
  httpTransport?: HttpTransportDriver;
}

// 原因：内置单飞刷新互斥锁并比对请求发出时的旧凭证与当前最新凭证，彻底消除并发及晚到 401 引起的二次重复刷新竞态
export function createHttpClient({
  getBaseUrl,
  backendAdapter,
  authSessionStore,
  logger,
  httpTransport,
}: CreateHttpClientOptions): HttpClient {
  const axiosInstance: AxiosInstance = createAxiosInstance({
    timeout: 15000,
    validateStatus: () => true,
    adapter: httpTransport ? toAxiosAdapter(httpTransport) : undefined,
  });

  let inflightRefreshPromise: Promise<SessionTokens> | null = null;

  async function executeRaw(req: RawHttpRequest): Promise<RawHttpResponse> {
    const response = await axiosInstance.request({
      baseURL: getBaseUrl(),
      url: req.url,
      method: req.method,
      headers: new AxiosHeaders(req.headers ?? {}),
      params: req.params,
      data: req.data,
    });

    const responseHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(response.headers)) {
      if (typeof v === 'string') {
        responseHeaders[k] = v;
      }
    }

    return {
      status: response.status,
      headers: responseHeaders,
      data: response.data,
    };
  }

  async function acquireRefreshedTokens(failedAccessToken: string | null): Promise<SessionTokens> {
    if (inflightRefreshPromise) {
      return inflightRefreshPromise;
    }

    // 原因：必须在首个 await 让出微任务队列前同步赋值互斥锁 Promise，确保同帧并发 401 共享同一锁且晚到请求比对最新令牌免重刷
    inflightRefreshPromise = (async () => {
      try {
        const [latestStoredAccess, refreshToken] = await Promise.all([
          authSessionStore.getState().getAccessToken(),
          authSessionStore.getState().getRefreshToken(),
        ]);

        if (
          failedAccessToken &&
          latestStoredAccess &&
          refreshToken &&
          latestStoredAccess !== failedAccessToken
        ) {
          return {
            accessToken: latestStoredAccess,
            refreshToken,
          };
        }

        if (!refreshToken) {
          throw new AppApiError({
            kind: 'unauthorized',
            code: 'MISSING_REFRESH_TOKEN',
            message: '登录状态已失效，请重新登录',
            httpStatus: 401,
          });
        }

        const freshTokens = await backendAdapter.refreshSession(refreshToken, executeRaw);
        await authSessionStore.getState().updateTokens(freshTokens);
        logger.info('Access token refreshed via single-flight coordinator');
        return freshTokens;
      } catch (refreshError) {
        const normalized = backendAdapter.normalizeError(refreshError);
        const isAuthInvalid = backendAdapter.isTerminalRefreshFailure
          ? backendAdapter.isTerminalRefreshFailure(normalized)
          : isTerminalRefreshFailure(normalized);
        if (isAuthInvalid) {
          logger.warn('Refresh token rejected by server; clearing session');
          await authSessionStore.getState().clearSession();
          throw new AppApiError({
            kind: 'unauthorized',
            code: normalized.code,
            message: normalized.message,
            httpStatus: normalized.httpStatus ?? 401,
          });
        }
        logger.warn(
          'Token refresh failed due to transient network/server error; preserving session',
        );
        throw normalized;
      } finally {
        inflightRefreshPromise = null;
      }
    })();

    return inflightRefreshPromise;
  }

  async function sendWithRetry<T>(
    method: HttpMethod,
    path: string,
    data: unknown,
    config: RequestConfig | undefined,
    isReplayAttempt: boolean,
  ): Promise<T> {
    try {
      let headers: Record<string, string> = { ...(config?.headers ?? {}) };
      let usedAccessToken: string | null = null;
      if (!config?.skipAuth) {
        usedAccessToken = await authSessionStore.getState().getAccessToken();
        if (usedAccessToken) {
          headers = backendAdapter.attachAuthHeaders(headers, usedAccessToken);
        }
      }

      const response = await executeRaw({
        url: path,
        method,
        headers,
        params: config?.params,
        data,
      });

      if (
        !config?.skipAuth &&
        backendAdapter.isAccessTokenExpired(response.status, response.data)
      ) {
        if (!isReplayAttempt) {
          await acquireRefreshedTokens(usedAccessToken);
          return sendWithRetry<T>(method, path, data, config, true);
        }
        await authSessionStore.getState().clearSession();
        throw new AppApiError({
          kind: 'unauthorized',
          code: 'REPLAY_STILL_UNAUTHORIZED',
          message: '登录状态已失效，请重新登录',
          httpStatus: 401,
        });
      }

      return backendAdapter.unwrapEnvelope<T>(response.status, response.data);
    } catch (err) {
      throw backendAdapter.normalizeError(err);
    }
  }

  async function executeAuthorized<R extends AuthorizedAttemptResult>(
    run: (authHeaders: Record<string, string>) => Promise<R>,
    isReplayAttempt = false,
  ): Promise<R> {
    const usedAccessToken = await authSessionStore.getState().getAccessToken();
    const authHeaders = usedAccessToken
      ? backendAdapter.attachAuthHeaders({}, usedAccessToken)
      : {};
    const result = await run(authHeaders);

    if (!backendAdapter.isAccessTokenExpired(result.status, result.data)) {
      return result;
    }
    if (!isReplayAttempt) {
      await acquireRefreshedTokens(usedAccessToken);
      return executeAuthorized(run, true);
    }
    await authSessionStore.getState().clearSession();
    throw new AppApiError({
      kind: 'unauthorized',
      code: 'REPLAY_STILL_UNAUTHORIZED',
      message: '登录状态已失效，请重新登录',
      httpStatus: 401,
    });
  }

  return {
    getBaseUrl,
    executeAuthorized(run) {
      return executeAuthorized(run);
    },
    request<T>(
      method: HttpMethod,
      path: string,
      data?: unknown,
      config?: RequestConfig,
    ): Promise<T> {
      return sendWithRetry<T>(method, path, data, config, false);
    },
    get<T>(path: string, config?: RequestConfig): Promise<T> {
      return sendWithRetry<T>('GET', path, undefined, config, false);
    },
    post<T>(path: string, data?: unknown, config?: RequestConfig): Promise<T> {
      return sendWithRetry<T>('POST', path, data, config, false);
    },
    put<T>(path: string, data?: unknown, config?: RequestConfig): Promise<T> {
      return sendWithRetry<T>('PUT', path, data, config, false);
    },
    delete<T>(path: string, config?: RequestConfig): Promise<T> {
      return sendWithRetry<T>('DELETE', path, undefined, config, false);
    },
  };
}
