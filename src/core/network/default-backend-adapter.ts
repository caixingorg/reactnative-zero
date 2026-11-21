import { isAxiosError } from 'axios';
import { isTerminalRefreshFailure } from './refresh-failure-policy';
import {
  AppApiError,
  type BackendAdapter,
  type RawHttpRequest,
  type RawHttpResponse,
  type SessionTokens,
} from './types';

interface StandardEnvelope<T = unknown> {
  code: number;
  message?: string;
  data: T;
}

function isStandardEnvelope(payload: unknown): payload is StandardEnvelope {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'code' in payload &&
    typeof (payload as { code: unknown }).code === 'number'
  );
}

const ACCESS_EXPIRED_BUSINESS_CODES = new Set([401, 40101]);

function createEnvelopeError(
  envelope: StandardEnvelope,
  httpStatus: number | undefined,
  fallbackMessage?: string,
): AppApiError {
  const isExpired = httpStatus === 401 || ACCESS_EXPIRED_BUSINESS_CODES.has(envelope.code);

  return new AppApiError({
    kind: isExpired ? 'unauthorized' : 'business',
    code: String(envelope.code),
    message: envelope.message ?? fallbackMessage ?? `业务请求失败 (${envelope.code})`,
    httpStatus,
  });
}

// 原因：提供开箱通用的 { code, message, data } 双凭证底层网关协议适配器，业务登录/列表路径保持在各自业务切片内
export function createDefaultBackendAdapter(): BackendAdapter {
  return {
    attachAuthHeaders(
      headers: Record<string, string>,
      accessToken: string,
    ): Record<string, string> {
      return {
        ...headers,
        Authorization: `Bearer ${accessToken}`,
      };
    },

    isAccessTokenExpired(httpStatus: number, rawBody: unknown): boolean {
      if (httpStatus === 401) {
        return true;
      }
      return isStandardEnvelope(rawBody) && ACCESS_EXPIRED_BUSINESS_CODES.has(rawBody.code);
    },

    unwrapEnvelope<T>(httpStatus: number, rawBody: unknown): T {
      if (isStandardEnvelope(rawBody)) {
        if (rawBody.code === 0 || rawBody.code === 200) {
          return rawBody.data as T;
        }
        throw createEnvelopeError(rawBody, httpStatus);
      }

      if (httpStatus >= 200 && httpStatus < 300) {
        return rawBody as T;
      }

      throw new AppApiError({
        kind: httpStatus === 401 ? 'unauthorized' : 'network',
        code: `HTTP_${httpStatus}`,
        message: httpStatus === 401 ? '登录凭证已过期' : `网络请求异常 (${httpStatus})`,
        httpStatus,
      });
    },

    normalizeError(error: unknown): AppApiError {
      if (error instanceof AppApiError) {
        return error;
      }

      if (isAxiosError(error)) {
        const status = error.response?.status;
        const body = error.response?.data;
        if (status !== undefined && isStandardEnvelope(body)) {
          return createEnvelopeError(body, status, error.message);
        }

        return new AppApiError({
          kind: status === 401 ? 'unauthorized' : 'network',
          code: status !== undefined ? `HTTP_${status}` : 'NETWORK_ERROR',
          message: error.message || '网络连接不可用，请检查网络设置',
          httpStatus: status,
        });
      }

      return new AppApiError({
        kind: 'unknown',
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : '未知请求错误',
      });
    },

    async refreshSession(
      refreshToken: string,
      executeRaw: (request: RawHttpRequest) => Promise<RawHttpResponse>,
    ): Promise<SessionTokens> {
      const response = await executeRaw({
        url: '/auth/refresh',
        method: 'POST',
        data: { refreshToken },
      });
      return this.unwrapEnvelope<SessionTokens>(response.status, response.data);
    },

    isTerminalRefreshFailure(error: AppApiError): boolean {
      return isTerminalRefreshFailure(error);
    },
  };
}
